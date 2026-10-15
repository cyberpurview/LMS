begin;
alter table public.quizzes add column price numeric(12,2) not null default 0 check(price>=0 and price<=10000000);
alter table public.quizzes add constraint linked_quiz_no_separate_price check(course_id is null or price=0);

-- Share one payment ledger and provider payment uniqueness across both products.
alter table lms_private.course_orders rename to purchase_orders;
alter table lms_private.purchase_orders alter column course_id drop not null;
alter table lms_private.purchase_orders add column quiz_id uuid references public.quizzes(id);
alter table lms_private.purchase_orders add constraint purchase_single_subject check((course_id is null)<>(quiz_id is null));
create index purchase_orders_learner_quiz on lms_private.purchase_orders(learner_id,quiz_id,created_at desc) where quiz_id is not null;
create table lms_private.quiz_access (
 id uuid primary key default gen_random_uuid(),
 learner_id uuid not null references public.profiles(id),
 quiz_id uuid not null references public.quizzes(id),
 granted_at timestamptz not null default clock_timestamp(),
 unique(learner_id,quiz_id)
);
alter table lms_private.quiz_access enable row level security;
revoke all on lms_private.quiz_access from public,anon,authenticated;

create function lms_private.can_take_quiz(qid uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select lms_private.manages_quiz(qid) or exists(select 1 from public.quizzes q where q.id=qid and q.status='published' and lms_private.current_role()='learner' and
 (case when q.course_id is not null then lms_private.enrolled(q.course_id) else q.price=0
 or exists(select 1 from lms_private.quiz_access a where a.quiz_id=qid and a.learner_id=auth.uid())
 or exists(select 1 from public.quiz_attempts a where a.quiz_id=qid and a.learner_id=auth.uid()) end));
$$;
revoke all on function lms_private.can_take_quiz(uuid) from public,anon,authenticated;
grant execute on function lms_private.can_take_quiz(uuid) to authenticated;
drop policy questions_read on public.quiz_questions;
create policy questions_read on public.quiz_questions for select to authenticated using(lms_private.can_take_quiz(quiz_id));

do $migration$
declare d text; r text;
begin
 for d in select pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('create_course_order','bind_course_checkout','fulfill_course_order') loop
  execute replace(d,'lms_private.course_orders','lms_private.purchase_orders');
 end loop;
 d:=pg_get_functiondef('public.lms_command(text,jsonb)'::regprocedure);
 r:=replace(d,'when ''saveQuiz'' then',$patch$when 'saveQuiz' then
 if coalesce(payload->>'price','0')::numeric not between 0 and 10000000 or coalesce(payload->>'price','0')::numeric<>round(coalesce(payload->>'price','0')::numeric,2) then raise exception 'Use a valid price with up to two decimal places'; end if;
 if nullif(payload->>'courseId','') is not null and coalesce(payload->>'price','0')::numeric<>0 then raise exception 'Course-linked quizzes use course access and cannot have a separate price'; end if;
 $patch$);
 r:=replace(r,'if exists(select 1 from public.quiz_attempts where quiz_id=target) then', 'if exists(select 1 from public.quiz_attempts where quiz_id=target) or exists(select 1 from lms_private.quiz_access where quiz_id=target) then');
 r:=replace(r,'a learner has started it. Create a new draft copy', 'a learner has started or purchased it. Create a new draft copy');
 r:=replace(r,'update public.quizzes set certificate_rule=', 'update public.quizzes set price=coalesce(payload->>''price'',''0'')::numeric where id=target; update public.quizzes set certificate_rule=');
 if r=d or strpos(r,'set price=coalesce(payload')=0 then raise exception 'Quiz pricing patch failed'; end if;
 execute r;
 for d in select pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('start_quiz','submit_quiz') loop
  r:=replace(d,'if q.course_id is not null and not coalesce(lms_private.enrolled(q.course_id),false)', $patch$if q.course_id is null and not lms_private.can_take_quiz(q.id) then raise exception 'Verified payment required for this assessment' using errcode='42501'; end if;
 if q.course_id is not null and not coalesce(lms_private.enrolled(q.course_id),false)$patch$);
  if r=d then raise exception 'Quiz access patch failed'; end if; execute r;
 end loop;
 d:=pg_get_functiondef('public.quiz_authoring_info(uuid[])'::regprocedure);
 r:=replace(d,'exists(select 1 from public.quiz_attempts a where a.quiz_id=q.id)', '(exists(select 1 from public.quiz_attempts a where a.quiz_id=q.id) or exists(select 1 from lms_private.quiz_access a where a.quiz_id=q.id))');
 if r=d then raise exception 'Quiz authoring lock patch failed'; end if; execute r;
end $migration$;

create or replace function public.quiz_summaries(quiz_ids uuid[]) returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',q.id,'questionCount',(select count(*) from public.quiz_questions x where x.quiz_id=q.id),
 'hasAccess',lms_private.can_take_quiz(q.id),
 'bestScore',(select max(a.score) from public.quiz_attempts a where a.quiz_id=q.id and a.learner_id=auth.uid() and a.version=q.version and a.submitted_at is not null),
 'passed',exists(select 1 from public.quiz_attempts a where a.quiz_id=q.id and a.learner_id=auth.uid() and a.version=q.version and a.passed),
 'inProgress',exists(select 1 from public.quiz_attempts a where a.quiz_id=q.id and a.learner_id=auth.uid() and a.submitted_at is null))),'[]'::jsonb)
 from public.quizzes q where cardinality(quiz_ids)<=200 and q.id=any(quiz_ids) and
 (lms_private.manages_quiz(q.id) or (q.status='published' and lms_private.current_role()='learner' and (q.course_id is null or lms_private.enrolled(q.course_id))));
