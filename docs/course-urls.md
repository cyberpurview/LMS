# Course URLs

Learner overview and lesson routes accept a course slug or its legacy UUID. New links use `learnerCourseUrl()`; authoring routes and database relationships continue to use UUIDs.

The database assigns slugs at creation and backfills older courses in `20261015120000_course_slugs.sql`. Duplicate titles receive a random eight-character suffix. Reserved route names and UUID-shaped titles are prefixed. The unique index and allocation lock protect concurrent creation. Renames and course upserts preserve the original slug; clients cannot choose or change it.

Legacy learner UUID routes use a cookie-authenticated, RLS-protected lookup and redirect to the slug, retaining `/learn` where applicable. Slug routes require one indexed lookup in the workspace loader; subsequent enrollment, quiz, curriculum and notes queries use the resolved UUID. Inaccessible and nonexistent slugs do not fall back to bulk course reads. Slugs do not grant enrollment or paid access.

Deploy the database migration before the application build that reads `courses.slug`. Existing identifiers, concurrency revisions, learner progress, purchases and certificates are not rewritten.
