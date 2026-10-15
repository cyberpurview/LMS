begin;
alter table public.courses add column completion_rule text not null default 'lessons_pass' check(completion_rule in ('lessons','lessons_pass','lessons_submit','quiz_pass','quiz_submit'));
alter table public.courses add column certificate_mode text not null default 'automatic' check(certificate_mode in ('automatic','approval','none'));
update public.courses set completion_rule='lessons' where not require_assessment;
alter table public.quizzes alter column course_id drop not null;
alter table public.quizzes add column creator_id uuid references public.profiles;
update public.quizzes q set creator_id=c.tutor_id from public.courses c where c.id=q.course_id;
alter table public.quizzes alter column creator_id set not null;
create index quizzes_creator on public.quizzes(creator_id,id);
alter table public.quizzes add column certificate_rule text not null default 'none' check(certificate_rule in ('none','submit','pass'));
alter table public.quizzes add column certificate_mode text not null default 'automatic' check(certificate_mode in ('automatic','approval','none'));
alter table public.certificates alter column course_id drop not null;
alter table public.certificates add column quiz_id uuid references public.quizzes;
alter table public.certificates add constraint certificate_single_subject check((course_id is null)<>(quiz_id is null));
create unique index certificate_quiz_learner on public.certificates(learner_id,quiz_id) where quiz_id is not null;
create table lms_private.award_approvals(learner_id uuid references public.profiles,subject_id uuid not null,kind text not null check(kind in ('course','quiz')),approved_by uuid references public.profiles,approved_at timestamptz not null default now(),primary key(learner_id,subject_id,kind));
revoke all on lms_private.award_approvals from public,anon,authenticated;

create function lms_private.manages_quiz(qid uuid) returns boolean language sql stable security definer set search_path='' as $$
 select coalesce(exists(select 1 from public.quizzes q where q.id=qid and (lms_private.current_role()='admin' or (lms_private.current_role()='tutor' and ((q.course_id is null and q.creator_id=auth.uid()) or lms_private.manages(q.course_id))))),false);
$$;
revoke all on function lms_private.manages_quiz(uuid) from public;
grant execute on function lms_private.manages_quiz(uuid) to authenticated;
drop policy quizzes_read on public.quizzes;
create policy quizzes_read on public.quizzes for select to authenticated using(lms_private.manages_quiz(id) or (status='published' and lms_private.current_role()='learner' and (course_id is null or lms_private.enrolled(course_id))));
drop policy attempts_read on public.quiz_attempts;
create policy attempts_read on public.quiz_attempts for select to authenticated using((learner_id=auth.uid() and lms_private.current_role() is not null) or lms_private.manages_quiz(quiz_id));
drop policy certificates_read on public.certificates;
create policy certificates_read on public.certificates for select to authenticated using((learner_id=auth.uid() and lms_private.current_role() is not null) or lms_private.manages(course_id) or lms_private.manages_quiz(quiz_id));

create function lms_private.course_eligible(cid uuid,uid uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.courses c join public.enrollments e on e.course_id=c.id and e.learner_id=uid where c.id=cid
 and (c.completion_rule in ('quiz_pass','quiz_submit') or (exists(select 1 from public.modules m join public.lessons l on l.module_id=m.id where m.course_id=cid) and not exists(select 1 from public.modules m join public.lessons l on l.module_id=m.id where m.course_id=cid and not exists(select 1 from public.lesson_progress p where p.lesson_id=l.id and p.learner_id=uid))))
 and (c.completion_rule='lessons' or (exists(select 1 from public.quizzes q where q.course_id=cid and q.status='published') and not exists(select 1 from public.quizzes q where q.course_id=cid and q.status='published' and not exists(select 1 from public.quiz_attempts a where a.quiz_id=q.id and a.learner_id=uid and a.version=q.version and a.submitted_at is not null and (case when c.completion_rule in ('quiz_pass','lessons_pass') then a.passed else a.score is not null and a.submitted_at<=a.started_at+make_interval(mins=>q.time_limit)+interval '5 seconds' and (select count(*) from jsonb_object_keys(coalesce(a.answers,'{}')))= (select count(*) from public.quiz_questions qq where qq.quiz_id=q.id) end))))));
$$;
create or replace function lms_private.issue_certificate(cid uuid,uid uuid) returns void language plpgsql security definer set search_path='' as $$
declare mode text;
begin
 if not lms_private.course_eligible(cid,uid) then return; end if;
 update public.enrollments set completed_at=coalesce(completed_at,clock_timestamp()) where course_id=cid and learner_id=uid;
 select certificate_mode into mode from public.courses where id=cid;
 if mode='none' or not (select certificate_enabled from public.platform_settings where singleton) then return; end if;
 if mode='approval' and not exists(select 1 from lms_private.award_approvals where subject_id=cid and learner_id=uid and kind='course') then return; end if;
 insert into public.certificates(learner_id,course_id,learner_name,course_title) select uid,cid,p.name,c.title from public.profiles p,public.courses c where p.id=uid and c.id=cid on conflict do nothing;
