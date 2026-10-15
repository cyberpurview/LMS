begin;
create index courses_browse_status_id on public.courses(status,id);
create index courses_browse_tutor_id on public.courses(tutor_id,id);
create function public.browse_courses(mode text default 'catalog',after_id uuid default null,
 page_size integer default 12,search text default '',category_filter text default '',level_filter text default '',state_filter text default '')
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare access_role public.lms_role:=lms_private.current_role(); uid uuid:=auth.uid(); result jsonb;
begin
 if access_role is null then raise exception 'Authentication required' using errcode='42501'; end if;
 if mode is null or mode not in ('catalog','mine','managed') or page_size is null or page_size not between 1 and 24
  or char_length(search)>200 or char_length(category_filter)>80
  or level_filter not in ('','Beginner','Intermediate','Advanced')
  or state_filter not in ('','published','draft','archived','completed','ongoing')
 then raise exception 'Invalid course filters'; end if;
 if (mode='mine' and access_role<>'learner') or (mode='managed' and access_role='learner') then raise exception 'Course access denied' using errcode='42501'; end if;
 with selected as (
  select c.*,p.name as tutor_name,p.avatar as tutor_avatar,e.completed_at as learner_completed_at
  from public.courses c join public.profiles p on p.id=c.tutor_id
  left join public.enrollments e on e.course_id=c.id and e.learner_id=uid
  where (after_id is null or c.id>after_id)
   and ((mode='catalog' and c.status='published') or (mode='mine' and e.id is not null) or (mode='managed' and (access_role='admin' or c.tutor_id=uid)))
   and (category_filter='' or c.category=category_filter)
   and (level_filter='' or c.level=level_filter)
   and (search='' or c.search_document @@ pg_catalog.websearch_to_tsquery('english',search))
   and (state_filter='' or (mode='mine' and ((state_filter='completed' and e.completed_at is not null) or (state_filter='ongoing' and e.completed_at is null))) or (mode='managed' and c.status=state_filter))
  order by c.id limit page_size+1
 ), cards as (
  select c.id,jsonb_build_object('id',c.id,'title',c.title,'tutorName',c.tutor_name,'tutorAvatar',c.tutor_avatar,
   'thumbnail',c.thumbnail,'category',c.category,'level',c.level,'duration',c.duration,'price',c.price,'status',c.status,
   'enrolledCount',(select count(*) from public.enrollments e where e.course_id=c.id),
   'progress',case when mode='mine' then coalesce((select round(100.0*count(lp.lesson_id)/nullif(count(l.id),0)) from public.modules m join public.lessons l on l.module_id=m.id left join public.lesson_progress lp on lp.lesson_id=l.id and lp.learner_id=uid where m.course_id=c.id),0) else null end,
   'completed',c.learner_completed_at is not null) as card
  from selected c order by c.id limit page_size
 ) select jsonb_build_object('courses',coalesce((select jsonb_agg(card order by id) from cards),'[]'),
   'nextCursor',case when (select count(*) from selected)>page_size then (select id from cards order by id desc limit 1) else null end) into result;
 return result;
end $$;
revoke all on function public.browse_courses(text,uuid,integer,text,text,text,text) from public,anon;
grant execute on function public.browse_courses(text,uuid,integer,text,text,text,text) to authenticated;
commit;
