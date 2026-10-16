-- Groq uses namespaced model IDs. Preserve all existing worker access controls.
create or replace function public.claim_ai_course_work(model_name text,daily_request_limit integer default 100) returns jsonb
language plpgsql security definer set search_path='' as $$
declare j lms_private.ai_course_jobs; last_call timestamptz;
begin
 if model_name is null or model_name !~ '^[a-zA-Z0-9][a-zA-Z0-9./_-]{0,99}$' then raise exception 'Invalid model'; end if;
 if daily_request_limit not between 1 and 10000 or daily_request_limit is null then raise exception 'Invalid generation budget'; end if;
 if not pg_try_advisory_xact_lock(hashtextextended('ai-course-worker',0)) then return null; end if;
 select last_started into last_call from lms_private.ai_worker_control where singleton for update;
 if last_call>clock_timestamp()-interval '15 seconds' or exists(select 1 from lms_private.ai_course_jobs where leased_until>clock_timestamp() and status in ('outlining','generating')) then return null; end if;
 update lms_private.ai_worker_control set request_day=current_date,request_count=0 where singleton and request_day<>current_date;
 if (select request_count>=daily_request_limit from lms_private.ai_worker_control where singleton) then
  update lms_private.ai_course_jobs set last_error='Daily AI request budget reached. Queued work will resume tomorrow.' where status in ('outline_queued','generating') and last_error is distinct from 'Daily AI request budget reached. Queued work will resume tomorrow.';
  return null;
 end if;
 update lms_private.ai_course_jobs pending set status='failed',last_error='Creator account is no longer eligible',lease_token=null,leased_until=null,updated_at=clock_timestamp() where status in ('outline_queued','outlining','generating') and not exists(select 1 from public.profiles p where p.id=pending.owner_id and p.is_active and p.role in ('admin','tutor'));
 select * into j from lms_private.ai_course_jobs where status in ('outline_queued','outlining','generating') and available_at<=clock_timestamp() and (leased_until is null or leased_until<=clock_timestamp()) order by available_at,created_at for update skip locked limit 1;
 if j.id is null then return null; end if;
 if j.attempts>=3 then update lms_private.ai_course_jobs set status='failed',last_error='Generation was interrupted repeatedly. Retry when ready.',lease_token=null,leased_until=null,updated_at=clock_timestamp() where id=j.id; return null; end if;
 update lms_private.ai_worker_control set last_started=clock_timestamp(),request_count=request_count+1 where singleton;
 update lms_private.ai_course_jobs set status=case when course_id is null then 'outlining' else 'generating' end,model=coalesce(model,model_name),lease_token=gen_random_uuid(),leased_until=clock_timestamp()+interval '2 minutes',attempts=attempts+1,updated_at=clock_timestamp() where id=j.id returning * into j;
 return to_jsonb(j);
end $$;
-- Invalidate old provider leases so late Gemini responses cannot commit.
update lms_private.ai_course_jobs set model=null, lease_token=null, leased_until=null, attempts=0, status=case when status='outlining' then 'outline_queued' else status end, updated_at=clock_timestamp() where model like 'gemini-%' and status not in ('complete','cancelled');
