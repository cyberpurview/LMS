-- Apply once through Supabase SQL Editor or `supabase db push`.
begin;
create schema if not exists lms_private;
revoke all on schema lms_private from public;
create type public.lms_role as enum ('admin','tutor','learner');
create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  name text not null check (length(name) between 1 and 100),
  email text not null, avatar text not null default '',
  role public.lms_role not null default 'learner',
  is_active boolean not null default true,
  preferences jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create table public.categories (name text primary key check(length(name) between 1 and 80));
create table public.platform_settings (
  singleton boolean primary key default true check(singleton),
  platform_name text not null default 'LearnFlow' check(length(platform_name) between 1 and 100),
  enrollment_open boolean not null default true, certificate_enabled boolean not null default true
);
insert into public.platform_settings(singleton) values(true);
create table public.courses (
  id uuid primary key default gen_random_uuid(), tutor_id uuid not null references public.profiles,
  title text not null check(length(title) between 1 and 200), description text not null,
  search_document tsvector generated always as (to_tsvector('english',title||' '||description)) stored,
  category text not null references public.categories, level text not null check(level in ('Beginner','Intermediate','Advanced')),
  status text not null default 'draft' check(status in ('published','draft','archived')),
  price numeric(12,2) not null default 0 check(price>=0), duration numeric not null default 0 check(duration>=0),
  thumbnail text not null default '', tags text[] not null default '{}',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.modules (
  id uuid primary key default gen_random_uuid(), course_id uuid not null references public.courses on delete cascade,
  title text not null, position integer not null check(position>=0), unique(course_id,position)
);
create table public.lessons (
  id uuid primary key default gen_random_uuid(), module_id uuid not null references public.modules on delete cascade,
  title text not null, position integer not null check(position>=0), duration integer not null default 0 check(duration>=0),
  type text not null check(type in ('reading','video','quiz')), content text not null default '',
  video_url text not null default '', unique(module_id,position)
);
create table public.enrollments (
  id uuid primary key default gen_random_uuid(), learner_id uuid not null references public.profiles,
  course_id uuid not null references public.courses, enrolled_at timestamptz not null default now(),
  last_accessed_at timestamptz not null default now(), completed_at timestamptz,
  unique(learner_id,course_id)
);
create table public.lesson_progress (
  learner_id uuid not null references public.profiles, lesson_id uuid not null references public.lessons on delete cascade,
  completed_at timestamptz not null default now(), primary key(learner_id,lesson_id)
);
create table public.lesson_notes (
  learner_id uuid not null references public.profiles, lesson_id uuid not null references public.lessons on delete cascade,
  body text not null check(length(body)<=20000), updated_at timestamptz not null default now(), primary key(learner_id,lesson_id)
);
create table public.quizzes (
  id uuid primary key default gen_random_uuid(), course_id uuid not null references public.courses,
  title text not null, passing_score integer not null check(passing_score between 1 and 100),
  time_limit integer not null check(time_limit between 1 and 180), version integer not null default 1
);
create table public.quiz_questions (
  id uuid primary key default gen_random_uuid(), quiz_id uuid not null references public.quizzes on delete cascade,
  text text not null, options jsonb not null check(jsonb_typeof(options)='array' and jsonb_array_length(options) between 2 and 10),
  position integer not null, unique(quiz_id,position)
);
-- Answer keys never appear in the public Data API, even with an authenticated learner JWT.
create table lms_private.quiz_keys (
  question_id uuid primary key references public.quiz_questions on delete cascade,
  correct_option_id text not null, explanation text not null default ''
);
create table public.quiz_attempts (
  id uuid primary key default gen_random_uuid(), quiz_id uuid not null references public.quizzes,
  learner_id uuid not null references public.profiles, version integer not null,
  started_at timestamptz not null default now(), submitted_at timestamptz,
  score integer check(score between 0 and 100), passed boolean, answers jsonb,
  feedback jsonb not null default '[]'
);
create unique index one_open_attempt on public.quiz_attempts(learner_id,quiz_id) where submitted_at is null;
create table public.certificates (
  id uuid primary key default gen_random_uuid(), learner_id uuid not null references public.profiles,
  course_id uuid not null references public.courses, learner_name text not null, course_title text not null,
  issued_at timestamptz not null default now(), unique(learner_id,course_id)
);
create table public.notifications (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles on delete cascade,
  title text not null, message text not null, type text not null default 'info',
  is_read boolean not null default false, created_at timestamptz not null default now()
);
create table public.support_tickets (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles,
  subject text not null, message text not null, status text not null default 'open', created_at timestamptz not null default now()
);
create table lms_private.audit_log (
  id bigint generated always as identity primary key, actor_id uuid, action text not null,
  entity_id uuid, created_at timestamptz not null default now()
);
create index courses_owner_status on public.courses(tutor_id,status,created_at desc,id);
create index courses_catalog on public.courses(status,category,created_at desc,id);
create index courses_search on public.courses using gin(search_document);
create index enrollments_course on public.enrollments(course_id,learner_id);
create index attempts_learner on public.quiz_attempts(learner_id,submitted_at desc);
create index attempts_quiz on public.quiz_attempts(quiz_id,submitted_at desc);
create index quizzes_course on public.quizzes(course_id);
create index notifications_owner on public.notifications(user_id,created_at desc,id);
create index tickets_owner on public.support_tickets(user_id,created_at desc);
create index progress_lesson on public.lesson_progress(lesson_id);
create index notes_lesson on public.lesson_notes(lesson_id);

create function lms_private.current_role() returns public.lms_role language sql stable security definer set search_path='' as $$
 select role from public.profiles where id=(select auth.uid()) and is_active;
$$;
create function lms_private.manages(cid uuid) returns boolean language sql stable security definer set search_path='' as $$
 select coalesce(lms_private.current_role()='admin' or (lms_private.current_role()='tutor' and exists(select 1 from public.courses where id=cid and tutor_id=(select auth.uid()))),false);
$$;
create function lms_private.enrolled(cid uuid) returns boolean language sql stable security definer set search_path='' as $$
 select lms_private.current_role() is not null and exists(select 1 from public.enrollments where course_id=cid and learner_id=(select auth.uid()));
$$;
create function lms_private.can_read_course(cid uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.courses where id=cid and status='published') or lms_private.manages(cid) or lms_private.enrolled(cid);
$$;
create function lms_private.create_profile() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.profiles(id,name,email) values(new.id,coalesce(nullif(left(trim(new.raw_user_meta_data->>'name'),100),''),'Learner'),coalesce(new.email,''));
 return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function lms_private.create_profile();
-- Existing Auth accounts are migrated as learners. Elevation always requires a trusted administrator.
insert into public.profiles(id,name,email) select id,coalesce(nullif(left(trim(raw_user_meta_data->>'name'),100),''),'Learner'),coalesce(email,'') from auth.users on conflict do nothing;
create function lms_private.sync_email() returns trigger language plpgsql security definer set search_path='' as $$
begin update public.profiles set email=coalesce(new.email,'') where id=new.id; return new; end $$;
create trigger on_auth_email_updated after update of email on auth.users for each row execute function lms_private.sync_email();

alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.platform_settings enable row level security;
alter table public.courses enable row level security;
alter table public.modules enable row level security;
alter table public.lessons enable row level security;
alter table public.enrollments enable row level security;
alter table public.lesson_progress enable row level security;
alter table public.lesson_notes enable row level security;
alter table public.quizzes enable row level security;
alter table public.quiz_questions enable row level security;
alter table public.quiz_attempts enable row level security;
alter table public.certificates enable row level security;
alter table public.notifications enable row level security;
alter table public.support_tickets enable row level security;
create policy profiles_read on public.profiles for select to authenticated using (
 lms_private.current_role() is not null and (id=(select auth.uid()) or lms_private.current_role()='admin' or
 exists(select 1 from public.courses where tutor_id=profiles.id and lms_private.can_read_course(id)) or
 exists(select 1 from public.enrollments where learner_id=profiles.id and lms_private.manages(course_id)))
);
create policy categories_read on public.categories for select using(true);
create policy settings_read on public.platform_settings for select using(true);
create policy courses_read on public.courses for select using(lms_private.can_read_course(id));
create policy modules_read on public.modules for select using(lms_private.can_read_course(course_id));
-- Actual lesson content is only visible to enrolled learners and course managers.
create policy lessons_read on public.lessons for select to authenticated using(exists(select 1 from public.modules where id=module_id and (lms_private.manages(course_id) or lms_private.enrolled(course_id))));
create policy enrollments_read on public.enrollments for select to authenticated using((learner_id=(select auth.uid()) and lms_private.current_role() is not null) or lms_private.manages(course_id));
create policy progress_read on public.lesson_progress for select to authenticated using(learner_id=(select auth.uid()) and lms_private.current_role() is not null);
create policy notes_read on public.lesson_notes for select to authenticated using(learner_id=(select auth.uid()) and lms_private.current_role() is not null);
create policy quizzes_read on public.quizzes for select to authenticated using(lms_private.manages(course_id) or lms_private.enrolled(course_id));
create policy questions_read on public.quiz_questions for select to authenticated using(exists(select 1 from public.quizzes where id=quiz_id));
create policy attempts_read on public.quiz_attempts for select to authenticated using((learner_id=(select auth.uid()) and lms_private.current_role() is not null) or exists(select 1 from public.quizzes where id=quiz_id and lms_private.manages(course_id)));
create policy certificates_read on public.certificates for select to authenticated using((learner_id=(select auth.uid()) and lms_private.current_role() is not null) or lms_private.manages(course_id));
create policy notifications_read on public.notifications for select to authenticated using(user_id=(select auth.uid()) and lms_private.current_role() is not null);
create policy tickets_read on public.support_tickets for select to authenticated using((user_id=(select auth.uid()) and lms_private.current_role() is not null) or lms_private.current_role()='admin');
-- No client table writes: commands below enforce invariants in database transactions.
revoke all on public.profiles,public.categories,public.platform_settings,public.courses,public.modules,public.lessons,public.enrollments,public.lesson_progress,public.lesson_notes,public.quizzes,public.quiz_questions,public.quiz_attempts,public.certificates,public.notifications,public.support_tickets from anon,authenticated;
grant select on public.categories,public.courses,public.modules to anon,authenticated;
grant select on public.platform_settings to anon,authenticated;
grant select on public.profiles,public.lessons,public.enrollments,public.lesson_progress,public.lesson_notes,public.quizzes,public.quiz_questions,public.quiz_attempts,public.certificates,public.notifications,public.support_tickets to authenticated;
grant usage on schema lms_private to anon,authenticated;
revoke all on function lms_private.current_role(),lms_private.manages(uuid),lms_private.enrolled(uuid),lms_private.can_read_course(uuid),lms_private.create_profile(),lms_private.sync_email() from public,anon,authenticated;
grant execute on function lms_private.current_role(),lms_private.manages(uuid),lms_private.enrolled(uuid),lms_private.can_read_course(uuid) to anon,authenticated;

create function lms_private.issue_certificate(cid uuid,uid uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if not (select certificate_enabled from public.platform_settings where singleton) then return; end if;
 if exists(select 1 from public.enrollments where course_id=cid and learner_id=uid)
 and exists(select 1 from public.lessons l join public.modules m on m.id=l.module_id where m.course_id=cid)
 and not exists(select 1 from public.lessons l join public.modules m on m.id=l.module_id where m.course_id=cid and not exists(select 1 from public.lesson_progress p where p.lesson_id=l.id and p.learner_id=uid))
 and exists(select 1 from public.quizzes where course_id=cid)
 and not exists(select 1 from public.quizzes q where q.course_id=cid and not exists(select 1 from public.quiz_attempts a where a.quiz_id=q.id and a.learner_id=uid and a.passed and a.version=q.version)) then
  insert into public.certificates(learner_id,course_id,learner_name,course_title) select uid,cid,p.name,c.title from public.profiles p,public.courses c where p.id=uid and c.id=cid on conflict do nothing;
  update public.enrollments set completed_at=coalesce(completed_at,now()) where learner_id=uid and course_id=cid;
 end if;
end $$;

create function public.enroll_course(course_id uuid) returns uuid language plpgsql security definer set search_path='' as $$
#variable_conflict use_column
declare eid uuid; c public.courses;
begin
 if lms_private.current_role() is distinct from 'learner' then raise exception 'Learner access required' using errcode='42501'; end if;
 if not (select enrollment_open from public.platform_settings where singleton) then raise exception 'New enrollments are currently closed'; end if;
 select * into c from public.courses where id=course_id and status='published' for share;
 if c.id is null then raise exception 'Course unavailable'; end if;
 if c.price>0 then raise exception 'Paid enrollment requires verified payment. Contact the administrator.'; end if;
 insert into public.enrollments(learner_id,course_id) values(auth.uid(),c.id) on conflict(learner_id,course_id) do update set last_accessed_at=now() returning id into eid;
 return eid;
end $$;

create function public.complete_lesson(lesson_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare cid uuid;
begin
 select m.course_id into cid from public.lessons l join public.modules m on m.id=l.module_id where l.id=lesson_id;
 if not coalesce(lms_private.enrolled(cid),false) then raise exception 'Enrollment required' using errcode='42501'; end if;
 perform 1 from public.enrollments where learner_id=auth.uid() and course_id=cid for update;
 insert into public.lesson_progress(learner_id,lesson_id) values(auth.uid(),lesson_id) on conflict do nothing;
 update public.enrollments set last_accessed_at=now() where learner_id=auth.uid() and course_id=cid;
 perform lms_private.issue_certificate(cid,auth.uid());
end $$;

create function public.start_quiz(quiz_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
#variable_conflict use_column
declare q public.quizzes; a public.quiz_attempts;
begin
 select * into q from public.quizzes where id=quiz_id;
 if not coalesce(lms_private.enrolled(q.course_id),false) then raise exception 'Enrollment required' using errcode='42501'; end if;
 if not exists(select 1 from public.quiz_questions where quiz_questions.quiz_id=q.id) then raise exception 'Quiz has no questions'; end if;
 insert into public.quiz_attempts(quiz_id,learner_id,version) values(q.id,auth.uid(),q.version)
 on conflict(learner_id,quiz_id) where submitted_at is null do update set quiz_id=excluded.quiz_id returning * into a;
 return jsonb_build_object('id',a.id,'deadline',a.started_at+make_interval(mins=>q.time_limit));
end $$;

create function public.submit_quiz(attempt_id uuid,answers jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.quiz_attempts; q public.quizzes; total integer; correct integer; mark integer; review jsonb;
begin
 select * into a from public.quiz_attempts where id=attempt_id and learner_id=auth.uid() for update;
 if a.id is null or lms_private.current_role() is distinct from 'learner' then raise exception 'Attempt unavailable' using errcode='42501'; end if;
 select * into q from public.quizzes where id=a.quiz_id;
 if a.submitted_at is not null then return jsonb_build_object('score',a.score,'passed',a.passed,'feedback',a.feedback); end if;
 if a.version<>q.version then raise exception 'Assessment changed. Ask your tutor to close this attempt.'; end if;
 if jsonb_typeof(answers)<>'object' or pg_column_size(answers)>64000 then raise exception 'Invalid answers'; end if;
 select count(*),count(*) filter(where answers->>x.id::text=k.correct_option_id),
 jsonb_agg(jsonb_build_object('id',x.id,'correctOptionId',k.correct_option_id,'explanation',k.explanation) order by x.position)
 into total,correct,review from public.quiz_questions x join lms_private.quiz_keys k on k.question_id=x.id where x.quiz_id=q.id;
 -- Time is measured by PostgreSQL, never by a client timer. Expired attempts score zero.
 mark:=case when now()>a.started_at+make_interval(mins=>q.time_limit)+interval '5 seconds' then 0 else round(100.0*correct/nullif(total,0)) end;
 update public.quiz_attempts set submitted_at=now(),score=mark,passed=mark>=q.passing_score,answers=submit_quiz.answers,feedback=review where id=a.id;
 perform 1 from public.enrollments where learner_id=auth.uid() and course_id=q.course_id for update;
 perform lms_private.issue_certificate(q.course_id,auth.uid());
 return jsonb_build_object('score',mark,'passed',mark>=q.passing_score,'feedback',review);
end $$;

create function public.verify_certificate(certificate_id uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',id,'learnerName',learner_name,'courseTitle',course_title,'issuedAt',issued_at) from public.certificates where id=certificate_id;
$$;

-- One validated command per request; the client cannot set scores, progress, issuer, or creation timestamps.
create function public.lms_command(command text,payload jsonb) returns void language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); r public.lms_role:=lms_private.current_role(); cid uuid; mid uuid; item jsonb; lesson jsonb; question jsonb; existing public.courses; target uuid;
begin
 if uid is null or r is null then raise exception 'Authentication required' using errcode='42501'; end if;
 if pg_column_size(payload)>524288 then raise exception 'Payload too large'; end if;
 case command
 when 'saveCourse' then
  cid:=(payload->>'id')::uuid; select * into existing from public.courses where id=cid for update;
  if r='learner' or (existing.id is not null and not lms_private.manages(cid)) then raise exception 'Course management denied' using errcode='42501'; end if;
  target:=case when r='tutor' then uid else (payload->>'tutorId')::uuid end;
  if not exists(select 1 from public.profiles where id=target and role='tutor' and is_active) then raise exception 'Choose an active tutor'; end if;
  if existing.id is not null and existing.updated_at<>(payload->>'updatedAt')::timestamptz then raise exception 'Course changed in another session. Reload before saving.'; end if;
  -- Curriculum changes after enrollment need a versioning workflow; do not erase learner history.
  if exists(select 1 from public.enrollments where course_id=cid) and payload ? 'modules' and
    (select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'title',m.title,'lessons',(select coalesce(jsonb_agg(jsonb_build_object('id',l.id,'title',l.title,'duration',l.duration,'type',l.type,'content',l.content,'videoUrl',l.video_url) order by l.position),'[]') from public.lessons l where l.module_id=m.id)) order by m.position),'[]') from public.modules m where m.course_id=cid)<>payload->'modules'
  then raise exception 'Curriculum is locked after enrollment. Create a new course version.'; end if;
  if not exists(select 1 from public.categories where name=payload->>'category') then raise exception 'Unknown category'; end if;
  insert into public.courses(id,tutor_id,title,description,category,level,status,price,duration,thumbnail,tags)
  values(cid,target,payload->>'title',payload->>'description',payload->>'category',payload->>'level',payload->>'status',(payload->>'price')::numeric,(payload->>'duration')::numeric,coalesce(payload->>'thumbnail',''),array(select jsonb_array_elements_text(payload->'tags')))
  on conflict(id) do update set tutor_id=excluded.tutor_id,title=excluded.title,description=excluded.description,category=excluded.category,level=excluded.level,status=excluded.status,price=excluded.price,duration=excluded.duration,thumbnail=excluded.thumbnail,tags=excluded.tags,updated_at=clock_timestamp();
  if not exists(select 1 from public.enrollments where course_id=cid) then
   delete from public.modules where course_id=cid;
   for item in select value from jsonb_array_elements(payload->'modules') loop
    mid:=(item->>'id')::uuid;
    insert into public.modules(id,course_id,title,position) values(mid,cid,item->>'title',(select count(*) from public.modules where course_id=cid));
    for lesson in select value from jsonb_array_elements(item->'lessons') loop
     insert into public.lessons(id,module_id,title,position,duration,type,content,video_url) values((lesson->>'id')::uuid,mid,lesson->>'title',(select count(*) from public.lessons where module_id=mid),(lesson->>'duration')::integer,lesson->>'type',coalesce(lesson->>'content',''),coalesce(lesson->>'videoUrl',''));
    end loop;
   end loop;
  end if;
 when 'saveQuiz' then
  cid:=(payload->>'courseId')::uuid;
  if not lms_private.manages(cid) then raise exception 'Quiz management denied' using errcode='42501'; end if;
  target:=(payload->>'id')::uuid;
  if exists(select 1 from public.quizzes where id=target and course_id<>cid) then raise exception 'Cannot move an assessment'; end if;
  perform 1 from public.quizzes where id=target for update;
  if exists(select 1 from public.quiz_attempts where quiz_id=target and submitted_at is null) then raise exception 'An assessment is in progress. Try again later.'; end if;
  if jsonb_array_length(payload->'questions') not between 1 and 100 then raise exception 'Add 1 to 100 questions'; end if;
  insert into public.quizzes(id,course_id,title,passing_score,time_limit) values(target,cid,payload->>'title',(payload->>'passingScore')::integer,(payload->>'timeLimit')::integer)
   on conflict(id) do update set title=excluded.title,passing_score=excluded.passing_score,time_limit=excluded.time_limit,version=quizzes.version+1;
  delete from public.quiz_questions where quiz_id=target;
  for question in select value from jsonb_array_elements(payload->'questions') loop
   if not exists(select 1 from jsonb_array_elements(question->'options') o where o->>'id'=question->>'correctOptionId') then raise exception 'Correct answer must be an option'; end if;
   insert into public.quiz_questions(id,quiz_id,text,options,position) values((question->>'id')::uuid,target,question->>'text',question->'options',(select count(*) from public.quiz_questions where quiz_id=target));
   insert into lms_private.quiz_keys(question_id,correct_option_id,explanation) values((question->>'id')::uuid,question->>'correctOptionId',coalesce(question->>'explanation',''));
  end loop;
 when 'profile' then
  target:=(payload->>'id')::uuid;
  if target<>uid and r<>'admin' then raise exception 'Profile management denied' using errcode='42501'; end if;
  update public.profiles set name=payload->>'name' where id=target;
  if r='admin' and target<>uid then update public.profiles set role=(payload->>'role')::public.lms_role,is_active=(payload->>'isActive')::boolean where id=target; end if;
 when 'preferences' then
  update public.profiles set preferences=payload where id=uid;
  if r='admin' then
   update public.platform_settings set platform_name=coalesce(payload->>'platformName',platform_name),enrollment_open=coalesce((payload->>'enrollmentOpen')::boolean,enrollment_open),certificate_enabled=coalesce((payload->>'certificateEnabled')::boolean,certificate_enabled) where singleton;
  end if;
 when 'category' then
  if r<>'admin' then raise exception 'Administrator access required' using errcode='42501'; end if;
  insert into public.categories(name) values(trim(payload->>'name')) on conflict do nothing;
 when 'supportStatus' then
  if r<>'admin' then raise exception 'Administrator access required' using errcode='42501'; end if;
  if payload->>'status' not in ('open','closed') then raise exception 'Invalid status'; end if;
  update public.support_tickets set status=payload->>'status' where id=(payload->>'id')::uuid;
 when 'readNotification' then update public.notifications set is_read=true where user_id=uid and (payload->>'id' is null or id=(payload->>'id')::uuid);
 when 'note' then
  target:=(payload->>'lessonId')::uuid;
  select m.course_id into cid from public.lessons l join public.modules m on m.id=l.module_id where l.id=target;
  if not coalesce(lms_private.enrolled(cid),false) then raise exception 'Enrollment required' using errcode='42501'; end if;
  insert into public.lesson_notes(learner_id,lesson_id,body) values(uid,target,payload->>'body') on conflict(learner_id,lesson_id) do update set body=excluded.body,updated_at=now();
 when 'support' then insert into public.support_tickets(user_id,subject,message) values(uid,payload->>'subject',payload->>'message');
 else raise exception 'Unknown command';
 end case;
 insert into lms_private.audit_log(actor_id,action,entity_id) values(uid,command,coalesce(cid,target));
end $$;

create function public.quiz_editor_keys(quiz_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not exists(select 1 from public.quizzes where id=quiz_id and lms_private.manages(course_id)) then raise exception 'Access denied' using errcode='42501'; end if;
 return (select coalesce(jsonb_agg(jsonb_build_object('id',q.id,'correctOptionId',k.correct_option_id,'explanation',k.explanation)),'[]') from public.quiz_questions q join lms_private.quiz_keys k on k.question_id=q.id where q.quiz_id=quiz_editor_keys.quiz_id);
end $$;
create function public.course_outlines(course_ids uuid[]) returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'tutorName',p.name,'enrolledCount',(select count(*) from public.enrollments where course_id=c.id),'modules',
 (select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'title',m.title,'lessons',
 (select coalesce(jsonb_agg(jsonb_build_object('id',l.id,'title',l.title,'duration',l.duration,'type',l.type,'content',case when lms_private.enrolled(c.id) or lms_private.manages(c.id) then l.content else '' end,'videoUrl',case when lms_private.enrolled(c.id) or lms_private.manages(c.id) then l.video_url else '' end) order by l.position),'[]') from public.lessons l where l.module_id=m.id)) order by m.position),'[]') from public.modules m where m.course_id=c.id))),'[]')
 from public.courses c join public.profiles p on p.id=c.tutor_id where c.id=any(course_ids) and lms_private.can_read_course(c.id) and cardinality(course_ids)<=100;
