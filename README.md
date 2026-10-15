# CyberPurview LMS

Next.js 15 App Router and React 19 application with Supabase Auth and PostgreSQL. Learner, tutor, and administrator workspaces use persisted account data. Marketing pages show published courses; a new database displays intentional empty states.

## Development

Use Node.js 22 or newer (validated with Node.js 24). Install dependencies, copy `.env.example` to `.env.local`, configure the public Supabase URL and publishable key, then run `npm run dev`.

Optional `SUPABASE_SECRET_KEY` enables administrator invitations and is used exclusively on the server. `.env.local` is ignored. Never give server secrets a `NEXT_PUBLIC_` prefix. Personal management tokens are operator credentials, not application configuration.

## Migrations

Migrations in `supabase/migrations` are applied to the configured project with matching migration history. Only category reference data is seeded. No mock users, courses, results, or certificates are inserted.

```sh
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase migration list --linked
npx supabase db push --dry-run
npx supabase db push
npx supabase gen types typescript --linked > src/types/database.types.ts
```

The CLI is installed as a development dependency, authenticated, and linked on this computer. `npm run db:status`, `npm run db:check`, and `npm run db:migrate` inspect history, preview changes, and apply new migrations. Create new migrations for changes; never edit an applied migration. `scripts/supabase-session.mjs` accepts an operator token over non-echoed stdin and holds it only in memory. Pass a CLI executable or JavaScript entry point as its argument. It supports CLI commands and the official Management API migration endpoint for tracked migrations when direct PostgreSQL connectivity is unavailable.

Local Auth callbacks allow `http://localhost:3000/**`, and email verification remains enabled. Configure production site/callback URLs and SMTP before deployment.

The hosted free email provider does not allow custom email templates. Signup, resend,
and recovery requests use a stateless email client without a browser-bound PKCE verifier.
The standard Supabase email verifies the address and redirects to `/auth/complete`.
That page immediately removes the session fragment, validates it through Supabase,
and stores the session in SSR cookies before redirecting to the workspace or password
reset. It works when the email opens in a different browser. Workspace sign-in and
sessions still use `@supabase/ssr`; `/auth/callback` supports existing PKCE links.
Expired or already-used links offer sign-in, resend, and password-reset actions.

Email session-fragment and legacy invitation pages clear URL credentials immediately, verify the account and show its email before the user explicitly continues. A stateless refresh validates that both credentials belong to that account before SSR cookies are persisted. The browser client disables automatic session detection from URLs; Google continues to use PKCE through the server callback. Login redirects go through the role-aware destination validator. Password changes support Supabase's reauthentication code and globally sign out sessions after success. Hosted secure-password-change policy is enabled separately through the management API; this does not change anyone's password. Private LMS policies additionally require a matching live `auth.sessions` row, blocking revoked sessions even while their JWT is unexpired. Auth pages use no-store/no-referrer and the app denies framing. CAPTCHA and administrator MFA enrollment/enforcement still require a separate setup; no CAPTCHA secret is currently configured.

Optional token-hash email templates are versioned in `supabase/templates/` and configured
for local development in `supabase/config.toml`. They can be installed on the hosted
project after configuring custom SMTP or a plan that allows template modification.
They direct links to `/auth/confirm`; an explicit button submits to `/api/auth/confirm`,
so opening an email preview does not consume the token. These templates are **not active
on the hosted project**. Keep the production Site URL and redirects configured for
the deployed domain; localhost links only work on the computer running this app.

## Administrator onboarding

An email verification gated reservation exists for the requested first admin. Register that email at `/login`, confirm the email, and sign in. The database assigns the reserved role after verification. All other public signups become learners; signup metadata cannot assign roles. Only administrators can add tutors or learners. Add user creates an Auth account, saves the selected role through the administrator-authorized database command, and returns a single-use setup link to copy and share privately. It does not send an email or depend on SMTP. The recipient confirms the link and chooses a password. Existing accounts are edited instead of overwritten. Setup links are returned with no-store headers and are not saved in workspace state or logs.

## Structure

```text
src/app/                  Routes, role protected layouts, Auth callbacks, APIs
src/components/features/  Learning, authoring, assessments, accounts, support
src/lib/supabase/          Typed browser and cookie based server clients
src/lib/server/            Verified identity and bounded database queries
src/lib/lms/               Domain commands, validation, API backed UI state
src/types/database.types.ts Generated live database types
supabase/migrations/      Schema, access policies, transaction functions
tests/database.test.mjs   PostgreSQL integration tests using PGlite
```

Normalized tables separate curriculum, enrollments, progress, private notes, assessments, attempts, certificates, notifications, and support tickets. Foreign keys, uniqueness constraints, targeted indexes, and full text search support growth. Answer keys and audit records live outside the exposed schema.

