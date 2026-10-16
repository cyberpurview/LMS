-- Match the grading/resume grace period and distinguish expiry from submission.
do $$
declare definition text; patched text;
begin
 definition:=pg_get_functiondef('public.learner_quiz_history(uuid,uuid)'::regprocedure);
 patched:=replace(definition,
  'a.started_at+make_interval(mins=>q.time_limit)>clock_timestamp() and lms_private.can_take_quiz(q.id)',
  'a.started_at+make_interval(mins=>q.time_limit)+interval ''5 seconds''>=clock_timestamp() and lms_private.can_take_quiz(q.id)');
 if patched=definition then raise exception 'History resume patch failed'; end if;
 execute patched;
 definition:=pg_get_functiondef('public.learner_quiz_attempt(uuid)'::regprocedure);
 patched:=replace(definition,
  '''completed'',completed,''feedbackAvailable'',released',
  '''completed'',completed,''status'',case when a.submitted_at is not null then case when a.passed then ''Passed'' else ''Not passed'' end when completed then ''Expired'' else ''In progress'' end,''feedbackAvailable'',released');
 if patched=definition then raise exception 'History result status patch failed'; end if;
 execute patched;
end $$;