$$;
create function public.enrollment_summaries(enrollment_ids uuid[]) returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'completedLessons',
 (select coalesce(jsonb_agg(l.id),'[]') from public.lesson_progress lp join public.lessons l on l.id=lp.lesson_id join public.modules m on m.id=l.module_id where m.course_id=e.course_id and lp.learner_id=e.learner_id),
 'totalLessons',(select count(*) from public.lessons l join public.modules m on m.id=l.module_id where m.course_id=e.course_id),
 'certificateIssued',exists(select 1 from public.certificates where learner_id=e.learner_id and course_id=e.course_id))),'[]')
 from public.enrollments e where e.id=any(enrollment_ids) and cardinality(enrollment_ids)<=50 and ((e.learner_id=auth.uid() and lms_private.current_role() is not null) or lms_private.manages(e.course_id));
$$;
create function public.quiz_editor_keys_bulk(quiz_ids uuid[]) returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'correctOptionId',k.correct_option_id,'explanation',k.explanation)),'[]') from public.quiz_questions x join lms_private.quiz_keys k on k.question_id=x.id join public.quizzes q on q.id=x.quiz_id where q.id=any(quiz_ids) and cardinality(quiz_ids)<=100 and lms_private.manages(q.course_id);
$$;
revoke all on function public.course_outlines(uuid[]),public.enrollment_summaries(uuid[]),public.quiz_editor_keys_bulk(uuid[]) from public,anon,authenticated;
grant execute on function public.course_outlines(uuid[]) to anon,authenticated;
grant execute on function public.enrollment_summaries(uuid[]),public.quiz_editor_keys_bulk(uuid[]) to authenticated;
revoke all on function lms_private.issue_certificate(uuid,uuid) from public,anon,authenticated;
revoke all on function public.enroll_course(uuid),public.complete_lesson(uuid),public.start_quiz(uuid),public.submit_quiz(uuid,jsonb),public.lms_command(text,jsonb),public.quiz_editor_keys(uuid),public.verify_certificate(uuid) from public,anon,authenticated;
grant execute on function public.enroll_course(uuid),public.complete_lesson(uuid),public.start_quiz(uuid),public.submit_quiz(uuid,jsonb),public.lms_command(text,jsonb),public.quiz_editor_keys(uuid) to authenticated;
grant execute on function public.verify_certificate(uuid) to anon,authenticated;
commit;
