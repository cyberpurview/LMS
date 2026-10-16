import { BrandLogo } from './BrandLogo'
import { CertificateVerification } from './CertificateVerification'
import { formatDate } from '@/lib/utils'
import type { Certificate } from '@/types'

/** The library and full certificate view share content, branding and layout. */
export function CertificateDocument({
  certificate: c,
  miniature = false,
}: {
  certificate: Certificate
  miniature?: boolean
}) {
  const Title = miniature ? 'p' : 'h1'
  const Recipient = miniature ? 'p' : 'h2'
  const CourseTitle = miniature ? 'p' : 'h3'
  return (
    <article
      data-theme-preserve
      aria-hidden={miniature || undefined}
      className={
        miniature
          ? 'flex aspect-[1.414/1] w-full bg-white p-[3cqw] text-center text-navy shadow-sm'
          : 'rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm sm:p-12'
      }
    >
      <div
        className={
          miniature
            ? 'flex min-w-0 flex-1 flex-col items-center border-[3px] border-double border-brand-200 px-[4cqw] py-[2cqw]'
            : 'flex flex-col items-center border-4 border-double border-brand-200 p-6 sm:p-10'
        }
      >
        <div className={miniature ? 'mb-[2cqw] flex justify-center' : 'mb-6 flex justify-center'}>
          <BrandLogo className={miniature ? '!h-[7cqw]' : 'h-16'} />
        </div>
        <Title
          className={
            miniature
              ? 'mb-[2cqw] font-serif text-[4cqw] leading-tight text-navy'
              : 'mb-8 mt-2 font-serif text-3xl text-navy sm:text-4xl'
          }
        >
          Certificate of Completion
        </Title>
        <p className={miniature ? 'text-[2cqw] text-slate-500' : 'text-sm text-slate-500'}>
          Proudly presented to
        </p>
        <Recipient
          className={
            miniature
              ? 'my-[1.5cqw] w-full truncate font-serif text-[4.5cqw] leading-tight'
              : 'my-5 max-w-full break-words font-serif text-4xl sm:text-5xl'
          }
        >
          {c.learnerName}
        </Recipient>
        <p
          className={
            miniature ? 'mb-[1cqw] text-[2cqw] text-slate-500' : 'mb-4 text-sm text-slate-500'
          }
        >
          for successfully completing
        </p>
        <CourseTitle
          className={
            miniature
              ? 'line-clamp-2 w-full text-[3cqw] font-semibold leading-tight text-slate-800'
              : 'max-w-prose text-xl font-semibold text-slate-800'
          }
        >
          {c.courseTitle}
        </CourseTitle>
        <div
          className={
            miniature
              ? 'mt-auto flex w-full items-end justify-between gap-[4cqw] pt-[2cqw] text-[1.8cqw]'
              : 'flex w-full items-end justify-between gap-6 pt-10 text-sm'
          }
        >
          <div className="text-left">
            <p className="font-semibold">{formatDate(c.issuedAt)}</p>
            <p className={miniature ? 'mt-[0.5cqw] text-slate-500' : 'mt-1 text-xs text-slate-400'}>
              Date of issue
            </p>
          </div>
          <div className="shrink-0">
            <CertificateVerification id={c.id} miniature={miniature} />
          </div>
        </div>
      </div>
    </article>
  )
}
