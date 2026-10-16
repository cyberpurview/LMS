begin;
-- Signature validation belongs to Auth/PostgREST; authorisation also requires an existing session.
-- This closes the remaining JWT lifetime window after sign-out without maintaining a token blacklist.
create or replace function lms_private.current_role() returns public.lms_role language sql stable security definer set search_path='' as $$
 select p.role from public.profiles p
 join auth.sessions s on s.user_id=p.id and s.id=case
  when auth.jwt()->>'session_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  then (auth.jwt()->>'session_id')::uuid end
 where p.id=(select auth.uid()) and p.is_active;
$$;
commit;
