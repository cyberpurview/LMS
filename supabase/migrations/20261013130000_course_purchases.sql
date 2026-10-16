begin;
-- An order is a quote, never an access grant. Amounts use integer USD cents.
create table lms_private.course_orders (
 id uuid primary key default gen_random_uuid(),
 learner_id uuid not null references public.profiles(id),
 course_id uuid not null references public.courses(id),
 amount_minor bigint not null check(amount_minor>0 and amount_minor<=1000000000),
 currency text not null default 'usd' check(currency='usd'),
 provider text not null default 'stripe' check(provider='stripe'),
 status text not null default 'pending' check(status in ('pending','paid')),
 checkout_id text unique check(char_length(checkout_id) between 1 and 255),
 payment_id text unique check(char_length(payment_id) between 1 and 255),
 created_at timestamptz not null default clock_timestamp(),
 expires_at timestamptz not null default clock_timestamp()+interval '30 minutes',
 paid_at timestamptz,
 check(expires_at>created_at),
 check((status='paid' and paid_at is not null and payment_id is not null and checkout_id is not null) or (status='pending' and paid_at is null and payment_id is null))
);
create index course_orders_learner_course on lms_private.course_orders(learner_id,course_id,created_at desc);
alter table lms_private.course_orders enable row level security;
revoke all on lms_private.course_orders from public,anon,authenticated;

create function public.create_course_order(course_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c public.courses; o lms_private.course_orders; uid uuid:=auth.uid();
begin
 if lms_private.current_role() is distinct from 'learner' then raise exception 'Learner access required' using errcode='42501'; end if;
 perform lms_private.course_request_limit('course-checkout',20);
 if not (select enrollment_open from public.platform_settings where singleton) then raise exception 'New enrollments are currently closed'; end if;
 select * into c from public.courses where id=create_course_order.course_id and status='published' for share;
 if c.id is null then raise exception 'Course unavailable'; end if;
 if c.price<=0 then raise exception 'Use free enrollment for this course'; end if;
 if exists(select 1 from public.enrollments e where e.course_id=c.id and e.learner_id=uid) then raise exception 'Already enrolled'; end if;
 perform pg_advisory_xact_lock(hashtextextended('purchase:'||uid::text||':'||c.id::text,0));
 select * into o from lms_private.course_orders p where p.learner_id=uid and p.course_id=c.id and p.status='pending' and p.expires_at>clock_timestamp() and p.amount_minor=(c.price*100)::bigint order by p.created_at desc limit 1;
 if o.id is null then
  insert into lms_private.course_orders(learner_id,course_id,amount_minor) values(uid,c.id,(c.price*100)::bigint) returning * into o;
 end if;
 return jsonb_build_object('id',o.id,'amountMinor',o.amount_minor,'currency',o.currency,'expiresAt',o.expires_at);
end $$;

-- Future checkout adapter calls this with its server-created Stripe session.
create function public.bind_course_checkout(order_id uuid,checkout_id text) returns void
language plpgsql security definer set search_path='' as $$
declare o lms_private.course_orders;
begin
 if checkout_id is null or char_length(checkout_id) not between 1 and 255 then raise exception 'Invalid checkout'; end if;
 select * into o from lms_private.course_orders where id=order_id for update;
 if o.id is null or o.status<>'pending' then raise exception 'Order unavailable'; end if;
 if o.checkout_id=bind_course_checkout.checkout_id then return; end if;
 if o.checkout_id is not null or o.expires_at<=clock_timestamp() then raise exception 'Checkout already bound or expired'; end if;
 update lms_private.course_orders set checkout_id=bind_course_checkout.checkout_id where id=o.id;
end $$;

-- SERVER ONLY: caller must verify provider signature and retrieve paid session/payment
-- from Stripe first. A success redirect or client-supplied paid flag is never proof.
create function public.fulfill_course_order(order_id uuid,checkout_id text,payment_id text,amount_minor bigint,currency text,paid_at timestamptz) returns uuid
language plpgsql security definer set search_path='' as $$
declare o lms_private.course_orders; eid uuid;
begin
 -- Consistent course -> order locking with course saves and order creation.
 perform 1 from public.courses c where c.id=(select p.course_id from lms_private.course_orders p where p.id=order_id) for share;
 select * into o from lms_private.course_orders where id=order_id for update;
 if o.id is null or o.checkout_id is null or o.checkout_id is distinct from fulfill_course_order.checkout_id
  or o.amount_minor is distinct from fulfill_course_order.amount_minor or o.currency is distinct from fulfill_course_order.currency
  or payment_id is null or char_length(payment_id) not between 1 and 255
 then raise exception 'Payment does not match the order'; end if;
 if o.status='paid' then
  if o.payment_id is distinct from fulfill_course_order.payment_id then raise exception 'Order already paid with another payment'; end if;
  select e.id into eid from public.enrollments e where e.learner_id=o.learner_id and e.course_id=o.course_id;
  return eid;
 end if;
 -- Providers commonly report timestamps at whole-second precision.
 if paid_at is null or paid_at<o.created_at-interval '1 second' or paid_at>o.expires_at or paid_at>clock_timestamp()+interval '1 minute' then raise exception 'Payment outside checkout validity'; end if;
 update lms_private.course_orders set status='paid',payment_id=fulfill_course_order.payment_id,paid_at=fulfill_course_order.paid_at where id=o.id;
 insert into public.enrollments(learner_id,course_id) values(o.learner_id,o.course_id)
 on conflict(learner_id,course_id) do update set last_accessed_at=public.enrollments.last_accessed_at returning id into eid;
 insert into lms_private.audit_log(actor_id,action,entity_id) values(o.learner_id,'paidCourseEnrollment',o.id);
 return eid;
end $$;
revoke all on function public.create_course_order(uuid),public.bind_course_checkout(uuid,text),public.fulfill_course_order(uuid,text,text,bigint,text,timestamptz) from public,anon,authenticated;
grant execute on function public.create_course_order(uuid) to authenticated;
do $$ begin if exists(select 1 from pg_roles where rolname='service_role') then
 grant execute on function public.bind_course_checkout(uuid,text),public.fulfill_course_order(uuid,text,text,bigint,text,timestamptz) to service_role;
end if; end $$;
commit;
