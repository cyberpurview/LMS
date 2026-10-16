begin;
create function lms_private.validate_quiz_payload(payload jsonb) returns void language plpgsql set search_path='' as $$
declare question jsonb; option jsonb; question_ids uuid[]:='{}'; option_ids uuid[]; ident uuid;
begin
 if octet_length(payload::text)>524288 then raise exception 'Quiz payload too large'; end if;
 if char_length(payload->>'title')>200 or jsonb_typeof(payload->'title') is distinct from 'string' then raise exception 'Invalid quiz title'; end if;
 if (payload->>'timeLimit')::integer not between 1 and 180 or (payload->>'passingScore')::integer not between 1 and 100 then raise exception 'Invalid quiz settings'; end if;
 if jsonb_typeof(payload->'questions') is distinct from 'array' or jsonb_array_length(payload->'questions')>100 then raise exception 'Add at most 100 questions'; end if;
 for question in select value from jsonb_array_elements(payload->'questions') loop
  ident:=(question->>'id')::uuid;
  if ident is null or ident=any(question_ids) then raise exception 'Questions must have unique IDs'; end if;
  question_ids:=array_append(question_ids,ident);
  if jsonb_typeof(question->'text') is distinct from 'string' or char_length(question->>'text')>2000 or char_length(coalesce(question->>'explanation',''))>5000 then raise exception 'Invalid question text'; end if;
  if question ? 'explanation' and jsonb_typeof(question->'explanation') is distinct from 'string' then raise exception 'Invalid explanation'; end if;
  if jsonb_typeof(question->'options') is distinct from 'array' or jsonb_array_length(question->'options') not between 2 and 10 then raise exception 'Add 2 to 10 options'; end if;
  option_ids:='{}';
  for option in select value from jsonb_array_elements(question->'options') loop
   ident:=(option->>'id')::uuid;
   if ident is null or ident=any(option_ids) then raise exception 'Answer options must have unique IDs'; end if;
   option_ids:=array_append(option_ids,ident);
   if jsonb_typeof(option->'text') is distinct from 'string' or char_length(option->>'text')>1000 then raise exception 'Invalid answer text'; end if;
  end loop;
 end loop;
end $$;
revoke all on function lms_private.validate_quiz_payload(jsonb) from public,anon,authenticated;
do $migration$
declare definition text; revised text;
begin
 definition:=pg_get_functiondef('public.lms_command(text,jsonb)'::regprocedure);
 revised:=replace(definition,'when ''saveQuiz'' then',$branch$when 'saveQuiz' then
  perform lms_private.validate_quiz_payload(payload);
  perform lms_private.course_request_limit('quiz-save',120);
  perform pg_advisory_xact_lock(hashtextextended((payload->>'id')::uuid::text,0));
 $branch$);
 if revised=definition then raise exception 'Quiz hardening did not match save'; end if;
 execute revised;
