export function learnerCourseUrl(course: { id: string; slug?: string }, suffix = '') {
  return `/learner/courses/${course.slug || course.id}${suffix}`
}

export const COURSE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const COURSE_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
