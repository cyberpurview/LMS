begin;
-- An empty path inherits the course image dynamically, including future image changes.
alter table public.quizzes add column thumbnail_path text not null default '' check(char_length(thumbnail_path)<=512);
do $migration$
declare definition text; revised text;
begin
 definition:=pg_get_functiondef('public.lms_command(text,jsonb)'::regprocedure);
 revised:=replace(definition,
  'insert into public.quizzes(id,course_id,title,passing_score,time_limit,status) values(target,cid,trim(payload->>''title''),(payload->>''passingScore'')::integer,(payload->>''timeLimit'')::integer,coalesce(payload->>''status'',''published''))',
  $replacement$
  if coalesce(payload->>'thumbnailPath','')<>'' then
   if coalesce(payload->>'thumbnailPath','') !~ ('^[0-9a-f-]{36}/' || cid::text || '/[0-9a-f-]{36}\.webp$')
      or not exists(select 1 from storage.objects where bucket_id='course-thumbnails' and name=payload->>'thumbnailPath') then
    raise exception 'Upload a valid thumbnail for this quiz course';
   end if;
  end if;
  insert into public.quizzes(id,course_id,title,passing_score,time_limit,status,thumbnail_path) values(target,cid,trim(payload->>'title'),(payload->>'passingScore')::integer,(payload->>'timeLimit')::integer,coalesce(payload->>'status','published'),coalesce(payload->>'thumbnailPath',''))
  $replacement$);
 if revised=definition then raise exception 'Quiz thumbnail migration did not match insert'; end if;
 definition:=revised;
 revised:=replace(definition,'status=excluded.status,version=quizzes.version+1','status=excluded.status,thumbnail_path=excluded.thumbnail_path,version=quizzes.version+1');
 if revised=definition then raise exception 'Quiz thumbnail migration did not match update'; end if;
 execute revised;
end
$migration$;
commit;