Verified Auth identities and active database roles control access. RLS scopes reads; database transaction functions authorize writes. Cookie authenticated APIs validate origin, payload size, and Zod contracts. Course edits check their last update timestamp. Curriculum changes are locked after enrollment to preserve progress. Quiz edits block while attempts are open.

Deadlines, grading, completion, and certificate issuance are authoritative database operations. Duplicate enrollment, completion, and quiz submission requests are idempotent. Certificates require all lessons and passing results for every current assessment. Public verification exposes only certificate identity, recipient name, course title, and issue date.

Workspace queries load bounded 50 record pages and fetch focused course/quiz details separately. Dashboard totals and monthly activity aggregate across all authorized records, independently of pagination. The courses API supports cursor pagination and full text search. UI filters currently search loaded records; load more pages to search additional records. For larger traffic, split workspace loading into screen specific queries and use paginated server filters throughout.

## Current boundaries

- Free enrollment works. Paid courses require a future verified payment integration.
- Lesson content and direct video URLs persist; managed uploads and adaptive video delivery are not connected.
- Support tickets persist and admins review/close them in the Help center.
- In-app notifications are generated for enrollments, publications, course/resource updates, assessment results, certificates, account roles and support requests. Feeds use cursor pagination, exact unread counts and user-scoped Realtime with a 30-second fallback. Database Cron checks learning reminders hourly (one per inactive enrollment per week); opted-in learners get a Monday weekly summary. New events create notifications; historical events are not replayed.
- Resend delivery is prepared with a private queue, leases, retry limits, preference checks and idempotency keys. Set server-only `RESEND_API_KEY`, `NOTIFICATION_EMAIL_FROM` (verified sender), `APP_URL` (public application origin), and a random `CRON_SECRET`. The Vercel cron configuration calls `/api/cron/notification-emails` hourly with `Authorization: Bearer <CRON_SECRET>`. On another host, schedule that authenticated endpoint yourself. Localhost cannot receive a hosted cron request; in-app database schedules run independently. Email remains disabled until credentials are configured. Provider acceptance is tracked as sent; inbox delivery/bounce monitoring requires provider webhook integration.
- Certificates download as HTML or through Print / Save PDF.
- Revenue remains zero until payments are integrated.

Production readiness also needs rate limiting, monitoring, backup/recovery exercises, email delivery validation, and load testing against expected traffic. This backend establishes access control and consistency; scalability must be measured with real usage.

Course hardening enforces a 512 KiB request body while streaming, plus database limits of 100 modules, 100 lessons per module and 500 lessons in total. Video links must use HTTP(S); module and lesson IDs must be unique. Saves use a transaction lock before initial ownership checks and bulk curriculum inserts. Per-account hourly limits currently allow 120 successful course saves, 30 thumbnail upload authorizations and 60 PDF upload authorizations; counters occupy one row per account and operation. Upload authorizations query ownership through a restricted database function, including courses hidden by RLS. Removed lesson resources are pruned after curriculum reconstruction and their files enter a private retry queue. Successful course saves drain up to 50 queued deletions; the authenticated hourly cron endpoint also drains cleanup before checking email configuration. Course/resource announcements are enqueued during saves and delivered by database Cron every minute in batches of at most 1,000 recipients, so large classes do not extend authoring transactions. Production traffic still needs infrastructure rate limiting and measured load tests; unused thumbnail uploads are bounded by upload quotas but storage retention cleanup remains a separate concern.

## Google sign-in

