begin;

alter table public.courses add column slug text;
create unique index courses_slug_unique on public.courses(slug);

create function lms_private.assign_course_slug() returns trigger
language plpgsql security definer set search_path='' as $$
declare base text; candidate text; existing_slug text;
begin
 if tg_op='UPDATE' and old.slug is not null then
  new.slug:=old.slug;
  return new;
 end if;
 -- Course saves use upserts. Reuse the existing URL on their insert path too.
 if tg_op='INSERT' then
  select c.slug into existing_slug from public.courses c where c.id=new.id;
  if existing_slug is not null then new.slug:=existing_slug; return new; end if;
 end if;
 base:=trim(both '-' from pg_catalog.regexp_replace(pg_catalog.lower(new.title),'[^a-z0-9]+','-','g'));
 base:=rtrim(left(base,80),'-');
 if base='' then base:='course'; end if;
 if base in ('new','ai','edit','learn') or base ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then base:='course-'||base; end if;
 -- Serialize allocation for matching titles; the unique index is the final safeguard.
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('course-slug:'||base,0));
 candidate:=base;
 while exists(select 1 from public.courses c where c.slug=candidate and c.id<>new.id) loop
  candidate:=base||'-'||left(replace(pg_catalog.gen_random_uuid()::text,'-',''),8);
 end loop;
 new.slug:=candidate;
 return new;
end $$;
revoke all on function lms_private.assign_course_slug() from public,anon,authenticated;
create trigger assign_course_slug before insert or update on public.courses
for each row execute function lms_private.assign_course_slug();

-- Preserve IDs, revisions, enrollments and certificates while assigning existing courses URLs.
update public.courses set slug='' where slug is null;
alter table public.courses alter column slug set not null;
alter table public.courses add constraint courses_slug_format
check(length(slug) between 1 and 96 and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$');

-- Keep the existing bounded, permission-checked listing RPC and include its course slug.
do $$
declare definition text; revised text;
begin
 definition:=pg_get_functiondef('public.browse_courses(text,uuid,integer,text,text,text,text)'::regprocedure);
 revised:=replace(definition,'''id'',c.id,''title'',c.title','''id'',c.id,''slug'',c.slug,''title'',c.title');
 if revised=definition then raise exception 'Course listing did not match slug migration'; end if;
 execute revised;
end $$;

commit;
