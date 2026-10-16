import sharp from 'sharp'
import { THUMBNAIL_MAX_BYTES, THUMBNAIL_WIDTH, THUMBNAIL_HEIGHT } from '@/lib/lms/thumbnail'

export async function prepareThumbnail(bytes: Buffer) {
  if (!bytes.length || bytes.length > THUMBNAIL_MAX_BYTES)
    throw new Error('Choose an image up to 5 MB.')
  const image = sharp(bytes, { limitInputPixels: 20000000, animated: false })
  const metadata = await image.metadata()
  if (!['jpeg', 'png', 'webp'].includes(metadata.format || '') || (metadata.pages || 1) > 1)
    throw new Error('Choose a non-animated JPG, PNG, or WebP image.')
  const swap = metadata.orientation && metadata.orientation >= 5
  const width = (swap ? metadata.height : metadata.width) || 0
  const height = (swap ? metadata.width : metadata.height) || 0
  if (width * 9 !== height * 16 || !width || !height)
    throw new Error(
      `Thumbnail must be exactly 16:9. Your image is ${width} × ${height} px. Recommended: 1280 × 720 px.`,
    )
  if (width < 640) throw new Error('Use at least 640 × 360 px. Recommended: 1280 × 720 px.')
  return image
    .rotate()
    .resize({
      width: THUMBNAIL_WIDTH,
      height: THUMBNAIL_HEIGHT,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .webp({ quality: 85 })
    .toBuffer()
}
