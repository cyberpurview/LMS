begin;
alter table public.notifications add column href text not null default '', add column event_key text, add column category text not null default 'activity';
create unique index notifications_event on public.notifications(user_id,event_key) where event_key is not null;
create index notifications_unread on public.notifications(user_id,created_at desc,id desc) where not is_read;
create function lms_private.notify(owner uuid,heading text,body text,link text,event text,kind text default 'info',category text default 'activity') returns void language sql security definer set search_path='' as $$
 insert into public.notifications(user_id,title,message,href,event_key,type,category)
 select id,heading,body,link,event,kind,category from public.profiles where id=owner and is_active
 on conflict(user_id,event_key) where event_key is not null do nothing;
$$;
revoke all on function lms_private.notify(uuid,text,text,text,text,text,text) from public,anon,authenticated;
create function lms_private.notification_events() returns trigger language plpgsql security definer set search_path='' as $$
declare c public.courses; q public.quizzes; p record; cid uuid; event text; label text;
begin
 if tg_table_name='enrollments' then
  select * into c from public.courses where id=new.course_id;
  if tg_op='INSERT' then
   perform lms_private.notify(new.learner_id,'Course enrollment confirmed','You can now start '||c.title||'.','/learner/courses/'||c.id,'enrollment:'||new.id,'success');
   perform lms_private.notify(c.tutor_id,'New learner enrolled','A learner enrolled in '||c.title||'.','/tutor/courses/'||c.id,'enrollment:'||new.id);
  elsif old.completed_at is null and new.completed_at is not null then
   perform lms_private.notify(new.learner_id,'Course completed','You have completed '||c.title||'.','/learner/courses/'||c.id,'completed:'||new.id,'success');
  end if;
 elsif tg_table_name='certificates' then
  perform lms_private.notify(new.learner_id,'Your certificate is ready','Your certificate for '||new.course_title||' is ready to view and download.','/learner/certificates','certificate:'||new.id,'success');
 elsif tg_table_name='quiz_attempts' then
  if new.submitted_at is null or old.submitted_at is not null then return new; end if;
  select * into q from public.quizzes where id=new.quiz_id;
  select * into c from public.courses where id=q.course_id;
  perform lms_private.notify(new.learner_id,case when new.passed then 'Assessment passed' else 'Assessment results ready' end,q.title||': '||new.score||'%.' ,'/learner/quizzes/'||q.id,'result:'||new.id,case when new.passed then 'success' else 'info' end);
  perform lms_private.notify(c.tutor_id,'Assessment submitted','A learner submitted '||q.title||'.','/tutor/quizzes/'||q.id||'/edit','submission:'||new.id);
 elsif tg_table_name='courses' then
  if tg_op='INSERT' or old.tutor_id is distinct from new.tutor_id then
   perform lms_private.notify(new.tutor_id,'Course assigned',new.title||' is assigned to you.','/tutor/courses/'||new.id,'assigned:'||new.id||':'||new.tutor_id);
  end if;
  if new.status='published' and (tg_op='INSERT' or old.status is distinct from 'published') then
   for p in select id from public.profiles where role='admin' and is_active loop
    perform lms_private.notify(p.id,'Course published',new.title||' is now published.','/admin/courses/'||new.id,'published:'||new.id||':'||new.updated_at,'success');
   end loop;
  elsif tg_op='UPDATE' and new.status='published' and (old.title,old.description,old.thumbnail) is distinct from (new.title,new.description,new.thumbnail) then
   for p in select learner_id from public.enrollments where course_id=new.id loop
    perform lms_private.notify(p.learner_id,'Course updated',new.title||' has been updated.','/learner/courses/'||new.id,'updated:'||new.id||':'||new.updated_at,'info','announcement');
   end loop;
  end if;
 elsif tg_table_name='quizzes' then
  if new.status<>'published' or (tg_op='UPDATE' and old.status='published') then return new; end if;
  for p in select learner_id from public.enrollments where course_id=new.course_id loop
   perform lms_private.notify(p.learner_id,'New assessment available',new.title||' is ready to take.','/learner/quizzes/'||new.id,'quiz:'||new.id,'info','announcement');
  end loop;
 elsif tg_table_name='support_tickets' then
  if tg_op='INSERT' then
   for p in select id from public.profiles where role='admin' and is_active loop
    perform lms_private.notify(p.id,'New support request',new.subject,'/admin/help','support:'||new.id,'warning');
   end loop;
  elsif old.status is distinct from new.status then
   select role into label from public.profiles where id=new.user_id;
   perform lms_private.notify(new.user_id,'Support request updated',new.subject||': '||new.status||'.','/'||label||'/help','support:'||new.id||':'||new.status);
  end if;
 elsif tg_table_name='profiles' then
  if tg_op='INSERT' then
   perform lms_private.notify(new.id,'Welcome to CyberPurview','Your learning workspace is ready.','/'||new.role,'welcome:'||new.id,'success');
  elsif old.role is distinct from new.role then
   perform lms_private.notify(new.id,'Account role updated','Your account is now a '||new.role||' account.','/'||new.role,'role:'||new.id||':'||new.role);
  end if;
 elsif tg_table_name='lesson_resources' or tg_table_name='lesson_worksheets' then
  cid:=new.course_id;
  if tg_table_name='lesson_worksheets' then
   if tg_op='UPDATE' and old.body is not distinct from new.body then return new; end if;
  end if;
  select * into c from public.courses where id=cid;
  if c.status<>'published' then return new; end if;
  if tg_table_name='lesson_resources' then event:='resource:'||new.id;
  else event:='worksheet:'||new.lesson_id||':'||md5(new.body); end if;
  for p in select learner_id from public.enrollments where course_id=cid loop
   perform lms_private.notify(p.learner_id,'Lesson resources updated','New learning material is available in '||c.title||'.','/learner/courses/'||cid||'/learn',event,'info','announcement');
  end loop;
 end if;
 return new;
