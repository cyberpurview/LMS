export const COURSE_BATCH_SIZE = 12
export interface CourseListing {
  slug?: string
  id: string
  title: string
  tutorName: string
  tutorAvatar: string
  thumbnail: string
  category: string
  level: string
  duration: number
  price: number
  status: string
  enrolledCount: number
  progress: number | null
  completed: boolean
}
export interface CoursePage {
  courses: CourseListing[]
  nextCursor: string | null
}
