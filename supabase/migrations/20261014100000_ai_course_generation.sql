begin;
create table lms_private.ai_course_jobs (
 id uuid primary key, owner_id uuid not null references public.profiles(id),
 course_id uuid references public.courses(id), spec jsonb not null,
 status text not null default 'outline_queued' check(status in ('outline_queued','outlining','review','generating','failed','complete','cancelled')),
 outline jsonb, plan jsonb not null default '[]', completed integer not null default 0,
 model text, attempts integer not null default 0,
 lease_token uuid, leased_until timestamptz, available_at timestamptz not null default clock_timestamp(),
 last_error text, created_at timestamptz not null default clock_timestamp(), updated_at timestamptz not null default clock_timestamp()
);
create index ai_course_jobs_owner on lms_private.ai_course_jobs(owner_id,created_at desc);
create index ai_course_jobs_queue on lms_private.ai_course_jobs(available_at,created_at) where status in ('outline_queued','outlining','generating');
alter table lms_private.ai_course_jobs enable row level security;
revoke all on lms_private.ai_course_jobs from public,anon,authenticated;
create table lms_private.ai_worker_control(singleton boolean primary key default true check(singleton),last_started timestamptz not null default '-infinity',request_day date not null default current_date,request_count integer not null default 0);
insert into lms_private.ai_worker_control default values;
revoke all on lms_private.ai_worker_control from public,anon,authenticated;