end $migration$;
create function lms_private.validate_quiz_answers(quiz_id uuid,answers jsonb) returns void language plpgsql stable set search_path='' as $$
begin
 if jsonb_typeof(answers) is distinct from 'object' or octet_length(answers::text)>16384 then raise exception 'Invalid answers'; end if;
 if (select count(*) from jsonb_object_keys(answers))>100 then raise exception 'Submit at most 100 answers'; end if;
 if exists(select 1 from jsonb_each(answers) a where jsonb_typeof(a.value)<>'string' or not exists(
  select 1 from public.quiz_questions q where q.quiz_id=validate_quiz_answers.quiz_id and q.id::text=a.key
   and exists(select 1 from jsonb_array_elements(q.options) o where o->>'id'=a.value#>>'{}')
 )) then raise exception 'Answers must match this assessment and its options'; end if;
end $$;
revoke all on function lms_private.validate_quiz_answers(uuid,jsonb) from public,anon,authenticated;
create or replace function public.start_quiz(quiz_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
#variable_conflict use_column
declare q public.quizzes; a public.quiz_attempts;
begin
 if lms_private.current_role() is distinct from 'learner' then raise exception 'Learner access required' using errcode='42501'; end if;
 select * into q from public.quizzes where id=quiz_id for share;
 if q.id is null or q.status<>'published' then raise exception 'Assessment is not published' using errcode='42501'; end if;
 if not coalesce(lms_private.enrolled(q.course_id),false) then raise exception 'Enrollment required' using errcode='42501'; end if;
 if not exists(select 1 from public.quiz_questions where quiz_questions.quiz_id=q.id) then raise exception 'Quiz has no questions'; end if;
 perform lms_private.course_request_limit('quiz-start',120);
 -- Serialize starts by learner, so a missing open attempt is also protected.
 perform 1 from public.enrollments where learner_id=auth.uid() and course_id=q.course_id for update;
 update public.quiz_attempts set submitted_at=clock_timestamp(),score=0,passed=false,answers=coalesce(answers,'{}'),feedback='[]'
 where quiz_id=q.id and learner_id=auth.uid() and submitted_at is null and started_at+make_interval(mins=>q.time_limit)+interval '5 seconds'<clock_timestamp();
 select * into a from public.quiz_attempts where quiz_id=q.id and learner_id=auth.uid() and submitted_at is null;
 if a.id is null then
  perform lms_private.course_request_limit('quiz-new-attempt',20);
  insert into public.quiz_attempts(quiz_id,learner_id,version,started_at) values(q.id,auth.uid(),q.version,clock_timestamp()) returning * into a;
 end if;
 return jsonb_build_object('id',a.id,'deadline',a.started_at+make_interval(mins=>q.time_limit),'serverTime',clock_timestamp());
end $$;
create or replace function public.submit_quiz(attempt_id uuid,answers jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.quiz_attempts; q public.quizzes; total integer; correct integer; mark integer; review jsonb; submitted timestamptz;
begin
 if lms_private.current_role() is distinct from 'learner' then raise exception 'Attempt unavailable' using errcode='42501'; end if;
 if jsonb_typeof(answers) is distinct from 'object' or octet_length(answers::text)>16384 then raise exception 'Invalid answers'; end if;
 if (select count(*) from jsonb_object_keys(answers))>100 then raise exception 'Invalid answers'; end if;
 perform lms_private.course_request_limit('quiz-submit',120);
 select * into a from public.quiz_attempts where id=attempt_id and learner_id=auth.uid();
 if a.id is null then raise exception 'Attempt unavailable' using errcode='42501'; end if;
 select * into q from public.quizzes where id=a.quiz_id;
 if not coalesce(lms_private.enrolled(q.course_id),false) then raise exception 'Enrollment required' using errcode='42501'; end if;
 -- Match the enrollment-before-attempt lock order used by completion/start to avoid deadlocks.
 perform 1 from public.enrollments where learner_id=auth.uid() and course_id=q.course_id for update;
 select * into a from public.quiz_attempts where id=attempt_id and learner_id=auth.uid() for update;
 if a.submitted_at is not null then return jsonb_build_object('score',a.score,'passed',a.passed,'feedback',a.feedback,'answers',a.answers); end if;
 if a.version<>q.version then raise exception 'Assessment changed. Ask your tutor to close this attempt.'; end if;
 perform lms_private.validate_quiz_answers(q.id,answers);
 select count(*),count(*) filter(where answers->>x.id::text=k.correct_option_id),
 jsonb_agg(jsonb_build_object('id',x.id,'correctOptionId',k.correct_option_id,'explanation',k.explanation) order by x.position)
 into total,correct,review from public.quiz_questions x join lms_private.quiz_keys k on k.question_id=x.id where x.quiz_id=q.id;
 if total=0 then raise exception 'Quiz has no questions'; end if;
 submitted:=clock_timestamp();
 mark:=case when submitted>a.started_at+make_interval(mins=>q.time_limit)+interval '5 seconds' then 0 else round(100.0*correct/total) end;
 update public.quiz_attempts set submitted_at=submitted,score=mark,passed=mark>=q.passing_score,answers=submit_quiz.answers,feedback=review where id=a.id;
 perform lms_private.issue_certificate(q.course_id,auth.uid());
 return jsonb_build_object('score',mark,'passed',mark>=q.passing_score,'feedback',review,'answers',answers);
end $$;
commit;
