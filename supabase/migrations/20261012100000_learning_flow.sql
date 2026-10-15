begin;
alter table public.courses add column require_assessment boolean not null default true;
-- Completion is earned independently of whether certificate delivery is enabled.
create or replace function lms_private.issue_certificate(cid uuid,uid uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.enrollments where course_id=cid and learner_id=uid)
 and exists(select 1 from public.lessons l join public.modules m on m.id=l.module_id where m.course_id=cid)
 and not exists(select 1 from public.lessons l join public.modules m on m.id=l.module_id where m.course_id=cid and not exists(select 1 from public.lesson_progress p where p.lesson_id=l.id and p.learner_id=uid))
 and ((select not require_assessment from public.courses where id=cid) or (
 exists(select 1 from public.quizzes where course_id=cid and status='published')
 and not exists(select 1 from public.quizzes q where q.course_id=cid and q.status='published' and not exists(select 1 from public.quiz_attempts a where a.quiz_id=q.id and a.learner_id=uid and a.passed and a.version=q.version)))) then
  update public.enrollments set completed_at=coalesce(completed_at,clock_timestamp()) where learner_id=uid and course_id=cid;
  if (select certificate_enabled from public.platform_settings where singleton) then
   insert into public.certificates(learner_id,course_id,learner_name,course_title) select uid,cid,p.name,c.title from public.profiles p,public.courses c where p.id=uid and c.id=cid on conflict do nothing;
  end if;
 end if;
end $$;

create or replace function public.enrollment_summaries(enrollment_ids uuid[]) returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'completedLessons',
 (select coalesce(jsonb_agg(l.id),'[]') from public.lesson_progress lp join public.lessons l on l.id=lp.lesson_id join public.modules m on m.id=l.module_id where m.course_id=e.course_id and lp.learner_id=e.learner_id),
 'totalLessons',(select count(*) from public.lessons l join public.modules m on m.id=l.module_id where m.course_id=e.course_id),
 'totalAssessments',(select count(*) from public.quizzes q where q.course_id=e.course_id and q.status='published'),
 'passedAssessments',(select count(*) from public.quizzes q where q.course_id=e.course_id and q.status='published' and exists(select 1 from public.quiz_attempts a where a.quiz_id=q.id and a.learner_id=e.learner_id and a.passed and a.version=q.version)),
 'certificateEnabled',(select certificate_enabled from public.platform_settings where singleton),
 'certificateIssued',exists(select 1 from public.certificates where learner_id=e.learner_id and course_id=e.course_id))),'[]')
 from public.enrollments e where e.id=any(enrollment_ids) and cardinality(enrollment_ids)<=50 and ((e.learner_id=auth.uid() and lms_private.current_role() is not null) or lms_private.manages(e.course_id));
$$;

create or replace function public.quiz_summaries(quiz_ids uuid[]) returns jsonb
language sql stable security invoker set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'questionCount',s.count,
 'bestScore',(select max(a.score) from public.quiz_attempts a where a.quiz_id=s.id and a.learner_id=auth.uid() and a.version=s.version and a.submitted_at is not null),
 'passed',exists(select 1 from public.quiz_attempts a where a.quiz_id=s.id and a.learner_id=auth.uid() and a.version=s.version and a.passed),
 'inProgress',exists(select 1 from public.quiz_attempts a where a.quiz_id=s.id and a.learner_id=auth.uid() and a.submitted_at is null))),'[]'::jsonb)
 from (select q.id,q.version,count(qq.id) as count from public.quizzes q
 left join public.quiz_questions qq on qq.quiz_id=q.id
 where cardinality(quiz_ids)<=200 and q.id=any(quiz_ids) group by q.id) s;
$$;

-- Serialize assessment publication with certificate issuance via the parent course.
-- Historical certificates must not acquire additional quiz requirements afterward.
do $migration$
declare definition text; revised text;
begin
 definition:=pg_get_functiondef('public.lms_command(text,jsonb)'::regprocedure);
 revised:=replace(definition,'cid:=(payload->>''courseId'')::uuid;',$branch$cid:=(payload->>'courseId')::uuid;
  perform 1 from public.courses where id=cid for update;
  if not exists(select 1 from public.quizzes where id=(payload->>'id')::uuid)
    and (select count(*) from public.quizzes where course_id=cid)>=100 then raise exception 'A course can have up to 100 assessments, including drafts.'; end if;
  if coalesce(payload->>'status','published')='published'
   and not exists(select 1 from public.quizzes where id=(payload->>'id')::uuid and status='published')
   and (select require_assessment from public.courses where id=cid)
   and (exists(select 1 from public.certificates where course_id=cid) or exists(select 1 from public.enrollments where course_id=cid and completed_at is not null))
  then raise exception 'This course has issued certificates. Publish additional assessments in a new course version.'; end if;
 $branch$);
 if revised=definition then raise exception 'Learning flow did not match quiz save'; end if;
 definition:=revised;
 revised:=replace(definition,'target:=case when r=''tutor''',$branch$if existing.id is not null and existing.require_assessment is distinct from coalesce((payload->>'requireAssessment')::boolean,existing.require_assessment)
   and exists(select 1 from public.enrollments where course_id=cid) then raise exception 'Completion requirements are locked after enrollment. Create a new course version.'; end if;
  target:=case when r='tutor'$branch$);
 if revised=definition then raise exception 'Learning flow did not match course settings'; end if;
 definition:=revised;
 revised:=replace(definition,'when ''saveQuiz'' then',$branch$update public.courses set require_assessment=coalesce((payload->>'requireAssessment')::boolean,require_assessment) where id=cid;
 when 'saveQuiz' then$branch$);
 if revised=definition then raise exception 'Learning flow did not match course setting persistence'; end if;
 execute revised;
end $migration$;
-- Certificate issuance must share the same course lock, acquired before enrollment locks.
do $migration$
declare definition text; revised text;
begin
 definition:=pg_get_functiondef('public.complete_lesson(uuid)'::regprocedure);
 revised:=replace(definition,'perform 1 from public.enrollments','perform 1 from public.courses where id=cid for share; perform 1 from public.enrollments');
 if revised=definition then raise exception 'Learning flow did not match lesson completion'; end if;
 execute revised;
 definition:=pg_get_functiondef('public.submit_quiz(uuid,jsonb)'::regprocedure);
 revised:=replace(definition,'perform 1 from public.enrollments','perform 1 from public.courses where id=q.course_id for share; perform 1 from public.enrollments');
 if revised=definition then raise exception 'Learning flow did not match quiz submission'; end if;
 execute revised;
end $migration$;
commit;
