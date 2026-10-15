begin;
-- Existing assessments remain published; new authoring uses explicit drafts.
alter table public.quizzes add column status text not null default 'published' check(status in ('draft','published'));
create index quizzes_course_status on public.quizzes(course_id,status);
drop policy quizzes_read on public.quizzes;
create policy quizzes_read on public.quizzes for select to authenticated using(lms_private.manages(course_id) or (status='published' and lms_private.enrolled(course_id)));

create function public.quiz_authoring_info(quiz_ids uuid[]) returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',q.id,'editLocked',exists(select 1 from public.quiz_attempts a where a.quiz_id=q.id))),'[]')
 from public.quizzes q where q.id=any(quiz_ids) and cardinality(quiz_ids)<=100 and lms_private.manages(q.course_id);
$$;
revoke all on function public.quiz_authoring_info(uuid[]) from public,anon;
grant execute on function public.quiz_authoring_info(uuid[]) to authenticated;

do $migration$
declare definition text; revised text; first_pos integer; last_pos integer;
begin
 definition:=pg_get_functiondef('public.lms_command(text,jsonb)'::regprocedure);
 first_pos:=strpos(definition,' when ''saveQuiz'' then');
 last_pos:=strpos(definition,' when ''profile'' then');
 if first_pos=0 or last_pos<=first_pos then raise exception 'Quiz draft migration did not match command'; end if;
 revised:=substring(definition from 1 for first_pos-1) || $branch$
 when 'saveQuiz' then
  cid:=(payload->>'courseId')::uuid;
  if not lms_private.manages(cid) then raise exception 'Quiz management denied' using errcode='42501'; end if;
  target:=(payload->>'id')::uuid;
  perform 1 from public.quizzes where id=target for update;
  if exists(select 1 from public.quizzes where id=target and course_id<>cid) then raise exception 'Cannot move an assessment'; end if;
  if exists(select 1 from public.quiz_attempts where quiz_id=target) then raise exception 'This assessment is locked because a learner has started it. Create a new draft copy for changes.'; end if;
  if exists(select 1 from public.quizzes where id=target and version is distinct from (payload->>'version')::integer) then raise exception 'Assessment changed in another session. Reload before saving.'; end if;
  if nullif(trim(payload->>'title'),'') is null then raise exception 'Add an assessment title before saving.'; end if;
  if coalesce(payload->>'status','published') not in ('draft','published') then raise exception 'Invalid assessment status'; end if;
  if jsonb_typeof(payload->'questions') is distinct from 'array' or jsonb_array_length(payload->'questions')>100 then raise exception 'Add at most 100 questions'; end if;
  if coalesce(payload->>'status','published')='published' and jsonb_array_length(payload->'questions')=0 then raise exception 'Add at least one question before publishing.'; end if;
  insert into public.quizzes(id,course_id,title,passing_score,time_limit,status) values(target,cid,trim(payload->>'title'),(payload->>'passingScore')::integer,(payload->>'timeLimit')::integer,coalesce(payload->>'status','published'))
   on conflict(id) do update set title=excluded.title,passing_score=excluded.passing_score,time_limit=excluded.time_limit,status=excluded.status,version=quizzes.version+1;
  delete from public.quiz_questions where quiz_id=target;
  for question in select value from jsonb_array_elements(payload->'questions') loop
   if char_length(question->>'text')>2000 or char_length(coalesce(question->>'explanation',''))>5000 or exists(select 1 from jsonb_array_elements(question->'options') o where char_length(o->>'text')>1000) then raise exception 'Question or answer is too long'; end if;
   if coalesce(payload->>'status','published')='published' then
    if nullif(trim(question->>'text'),'') is null or exists(select 1 from jsonb_array_elements(question->'options') o where nullif(trim(o->>'text'),'') is null) then raise exception 'Complete every question and answer before publishing.'; end if;
    if not exists(select 1 from jsonb_array_elements(question->'options') o where o->>'id'=question->>'correctOptionId') then raise exception 'Correct answer must be an option'; end if;
   elsif nullif(question->>'correctOptionId','') is not null and not exists(select 1 from jsonb_array_elements(question->'options') o where o->>'id'=question->>'correctOptionId') then raise exception 'Correct answer must be an option'; end if;
   insert into public.quiz_questions(id,quiz_id,text,options,position) values((question->>'id')::uuid,target,coalesce(question->>'text',''),question->'options',(select count(*) from public.quiz_questions where quiz_id=target));
   insert into lms_private.quiz_keys(question_id,correct_option_id,explanation) values((question->>'id')::uuid,coalesce(question->>'correctOptionId',''),coalesce(question->>'explanation',''));
  end loop;
 $branch$ || substring(definition from last_pos);
 execute revised;

 definition:=pg_get_functiondef('public.start_quiz(uuid)'::regprocedure);
 revised:=replace(definition,'if not coalesce(lms_private.enrolled(q.course_id),false)', 'if q.status is distinct from ''published'' then raise exception ''Assessment is not published'' using errcode=''42501''; end if; if not coalesce(lms_private.enrolled(q.course_id),false)');
 if revised=definition then raise exception 'Quiz draft migration did not match start'; end if;
 execute revised;

 definition:=pg_get_functiondef('lms_private.issue_certificate(uuid,uuid)'::regprocedure);
 revised:=replace(definition,'from public.quizzes where course_id=cid','from public.quizzes where course_id=cid and status=''published''');
 revised:=replace(revised,'where q.course_id=cid and not exists','where q.course_id=cid and q.status=''published'' and not exists');
 if revised=definition then raise exception 'Quiz draft migration did not match certificates'; end if;
 execute revised;
end
$migration$;
commit;
