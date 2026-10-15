import { BRAND_NAME } from '@/lib/brand'
import type {
  Course,
  User,
  Enrollment,
  Certificate,
  Quiz,
  QuizAttempt,
  Notification,
} from '@/types'

export interface WorkspaceSummary {
  users: number
  courses: number
  published: number
  enrollments: number
  completed: number
  certificates: number
  quizCount: number
  avgScore: number
  monthly: { month: string; revenue: number; enrollments: number }[]
}
export interface LmsState {
  platformName: string
  summary: WorkspaceSummary
  courses: Course[]
  users: User[]
  enrollments: Enrollment[]
  certificates: Certificate[]
  quizzes: Quiz[]
  attempts: QuizAttempt[]
  notifications: Notification[]
  unreadNotifications: number
  completedLessons: Record<string, string[]>
  notes: Record<string, string>
  preferences: Record<string, Record<string, string | boolean>>
  categories: string[]
}
export const emptyState: LmsState = {
  platformName: BRAND_NAME,
  summary: {
    users: 0,
    courses: 0,
    published: 0,
    enrollments: 0,
    completed: 0,
    certificates: 0,
    quizCount: 0,
    avgScore: 0,
    monthly: [],
  },
  courses: [],
  users: [],
  enrollments: [],
  certificates: [],
  quizzes: [],
  attempts: [],
  notifications: [],
  unreadNotifications: 0,
  completedLessons: {},
  notes: {},
  preferences: {},
  categories: [],
}
