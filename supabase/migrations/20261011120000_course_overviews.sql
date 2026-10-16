begin;
create function public.course_overviews(course_ids uuid[]) returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'tutorName',p.name,'enrolledCount',(select count(*) from public.enrollments where course_id=c.id),'modules',
 (select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'title',m.title,'lessons',
 (select coalesce(jsonb_agg(jsonb_build_object('id',l.id,'title',l.title,'duration',l.duration,'type',l.type) order by l.position),'[]') from public.lessons l where l.module_id=m.id)) order by m.position),'[]') from public.modules m where m.course_id=c.id))),'[]')
 from public.courses c join public.profiles p on p.id=c.tutor_id where c.id=any(course_ids) and lms_private.can_read_course(c.id) and cardinality(course_ids)<=100;
$$;
revoke all on function public.course_overviews(uuid[]) from public,anon;
grant execute on function public.course_overviews(uuid[]) to authenticated;
commit;
