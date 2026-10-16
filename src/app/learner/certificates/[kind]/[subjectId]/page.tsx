import { notFound, redirect } from 'next/navigation'
import { requireRole } from '@/lib/server/auth'
import { COURSE_UUID } from '@/lib/lms/course-url'

export default async function CertificateForSubject({
  params,
}: {
  params: Promise<{ kind: string; subjectId: string }>
}) {
  const { kind, subjectId } = await params
  if (!['course', 'quiz'].includes(kind) || !COURSE_UUID.test(subjectId)) notFound()
  const { client, user } = await requireRole('learner')
  const { data, error } = await client
    .from('certificates')
    .select('id')
    .eq('learner_id', user.id)
    .eq(kind === 'course' ? 'course_id' : 'quiz_id', subjectId)
    .maybeSingle()
  if (error) throw new Error('Unable to open your certificate. Please try again.')
  if (!data) notFound()
  redirect(`/certificates/${data.id}`)
}
