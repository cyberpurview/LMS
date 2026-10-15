begin;
alter table public.quizzes add column purpose text not null default 'assessment' check(purpose in ('practice','assessment'));
alter table public.quizzes add column max_attempts integer check(max_attempts between 1 and 1000);
alter table public.quizzes add column retry_delay_minutes integer not null default 0 check(retry_delay_minutes between 0 and 10080);
alter table public.quizzes add column feedback_policy text not null default 'immediate' check(feedback_policy in ('immediate','after_pass_or_last'));
update public.quizzes set certificate_rule='none' where course_id is not null;
alter table public.quizzes add constraint practice_quiz_rules check(purpose<>'practice' or (max_attempts is null and retry_delay_minutes=0 and feedback_policy='immediate' and certificate_rule='none' and certificate_mode='none'));
alter table public.quizzes add constraint course_quiz_certificate_rules check(course_id is null or certificate_rule='none');
create index attempts_quiz_learner_version on public.quiz_attempts(quiz_id,learner_id,version,started_at desc);
create table lms_private.quiz_attempt_grants(id uuid primary key default gen_random_uuid(),quiz_id uuid not null references public.quizzes on delete cascade,learner_id uuid not null references public.profiles,amount integer not null check(amount between 1 and 10),reason text not null check(char_length(reason) between 5 and 500),granted_by uuid not null references public.profiles,created_at timestamptz not null default clock_timestamp());
create index quiz_attempt_grants_subject on lms_private.quiz_attempt_grants(quiz_id,learner_id);
create table lms_private.quiz_feedback(attempt_id uuid primary key references public.quiz_attempts on delete cascade deferrable initially deferred,feedback jsonb not null);
create table lms_private.quiz_feedback_releases(quiz_id uuid references public.quizzes on delete cascade,learner_id uuid references public.profiles,primary key(quiz_id,learner_id));
revoke all on lms_private.quiz_attempt_grants,lms_private.quiz_feedback,lms_private.quiz_feedback_releases from public,anon,authenticated;
insert into lms_private.quiz_feedback select id,feedback from public.quiz_attempts where feedback<>'[]';
update public.quiz_attempts set feedback='[]' where feedback<>'[]';

create function lms_private.capture_quiz_feedback() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.feedback<>'[]'::jsonb then insert into lms_private.quiz_feedback values(new.id,new.feedback) on conflict(attempt_id) do update set feedback=excluded.feedback; new.feedback:='[]'; end if;
 return new;
end $$;
-- Deferred foreign-key validation permits protecting both inserts and updates.
create trigger protect_quiz_feedback before insert or update on public.quiz_attempts for each row execute function lms_private.capture_quiz_feedback();
create function lms_private.lock_quiz_rules() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if (new.purpose,new.max_attempts,new.retry_delay_minutes,new.feedback_policy,new.certificate_rule,new.certificate_mode,new.course_id) is distinct from (old.purpose,old.max_attempts,old.retry_delay_minutes,old.feedback_policy,old.certificate_rule,old.certificate_mode,old.course_id)
 and exists(select 1 from public.quiz_attempts where quiz_id=old.id) then raise exception 'Assessment rules are locked after the first attempt.'; end if;
 if (new.purpose,new.course_id) is distinct from (old.purpose,old.course_id) and old.status='published' and exists(select 1 from public.enrollments where course_id=old.course_id or course_id=new.course_id) then raise exception 'Published quiz purpose and course are locked after enrollment.'; end if;
 return new;
end $$;
create trigger lock_quiz_rules before update on public.quizzes for each row execute function lms_private.lock_quiz_rules();
revoke all on function lms_private.capture_quiz_feedback(),lms_private.lock_quiz_rules() from public,anon,authenticated;