end $$;
create function lms_private.quiz_eligible(qid uuid,uid uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.quizzes q join public.quiz_attempts a on a.quiz_id=q.id and a.learner_id=uid and a.version=q.version where q.id=qid and q.course_id is null and q.certificate_rule<>'none' and a.submitted_at is not null and (case when q.certificate_rule='pass' then a.passed else a.submitted_at<=a.started_at+make_interval(mins=>q.time_limit)+interval '5 seconds' and (select count(*) from jsonb_object_keys(coalesce(a.answers,'{}')))= (select count(*) from public.quiz_questions qq where qq.quiz_id=q.id) end));
$$;
create function lms_private.issue_quiz_certificate(qid uuid,uid uuid) returns void language plpgsql security definer set search_path='' as $$
declare mode text;
begin
 if not lms_private.quiz_eligible(qid,uid) then return; end if;
 select certificate_mode into mode from public.quizzes where id=qid;
 if mode='none' or not (select certificate_enabled from public.platform_settings where singleton) then return; end if;
 if mode='approval' and not exists(select 1 from lms_private.award_approvals where subject_id=qid and learner_id=uid and kind='quiz') then return; end if;
 insert into public.certificates(learner_id,quiz_id,learner_name,course_title) select uid,qid,p.name,q.title from public.profiles p,public.quizzes q where p.id=uid and q.id=qid on conflict do nothing;
end $$;
revoke all on function lms_private.course_eligible(uuid,uuid),lms_private.quiz_eligible(uuid,uuid),lms_private.issue_quiz_certificate(uuid,uuid) from public,anon,authenticated;

do $migration$
declare d text; r text;
begin
 d:=pg_get_functiondef('public.lms_command(text,jsonb)'::regprocedure);
 r:=replace(d,'if not lms_private.manages(cid) then raise exception ''Quiz management denied''', 'if (cid is not null and not lms_private.manages(cid)) or (cid is null and r not in (''admin'',''tutor'')) or (exists(select 1 from public.quizzes where id=(payload->>''id'')::uuid) and not lms_private.manages_quiz((payload->>''id'')::uuid)) then raise exception ''Quiz management denied''');
 r:=replace(r,'course_id<>cid','course_id is distinct from cid');
 r:=replace(r,'(payload->>''courseId'')::uuid','nullif(payload->>''courseId'','''')::uuid');
 r:=replace(r,'cid::text || ''/[0-9a-f-]{36}', 'coalesce(cid,target)::text || ''/[0-9a-f-]{36}');
 r:=replace(r,'id,course_id,title,passing_score,time_limit,status,thumbnail_path','id,course_id,creator_id,title,passing_score,time_limit,status,thumbnail_path');
 r:=replace(r,'values(target,cid,trim(payload->>''title'')','values(target,cid,uid,trim(payload->>''title'')');
 r:=replace(r,' when ''profile'' then',$patch$
 update public.quizzes set certificate_rule=coalesce(payload->>'certificateRule','none'),certificate_mode=coalesce(payload->>'certificateMode','automatic') where id=target;
 when 'profile' then$patch$);
 r:=replace(r,' when ''saveQuiz'' then',$patch$
 if existing.id is not null and (existing.completion_rule is distinct from coalesce(payload->>'completionRule',case when (payload->>'requireAssessment')::boolean=false then 'lessons' else existing.completion_rule end) or existing.certificate_mode is distinct from coalesce(payload->>'certificateMode',existing.certificate_mode)) and exists(select 1 from public.enrollments where course_id=cid) then raise exception 'Completion and certificate rules are locked after enrollment.'; end if;
 update public.courses set completion_rule=coalesce(payload->>'completionRule',case when require_assessment then 'lessons_pass' else 'lessons' end),certificate_mode=coalesce(payload->>'certificateMode',certificate_mode) where id=cid;
 update public.courses set require_assessment=completion_rule<>'lessons' where id=cid;
 when 'saveQuiz' then$patch$);
 if r=d then raise exception 'Flexible awards command patch failed'; end if; execute r;
 for d in select pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('quiz_editor_keys','quiz_editor_keys_bulk','quiz_authoring_info') loop
 r:=replace(d,'lms_private.manages(q.course_id)','lms_private.manages_quiz(q.id)');
 r:=replace(r,'lms_private.manages(course_id)','lms_private.manages_quiz(id)'); execute r;
 end loop;
 d:=pg_get_functiondef('public.start_quiz(uuid)'::regprocedure);
 d:=replace(d,'select * into q from public.quizzes where id=quiz_id for share;', 'select * into q from public.quizzes where id=quiz_id; perform 1 from public.courses where id=q.course_id for share; select * into q from public.quizzes where id=quiz_id for share;');
 r:=replace(d,'if not coalesce(lms_private.enrolled(q.course_id),false)','if q.course_id is not null and not coalesce(lms_private.enrolled(q.course_id),false)');
 r:=replace(r,'perform 1 from public.enrollments','perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text || q.id::text,0)); perform 1 from public.enrollments');execute r;
 d:=pg_get_functiondef('public.submit_quiz(uuid,jsonb)'::regprocedure);
 r:=replace(d,'if not coalesce(lms_private.enrolled(q.course_id),false)','if q.course_id is not null and not coalesce(lms_private.enrolled(q.course_id),false)');
 r:=replace(r,'perform 1 from public.enrollments','perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text || q.id::text,0)); perform 1 from public.enrollments');
 r:=replace(r,'perform lms_private.issue_certificate(q.course_id,auth.uid());','if q.course_id is null then perform lms_private.issue_quiz_certificate(q.id,auth.uid()); else perform lms_private.issue_certificate(q.course_id,auth.uid()); end if;');execute r;
 d:=pg_get_functiondef('lms_private.notification_events()'::regprocedure);
 r:=replace(d,'elsif tg_table_name=''quizzes'' then','elsif tg_table_name=''quizzes'' then if new.course_id is null then return new; end if;');
 r:=replace(r,'lms_private.notify(c.tutor_id,''Assessment submitted''','lms_private.notify(coalesce(c.tutor_id,q.creator_id),''Assessment submitted''');execute r;