end $$;
revoke all on function lms_private.notification_events() from public,anon,authenticated;
create trigger notification_enrollment after insert or update on public.enrollments for each row execute function lms_private.notification_events();
create trigger notification_certificate after insert on public.certificates for each row execute function lms_private.notification_events();
create trigger notification_result after update on public.quiz_attempts for each row execute function lms_private.notification_events();
create trigger notification_course after insert or update on public.courses for each row execute function lms_private.notification_events();
create trigger notification_quiz after insert or update on public.quizzes for each row execute function lms_private.notification_events();
create trigger notification_support after insert or update on public.support_tickets for each row execute function lms_private.notification_events();
create trigger notification_profile after insert or update on public.profiles for each row execute function lms_private.notification_events();
create trigger notification_resource after insert on lms_private.lesson_resources for each row execute function lms_private.notification_events();
create trigger notification_worksheet after insert or update on lms_private.lesson_worksheets for each row execute function lms_private.notification_events();
do $$ begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') and not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='notifications') then
  alter publication supabase_realtime add table public.notifications;
 end if;
end $$;
create function public.notification_feed(before_time timestamptz default null,before_id uuid default null,unread_only boolean default false) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare uid uuid:=auth.uid(); rows jsonb; unread_count bigint;
begin
 if uid is null or lms_private.current_role() is null then raise exception 'Authentication required' using errcode='42501'; end if;
 select count(*) into unread_count from public.notifications where user_id=uid and not is_read;
 select coalesce(jsonb_agg(to_jsonb(n) order by created_at desc,id desc),'[]') into rows from (
  select * from public.notifications where user_id=uid and (not unread_only or not is_read)
   and (before_time is null or (created_at,id)<(before_time,before_id))
  order by created_at desc,id desc limit 51
 ) n;
 return jsonb_build_object('notifications',rows,'unreadCount',unread_count);
end $$;
revoke all on function public.notification_feed(timestamptz,uuid,boolean) from public,anon;
grant execute on function public.notification_feed(timestamptz,uuid,boolean) to authenticated;
commit;

