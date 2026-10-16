begin;
create table lms_private.contact_message_requests (
 id uuid primary key,
 ip_hash text not null,
 email_hash text not null,
 payload_hash text not null,
 created_at timestamptz not null default now(),
 last_attempt_at timestamptz not null default now(),
 tries integer not null default 1,
 sent boolean not null default false
);
create index contact_requests_ip_time on lms_private.contact_message_requests(ip_hash,created_at);
create index contact_requests_email_time on lms_private.contact_message_requests(email_hash,created_at);
create index contact_requests_time on lms_private.contact_message_requests(created_at);
revoke all on lms_private.contact_message_requests from public,anon,authenticated;
create or replace function public.claim_contact_message(request_id uuid,ip_hash text,email_hash text,payload_hash text)
returns text language plpgsql security definer set search_path='' as $$
declare original lms_private.contact_message_requests;
begin
 if request_id is null or ip_hash is null or email_hash is null or payload_hash is null or ip_hash !~ '^[a-f0-9]{64}$' or email_hash !~ '^[a-f0-9]{64}$' or payload_hash !~ '^[a-f0-9]{64}$' then raise exception 'Invalid contact request'; end if;
 perform pg_advisory_xact_lock(hashtextextended('contact-message-quota',0));
 delete from lms_private.contact_message_requests where created_at < now()-interval '2 days';
 select * into original from lms_private.contact_message_requests where id=request_id;
 if found then
  if original.created_at < now()-interval '23 hours' then return 'limited'; end if;
  if original.ip_hash<>ip_hash or original.email_hash<>email_hash or original.payload_hash<>payload_hash then return 'conflict'; end if;
  if original.sent then return 'sent'; end if;
  if original.tries>=3 then return 'limited'; end if;
  if original.last_attempt_at>now()-interval '15 seconds' then return 'wait'; end if;
  update lms_private.contact_message_requests set tries=tries+1,last_attempt_at=now() where id=request_id;
  return 'allowed';
 end if;
 if (select count(*) from lms_private.contact_message_requests r where r.ip_hash=claim_contact_message.ip_hash and r.created_at>now()-interval '1 hour')>=3
 or (select count(*) from lms_private.contact_message_requests r where r.email_hash=claim_contact_message.email_hash and r.created_at>now()-interval '1 hour')>=3
 or (select count(*) from lms_private.contact_message_requests r where r.created_at>now()-interval '24 hours')>=100 then return 'limited'; end if;
 insert into lms_private.contact_message_requests(id,ip_hash,email_hash,payload_hash) values(request_id,ip_hash,email_hash,payload_hash);
 return 'allowed';
end $$;
revoke all on function public.claim_contact_message(uuid,text,text,text) from public,anon,authenticated;
create or replace function public.finish_contact_message(request_id uuid,payload_hash text)
returns void language sql security definer set search_path='' as $$
 update lms_private.contact_message_requests set sent=true where id=request_id and payload_hash=finish_contact_message.payload_hash;
$$;
revoke all on function public.finish_contact_message(uuid,text) from public,anon,authenticated;
do $$ begin if exists(select 1 from pg_roles where rolname='service_role') then grant execute on function public.claim_contact_message(uuid,text,text,text),public.finish_contact_message(uuid,text) to service_role; end if; end $$;
commit;
