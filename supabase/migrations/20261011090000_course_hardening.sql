begin;
create table lms_private.course_request_limits (
 user_id uuid not null references public.profiles(id) on delete cascade,
 operation text not null, window_start timestamptz not null, used integer not null,
 primary key(user_id,operation)
);
alter table lms_private.course_request_limits enable row level security;
create function lms_private.course_request_limit(operation_name text,max_requests integer) returns void language plpgsql security definer set search_path='' as $$
declare usage_count integer;
begin
 insert into lms_private.course_request_limits(user_id,operation,window_start,used) values(auth.uid(),operation_name,date_trunc('hour',now()),1)
 on conflict(user_id,operation) do update set window_start=excluded.window_start,
 used=case when course_request_limits.window_start=excluded.window_start then course_request_limits.used+1 else 1 end
 returning course_request_limits.used into usage_count;
 if usage_count>max_requests then raise exception 'Too many course requests. Try again later.' using errcode='P0001'; end if;
end $$;
revoke all on function lms_private.course_request_limit(text,integer) from public,anon,authenticated;
create function public.course_upload_guard(course_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare r public.lms_role:=lms_private.current_role(); owner uuid;
begin
 if r is null or r not in ('admin','tutor') then raise exception 'Course management access required' using errcode='42501'; end if;
 select tutor_id into owner from public.courses where id=course_id;
 if owner is not null and r='tutor' and owner<>auth.uid() then raise exception 'You can only change your own course images.' using errcode='42501'; end if;
 perform lms_private.course_request_limit('thumbnail',30);
end $$;
revoke all on function public.course_upload_guard(uuid) from public,anon;
grant execute on function public.course_upload_guard(uuid) to authenticated;
create function lms_private.validate_course_payload(payload jsonb) returns void language plpgsql set search_path='' as $$
declare item jsonb; lesson jsonb; lessons integer:=0; module_ids uuid[]:='{}'; lesson_ids uuid[]:='{}'; ident uuid;
begin
 if octet_length(payload::text)>524288 then raise exception 'Course payload too large'; end if;
 if jsonb_typeof(payload->'modules') is distinct from 'array' then raise exception 'Curriculum must be an array'; end if;
 if jsonb_array_length(payload->'modules')>100 then raise exception 'A course can have up to 100 modules'; end if;
 if char_length(payload->>'title')>160 or char_length(payload->>'description')>20000 or char_length(payload->>'thumbnail')>2048 then raise exception 'Course text is too long'; end if;
 if (payload->>'price')::numeric not between 0 and 10000000 or (payload->>'duration')::numeric not between 0 and 10000 then raise exception 'Invalid course price or duration'; end if;
 if jsonb_typeof(payload->'tags') is distinct from 'array' or jsonb_array_length(payload->'tags')>20 or exists(select 1 from jsonb_array_elements_text(payload->'tags') t where char_length(t)>80) then raise exception 'Invalid course tags'; end if;
 for item in select value from jsonb_array_elements(payload->'modules') loop
  ident:=(item->>'id')::uuid;
  if ident=any(module_ids) then raise exception 'Duplicate module ID'; end if;
  module_ids:=array_append(module_ids,ident);
  if char_length(item->>'title')>200 or jsonb_typeof(item->'lessons') is distinct from 'array' then raise exception 'Invalid module'; end if;
  if jsonb_array_length(item->'lessons')>100 then raise exception 'A module can have up to 100 lessons'; end if;
  lessons:=lessons+jsonb_array_length(item->'lessons');
  if lessons>500 then raise exception 'A course can have up to 500 lessons'; end if;
  for lesson in select value from jsonb_array_elements(item->'lessons') loop
   ident:=(lesson->>'id')::uuid;
   if ident=any(lesson_ids) then raise exception 'Duplicate lesson ID'; end if;
   lesson_ids:=array_append(lesson_ids,ident);
   if char_length(lesson->>'title')>200 or char_length(lesson->>'content')>100000 or char_length(lesson->>'videoUrl')>2048 or (lesson->>'duration')::integer not between 0 and 1440 then raise exception 'Invalid lesson content or duration'; end if;
   if coalesce(lesson->>'videoUrl','')<>'' and lesson->>'videoUrl' !~* '^https?://' then raise exception 'Use an HTTP or HTTPS video URL'; end if;
  end loop;
 end loop;
end $$;
revoke all on function lms_private.validate_course_payload(jsonb) from public,anon,authenticated;
do $migration$
declare definition text; revised text;
begin
 definition:=pg_get_functiondef('public.lms_command(text,jsonb)'::regprocedure);
 revised:=replace(definition,'when ''saveCourse'' then', $branch$when 'saveCourse' then
  if r not in ('admin','tutor') then raise exception 'Course management denied' using errcode='42501'; end if;
  perform lms_private.validate_course_payload(payload);
  perform lms_private.course_request_limit('save',120);
  -- Serialize first-time creates as well as updates before checking ownership/revision.
  perform pg_advisory_xact_lock(hashtextextended((payload->>'id')::uuid::text,0));
 $branch$);
 if revised=definition then raise exception 'Course hardening did not match save'; end if;
 execute revised;
 definition:=revised;
 -- Insert curriculum in two set-based statements instead of a COUNT query per row.
 revised:=replace(definition,$old$
   for item in select value from jsonb_array_elements(payload->'modules') loop
    mid:=(item->>'id')::uuid;
    insert into public.modules(id,course_id,title,position) values(mid,cid,item->>'title',(select count(*) from public.modules where course_id=cid));
    for lesson in select value from jsonb_array_elements(item->'lessons') loop
     insert into public.lessons(id,module_id,title,position,duration,type,content,video_url) values((lesson->>'id')::uuid,mid,lesson->>'title',(select count(*) from public.lessons where module_id=mid),(lesson->>'duration')::integer,lesson->>'type',coalesce(lesson->>'content',''),coalesce(lesson->>'videoUrl',''));
    end loop;
   end loop;
 $old$,$new$
   insert into public.modules(id,course_id,title,position)
   select (m->>'id')::uuid,cid,m->>'title',position-1 from jsonb_array_elements(payload->'modules') with ordinality as modules(m,position);
   insert into public.lessons(id,module_id,title,position,duration,type,content,video_url)
   select (l->>'id')::uuid,(m->>'id')::uuid,l->>'title',position-1,(l->>'duration')::integer,l->>'type',coalesce(l->>'content',''),coalesce(l->>'videoUrl','')
   from jsonb_array_elements(payload->'modules') as modules(m),lateral jsonb_array_elements(m->'lessons') with ordinality as lessons(l,position);
 $new$);
 if revised=definition then raise exception 'Course hardening did not match curriculum inserts'; end if;
 execute revised;
 definition:=pg_get_functiondef('public.lesson_resource_command(text,jsonb)'::regprocedure);
 revised:=replace(definition,'if action=''prepare'' then','if action=''prepare'' then perform lms_private.course_request_limit(''pdf'',60);');
 if revised=definition then raise exception 'Course hardening did not match resource preparation'; end if;
 execute revised;
end $migration$;
commit;
