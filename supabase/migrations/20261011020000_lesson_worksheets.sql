begin;
-- Kept separately so draft course saves do not erase authored exercises when
-- modules are rebuilt, and enrolled courses can receive worksheet updates.
create table lms_private.lesson_worksheets (
 course_id uuid not null references public.courses(id) on delete cascade,
 lesson_id uuid not null,
 body text not null check (char_length(body) between 1 and 100000),
 primary key(course_id,lesson_id)
);
alter table lms_private.lesson_worksheets enable row level security;

do $migration$
declare definition text; revised text;
begin
 definition:=pg_get_functiondef('public.lms_command(text,jsonb)'::regprocedure);
 revised:=replace(definition,'case command', $branch$case command
 when 'worksheet' then
  select m.course_id into cid from public.lessons l join public.modules m on m.id=l.module_id where l.id=(payload->>'lessonId')::uuid;
  if cid is null or not lms_private.manages(cid) then raise exception 'Worksheet management denied' using errcode='42501'; end if;
  perform 1 from public.courses where id=cid for update;
  if not lms_private.manages(cid) then raise exception 'Worksheet management denied' using errcode='42501'; end if;
  if not exists(select 1 from public.lessons l join public.modules m on m.id=l.module_id where l.id=(payload->>'lessonId')::uuid and m.course_id=cid) then raise exception 'Lesson changed. Reload before saving.'; end if;
  if coalesce((select body from lms_private.lesson_worksheets where course_id=cid and lesson_id=(payload->>'lessonId')::uuid),'') is distinct from payload->>'previous' then raise exception 'Worksheet changed in another session. Reload before saving.'; end if;
  if payload->>'body' is null or char_length(payload->>'body')>100000 then raise exception 'Worksheet must contain at most 100000 characters'; end if;
  if nullif(trim(payload->>'body'),'') is null then
   delete from lms_private.lesson_worksheets where course_id=cid and lesson_id=(payload->>'lessonId')::uuid;
  else
   insert into lms_private.lesson_worksheets(course_id,lesson_id,body) values(cid,(payload->>'lessonId')::uuid,trim(payload->>'body'))
   on conflict(course_id,lesson_id) do update set body=excluded.body;
  end if;
 $branch$);
 if revised=definition then raise exception 'Worksheet command migration did not match'; end if;
 execute revised;

 definition:=pg_get_functiondef('public.course_outlines(uuid[])'::regprocedure);
 revised:=replace(definition,'''videoUrl'',case', $outline$'worksheet',case when lms_private.enrolled(c.id) or lms_private.manages(c.id) then coalesce((select w.body from lms_private.lesson_worksheets w where w.course_id=c.id and w.lesson_id=l.id),'') else '' end,'videoUrl',case$outline$);
 if revised=definition then raise exception 'Worksheet outline migration did not match'; end if;
 execute revised;
end
$migration$;
commit;
