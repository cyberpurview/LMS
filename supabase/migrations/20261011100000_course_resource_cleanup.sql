begin;
create table lms_private.course_storage_cleanup (
 path text primary key, available_at timestamptz not null default now(), attempts integer not null default 0
);
alter table lms_private.course_storage_cleanup enable row level security;
create function lms_private.queue_course_resource_cleanup() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into lms_private.course_storage_cleanup(path) values(old.path) on conflict do nothing;
 return old;
end $$;
revoke all on function lms_private.queue_course_resource_cleanup() from public,anon,authenticated;
create trigger resource_cleanup after delete on lms_private.lesson_resources for each row execute function lms_private.queue_course_resource_cleanup();
create function public.claim_course_resource_cleanup() returns jsonb language sql security definer set search_path='' as $$
 with picked as (select path from lms_private.course_storage_cleanup where available_at<=now() order by available_at,path limit 50 for update skip locked),
 claimed as (update lms_private.course_storage_cleanup c set available_at=now()+interval '10 minutes',attempts=attempts+1 from picked where c.path=picked.path returning c.path)
 select coalesce(jsonb_agg(path),'[]') from claimed;
$$;
create function public.finish_course_resource_cleanup(paths text[]) returns void language sql security definer set search_path='' as $$
 delete from lms_private.course_storage_cleanup where path=any(paths);
$$;
revoke all on function public.claim_course_resource_cleanup(),public.finish_course_resource_cleanup(text[]) from public,anon,authenticated;
do $migration$
declare definition text; revised text;
begin
 if exists(select 1 from pg_roles where rolname='service_role') then
  grant execute on function public.claim_course_resource_cleanup(),public.finish_course_resource_cleanup(text[]) to service_role;
 end if;
 definition:=pg_get_functiondef('public.lms_command(text,jsonb)'::regprocedure);
 revised:=replace(definition,' when ''saveQuiz'' then',$branch$
  -- Metadata intentionally survives rebuilding lesson IDs; prune only after the final outline exists.
  delete from lms_private.lesson_resources r where r.course_id=cid and not exists(select 1 from public.lessons l join public.modules m on m.id=l.module_id where l.id=r.lesson_id and m.course_id=cid);
  delete from lms_private.lesson_worksheets w where w.course_id=cid and not exists(select 1 from public.lessons l join public.modules m on m.id=l.module_id where l.id=w.lesson_id and m.course_id=cid);
 when 'saveQuiz' then
 $branch$);
 if revised=definition then raise exception 'Course cleanup did not match save'; end if;
 execute revised;
end $migration$;
commit;
