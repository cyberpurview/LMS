'use client'
import React, { useState } from 'react'
import Link from 'next/link'
import { Download, Printer } from 'lucide-react'
import { useLms, downloadText } from '@/lib/lms/store'
import {
  FeatureShell,
  Heading,
  Panel,
  SearchField,
  Empty,
  Back,
  primaryClass,
  secondaryClass,
} from './common'
import { formatDate } from '@/lib/utils'
import type { Role, Certificate } from '@/types'
import { CertificateDocument } from '@/components/shared/CertificateDocument'
import { certificateQrSvg, certificateVerificationUrl } from '@/lib/lms/certificate-qr'
function certificateDownload(c: Certificate) {
  const escape = (s: string) =>
    s.replace(
      /[&<>"']/g,
      (x) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[x]!,
    )
  const verificationUrl = certificateVerificationUrl(c.id, window.location.origin)
  const qr = certificateQrSvg(c.id, window.location.origin)
  downloadText(
    `CyberPurview-certificate-${c.id}.html`,
    `<!doctype html><html><head><meta charset="utf-8"><title>CyberPurview Certificate</title><style>body{font-family:Georgia,serif;color:#0e273f;padding:60px;text-align:center}article{border:double 8px #bfd8ef;padding:60px}h1{font-size:40px}h2{font-size:32px}p{line-height:1.8}a{display:inline-flex;align-items:center;flex-direction:column;color:#015bb0;font:12px system-ui,sans-serif}svg{display:block}.credential-footer{display:flex;align-items:flex-end;justify-content:space-between;gap:32px;margin-top:48px;text-align:left}.date-label{display:block;margin-top:6px;color:#64748b;font:12px system-ui,sans-serif}</style></head><body><article><p>CYBERPURVIEW</p><h1>Certificate of Completion</h1><p>Proudly presented to</p><h2>${escape(c.learnerName)}</h2><p>for successfully completing</p><h2>${escape(c.courseTitle)}</h2><div class="credential-footer"><div><strong>${escape(formatDate(c.issuedAt))}</strong><span class="date-label">Date of issue</span></div><a href="${escape(verificationUrl)}" aria-label="Verify this certificate">${qr}</a></div></article></body></html>`,
    'text/html',
  )
}
export function Certificates({ role }: { role: Role }) {
  const { state, user: currentUser } = useLms()
  const [search, setSearch] = useState('')
  const certs = state.certificates.filter(
    (c) =>
      (role !== 'learner' || c.learnerId === currentUser.id) &&
      `${c.courseTitle} ${c.learnerName}`.toLowerCase().includes(search.toLowerCase()),
  )
  return (
    <FeatureShell role={role} title="Certificates">
      <Heading title="Certificates" />
      <div className="mb-6">
        <SearchField value={search} onChange={setSearch} placeholder="Search certificates" />
      </div>
      {certs.length ? (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-5">
          {certs.map((c) => (
            <Panel key={c.id}>
              <Link
                href={`/certificates/${c.id}`}
                aria-label={`Preview certificate for ${c.courseTitle}`}
                className="mb-5 block overflow-hidden rounded-lg border border-slate-200 bg-slate-50 p-2 [container-type:inline-size] transition-shadow hover:shadow-md focus-visible:outline-brand-600"
              >
                <CertificateDocument certificate={c} miniature />
              </Link>
              <p className="text-xs uppercase tracking-wider text-brand-600 font-semibold mb-2">
                Certificate of completion
              </p>
              <h3 className="font-semibold text-navy mb-3">{c.courseTitle}</h3>
              <p className="text-sm text-slate-500">{c.learnerName}</p>
              <p className="text-xs text-slate-400 mt-1 mb-5">Issued {formatDate(c.issuedAt)}</p>
              <div className="flex gap-2">
                <Link className={`${secondaryClass} flex-1`} href={`/certificates/${c.id}`}>
                  View certificate
                </Link>
                <button
                  className={secondaryClass}
                  aria-label="Download certificate"
                  onClick={() => certificateDownload(c)}
                >
                  <Download className="w-4 h-4" />
                </button>
              </div>
            </Panel>
          ))}
        </div>
      ) : (
        <Empty
          title="Your next achievement awaits"
          description="Meet your course’s completion requirements to earn a certificate when certificates are enabled."
          href="/learner/courses"
          action="Continue learning"
        />
      )}
    </FeatureShell>
  )
}
export function CertificateView({ certificate: c }: { certificate: Certificate | null }) {
  return (
    <div className="min-h-screen bg-slate-50 p-5 sm:p-12">
      <div className="max-w-4xl mx-auto">
        <div className="print:hidden">
          <Back href="/learner/certificates" label="Back to certificate library" />
        </div>
        {c ? (
          <>
            <CertificateDocument certificate={c} />
            <div className="flex flex-wrap justify-center gap-3 mt-6 print:hidden">
              <button className={primaryClass} onClick={() => certificateDownload(c)}>
                <Download className="w-4 h-4" />
                Download HTML
              </button>
              <button className={secondaryClass} onClick={() => window.print()}>
                <Printer className="w-4 h-4" />
                Print / Save PDF
              </button>
            </div>
          </>
        ) : (
          <Empty
            title="Certificate not found"
            description="Check the certificate link and try again."
          />
        )}
      </div>
    </div>
  )
}
