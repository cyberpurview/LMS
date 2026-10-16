begin;
-- GoTrue uses its own database connection, so application-only validation is insufficient.
-- Reject both a pending email-change request and its eventual confirmation.
create function lms_private.prevent_account_email_change() returns trigger
language plpgsql set search_path='' as $$
begin
 if (old.email is not null and new.email is distinct from old.email)
 or (nullif(to_jsonb(new)->>'email_change','') is not null and
     nullif(to_jsonb(new)->>'email_change','') is distinct from nullif(to_jsonb(old)->>'email_change',''))
 then raise exception 'The sign-in email cannot be changed' using errcode='23514'; end if;
 return new;
end $$;
revoke all on function lms_private.prevent_account_email_change() from public,anon,authenticated;
create trigger prevent_lms_email_change before update on auth.users
for each row execute function lms_private.prevent_account_email_change();
commit;