The sign-in and signup screens offer Google through the SSR browser client with PKCE.
`/auth/callback` exchanges the code for session cookies; `/api/auth/destination` checks
the database role before returning to a requested workspace. New accounts remain learners.
Google credentials stay in Supabase. Its redirect allow-list must include the app's
`/auth/callback` URL; add the production callback when deploying to a new domain.
Google Cloud's authorized redirect URI is the Supabase project's `/auth/v1/callback`,
not the app callback. See [Supabase's Google setup](https://supabase.com/docs/guides/auth/social-login/auth-google).

## Checks

Course thumbnails use the public `course-thumbnails` Storage bucket created by migration.
Uploads go through `/api/course-thumbnail` with an authenticated tutor or admin and the
server-only `SUPABASE_SECRET_KEY`; direct anonymous and authenticated bucket writes are blocked.
The server validates actual image bytes, exact 16:9 dimensions, a 640 × 360 minimum,
and a 5 MB maximum. It strips image metadata and encodes WebP at up to 1280 × 720.
Immutable image URLs support CDN caching; save the course to commit the selected image.
Old replacements and uploads abandoned before saving remain in Storage. A future retention
job should remove unreferenced objects after a grace period rather than deleting them on selection.

```sh
npm test
npm run typecheck
npm run lint
npm run build
npm run format:check
```

Tests apply migrations in an embedded PostgreSQL engine and cover role escalation, RLS isolation, enrollment, server grading/deadlines, certificates, private notes, verified admin onboarding, scoped reports, and administrator settings. They never create live Auth users or send email.

Photography sources: `docs/photography.md`.

## Branding

The supplied CyberPurview logo is preserved in `public/brand/cyberpurview.png`.
`src/components/shared/BrandLogo.tsx` provides full, light, and shield-only treatments;
asset paths and the default name live in `src/lib/brand.ts`.
The shield is traced as `public/brand/shield.svg`, with Next.js favicon and Apple touch
icon assets in `src/app`. Replace the screenshot with a higher-resolution original
logo at the same path if one becomes available.

## Bulk quiz question import

Quiz editors support title-only drafts, incomplete questions, and separate
publication. Draft assessments are visible only to course staff and excluded from
certificate requirements. Publishing requires complete questions, answer options,
and correct answers. Existing assessments remain published after migration.

Once any learner starts an assessment, database commands lock the entire quiz,
including questions, answer keys, timing, and passing score. This also applies to
submitted or expired attempts. Staff can create a draft copy with new question and
option IDs; the original results remain intact. Publishing a copy adds a separate
assessment to the course. Draft and unattempted quiz edits use revision checks to
reject conflicting saves. Migration: `20261011030000_quiz_drafts.sql`.

The admin and tutor quiz editors accept `.json` files up to 256 KB. Download the
sample in the editor, upload the completed file, review the preview, and click
**Add questions**. Imports append to existing questions and require saving the
assessment to persist. A quiz can contain up to 100 questions.

The format is `{ "questions": [{ "text": "Question?", "options": ["First", "Second"],
"correctAnswer": 1, "explanation": "Optional feedback" }] }`. A plain question
array is also accepted. Answer numbers start at 1. Each question requires 2–10
nonempty options. Invalid files leave existing questions unchanged; generated
question and option IDs are fresh for every import.

## Lesson worksheets

After saving a course, open its overview and expand a lesson. Course owners and
administrators can write, update, or remove that lesson's worksheet there. The
worksheet saves independently, including for courses with enrolled learners.
Enrolled learners can read the exercise in the lesson's resources tab and download
it as a text file. Blank worksheets show an empty state with no download button.
These are independent practice exercises; there is no submission or grading flow.

Migration `20261011020000_lesson_worksheets.sql` stores worksheet text in the private
schema, keyed by course and lesson. Database commands enforce course ownership,
length limits, and conflicting-edit checks; protected course outlines expose the
text only to enrolled learners and course staff. Worksheet storage survives course
draft saves that rebuild modules. Records for removed lessons remain hidden and
are deleted when their course is deleted.

## Lesson PDF resources

Save a course, expand a lesson in its overview, and use **PDF resources** to upload
readings or guides. Owners and administrators can upload/remove up to 10 PDFs per
lesson, each up to 20 MB. Files are parsed before upload; unreadable, empty, and
password-protected PDFs are rejected. Enrolled learners can preview resources in
the lesson's Resources tab or download them. Preview uses the browser's PDF viewer
with a new-tab/download fallback for browsers without PDF embedding support.

Migration `20261011040000_lesson_resources.sql` creates the private
`lesson-resources` Storage bucket and private metadata. API routes check identity,
course management or enrollment, and issue signed URLs valid for 10 minutes.
Direct Storage reads and writes are blocked for client roles. Resource metadata is
kept separate from curriculum rebuilding so draft saves preserve uploaded files.
Unlinked resources are inaccessible through the API. Failed registration cleans
up its uploaded file; removal deletes metadata then attempts object cleanup.
Objects orphaned by storage errors or course deletion need periodic storage cleanup.

PDF uploads are also available inside each lesson in the course editor. Uploading
for a new lesson saves the course/lesson first and keeps the editor open. A course
title and active tutor are required. Subsequent saves use the exact revision returned
by `save_course_with_revision` (migration `20261011050000_course_save_revision.sql`).

Lesson guides use a Tiptap rich text editor with headings, emphasis, lists, links,
alignment, formatted paste, and an expanded writing area. PDF-only lessons may leave
the text blank. Rich text uses an explicit version marker in the existing content
field; legacy plain text remains plain text. Stored and displayed HTML is sanitized
with allowed tags, safe link schemes and restricted CSS. The editor loads lazily so
learners do not download authoring tools.
