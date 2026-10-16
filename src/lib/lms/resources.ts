export const RESOURCE_BUCKET = 'lesson-resources'
export const RESOURCE_MAX_BYTES = 20 * 1024 * 1024
export const RESOURCE_MAX_FILES = 10
export interface LessonResource {
  id: string
  name: string
  bytes: number
  pages: number
  createdAt: string
}
