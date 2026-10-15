begin;
-- Return the exact revision under the same transaction lock, allowing authoring
-- to continue after saving a new lesson for a PDF upload.
create function public.save_course_with_revision(payload jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare revision timestamptz;
begin
 perform public.lms_command('saveCourse',payload);
 select updated_at into revision from public.courses where id=(payload->>'id')::uuid;
 return jsonb_build_object('updatedAt',revision);
end $$;
revoke all on function public.save_course_with_revision(jsonb) from public,anon;
grant execute on function public.save_course_with_revision(jsonb) to authenticated;
commit;
