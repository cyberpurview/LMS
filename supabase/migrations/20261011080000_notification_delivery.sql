begin;
create index enrollment_reminders on public.enrollments(last_accessed_at,learner_id) where completed_at is null;
create function lms_private.scheduled_notifications() returns void language plpgsql security definer set search_path='' as $$
declare r record; event text;
begin
 for r in select e.*,c.title from public.enrollments e join public.courses c on c.id=e.course_id join public.profiles p on p.id=e.learner_id
  where e.completed_at is null and e.last_accessed_at<now()-interval '7 days' and c.status='published' and p.is_active
   and (p.preferences->'courseReminders' is distinct from 'false'::jsonb)
   and not exists(select 1 from public.notifications n where n.user_id=e.learner_id and n.event_key='reminder:'||e.id||':'||date_trunc('week',now())::date)
  order by e.last_accessed_at,e.id limit 500 loop
  perform lms_private.notify(r.learner_id,'Continue your learning','Pick up where you left off in '||r.title||'.','/learner/courses/'||r.course_id||'/learn','reminder:'||r.id||':'||date_trunc('week',now())::date,'info','reminder');
 end loop;
 if extract(isodow from now())=1 then
  for r in select p.id,p.role,
   (select count(*) from public.lesson_progress l where l.learner_id=p.id and l.completed_at>=now()-interval '7 days') lessons,
   (select count(*) from public.quiz_attempts a where a.learner_id=p.id and a.submitted_at>=now()-interval '7 days') assessments
   from public.profiles p where p.is_active and p.role='learner' and coalesce(p.preferences->'weeklyDigest'='true'::jsonb,false)
    and not exists(select 1 from public.notifications n where n.user_id=p.id and n.event_key='digest:'||date_trunc('week',now())::date)
   order by p.id limit 500 loop
   perform lms_private.notify(r.id,'Your weekly learning summary',r.lessons||' lessons completed and '||r.assessments||' assessments submitted in the last seven days.','/learner','digest:'||date_trunc('week',now())::date,'info','digest');
  end loop;
 end if;
end $$;
revoke all on function lms_private.scheduled_notifications() from public,anon,authenticated;
create table lms_private.notification_emails (
 id uuid primary key references public.notifications(id) on delete cascade,
 user_id uuid not null references public.profiles(id) on delete cascade,
 status text not null default 'pending' check(status in ('pending','sending','sent','failed')),
 attempts integer not null default 0, available_at timestamptz not null default now(), sent_at timestamptz,
 last_error text
);
alter table lms_private.notification_emails enable row level security;
create index email_pending on lms_private.notification_emails(available_at,id) where status in ('pending','sending');
create function lms_private.queue_notification_email() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into lms_private.notification_emails(id,user_id)
 select new.id,p.id from public.profiles p where p.id=new.user_id and p.is_active and nullif(p.email,'') is not null and
 case new.category when 'reminder' then (p.preferences->'courseReminders' is distinct from 'false'::jsonb)
 when 'digest' then coalesce(p.preferences->'weeklyDigest'='true'::jsonb,false)
 else (p.preferences->'emailUpdates' is distinct from 'false'::jsonb) end;
 return new;
end $$;
revoke all on function lms_private.queue_notification_email() from public,anon,authenticated;
create trigger notification_email after insert on public.notifications for each row execute function lms_private.queue_notification_email();
create function public.claim_notification_emails() returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 update lms_private.notification_emails set status='failed',last_error='Retry limit reached' where status='sending' and attempts>=5 and available_at<=now();
 -- Disabled accounts and opted-out recipients are never delivered from an old queue.
 update lms_private.notification_emails e set status='failed',last_error='Recipient disabled or opted out'
 from public.profiles p,public.notifications n where p.id=e.user_id and n.id=e.id and e.status in ('pending','sending') and
 (not p.is_active or not case n.category when 'reminder' then (p.preferences->'courseReminders' is distinct from 'false'::jsonb)
 when 'digest' then coalesce(p.preferences->'weeklyDigest'='true'::jsonb,false) else (p.preferences->'emailUpdates' is distinct from 'false'::jsonb) end);
 with picked as (select id from lms_private.notification_emails where status in ('pending','sending') and available_at<=now() and attempts<5 order by available_at,id limit 50 for update skip locked),
 claimed as (update lms_private.notification_emails e set status='sending',attempts=attempts+1,available_at=now()+interval '10 minutes' from picked where e.id=picked.id returning e.id,e.user_id)
 select coalesce(jsonb_agg(jsonb_build_object('id',n.id,'email',p.email,'title',n.title,'message',n.message,'href',n.href)),'[]') into result
 from claimed e join public.notifications n on n.id=e.id join public.profiles p on p.id=e.user_id;
 return result;
end $$;
create function public.finish_notification_email(email_id uuid,delivered boolean) returns void language sql security definer set search_path='' as $$
 update lms_private.notification_emails set status=case when delivered then 'sent' when attempts>=5 then 'failed' else 'pending' end,
 sent_at=case when delivered then now() end,last_error=case when delivered then null else 'Email provider rejected or could not deliver request' end,
 available_at=now()+interval '15 minutes' where id=email_id and status='sending';
$$;
revoke all on function public.claim_notification_emails(),public.finish_notification_email(uuid,boolean) from public,anon,authenticated;
do $$ begin
 if exists(select 1 from pg_roles where rolname='service_role') then
  grant execute on function public.claim_notification_emails(),public.finish_notification_email(uuid,boolean) to service_role;
 end if;
 if exists(select 1 from pg_available_extensions where name='pg_cron') then
  create extension if not exists pg_cron with schema pg_catalog;
  perform cron.schedule('cyberpurview-learning-notifications','0 * * * *','select lms_private.scheduled_notifications()');
 end if;
end $$;
commit;

