begin;
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('course-thumbnails', 'course-thumbnails', true, 5242880, array['image/webp'])
on conflict (id) do update set public = excluded.public,
  file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- Public marketing images; writes pass through the server's ownership and ratio checks.
-- Restrictive policies prevent broad policies for other buckets from allowing direct writes.
create policy course_thumbnails_server_insert on storage.objects as restrictive for insert to authenticated, anon
with check (bucket_id <> 'course-thumbnails');
create policy course_thumbnails_server_update on storage.objects as restrictive for update to authenticated, anon
using (bucket_id <> 'course-thumbnails') with check (bucket_id <> 'course-thumbnails');
create policy course_thumbnails_server_delete on storage.objects as restrictive for delete to authenticated, anon
using (bucket_id <> 'course-thumbnails');
commit;