create function lms_private.ai_outline_valid(outline jsonb) returns boolean language plpgsql immutable set search_path='' as $$
declare m jsonb; l jsonb; total integer:=0;
begin
 if jsonb_typeof(outline) is distinct from 'object' or octet_length(outline::text)>40000 then return false; end if;
 if coalesce(length(trim(outline->>'description')),0) not between 1 and 10000 or jsonb_typeof(outline->'objectives') is distinct from 'array' or jsonb_array_length(outline->'objectives') not between 1 and 10 then return false; end if;
 if exists(select 1 from jsonb_array_elements(outline->'objectives') x where jsonb_typeof(x)<>'string' or length(trim(x#>>'{}')) not between 1 and 500) then return false; end if;
 if jsonb_typeof(outline->'modules') is distinct from 'array' or jsonb_array_length(outline->'modules') not between 1 and 6 then return false; end if;
 for m in select value from jsonb_array_elements(outline->'modules') loop
  if coalesce(length(trim(m->>'title')),0) not between 1 and 200 or jsonb_typeof(m->'lessons') is distinct from 'array' or jsonb_array_length(m->'lessons') not between 1 and 4 then return false; end if;
  for l in select value from jsonb_array_elements(m->'lessons') loop
   if jsonb_typeof(l) is distinct from 'string' or length(trim(l#>>'{}')) not between 1 and 200 then return false; end if;
   total:=total+1;
  end loop;
 end loop;
 return total<=24;
exception when others then return false;
end $$;
create function lms_private.ai_job_view(j lms_private.ai_course_jobs) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('id',j.id,'spec',j.spec,'status',j.status,'outline',j.outline,'courseId',j.course_id,'completed',j.completed,'total',jsonb_array_length(j.plan),'error',j.last_error,'model',j.model,'createdAt',j.created_at);
$$;
revoke all on function lms_private.ai_outline_valid(jsonb),lms_private.ai_job_view(lms_private.ai_course_jobs) from public,anon,authenticated;

create function public.ai_course_command(action text,payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); r text:=lms_private.current_role(); j lms_private.ai_course_jobs; ident uuid; target uuid; modules jsonb:='[]'; lessons jsonb; generated_plan jsonb:='[]'; m jsonb; l jsonb; mid uuid; lid uuid; cid uuid; spec jsonb; result jsonb;
begin
 if r is null or r not in ('admin','tutor') then raise exception 'Course creator access required' using errcode='42501'; end if;
 if action='list' then
  select coalesce(jsonb_agg(lms_private.ai_job_view(x) order by x.created_at desc),'[]') into result from (select * from lms_private.ai_course_jobs where owner_id=uid order by created_at desc limit 10) x;
  return result;
 end if;
 if octet_length(payload::text)>50000 then raise exception 'Request too large'; end if;
 perform lms_private.course_request_limit('ai-course-actions',30);
 ident:=(payload->>'id')::uuid;
 if ident is null then raise exception 'Job ID required'; end if;
 perform 1 from public.profiles where id=uid for update;
 if action='create' then
  spec:=payload->'spec';
  if jsonb_typeof(spec) is distinct from 'object' or coalesce(length(trim(spec->>'title')),0) not between 1 and 160 or length(coalesce(spec->>'audience',''))>500 or length(coalesce(spec->>'goals',''))>1500
   or (spec->>'level') not in ('Beginner','Intermediate','Advanced') or nullif(spec->>'level','') is null
   or not exists(select 1 from public.categories where name=spec->>'category')
   or coalesce((spec->>'moduleCount')::integer,0) not between 1 and 6 or coalesce((spec->>'lessonsPerModule')::integer,0) not between 1 and 4 then raise exception 'Invalid course requirements'; end if;
  target:=case when r='tutor' then uid else (spec->>'tutorId')::uuid end;
  if not exists(select 1 from public.profiles where id=target and role='tutor' and is_active) then raise exception 'Choose an active instructor'; end if;
  spec:=jsonb_build_object('title',trim(spec->>'title'),'audience',coalesce(spec->>'audience',''),'goals',coalesce(spec->>'goals',''),'level',spec->>'level','category',spec->>'category','moduleCount',(spec->>'moduleCount')::integer,'lessonsPerModule',(spec->>'lessonsPerModule')::integer,'tutorId',target);
  select * into j from lms_private.ai_course_jobs where id=ident;
  if j.id is not null then
   if j.owner_id<>uid or j.spec<>spec then raise exception 'Request cannot be reused'; end if;
   return lms_private.ai_job_view(j);
  end if;
  if exists(select 1 from lms_private.ai_course_jobs where owner_id=uid and status in ('outline_queued','outlining','review','generating')) then raise exception 'Finish or cancel your current AI course first'; end if;
  if (select count(*) from lms_private.ai_course_jobs where owner_id=uid and created_at>clock_timestamp()-interval '24 hours')>=3 then raise exception 'Daily limit reached: create up to three AI courses per day'; end if;
  perform pg_advisory_xact_lock(hashtextextended('ai-course-queue',0));
  if (select count(*) from lms_private.ai_course_jobs where status in ('outline_queued','outlining','generating'))>=20 then raise exception 'Generation queue is full. Try again later'; end if;
  insert into lms_private.ai_course_jobs(id,owner_id,spec) values(ident,uid,spec) returning * into j;
 else
  select * into j from lms_private.ai_course_jobs where id=ident and owner_id=uid for update;
  if j.id is null then raise exception 'Generation unavailable' using errcode='42501'; end if;
  if action='cancel' then
   if j.status='complete' then raise exception 'Generation already complete'; end if;
   update lms_private.ai_course_jobs set status='cancelled',lease_token=null,leased_until=null,updated_at=clock_timestamp() where id=ident returning * into j;
  elsif action='retry' then
   perform lms_private.course_request_limit('ai-course-retry',5);
   if j.status<>'failed' then raise exception 'Only failed jobs can be retried'; end if;
   if exists(select 1 from lms_private.ai_course_jobs where owner_id=uid and id<>ident and status in ('outline_queued','outlining','review','generating')) then raise exception 'Finish your current AI course first'; end if;
   if j.updated_at>clock_timestamp()-interval '1 minute' then raise exception 'Please wait a minute before retrying'; end if;
   perform pg_advisory_xact_lock(hashtextextended('ai-course-queue',0));
   if (select count(*) from lms_private.ai_course_jobs where status in ('outline_queued','outlining','generating'))>=20 then raise exception 'Generation queue is full'; end if;
   update lms_private.ai_course_jobs set status=case when course_id is null then 'outline_queued' else 'generating' end,attempts=0,last_error=null,lease_token=null,leased_until=null,available_at=clock_timestamp(),updated_at=clock_timestamp() where id=ident returning * into j;
  elsif action='approve' then
   if j.status<>'review' then raise exception 'Outline is not ready for approval'; end if;
   if not lms_private.ai_outline_valid(payload->'outline') then raise exception 'Invalid outline'; end if;
   perform pg_advisory_xact_lock(hashtextextended('ai-course-queue',0));
   if (select count(*) from lms_private.ai_course_jobs where status in ('outline_queued','outlining','generating'))>=20 then raise exception 'Generation queue is full'; end if;
   cid:=gen_random_uuid();
   for m in select value from jsonb_array_elements(payload->'outline'->'modules') loop
    mid:=gen_random_uuid(); lessons:='[]';
    for l in select value from jsonb_array_elements(m->'lessons') loop
     lid:=gen_random_uuid();
     lessons:=lessons||jsonb_build_array(jsonb_build_object('id',lid,'title',trim(l#>>'{}'),'duration',8,'type','reading','content','','videoUrl',''));
     generated_plan:=generated_plan||jsonb_build_array(jsonb_build_object('lessonId',lid,'moduleId',mid,'moduleTitle',trim(m->>'title'),'title',trim(l#>>'{}')));
    end loop;
    modules:=modules||jsonb_build_array(jsonb_build_object('id',mid,'title',trim(m->>'title'),'lessons',lessons));
   end loop;
   perform public.lms_command('saveCourse',jsonb_build_object('id',cid,'tutorId',j.spec->>'tutorId','title',j.spec->>'title','description',(payload->'outline'->>'description')||E'\n\nLearning objectives:\n'||(select string_agg('- '||x,E'\n') from jsonb_array_elements_text(payload->'outline'->'objectives') x),'category',j.spec->>'category','level',j.spec->>'level','status','draft','price',0,'duration',round(jsonb_array_length(generated_plan)*8.0/60,2),'thumbnail','','tags','[]'::jsonb,'requireAssessment',false,'completionRule','lessons','certificateMode','none','modules',modules));
   update lms_private.ai_course_jobs set course_id=cid,status='generating',outline=payload->'outline',plan=generated_plan,completed=0,attempts=0,last_error=null,available_at=clock_timestamp(),updated_at=clock_timestamp() where id=ident returning * into j;
  else raise exception 'Invalid generation action'; end if;
 end if;
 return lms_private.ai_job_view(j);
end $$;
revoke all on function public.ai_course_command(text,jsonb) from public,anon,authenticated;
grant execute on function public.ai_course_command(text,jsonb) to authenticated;

create function public.claim_ai_course_work(model_name text,daily_request_limit integer default 100) returns jsonb
language plpgsql security definer set search_path='' as $$
declare j lms_private.ai_course_jobs; last_call timestamptz;
begin
 if model_name is null or model_name !~ '^[a-zA-Z0-9.-]{1,100}$' then raise exception 'Invalid model'; end if;
 if daily_request_limit not between 1 and 10000 or daily_request_limit is null then raise exception 'Invalid generation budget'; end if;
 if not pg_try_advisory_xact_lock(hashtextextended('ai-course-worker',0)) then return null; end if;
 select last_started into last_call from lms_private.ai_worker_control where singleton for update;
 if last_call>clock_timestamp()-interval '15 seconds' or exists(select 1 from lms_private.ai_course_jobs where leased_until>clock_timestamp() and status in ('outlining','generating')) then return null; end if;
 update lms_private.ai_worker_control set request_day=current_date,request_count=0 where singleton and request_day<>current_date;
 if (select request_count>=daily_request_limit from lms_private.ai_worker_control where singleton) then
  update lms_private.ai_course_jobs set last_error='Daily AI request budget reached. Queued work will resume tomorrow.' where status in ('outline_queued','generating') and last_error is distinct from 'Daily AI request budget reached. Queued work will resume tomorrow.';
  return null;
 end if;
 update lms_private.ai_course_jobs pending set status='failed',last_error='Creator account is no longer eligible',lease_token=null,leased_until=null,updated_at=clock_timestamp() where status in ('outline_queued','outlining','generating') and not exists(select 1 from public.profiles p where p.id=pending.owner_id and p.is_active and p.role in ('admin','tutor'));
 select * into j from lms_private.ai_course_jobs where status in ('outline_queued','outlining','generating') and available_at<=clock_timestamp() and (leased_until is null or leased_until<=clock_timestamp()) order by available_at,created_at for update skip locked limit 1;
 if j.id is null then return null; end if;
 if j.attempts>=3 then update lms_private.ai_course_jobs set status='failed',last_error='Generation was interrupted repeatedly. Retry when ready.',lease_token=null,leased_until=null,updated_at=clock_timestamp() where id=j.id; return null; end if;
 update lms_private.ai_worker_control set last_started=clock_timestamp(),request_count=request_count+1 where singleton;
 update lms_private.ai_course_jobs set status=case when course_id is null then 'outlining' else 'generating' end,model=coalesce(model,model_name),lease_token=gen_random_uuid(),leased_until=clock_timestamp()+interval '2 minutes',attempts=attempts+1,updated_at=clock_timestamp() where id=j.id returning * into j;
 return to_jsonb(j);
end $$;
create function public.finish_ai_course_work(job_id uuid,lease uuid,result jsonb,error_message text default null,permanent boolean default false) returns void
language plpgsql security definer set search_path='' as $$
declare j lms_private.ai_course_jobs; item jsonb;
begin
 select * into j from lms_private.ai_course_jobs where id=job_id for update;
 if j.id is null or j.lease_token is distinct from lease or j.leased_until<=clock_timestamp() or j.status not in ('outlining','generating') then return; end if;
 if not exists(select 1 from public.profiles where id=j.owner_id and is_active and role in ('admin','tutor')) then error_message:='Creator account is no longer eligible'; permanent:=true; end if;
 if error_message is not null then
  update lms_private.ai_course_jobs set status=case when permanent or attempts>=3 then 'failed' when course_id is null then 'outline_queued' else 'generating' end,last_error=left(error_message,250),lease_token=null,leased_until=null,available_at=clock_timestamp()+make_interval(secs=>30*attempts),updated_at=clock_timestamp() where id=j.id;
  return;
 end if;
 if j.course_id is null then
  if not lms_private.ai_outline_valid(result) then raise exception 'Invalid generated outline'; end if;
  update lms_private.ai_course_jobs set outline=result,status='review',attempts=0,last_error=null,lease_token=null,leased_until=null,updated_at=clock_timestamp() where id=j.id;
 else
  perform 1 from public.courses where id=j.course_id for update;
  if not exists(select 1 from public.courses c join public.profiles p on p.id=c.tutor_id where c.id=j.course_id and c.status='draft' and c.tutor_id=(j.spec->>'tutorId')::uuid and p.role='tutor' and p.is_active) then
   update lms_private.ai_course_jobs set status='failed',last_error='The draft was published, removed or reassigned. Generation stopped.',lease_token=null,leased_until=null,updated_at=clock_timestamp() where id=j.id; return;
  end if;
  if jsonb_typeof(result) is distinct from 'object' or coalesce(length(result->>'content'),0) not between 50 and 100000 then raise exception 'Invalid lesson content'; end if;
  item:=j.plan->j.completed;
  -- Never overwrite human edits, changed lesson titles/types, or recreated curriculum IDs.
  update public.lessons set content=result->>'content' where id=(item->>'lessonId')::uuid and module_id=(item->>'moduleId')::uuid and title=item->>'title' and type='reading' and content='' and exists(select 1 from public.modules where id=lessons.module_id and course_id=j.course_id and title=item->>'moduleTitle');
  update public.courses set updated_at=clock_timestamp() where id=j.course_id;
  update lms_private.ai_course_jobs set completed=completed+1,status=case when completed+1>=jsonb_array_length(plan) then 'complete' else 'generating' end,attempts=0,last_error=null,lease_token=null,leased_until=null,available_at=clock_timestamp(),updated_at=clock_timestamp() where id=j.id;
 end if;
end $$;
revoke all on function public.claim_ai_course_work(text,integer),public.finish_ai_course_work(uuid,uuid,jsonb,text,boolean) from public,anon,authenticated;
do $$ begin if exists(select 1 from pg_roles where rolname='service_role') then grant execute on function public.claim_ai_course_work(text,integer),public.finish_ai_course_work(uuid,uuid,jsonb,text,boolean) to service_role; end if; end $$;
commit;
