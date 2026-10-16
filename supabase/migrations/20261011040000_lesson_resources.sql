begin;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('lesson-resources','lesson-resources',false,20971520,array['application/pdf'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
-- Every file operation is authorized by the resource API, including signed reads.
create policy lesson_resources_server_only on storage.objects as restrictive for all to authenticated,anon
using(bucket_id<>'lesson-resources') with check(bucket_id<>'lesson-resources');

create table lms_private.lesson_resources (
 id uuid primary key,
 course_id uuid not null references public.courses(id) on delete cascade,
 lesson_id uuid not null,
 name text not null check(char_length(name) between 1 and 200),
 path text not null unique,
 bytes integer not null check(bytes between 1 and 20971520),
 pages integer not null check(pages>0),
 created_at timestamptz not null default now()
);
alter table lms_private.lesson_resources enable row level security;
create index lesson_resources_lesson on lms_private.lesson_resources(course_id,lesson_id,created_at,id);

create function public.lesson_resource_command(action text,payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare cid uuid; lid uuid; item lms_private.lesson_resources; result jsonb;
begin
 if auth.uid() is null or lms_private.current_role() is null then raise exception 'Please sign in' using errcode='42501'; end if;
 if action in ('read','remove') then
  select * into item from lms_private.lesson_resources where id=(payload->>'id')::uuid;
  lid:=item.lesson_id;
 else lid:=(payload->>'lessonId')::uuid; end if;
 select m.course_id into cid from public.lessons l join public.modules m on m.id=l.module_id where l.id=lid;
 if cid is null or (item.id is not null and item.course_id<>cid) then raise exception 'Resource unavailable' using errcode='42501'; end if;
 if action in ('add','remove','prepare') then
  perform 1 from public.courses where id=cid for update;
  if not lms_private.manages(cid) then raise exception 'Resource management denied' using errcode='42501'; end if;
  if not exists(select 1 from public.lessons l join public.modules m on m.id=l.module_id where l.id=lid and m.course_id=cid) then raise exception 'Lesson changed. Reload before uploading.'; end if;
 elsif not (lms_private.manages(cid) or lms_private.enrolled(cid)) then raise exception 'Enrollment required' using errcode='42501'; end if;
 if action='prepare' then
  if (select count(*) from lms_private.lesson_resources where course_id=cid and lesson_id=lid)>=10 then raise exception 'A lesson can have up to 10 PDFs. Remove one before uploading another.'; end if;
  return jsonb_build_object('courseId',cid);
 elsif action='list' then
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'bytes',bytes,'pages',pages,'createdAt',created_at) order by created_at,id),'[]') into result from lms_private.lesson_resources where course_id=cid and lesson_id=lid;
  return result;
 elsif action='read' then
  return jsonb_build_object('path',item.path,'name',item.name);
 elsif action='remove' then
  delete from lms_private.lesson_resources where id=item.id;
  return jsonb_build_object('path',item.path);
 elsif action='add' then
  if (select count(*) from lms_private.lesson_resources where course_id=cid and lesson_id=lid)>=10 then raise exception 'A lesson can have up to 10 PDFs. Remove one before uploading another.'; end if;
  if payload->>'path' is distinct from cid::text||'/'||lid::text||'/'||(payload->>'id')::uuid::text||'.pdf' then raise exception 'Invalid resource path'; end if;
  if not exists(select 1 from storage.objects where bucket_id='lesson-resources' and name=payload->>'path') then raise exception 'Upload the PDF before saving its resource'; end if;
  insert into lms_private.lesson_resources(id,course_id,lesson_id,name,path,bytes,pages) values((payload->>'id')::uuid,cid,lid,payload->>'name',payload->>'path',(payload->>'bytes')::integer,(payload->>'pages')::integer) returning * into item;
  return jsonb_build_object('id',item.id,'name',item.name,'bytes',item.bytes,'pages',item.pages,'createdAt',item.created_at);
 else raise exception 'Unknown resource action'; end if;
end $$;
revoke all on function public.lesson_resource_command(text,jsonb) from public,anon;
grant execute on function public.lesson_resource_command(text,jsonb) to authenticated;
commit;
