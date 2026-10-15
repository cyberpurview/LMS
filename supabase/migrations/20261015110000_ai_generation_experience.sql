begin;
-- Count content actually present in the saved draft, rather than assuming every
-- processed lesson was written (creators may rename, remove or edit lessons).
create or replace function lms_private.ai_job_view(j lms_private.ai_course_jobs) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('id',j.id,'spec',j.spec,'status',j.status,'outline',j.outline,'courseId',j.course_id,'completed',j.completed,'total',jsonb_array_length(j.plan),'ready',(
   select count(*) from jsonb_array_elements(j.plan) item
   join public.lessons l on l.id=(item->>'lessonId')::uuid
   join public.modules m on m.id=l.module_id and m.course_id=j.course_id
   where length(trim(regexp_replace(l.content,'<[^>]*>','','g')))>0
 ),'error',j.last_error,'model',j.model,'createdAt',j.created_at);
$$;

create function lms_private.ai_generation_notification() returns trigger language plpgsql security definer set search_path='' as $$
declare creator_role text; heading text; body text; link text; kind text:='info'; ready integer; total integer;
begin
 select role into creator_role from public.profiles where id=new.owner_id and is_active and role in ('admin','tutor');
 if creator_role is null then return new; end if;
 link:='/'||creator_role||'/courses/ai?job='||new.id;
 if new.status='review' then
   heading:='Your course outline is ready'; body:=new.spec->>'title';
 elsif new.status='complete' then
   ready:=(lms_private.ai_job_view(new)->>'ready')::integer;
   total:=jsonb_array_length(new.plan);
   if ready>=total and total>0 then
     heading:='Your course draft is ready'; kind:='success';
     body:=(new.spec->>'title')||': all '||total||' lessons are ready for review.';
   else
     heading:='Generation finished — review needed';
     body:=(new.spec->>'title')||': '||ready||' of '||total||' planned lessons have content. Check changed or removed lessons.';
   end if;
   link:='/'||creator_role||'/courses/'||new.course_id||'/edit';
 elsif new.status='failed' then
   heading:='Course generation needs attention';
   body:=(new.spec->>'title')||'. Your progress is saved. Open generation status to retry.';
 else return new;
 end if;
 -- One notification per milestone, never one per lesson or repeated polling.
 perform lms_private.notify(new.owner_id,heading,body,link,'ai-generation:'||new.id||':'||new.status,kind);
 return new;
end $$;
revoke all on function lms_private.ai_generation_notification() from public,anon,authenticated;
create trigger ai_generation_milestone after update of status on lms_private.ai_course_jobs
for each row when(old.status is distinct from new.status and new.status in ('review','complete','failed'))
execute function lms_private.ai_generation_notification();
commit;
