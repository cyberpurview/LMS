begin;
create table lms_private.course_announcements (
 event_key text primary key, course_id uuid not null references public.courses(id) on delete cascade,
 title text not null, message text not null, href text not null,
 cursor_id uuid, created_at timestamptz not null default now(), finished_at timestamptz
);
alter table lms_private.course_announcements enable row level security;
create index announcements_pending on lms_private.course_announcements(created_at,event_key) where finished_at is null;
create function lms_private.queue_course_announcement(cid uuid,heading text,body text,link text,event text) returns void language sql security definer set search_path='' as $$
 insert into lms_private.course_announcements(event_key,course_id,title,message,href) values(event,cid,heading,body,link) on conflict do nothing;
$$;
create function lms_private.process_course_announcements() returns integer language plpgsql security definer set search_path='' as $$
declare job record; recipient record; last_id uuid; processed integer:=0; batch integer;
begin
 for job in select * from lms_private.course_announcements where finished_at is null order by created_at,event_key limit 10 for update skip locked loop
  batch:=0; last_id:=job.cursor_id;
  for recipient in select learner_id from public.enrollments where course_id=job.course_id and (job.cursor_id is null or learner_id>job.cursor_id) order by learner_id limit 100 loop
   perform lms_private.notify(recipient.learner_id,job.title,job.message,job.href,job.event_key,'info','announcement');
   last_id:=recipient.learner_id; batch:=batch+1;
  end loop;
  update lms_private.course_announcements set cursor_id=last_id,finished_at=case when batch<100 then now() end where event_key=job.event_key;
  processed:=processed+batch;
 end loop;
 return processed;
end $$;
revoke all on function lms_private.queue_course_announcement(uuid,text,text,text,text),lms_private.process_course_announcements() from public,anon,authenticated;
do $migration$
declare definition text; revised text;
begin
 definition:=pg_get_functiondef('lms_private.notification_events()'::regprocedure);
 revised:=replace(definition,$old$
   for p in select learner_id from public.enrollments where course_id=new.id loop
    perform lms_private.notify(p.learner_id,'Course updated',new.title||' has been updated.','/learner/courses/'||new.id,'updated:'||new.id||':'||new.updated_at,'info','announcement');
   end loop;
 $old$,$new$
   perform lms_private.queue_course_announcement(new.id,'Course updated',new.title||' has been updated.','/learner/courses/'||new.id,'updated:'||new.id||':'||new.updated_at);
 $new$);
 if revised=definition then raise exception 'Announcement batching did not match courses'; end if;
 definition:=revised;
 revised:=replace(definition,$old$
  for p in select learner_id from public.enrollments where course_id=new.course_id loop
   perform lms_private.notify(p.learner_id,'New assessment available',new.title||' is ready to take.','/learner/quizzes/'||new.id,'quiz:'||new.id,'info','announcement');
  end loop;
 $old$,$new$
  perform lms_private.queue_course_announcement(new.course_id,'New assessment available',new.title||' is ready to take.','/learner/quizzes/'||new.id,'quiz:'||new.id);
 $new$);
 if revised=definition then raise exception 'Announcement batching did not match assessments'; end if;
 definition:=revised;
 revised:=replace(definition,$old$
  for p in select learner_id from public.enrollments where course_id=cid loop
   perform lms_private.notify(p.learner_id,'Lesson resources updated','New learning material is available in '||c.title||'.','/learner/courses/'||cid||'/learn',event,'info','announcement');
  end loop;
 $old$,$new$
  perform lms_private.queue_course_announcement(cid,'Lesson resources updated','New learning material is available in '||c.title||'.','/learner/courses/'||cid||'/learn',event);
 $new$);
 if revised=definition then raise exception 'Announcement batching did not match resources'; end if;
 execute revised;
 if exists(select 1 from pg_extension where extname='pg_cron') then
  perform cron.schedule('cyberpurview-course-announcements','* * * * *','select lms_private.process_course_announcements()');
 end if;
end $migration$;
commit;
