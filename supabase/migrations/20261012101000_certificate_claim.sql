begin;
create function public.claim_course_certificate(course_id uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare certificate_id uuid;
begin
 if lms_private.current_role() is distinct from 'learner' or not coalesce(lms_private.enrolled(course_id),false) then raise exception 'Enrollment required' using errcode='42501'; end if;
 if not (select certificate_enabled from public.platform_settings where singleton) then raise exception 'Certificates are currently disabled'; end if;
 perform lms_private.course_request_limit('certificate-claim',60);
 perform 1 from public.courses where id=course_id for share;
 perform 1 from public.enrollments where enrollments.course_id=claim_course_certificate.course_id and learner_id=auth.uid() for update;
 perform lms_private.issue_certificate(course_id,auth.uid());
 select id into certificate_id from public.certificates where certificates.course_id=claim_course_certificate.course_id and learner_id=auth.uid();
 if certificate_id is null then raise exception 'Complete all course requirements before claiming a certificate'; end if;
 return certificate_id;
end $$;
revoke all on function public.claim_course_certificate(uuid) from public,anon;
grant execute on function public.claim_course_certificate(uuid) to authenticated;
commit;
