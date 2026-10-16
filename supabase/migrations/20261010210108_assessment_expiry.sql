begin;
-- Expired abandoned attempts cannot permanently block assessment authoring.
-- Shared/exclusive quiz locks serialize starting an attempt with editing.
create or replace function public.start_quiz(quiz_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
#variable_conflict use_column
declare q public.quizzes; a public.quiz_attempts;
begin
 select * into q from public.quizzes where id=quiz_id for share;
 if not coalesce(lms_private.enrolled(q.course_id),false) then raise exception 'Enrollment required' using errcode='42501'; end if;
 if not exists(select 1 from public.quiz_questions where quiz_questions.quiz_id=q.id) then raise exception 'Quiz has no questions'; end if;
 update public.quiz_attempts set submitted_at=now(),score=0,passed=false,answers='{}',feedback='[]'
 where quiz_id=q.id and learner_id=auth.uid() and submitted_at is null and started_at+make_interval(mins=>q.time_limit)+interval '5 seconds'<now();
 insert into public.quiz_attempts(quiz_id,learner_id,version) values(q.id,auth.uid(),q.version)
 on conflict(learner_id,quiz_id) where submitted_at is null do update set quiz_id=excluded.quiz_id returning * into a;
 return jsonb_build_object('id',a.id,'deadline',a.started_at+make_interval(mins=>q.time_limit));
end $$;
create or replace function public.lms_command(command text,payload jsonb) returns void language plpgsql security definer set search_path='' as $$
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
  update public.quiz_attempts a set submitted_at=now(),score=0,passed=false,answers='{}',feedback='[]'
  from public.quizzes q where q.id=target and a.quiz_id=q.id and a.submitted_at is null and a.started_at+make_interval(mins=>q.time_limit)+interval '5 seconds'<now();
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
commit;
