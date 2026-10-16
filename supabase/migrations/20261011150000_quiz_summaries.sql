begin;
create function public.quiz_summaries(quiz_ids uuid[]) returns jsonb
language sql stable security invoker set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'questionCount',s.count)),'[]'::jsonb)
 from (select q.id,count(qq.id) as count from public.quizzes q
 left join public.quiz_questions qq on qq.quiz_id=q.id
 where cardinality(quiz_ids)<=200 and q.id=any(quiz_ids)
 group by q.id) s;
$$;
revoke all on function public.quiz_summaries(uuid[]) from public,anon;
grant execute on function public.quiz_summaries(uuid[]) to authenticated;
commit;