$$;

create function public.create_quiz_order(quiz_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare q public.quizzes; o lms_private.purchase_orders; uid uuid:=auth.uid();
begin
 if lms_private.current_role() is distinct from 'learner' then raise exception 'Learner access required' using errcode='42501'; end if;
 perform lms_private.course_request_limit('course-checkout',20);
 if not (select enrollment_open from public.platform_settings where singleton) then raise exception 'New purchases are currently closed'; end if;
 select * into q from public.quizzes where id=create_quiz_order.quiz_id and status='published' for share;
 if q.id is null then raise exception 'Assessment unavailable'; end if;
 if q.course_id is not null then raise exception 'Use course access for this assessment'; end if;
 if q.price<=0 then raise exception 'This assessment is free'; end if;
 if lms_private.can_take_quiz(q.id) then raise exception 'Assessment already unlocked'; end if;
 perform pg_advisory_xact_lock(hashtextextended('quiz-purchase:'||uid::text||':'||q.id::text,0));
 select * into o from lms_private.purchase_orders p where p.learner_id=uid and p.quiz_id=q.id and p.status='pending' and p.expires_at>clock_timestamp() and p.amount_minor=(q.price*100)::bigint order by p.created_at desc limit 1;
 if o.id is null then insert into lms_private.purchase_orders(learner_id,quiz_id,amount_minor) values(uid,q.id,(q.price*100)::bigint) returning * into o; end if;
 return jsonb_build_object('id',o.id,'amountMinor',o.amount_minor,'currency',o.currency,'expiresAt',o.expires_at);
end $$;

-- One atomic fulfillment path for courses and standalone assessments.
create function public.bind_purchase_checkout(order_id uuid,checkout_id text) returns void
language sql security definer set search_path='' as $$
 select public.bind_course_checkout(order_id,checkout_id);
$$;
create function public.fulfill_purchase_order(order_id uuid,checkout_id text,payment_id text,amount_minor bigint,currency text,paid_at timestamptz) returns uuid
language plpgsql security definer set search_path='' as $$
declare o lms_private.purchase_orders; access_id uuid;
begin
 perform 1 from public.courses c where c.id=(select p.course_id from lms_private.purchase_orders p where p.id=order_id) for share;
 perform 1 from public.quizzes q where q.id=(select p.quiz_id from lms_private.purchase_orders p where p.id=order_id) for share;
 select * into o from lms_private.purchase_orders where id=order_id for update;
 if o.id is null or o.checkout_id is null or o.checkout_id is distinct from fulfill_purchase_order.checkout_id
 or o.amount_minor is distinct from fulfill_purchase_order.amount_minor or o.currency is distinct from fulfill_purchase_order.currency
 or payment_id is null or char_length(payment_id) not between 1 and 255 then raise exception 'Payment does not match the order'; end if;
 if o.status='paid' and o.payment_id is distinct from fulfill_purchase_order.payment_id then raise exception 'Order already paid with another payment'; end if;
 if o.status<>'paid' then
  if paid_at is null or paid_at<o.created_at-interval '1 second' or paid_at>o.expires_at or paid_at>clock_timestamp()+interval '1 minute' then raise exception 'Payment outside checkout validity'; end if;
  update lms_private.purchase_orders set status='paid',payment_id=fulfill_purchase_order.payment_id,paid_at=fulfill_purchase_order.paid_at where id=o.id;
  if o.course_id is not null then
   insert into public.enrollments(learner_id,course_id) values(o.learner_id,o.course_id) on conflict(learner_id,course_id) do nothing;
  else
   insert into lms_private.quiz_access(learner_id,quiz_id) values(o.learner_id,o.quiz_id) on conflict(learner_id,quiz_id) do nothing;
  end if;
  insert into lms_private.audit_log(actor_id,action,entity_id) values(o.learner_id,'paidPurchaseAccess',o.id);
 end if;
 if o.course_id is not null then select e.id into access_id from public.enrollments e where e.learner_id=o.learner_id and e.course_id=o.course_id;
 else select a.id into access_id from lms_private.quiz_access a where a.learner_id=o.learner_id and a.quiz_id=o.quiz_id; end if;
 return access_id;
end $$;
create or replace function public.fulfill_course_order(order_id uuid,checkout_id text,payment_id text,amount_minor bigint,currency text,paid_at timestamptz) returns uuid
language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from lms_private.purchase_orders p where p.id=order_id and p.course_id is not null) then raise exception 'Course order unavailable'; end if;
 return public.fulfill_purchase_order(order_id,checkout_id,payment_id,amount_minor,currency,paid_at);
end $$;
revoke all on function public.create_quiz_order(uuid),public.bind_purchase_checkout(uuid,text),public.fulfill_purchase_order(uuid,text,text,bigint,text,timestamptz) from public,anon,authenticated;
grant execute on function public.create_quiz_order(uuid) to authenticated;
do $$ begin if exists(select 1 from pg_roles where rolname='service_role') then
 grant execute on function public.bind_purchase_checkout(uuid,text),public.fulfill_purchase_order(uuid,text,text,bigint,text,timestamptz) to service_role;
end if; end $$;
commit;
