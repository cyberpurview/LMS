-- Bounded, owner-only attempt history. Reviewing history never starts an attempt.
create index quiz_attempts_history on public.quiz_attempts(learner_id,started_at desc,id desc);
create index quiz_attempts_quiz_history on public.quiz_attempts(learner_id,quiz_id,started_at desc,id desc);

create function public.learner_quiz_history(filter_quiz uuid default null, after_attempt uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare cursor_row public.quiz_attempts; items jsonb;
begin
 if lms_private.current_role() is distinct from 'learner' then raise exception 'Learner access required' using errcode='42501'; end if;
 perform lms_private.course_request_limit('quiz-history',120);
 if after_attempt is not null then
  select * into cursor_row from public.quiz_attempts where id=after_attempt and learner_id=auth.uid() and (filter_quiz is null or quiz_id=filter_quiz);
  if cursor_row.id is null then raise exception 'Invalid history cursor' using errcode='42501'; end if;
 end if;
 select coalesce(jsonb_agg(row_data order by started_at desc,id desc),'[]') into items from (
  select a.started_at,a.id,jsonb_build_object('id',a.id,'quizId',q.id,'title',q.title,'startedAt',a.started_at,'submittedAt',a.submitted_at,'score',case when a.submitted_at is not null then coalesce(a.score,0) when a.started_at+make_interval(mins=>q.time_limit)+interval '5 seconds'<clock_timestamp() then 0 else null end,'status',case when a.submitted_at is not null then case when a.passed then 'Passed' else 'Not passed' end when a.started_at+make_interval(mins=>q.time_limit)+interval '5 seconds'<clock_timestamp() then 'Expired' else 'In progress' end,'canResume',a.submitted_at is null and a.version=q.version and a.started_at+make_interval(mins=>q.time_limit)>clock_timestamp() and lms_private.can_take_quiz(q.id)) row_data
  from public.quiz_attempts a join public.quizzes q on q.id=a.quiz_id
  where a.learner_id=auth.uid() and (filter_quiz is null or a.quiz_id=filter_quiz)
   and (after_attempt is null or (a.started_at,a.id)<(cursor_row.started_at,cursor_row.id))
  order by a.started_at desc,a.id desc limit 21
 ) page;
 return jsonb_build_object('items',items);
end $$;

create function public.learner_quiz_attempt(requested_attempt uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.quiz_attempts; q public.quizzes; released boolean:=false; review jsonb:='[]'; questions jsonb:='[]'; completed boolean;
begin
 if lms_private.current_role() is distinct from 'learner' then raise exception 'Learner access required' using errcode='42501'; end if;
 perform lms_private.course_request_limit('quiz-history-result',120);
 select * into a from public.quiz_attempts where id=requested_attempt and learner_id=auth.uid();
 if a.id is null then raise exception 'Attempt not found' using errcode='42501'; end if;
 select * into q from public.quizzes where id=a.quiz_id;
 completed:=a.submitted_at is not null or a.started_at+make_interval(mins=>q.time_limit)+interval '5 seconds'<clock_timestamp();
 released:=completed and a.version=q.version and lms_private.can_take_quiz(q.id) and lms_private.can_review_quiz(q.id,auth.uid());
 if released then
  insert into lms_private.quiz_feedback_releases values(q.id,auth.uid()) on conflict do nothing;
  select feedback into review from lms_private.quiz_feedback where attempt_id=a.id;
  if review is null then select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'correctOptionId',k.correct_option_id,'explanation',k.explanation) order by x.position),'[]') into review from public.quiz_questions x join lms_private.quiz_keys k on k.question_id=x.id where x.quiz_id=q.id; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'text',text,'options',options,'correctOptionId','') order by position),'[]') into questions from public.quiz_questions where quiz_id=q.id;
 end if;
 return jsonb_build_object('id',a.id,'title',q.title,'startedAt',a.started_at,'score',case when completed then coalesce(a.score,0) else null end,'passed',coalesce(a.passed,false),'completed',completed,'feedbackAvailable',released,'questions',questions,'answers',case when released then coalesce(a.answers,'{}') else '{}' end,'feedback',case when released then coalesce(review,'[]') else '[]' end);
end $$;
revoke all on function public.learner_quiz_history(uuid,uuid),public.learner_quiz_attempt(uuid) from public,anon;
grant execute on function public.learner_quiz_history(uuid,uuid),public.learner_quiz_attempt(uuid) to authenticated;
