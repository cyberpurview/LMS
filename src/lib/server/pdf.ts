import 'server-only'
import { PDFDocument } from 'pdf-lib'
import { RESOURCE_MAX_BYTES } from '@/lib/lms/resources'

export async function validateLessonPdf(bytes: Uint8Array) {
  if (!bytes.length || bytes.byteLength > RESOURCE_MAX_BYTES)
    throw new Error('Choose a PDF up to 20 MB.')
  if (Buffer.from(bytes.subarray(0, 5)).toString('ascii') !== '%PDF-')
    throw new Error('This file is not a PDF.')
  try {
    const document = await PDFDocument.load(bytes, {
      throwOnInvalidObject: true,
      updateMetadata: false,
    })
    const pages = document.getPageCount()
    if (!pages) throw new Error('Empty PDF')
    return pages
  } catch {
    throw new Error('This PDF could not be read. Upload a valid PDF without password protection.')
  }
}