do $$ declare d text; r text; begin
 d:=pg_get_functiondef('public.lms_command(text,jsonb)'::regprocedure);
 r:=replace(d,'update public.quizzes set certificate_rule=coalesce(payload->>''certificateRule'',''none''),certificate_mode=coalesce(payload->>''certificateMode'',''automatic'') where id=target;',
 $patch$update public.quizzes set purpose=coalesce(payload->>'purpose','assessment'),max_attempts=nullif(payload->>'maxAttempts','')::integer,retry_delay_minutes=coalesce(payload->>'retryDelayMinutes','0')::integer,feedback_policy=coalesce(payload->>'feedbackPolicy','immediate'),certificate_rule=coalesce(payload->>'certificateRule','none'),certificate_mode=coalesce(payload->>'certificateMode','automatic') where id=target;$patch$);
 if r=d then raise exception 'Quiz settings command patch failed'; end if;
 r:=replace(r,'id,course_id,creator_id,title,passing_score,time_limit,status,thumbnail_path','id,course_id,creator_id,purpose,max_attempts,retry_delay_minutes,feedback_policy,certificate_rule,certificate_mode,title,passing_score,time_limit,status,thumbnail_path');
 r:=replace(r,'values(target,cid,uid,trim(payload->>''title'')','values(target,cid,uid,coalesce(payload->>''purpose'',''assessment''),nullif(payload->>''maxAttempts'','''')::integer,coalesce(payload->>''retryDelayMinutes'',''0'')::integer,coalesce(payload->>''feedbackPolicy'',''immediate''),coalesce(payload->>''certificateRule'',''none''),coalesce(payload->>''certificateMode'',''automatic''),trim(payload->>''title'')');
 r:=replace(r,'if coalesce(payload->>''status'',''published'')=''published''','if coalesce(payload->>''purpose'',''assessment'')=''assessment'' and coalesce(payload->>''status'',''published'')=''published''');
 execute r;
 d:=pg_get_functiondef('lms_private.course_eligible(uuid,uuid)'::regprocedure);
 r:=replace(d,'q.status=''published''','q.status=''published'' and q.purpose=''assessment''');
 if r=d then raise exception 'Course eligibility patch failed'; end if; execute r;
 d:=pg_get_functiondef('lms_private.quiz_eligible(uuid,uuid)'::regprocedure);
 r:=replace(d,'q.course_id is null','q.course_id is null and q.purpose=''assessment'''); execute r;
 d:=pg_get_functiondef('public.enrollment_summaries(uuid[])'::regprocedure);
 r:=replace(d,'q.status=''published''','q.status=''published'' and q.purpose=''assessment'''); execute r;
 d:=pg_get_functiondef('lms_private.notification_events()'::regprocedure);
 r:=replace(d,'select * into q from public.quizzes where id=new.quiz_id;', 'select * into q from public.quizzes where id=new.quiz_id; if q.purpose=''practice'' then return new; end if;');
 r:=replace(r,'''New assessment available'',new.title', 'case when new.purpose=''practice'' then ''New practice quiz available'' else ''New assessment available'' end,new.title');
 execute r;
end $$;

create function lms_private.quiz_attempt_info(qid uuid,uid uuid) returns jsonb language sql stable security definer set search_path='' as $$
 with q as(select * from public.quizzes where id=qid), a as(select count(*)::integer used,max(coalesce(submitted_at,case when started_at+make_interval(mins=>(select time_limit from q))+interval '5 seconds'<now() then started_at+make_interval(mins=>(select time_limit from q)) end)) last_submission from public.quiz_attempts where quiz_id=qid and learner_id=uid and version=(select version from q)), cap as(select case when purpose='practice' or max_attempts is null then null else max_attempts+coalesce((select sum(amount)::integer from lms_private.quiz_attempt_grants where quiz_id=qid and learner_id=uid),0) end n from q)
 select jsonb_build_object('attemptsUsed',a.used,'attemptLimit',cap.n,'attemptsRemaining',case when cap.n is null then null else greatest(0,cap.n-a.used) end,'retryAvailableAt',case when q.retry_delay_minutes>0 then a.last_submission+make_interval(mins=>q.retry_delay_minutes) else null end)
 from q,a,cap;
$$;
create function lms_private.can_review_quiz(qid uuid,uid uuid) returns boolean language sql stable security definer set search_path='' as $$
 select coalesce((select purpose='practice' or feedback_policy='immediate' or exists(select 1 from lms_private.quiz_feedback_releases where quiz_id=qid and learner_id=uid)
 or exists(select 1 from public.quiz_attempts where quiz_id=qid and learner_id=uid and version=q.version and passed)
 or (max_attempts is not null and (select count(*) from public.quiz_attempts where quiz_id=qid and learner_id=uid and version=q.version and (submitted_at is not null or started_at+make_interval(mins=>q.time_limit)+interval '5 seconds'<now()))>=max_attempts+coalesce((select sum(amount) from lms_private.quiz_attempt_grants where quiz_id=qid and learner_id=uid),0)) from public.quizzes q where id=qid),false);
$$;
revoke all on function lms_private.quiz_attempt_info(uuid,uuid),lms_private.can_review_quiz(uuid,uuid) from public,anon,authenticated;

-- Keep existing grading, payment, session and rate-limit guards in private core functions.
alter function public.start_quiz(uuid) set schema lms_private;
alter function public.submit_quiz(uuid,jsonb) set schema lms_private;
revoke all on function lms_private.start_quiz(uuid),lms_private.submit_quiz(uuid,jsonb) from public,anon,authenticated;
do $$ declare d text; r text; begin
 d:=pg_get_functiondef('lms_private.submit_quiz(uuid,jsonb)'::regprocedure);
 r:=replace(d,'if q.course_id is null then perform lms_private.issue_quiz_certificate(q.id,auth.uid()); else perform lms_private.issue_certificate(q.course_id,auth.uid()); end if;', 'if q.purpose=''assessment'' then if q.course_id is null then perform lms_private.issue_quiz_certificate(q.id,auth.uid()); else perform lms_private.issue_certificate(q.course_id,auth.uid()); end if; end if;');
 if r=d then raise exception 'Practice issuance guard patch failed'; end if; execute r;
end $$;
create function public.start_quiz(quiz_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare q public.quizzes; a public.quiz_attempts; info jsonb; reply jsonb;
begin
 if lms_private.current_role() is distinct from 'learner' then raise exception 'Learner access required' using errcode='42501'; end if;
 select * into q from public.quizzes where id=quiz_id;
 if q.id is null or q.status<>'published' then raise exception 'Assessment is not published' using errcode='42501'; end if;
 if q.course_id is not null and not lms_private.enrolled(q.course_id) then raise exception 'Enrollment required' using errcode='42501'; end if;
 if not lms_private.can_take_quiz(q.id) then raise exception 'Verified payment required for this assessment' using errcode='42501'; end if;
 perform 1 from public.courses where id=q.course_id for share;
 select * into q from public.quizzes where id=quiz_id for share;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||q.id::text,0));
 select * into a from public.quiz_attempts where quiz_attempts.quiz_id=q.id and learner_id=auth.uid() and submitted_at is null and started_at+make_interval(mins=>q.time_limit)+interval '5 seconds'>=clock_timestamp();
 info:=lms_private.quiz_attempt_info(q.id,auth.uid());
 if a.id is null then
  if (info->>'attemptsRemaining')::integer=0 then raise exception 'Attempt limit reached. Ask your instructor for an additional attempt.'; end if;
  if (info->>'retryAvailableAt')::timestamptz>clock_timestamp() then raise exception 'Please wait until % before starting another attempt.',info->>'retryAvailableAt'; end if;
 end if;
 reply:=lms_private.start_quiz(q.id);
 return reply||lms_private.quiz_attempt_info(q.id,auth.uid());
end $$;
create function public.submit_quiz(attempt_id uuid,answers jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare reply jsonb; qid uuid; released boolean; review jsonb;
begin
 reply:=lms_private.submit_quiz(attempt_id,answers);
 select quiz_id into qid from public.quiz_attempts where id=attempt_id and learner_id=auth.uid();
 released:=lms_private.can_review_quiz(qid,auth.uid());
 if released then
  insert into lms_private.quiz_feedback_releases values(qid,auth.uid()) on conflict do nothing;
  select feedback into review from lms_private.quiz_feedback where quiz_feedback.attempt_id=submit_quiz.attempt_id;
 end if;
 return reply||jsonb_build_object('feedback',case when released then coalesce(review,'[]') else '[]' end,'feedbackAvailable',released)||lms_private.quiz_attempt_info(qid,auth.uid());
end $$;
revoke all on function public.start_quiz(uuid),public.submit_quiz(uuid,jsonb) from public,anon;
grant execute on function public.start_quiz(uuid),public.submit_quiz(uuid,jsonb) to authenticated;

create or replace function public.quiz_summaries(quiz_ids uuid[]) returns jsonb language sql stable security definer set search_path='' as $$
 with visible as materialized(select q.* from public.quizzes q where cardinality(quiz_ids)<=200 and q.id=any(quiz_ids) and (lms_private.manages_quiz(q.id) or (q.status='published' and lms_private.current_role()='learner' and (q.course_id is null or lms_private.enrolled(q.course_id))))), info as materialized(select q.id,lms_private.quiz_attempt_info(q.id,auth.uid()) value from visible q)
 select coalesce(jsonb_agg(jsonb_build_object('id',q.id,'questionCount',(select count(*) from public.quiz_questions x where x.quiz_id=q.id),'hasAccess',lms_private.can_take_quiz(q.id),'bestScore',(select max(a.score) from public.quiz_attempts a where a.quiz_id=q.id and a.learner_id=auth.uid() and a.version=q.version and a.submitted_at is not null),'passed',exists(select 1 from public.quiz_attempts a where a.quiz_id=q.id and a.learner_id=auth.uid() and a.version=q.version and a.passed),'inProgress',exists(select 1 from public.quiz_attempts a where a.quiz_id=q.id and a.learner_id=auth.uid() and a.submitted_at is null and a.started_at+make_interval(mins=>q.time_limit)+interval '5 seconds'>=now()))||i.value),'[]') from visible q join info i on i.id=q.id;
$$;

create function public.quiz_result(quiz_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.quiz_attempts; q public.quizzes; review jsonb; released boolean;
begin
 if lms_private.current_role() is distinct from 'learner' or not lms_private.can_take_quiz(quiz_id) then raise exception 'Assessment access required' using errcode='42501'; end if;
 perform lms_private.course_request_limit('quiz-result',120);
 select * into q from public.quizzes where id=quiz_id;
 select * into a from public.quiz_attempts x where x.quiz_id=q.id and learner_id=auth.uid() and version=q.version and (submitted_at is not null or started_at+make_interval(mins=>q.time_limit)+interval '5 seconds'<clock_timestamp()) order by started_at desc,id desc limit 1;
 if a.id is null then raise exception 'No completed attempt is available.'; end if;
 released:=lms_private.can_review_quiz(q.id,auth.uid());
 if released then
  insert into lms_private.quiz_feedback_releases values(q.id,auth.uid()) on conflict do nothing;
  select feedback into review from lms_private.quiz_feedback where attempt_id=a.id;
  if review is null then select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'correctOptionId',k.correct_option_id,'explanation',k.explanation) order by x.position),'[]') into review from public.quiz_questions x join lms_private.quiz_keys k on k.question_id=x.id where x.quiz_id=q.id; end if;
 end if;
 return jsonb_build_object('id',a.id,'score',coalesce(a.score,0),'answers',coalesce(a.answers,'{}'),'feedbackAvailable',released,'feedback',case when released then coalesce(review,'[]') else '[]' end)||lms_private.quiz_attempt_info(q.id,auth.uid());
end $$;
revoke all on function public.quiz_result(uuid) from public,anon;
grant execute on function public.quiz_result(uuid) to authenticated;

create function public.quiz_attempt_action(action text,quiz_id uuid,learner_id uuid default null,extra integer default 1,reason text default '',request_id uuid default null,after_id uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare q public.quizzes; result jsonb;
begin
 if not lms_private.manages_quiz(quiz_id) then raise exception 'Quiz management denied' using errcode='42501'; end if;
 select * into q from public.quizzes where id=quiz_id for share;
 if q.purpose<>'assessment' or q.max_attempts is null then raise exception 'This quiz has unlimited attempts.'; end if;
 perform lms_private.course_request_limit('quiz-attempt-action',120);
 if action='list' then
  select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.name)||lms_private.quiz_attempt_info(q.id,p.id)),'[]') into result from (select p.id,p.name from public.profiles p where (after_id is null or p.id>after_id) and exists(select 1 from public.quiz_attempts a where a.quiz_id=q.id and a.learner_id=p.id) order by p.id limit 100) p;
  return result;
 elsif action='grant' then
  if extra is null or extra not between 1 and 10 or reason is null or char_length(trim(reason)) not between 5 and 500 then raise exception 'Provide 1–10 attempts and a reason of 5–500 characters.'; end if;
  if request_id is null then raise exception 'A grant request ID is required.'; end if;
  if not exists(select 1 from public.quiz_attempts where quiz_attempts.quiz_id=q.id and quiz_attempts.learner_id=quiz_attempt_action.learner_id) then raise exception 'Learner has not started this quiz.'; end if;
  perform pg_advisory_xact_lock(hashtextextended('quiz-grant:'||request_id::text,0));
  perform pg_advisory_xact_lock(hashtextextended(learner_id::text||q.id::text,0));
  if exists(select 1 from lms_private.quiz_attempt_grants where id=request_id) then
   if not exists(select 1 from lms_private.quiz_attempt_grants g where g.id=request_id and g.quiz_id=q.id and g.learner_id=quiz_attempt_action.learner_id and g.amount=extra and g.reason=trim(quiz_attempt_action.reason) and g.granted_by=auth.uid()) then raise exception 'Grant request does not match the original request.'; end if;
   return lms_private.quiz_attempt_info(q.id,learner_id);
  end if;
  if lms_private.can_review_quiz(q.id,learner_id) then insert into lms_private.quiz_feedback_releases values(q.id,learner_id) on conflict do nothing; end if;
  insert into lms_private.quiz_attempt_grants(id,quiz_id,learner_id,amount,reason,granted_by) values(request_id,q.id,learner_id,extra,trim(reason),auth.uid());
  insert into lms_private.audit_log(actor_id,action,entity_id) values(auth.uid(),'grantQuizAttempts',q.id);
  return lms_private.quiz_attempt_info(q.id,learner_id);
 else raise exception 'Invalid attempt action'; end if;
end $$;
revoke all on function public.quiz_attempt_action(text,uuid,uuid,integer,text,uuid,uuid) from public,anon;
grant execute on function public.quiz_attempt_action(text,uuid,uuid,integer,text,uuid,uuid) to authenticated;
commit;
