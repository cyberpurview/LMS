'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import Image from 'next/image'
import { certificateQrSvg, certificateVerificationUrl } from '@/lib/lms/certificate-qr'

export function CertificateVerification({
  id,
  miniature = false,
}: {
  id: string
  miniature?: boolean
}) {
  const [origin, setOrigin] = useState('')
  const element = useRef<HTMLElement | null>(null)
  useEffect(() => {
    if (!miniature || typeof IntersectionObserver === 'undefined') {
      setOrigin(window.location.origin)
      return
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setOrigin(window.location.origin)
          observer.disconnect()
        }
      },
      { rootMargin: '160px' },
    )
    if (element.current) observer.observe(element.current)
    return () => observer.disconnect()
  }, [miniature])
  const svg = useMemo(() => (origin ? certificateQrSvg(id, origin) : ''), [id, origin])
  const sizeClass = miniature ? 'h-[9cqw] w-[9cqw]' : 'h-[120px] w-[120px]'
  const Wrapper = miniature ? 'span' : 'a'
  const linkProps = miniature
    ? {}
    : {
        href: origin ? certificateVerificationUrl(id, origin) : `/certificates/${id}`,
        'aria-label': 'Verify this certificate',
        title: 'Verify this certificate',
      }
  return (
    <Wrapper
      ref={(node) => {
        element.current = node
      }}
      {...linkProps}
      className="inline-flex items-center rounded focus-visible:outline-brand-600"
    >
      {svg ? (
        <Image
          src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`}
          alt={miniature ? '' : 'QR code to verify this certificate'}
          width={120}
          height={120}
          unoptimized
          className={sizeClass}
        />
      ) : (
        <span aria-hidden="true" className={`${sizeClass} block bg-slate-50`} />
      )}
    </Wrapper>
  )
}
