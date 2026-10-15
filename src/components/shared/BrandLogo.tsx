import Image from 'next/image'
import { BRAND_NAME, BRAND_LOGO, BRAND_ICON } from '@/lib/brand'
import { cn } from '@/lib/utils'

/** Preserve the supplied wordmark; the standalone shield is a scalable vector. */
export function BrandLogo({
  light = false,
  iconOnly = false,
  className = '',
}: {
  light?: boolean
  iconOnly?: boolean
  className?: string
}) {
  return (
    <Image
      data-brand-logo
      src={iconOnly ? BRAND_ICON : BRAND_LOGO}
      alt={BRAND_NAME}
      width={iconOnly ? 40 : 148}
      height={iconOnly ? 40 : 68}
      className={cn(
        'shrink-0',
        iconOnly ? 'h-8 w-8' : 'h-14 w-auto',
        light ? 'mix-blend-screen' : 'mix-blend-multiply',
        className,
      )}
      style={light ? { filter: 'grayscale(1) invert(1) brightness(3)' } : undefined}
      unoptimized
    />
  )
}
