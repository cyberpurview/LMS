export const COMPLETION_RULES = {
  lessons: 'Complete all lessons',
  lessons_pass: 'Complete all lessons and pass all published quizzes',
  lessons_submit: 'Complete all lessons and submit all published quizzes',
  quiz_pass: 'Pass all published quizzes; lessons are optional',
  quiz_submit: 'Submit all published quizzes; lessons are optional',
} as const
export const COMPLETION_LABELS = {
  lessons: 'All lessons',
  lessons_pass: 'Lessons + quiz passes',
  lessons_submit: 'Lessons + quiz submissions',
  quiz_pass: 'Quiz passes only',
  quiz_submit: 'Quiz submissions only',
} as const
export const CERTIFICATE_LABELS = {
  automatic: 'Automatic',
  approval: 'Approval required',
  none: 'No certificate',
} as const
export const CERTIFICATE_MODES = {
  automatic: 'Issue automatically when requirements are met',
  approval: 'Require creator or administrator approval',
  none: 'Do not issue certificates',
} as const
