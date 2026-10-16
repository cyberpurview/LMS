import { Suspense } from 'react'
import { CertificateView } from '@/components/features/certificates'
import { createClient } from '@/lib/supabase/server'
import type { Certificate } from '@/types'
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { data } = await (
    await createClient()
  ).rpc('verify_certificate', { certificate_id: (await params).id })
  const certificate = data
    ? ({
        ...(data as unknown as Pick<
          Certificate,
          'id' | 'learnerName' | 'courseTitle' | 'issuedAt'
        >),
        learnerId: '',
        courseId: '',
        certificateUrl: '',
      } as Certificate)
    : null
  return (
    <Suspense fallback={<div className="p-8 text-slate-500">Loading workspace…</div>}>
      <CertificateView certificate={certificate} />
    </Suspense>
  )
}
