import 'server-only'
import { storageAdmin } from './storage'
import { RESOURCE_BUCKET } from '@/lib/lms/resources'
export async function cleanupCourseResources() {
  const client = storageAdmin(5000)
  const claimed = await client
    .rpc('claim_course_resource_cleanup')
    .abortSignal(AbortSignal.timeout(3000))
  if (claimed.error) throw new Error('Unable to claim resource cleanup')
  const paths = claimed.data as string[]
  if (!paths.length) return 0
  const removed = await client.storage.from(RESOURCE_BUCKET).remove(paths)
  if (removed.error) throw new Error('Resource cleanup will retry')
  const finished = await client
    .rpc('finish_course_resource_cleanup', { paths })
    .abortSignal(AbortSignal.timeout(3000))
  if (finished.error) throw new Error('Resource cleanup acknowledgement will retry')
  return paths.length
}
