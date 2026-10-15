// ─── User & Auth ────────────────────────────────────────────────────────────

export type Role = 'admin' | 'tutor' | 'learner'

export interface User {
  id: string
  name: string
  email: string
  role: Role
  avatar: string
  joinedAt: string
  isActive: boolean
}

// ─── Courses ─────────────────────────────────────────────────────────────────

export type CourseLevel = 'Beginner' | 'Intermediate' | 'Advanced'
export type CourseStatus = 'published' | 'draft' | 'archived'
export type CourseCategory = string

export interface Lesson {
  id: string
  title: string
  duration: number // minutes
  content?: string
  videoUrl?: string
  worksheet?: string
  type: 'video' | 'reading' | 'quiz'
  isCompleted?: boolean
}

export interface Module {
  id: string
  title: string
  lessons: Lesson[]
}

export interface Course {
  slug?: string
  completionRule?: 'lessons' | 'lessons_pass' | 'lessons_submit' | 'quiz_pass' | 'quiz_submit'
  certificateMode?: 'automatic' | 'approval' | 'none'
  requireAssessment?: boolean
  id: string
  title: string
  description: string
  thumbnail: string
  tutorId: string
  tutorName: string
  tutorAvatar: string
  category: CourseCategory
  level: CourseLevel
  status: CourseStatus
  price: number
  enrolledCount: number
  rating: number
  reviewCount: number
  duration: number // total hours
  modules: Module[]
  tags: string[]
  createdAt: string
  updatedAt: string
}

// ─── Enrollments ─────────────────────────────────────────────────────────────

export interface Enrollment {
  id: string
  learnerId: string
  courseId: string
  enrolledAt: string
  progress: number // 0–100
  completedAt?: string
  lastAccessedAt: string
  certificateIssued: boolean
  totalAssessments?: number
  passedAssessments?: number
  certificateEnabled?: boolean
}

// ─── Quizzes ─────────────────────────────────────────────────────────────────

export interface QuizOption {
  id: string
  text: string
}

export interface QuizQuestion {
  id: string
  text: string
  options: QuizOption[]
  correctOptionId: string
  explanation?: string
}

export interface Quiz {
  purpose?: 'practice' | 'assessment'
  maxAttempts?: number | null
  retryDelayMinutes?: number
  feedbackPolicy?: 'immediate' | 'after_pass_or_last'
  attemptsUsed?: number
  attemptLimit?: number | null
  attemptsRemaining?: number | null
  retryAvailableAt?: string | null
  price?: number
  hasAccess?: boolean
  creatorId?: string
  certificateRule?: 'none' | 'submit' | 'pass'
  certificateMode?: 'automatic' | 'approval' | 'none'
  thumbnail?: string // Empty uses the current course thumbnail.
  status?: 'draft' | 'published'
  version?: number
  editLocked?: boolean
  id: string
  courseId: string
  title: string
  questions: QuizQuestion[]
  questionCount?: number
  bestScore?: number | null
  passed?: boolean
  inProgress?: boolean
  passingScore: number // percentage
  timeLimit: number // minutes
}

export interface QuizAttempt {
  id: string
  quizId: string
  learnerId: string
  score: number
  passed: boolean
  attemptedAt: string
  timeTaken: number // seconds
}

// ─── Certificates ─────────────────────────────────────────────────────────────

export interface Certificate {
  quizId?: string
  id: string
  learnerId: string
  courseId: string
  courseTitle: string
  learnerName: string
  issuedAt: string
  certificateUrl: string
}

// ─── Analytics ───────────────────────────────────────────────────────────────

export interface RevenueData {
  month: string
  revenue: number
  enrollments: number
}

export interface CategoryData {
  category: string
  count: number
  fill: string
}

// ─── Notifications ───────────────────────────────────────────────────────────

export type NotificationType = 'info' | 'success' | 'warning' | 'error'

export interface Notification {
  eventKey?: string
  href?: string
  id: string
  userId: string
  title: string
  message: string
  type: NotificationType
  isRead: boolean
  createdAt: string
}

// ─── Dashboard Stats ─────────────────────────────────────────────────────────

export interface AdminStats {
  totalUsers: number
  totalCourses: number
  totalEnrollments: number
  totalRevenue: number
  activeUsers: number
  newUsersThisMonth: number
  completionRate: number
  avgRating: number
}

export interface TutorStats {
  totalCourses: number
  totalStudents: number
  totalRevenue: number
  avgRating: number
  publishedCourses: number
  draftCourses: number
  completionRate: number
  totalReviews: number
}

export interface LearnerStats {
  enrolledCourses: number
  completedCourses: number
  inProgressCourses: number
  totalCertificates: number
  totalHoursLearned: number
  currentStreak: number
  quizzesTaken: number
  avgQuizScore: number
}
