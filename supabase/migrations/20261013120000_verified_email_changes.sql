begin;
create table lms_private.email_change_permissions (
 user_id uuid primary key references auth.users(id) on delete cascade,
 old_email text not null,new_email text not null,expires_at timestamptz not null,
 requested boolean not null default false
);
alter table lms_private.email_change_permissions enable row level security;
revoke all on lms_private.email_change_permissions from public,anon,authenticated;

-- Only the server may grant permission, after checking a fresh OTP for this same user.
create function public.authorize_email_change(user_id uuid,new_email text) returns void
language plpgsql security definer set search_path='' as $$
declare current_email text;
begin
 select email into current_email from auth.users where id=user_id for update;
 if current_email is null or not exists(select 1 from public.profiles p where p.id=user_id and p.is_active) then raise exception 'Account unavailable'; end if;
 if char_length(new_email)>254 or new_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or lower(new_email)=lower(current_email) then raise exception 'Choose a different valid email address'; end if;
 if exists(select 1 from lms_private.email_change_permissions p where p.user_id=authorize_email_change.user_id and p.requested and p.expires_at>clock_timestamp()) then raise exception 'An email change is already pending'; end if;
 insert into lms_private.email_change_permissions values(user_id,current_email,lower(new_email),clock_timestamp()+interval '2 minutes',false)
 on conflict on constraint email_change_permissions_pkey do update set old_email=excluded.old_email,new_email=excluded.new_email,expires_at=excluded.expires_at,requested=false;
end $$;
create function public.email_change_quota(operation text) returns void
language plpgsql security definer set search_path='' as $$
begin
 if lms_private.current_role() is null then raise exception 'Please sign in' using errcode='42501'; end if;
 if operation not in ('send','verify','change','cancel') then raise exception 'Invalid operation'; end if;
 perform lms_private.course_request_limit('email-change-'||operation,case when operation='verify' then 10 when operation='cancel' then 10 else 3 end);
end $$;
create function public.cancel_email_change(user_id uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 perform 1 from auth.users where id=user_id for update;
 update auth.users set email_change='',email_change_token_current='',email_change_token_new='',email_change_confirm_status=0,email_change_sent_at=null where id=user_id;
 if to_regclass('auth.one_time_tokens') is not null then
  delete from auth.one_time_tokens t where t.user_id=cancel_email_change.user_id and t.token_type::text in ('email_change_token_current','email_change_token_new');
 end if;
 delete from lms_private.email_change_permissions p where p.user_id=cancel_email_change.user_id;
end $$;
revoke all on function public.authorize_email_change(uuid,text),public.cancel_email_change(uuid),public.email_change_quota(text) from public,anon,authenticated;
grant execute on function public.email_change_quota(text) to authenticated;
do $$ begin if exists(select 1 from pg_roles where rolname='service_role') then
 grant execute on function public.authorize_email_change(uuid,text),public.cancel_email_change(uuid) to service_role;
end if; end $$;

create or replace function lms_private.prevent_account_email_change() returns trigger
language plpgsql security definer set search_path='' as $$
declare pending_email text:=nullif(to_jsonb(new)->>'email_change',''); permission lms_private.email_change_permissions;
begin
 if old.email is not null and new.email is distinct from old.email then
  select * into permission from lms_private.email_change_permissions where user_id=old.id for update;
  if permission.user_id is null or not permission.requested or permission.expires_at<clock_timestamp()
   or permission.old_email is distinct from old.email or lower(permission.new_email) is distinct from lower(new.email)
  then raise exception 'Verify your identity before changing your email' using errcode='23514'; end if;
 elsif pending_email is not null and pending_email is distinct from nullif(to_jsonb(old)->>'email_change','') then
  select * into permission from lms_private.email_change_permissions where user_id=old.id for update;
  if permission.user_id is null or permission.requested or permission.expires_at<clock_timestamp()
   or permission.old_email is distinct from old.email or permission.new_email is distinct from lower(pending_email)
  then raise exception 'Verify your identity before changing your email' using errcode='23514'; end if;
  update lms_private.email_change_permissions set requested=true,expires_at=clock_timestamp()+interval '1 hour' where user_id=old.id;
 end if;
 return new;
end $$;
create function lms_private.finish_verified_email_change() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if old.email is not null and new.email is distinct from old.email then
  -- JWTs remain signed, but LMS RLS requires a live auth.sessions row.
  delete from auth.sessions where user_id=new.id;
  delete from lms_private.email_change_permissions where user_id=new.id;
  insert into lms_private.audit_log(actor_id,action,entity_id) values(new.id,'verifiedEmailChange',new.id);
 end if;
 return new;
end $$;
revoke all on function lms_private.finish_verified_email_change() from public,anon,authenticated;
create trigger finish_lms_email_change after update of email on auth.users for each row execute function lms_private.finish_verified_email_change();
commit;
