import QRCode from 'qrcode'
import { BRAND_NAVY } from '@/lib/brand'

export function certificateVerificationUrl(id: string, origin: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))
    throw new Error('Invalid certificate identifier.')
  const base = new URL(origin)
  if (!['https:', 'http:'].includes(base.protocol) || base.username || base.password)
    throw new Error('Invalid certificate origin.')
  return new URL(`/certificates/${id}`, base.origin).href
}

/** Vector modules with a four-module quiet zone; no external QR service or certificate lookup. */
export function certificateQrSvg(id: string, origin: string) {
  const url = certificateVerificationUrl(id, origin)
  const { modules } = QRCode.create(url, { errorCorrectionLevel: 'M' })
  const margin = 4
  const size = modules.size + margin * 2
  let path = ''
  for (let row = 0; row < modules.size; row++) {
    for (let column = 0; column < modules.size;) {
      if (!modules.get(row, column)) {
        column++
        continue
      }
      const start = column
      while (column < modules.size && modules.get(row, column)) column++
      const width = column - start
      path += `M${start + margin} ${row + margin}h${width}v1h-${width}z`
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="120" height="120" shape-rendering="crispEdges"><rect width="${size}" height="${size}" fill="#fff"/><path d="${path}" fill="${BRAND_NAVY}"/></svg>`
}
