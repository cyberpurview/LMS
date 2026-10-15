begin;
-- Operator-created role reservations activate only after Auth verifies email ownership.
create table lms_private.role_reservations (
  email text primary key check(email=lower(trim(email))), role public.lms_role not null,
  created_at timestamptz not null default now()
);
create function lms_private.assign_reserved_role() returns trigger language plpgsql security definer set search_path='' as $$
declare reserved public.lms_role;
begin
 if new.email_confirmed_at is not null then
  select role into reserved from lms_private.role_reservations where email=lower(new.email) for update;
  if reserved is not null then
   update public.profiles set role=reserved where id=new.id;
   delete from lms_private.role_reservations where email=lower(new.email);
  end if;
 end if;
 return new;
end $$;
create trigger lms_role_after_verification after update of email_confirmed_at on auth.users for each row execute function lms_private.assign_reserved_role();
create trigger zz_lms_role_for_verified_creation after insert on auth.users for each row execute function lms_private.assign_reserved_role();
revoke all on function lms_private.assign_reserved_role() from public,anon,authenticated;

create function public.workspace_summary() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare r public.lms_role:=lms_private.current_role(); uid uuid:=auth.uid(); result jsonb;
begin
 if r is null then raise exception 'Authentication required' using errcode='42501'; end if;
 with scoped_courses as (
  select c.id from public.courses c where r='admin' or (r='tutor' and c.tutor_id=uid) or (r='learner' and exists(select 1 from public.enrollments where course_id=c.id and learner_id=uid))
 ), scoped_enrollments as (
  select e.* from public.enrollments e where e.course_id in (select id from scoped_courses) and (r<>'learner' or e.learner_id=uid)
 ), scoped_attempts as (
  select a.* from public.quiz_attempts a join public.quizzes q on q.id=a.quiz_id where q.course_id in (select id from scoped_courses) and a.submitted_at is not null and (r<>'learner' or a.learner_id=uid)
 ), months as (select generate_series(date_trunc('month',now())-interval '9 months',date_trunc('month',now()),interval '1 month') as month)
 select jsonb_build_object(
 'users',case when r='admin' then (select count(*) from public.profiles) else (select count(distinct learner_id) from scoped_enrollments) end,
 'courses',(select count(*) from scoped_courses),
 'published',(select count(*) from public.courses where id in (select id from scoped_courses) and status='published'),
 'enrollments',(select count(*) from scoped_enrollments),
 'completed',(select count(*) from scoped_enrollments where completed_at is not null),
 'certificates',(select count(*) from public.certificates where course_id in (select id from scoped_courses) and (r<>'learner' or learner_id=uid)),
 'quizCount',(select count(*) from scoped_attempts),
 'avgScore',coalesce((select round(avg(score)) from scoped_attempts),0),
 'monthly',(select jsonb_agg(jsonb_build_object('month',to_char(month,'Mon YY'),'revenue',0,'enrollments',(select count(*) from scoped_enrollments where enrolled_at>=month and enrolled_at<month+interval '1 month')) order by month) from months)
 ) into result;
 return result;
end $$;
revoke all on function public.workspace_summary() from public,anon,authenticated;
grant execute on function public.workspace_summary() to authenticated;
commit;
