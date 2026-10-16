# Vercel deployment

This Next.js application replaces the earlier application in `cyberpurview/LMS`.
Keep the earlier commits in Git history, but do not merge the earlier JavaScript
routes or configuration files into this TypeScript application.

## Project settings

- Framework: Next.js.
- Root directory: repository root.
- Node.js: 24.x, matching `.node-version`.
- Install: `npm ci`.
- Build: `npm run build`.
- Output directory: Next.js default; remove any previous custom override.
- Check the existing production branch before pushing a production release.

## Environment

Configure Vercel environment variables using `.env.example` as the variable-name
reference. Never commit `.env.local`, operator access tokens or Vercel credentials.
Verify existing project values rather than assuming the previous app used the
same Supabase database or variable names.

Required for the application:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SECRET_KEY` (server only, used by privileged administration/storage)
- `APP_URL` (the canonical HTTPS production origin)
- `CRON_SECRET` (a strong secret shared only with trusted job runners)

For AI generation: `GROQ_API_KEY`, `GROQ_MODEL`, and
`AI_DAILY_REQUEST_LIMIT`. These are server-only settings.

For notification emails: `RESEND_API_KEY` and `NOTIFICATION_EMAIL_FROM`.
Leave `AUTH_EMAIL_CHANGE_ENABLED=false` until Supabase Auth has a verified SMTP
sender configured. Auth SMTP settings are separate from notification email API
settings. Stripe is not configured; paid items remain gated.

Give previews their own `APP_URL` and explicitly allowed auth redirect origin
when testing authentication. Do not expose privileged environment variables to
untrusted pull request deployments. Isolate preview data before running write
tests against previews.

## Authentication and database

The project uses versioned Supabase migrations in `supabase/migrations`.
Confirm the target project's migration history; do not blindly reset or reseed
the production database during deployment.

Set Supabase Auth's Site URL to the canonical production origin and allow the
app's `/auth/callback` and `/auth/confirm` return URLs as required by the auth
flows. Preserve explicitly needed localhost URLs for development. Verify the
actual callback routes when configuring these settings. Google OAuth continues
to use the Supabase provider callback configured in Google Cloud.

## Scheduled work

`vercel.json` currently schedules `/api/cron/notification-emails` hourly. This
requires a Vercel plan supporting sub-daily cron jobs. Hobby allows daily cron
only; do not silently slow delivery or upgrade a plan during deployment.

AI generation is a durable database queue. Vercel production schedules
`/api/cron/ai-courses` once per minute; each invocation processes one outline or
lesson. Database leases prevent duplicate work, and the daily provider budget
defaults to 100 requests. Generation continues with the browser closed.
`scripts/ai-course-worker.mjs` remains available for local development. Use a
server-side `Authorization: Bearer <CRON_SECRET>` header. Never expose this secret
in browser code or URL parameters. Do not rely on a developer's local worker to
keep production generation running. Configure deployment protection access for
an external runner if needed.

## Release checks

Run type checking, lint, tests and a production build. Verify the deployed home,
public catalog, email/Google sign-in, role routing, private lesson access,
certificate verification URLs, uploads and scheduled jobs. Verify that old
project routes and build overrides are gone. Retain the previous deployment for
rollback, and avoid database changes that would make rollback unsafe.

References: [Vercel cron limits](https://vercel.com/docs/cron-jobs/usage-and-pricing)
and [Vercel MCP](https://vercel.com/docs/agent-resources/vercel-mcp).