end $migration$;

create function public.award_action(action text,kind text,subject_id uuid,learner_id uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); allowed boolean; result jsonb;
begin
 if lms_private.current_role() is null then raise exception 'Authentication required' using errcode='42501'; end if;
 if kind is null or kind not in ('course','quiz') or subject_id is null then raise exception 'Invalid award subject'; end if;
 allowed:=case when kind='course' then lms_private.manages(subject_id) else lms_private.manages_quiz(subject_id) end;
 if action='candidates' then
  if not allowed then raise exception 'Management access required' using errcode='42501'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'issued',exists(select 1 from public.certificates c where c.learner_id=p.id and (case when kind='course' then c.course_id=subject_id else c.quiz_id=subject_id end)))),'[]') into result
  from (select p.id,p.name from public.profiles p where p.id in (select e.learner_id from public.enrollments e where kind='course' and e.course_id=subject_id and e.completed_at is not null union select a.learner_id from public.quiz_attempts a where kind='quiz' and a.quiz_id=subject_id and a.submitted_at is not null) and (case when kind='course' then lms_private.course_eligible(subject_id,p.id) else lms_private.quiz_eligible(subject_id,p.id) end) and not exists(select 1 from public.certificates c where c.learner_id=p.id and (case when kind='course' then c.course_id=subject_id else c.quiz_id=subject_id end)) order by p.id limit 100) p;
  return result;
 elsif action='approve' then
  if not allowed then raise exception 'Management access required' using errcode='42501'; end if;
  if not (case when kind='course' then lms_private.course_eligible(subject_id,learner_id) else lms_private.quiz_eligible(subject_id,learner_id) end) then raise exception 'Learner has not met the requirements'; end if;
  insert into lms_private.award_approvals values(learner_id,subject_id,kind,uid,clock_timestamp()) on conflict do nothing;
 elsif action='claim' then
  if lms_private.current_role()<>'learner' then raise exception 'Learner access required' using errcode='42501'; end if;
  learner_id:=uid;
 else raise exception 'Invalid award action'; end if;
 perform lms_private.course_request_limit('award-action',120);
 if kind='course' then
  perform 1 from public.courses where id=subject_id for share;
  perform 1 from public.enrollments e where e.course_id=subject_id and e.learner_id=award_action.learner_id for update;
  perform lms_private.issue_certificate(subject_id,learner_id);
 else perform lms_private.issue_quiz_certificate(subject_id,learner_id); end if;
 select jsonb_build_object('id',c.id) into result from public.certificates c where c.learner_id=award_action.learner_id and (case when kind='course' then c.course_id=subject_id else c.quiz_id=subject_id end);
 if result is null then raise exception 'Certificate unavailable: check requirements, approval and certificate settings'; end if;
 return result;
end $$;
revoke all on function public.award_action(text,text,uuid,uuid) from public,anon;
grant execute on function public.award_action(text,text,uuid,uuid) to authenticated;
commit;

