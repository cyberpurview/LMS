# AI course generation

Admin and tutor course lists and the manual course form link to **Create with AI**. The creator supplies a title, category, level and optional audience/goals, reviews the outline, then approves a new draft. Generated lessons are sanitized rich text and remain editable. Prices, publishing, resources, quizzes and certificates stay under creator control.

The builder shows one current task with stages and lesson progress. Completion displays a prominent draft-ready result with a review action. Starting another course clears that result into collapsed, compact recent history (the latest ten requests). Outline readiness, completion and terminal failure generate deduplicated in-app bell notifications, including when the creator has left the builder. Existing notification preferences govern email delivery when a sender is configured. Completed processing is distinguished from all planned lessons having saved content, so changed or removed lessons prompt review instead of a false success message.

Creators can enable **AI course completion sound** in Settings → Notifications and preview the chime. It defaults off, persists in their profile preferences and applies only to new successful completion notifications during an open dashboard session. Only the focused tab plays; bounded account-scoped receipts suppress repeats across polling and tabs. Browser autoplay restrictions require an interaction to enable audio. Closed dashboards do not play sounds, and visual notifications remain available regardless of sound support.

## Configuration

Store `GROQ_API_KEY`, `GROQ_MODEL`, `CRON_SECRET` and optional `AI_DAILY_REQUEST_LIMIT` in server-only environment variables. Local values belong in the ignored `.env.local`; never use a `NEXT_PUBLIC_` prefix. Model selection is configuration, so upgrading does not require changing the course workflow. Existing jobs pin the model they started with.

Run the application, then run `node scripts/ai-course-worker.mjs` as a separate always-on process. It calls the authenticated `/api/cron/ai-courses` endpoint every 15 seconds; generation continues when browser tabs close. In production, run the scheduler on an always-on host, or configure a supported authenticated scheduler to call the endpoint at least once per minute. The application process alone does not run the queue. `AI_WORKER_URL` defaults to localhost; remote deployments must use HTTPS and a private worker secret. Do not use Next.js fire-and-forget requests as a substitute for the worker.

## Persistence and limits

- Private Supabase jobs, creator-scoped reads and mutations; service-only claim/finish RPCs.
- One active course per creator, three new courses per 24 hours, a 20-job pending queue, up to 6 modules and 4 lessons each.
- One globally leased generation step, at least 15 seconds between claims, two-minute recovery leases, three automatic attempts per step. Manual retries have a cooldown and hourly cap.
- Default global budget: 100 provider requests per UTC database day, including failed requests. Change `AI_DAILY_REQUEST_LIMIT` after checking provider limits and billing. The queue waits for the next day after reaching the budget.
- Approval atomically creates a new unpublished course. Lessons save individually; cancellation invalidates the lease while retaining the partial draft.
- The worker only fills empty, unchanged reading lessons in the same draft/module. Manual content, renamed/moved lessons and module changes are preserved. Publishing, reassignment or an ineligible creator stops generation.

AI content needs a subject-matter review before publishing. No fabricated references, external research or source-grounded claims are promised. The free Groq tier's data terms and quotas should be reviewed before sending confidential material.

## Provider access

Generation uses Groq chat completions with strict JSON schema output. The default configured model is `openai/gpt-oss-120b`; `GROQ_MODEL` must name a model that supports strict structured outputs. Quotas and billing remain controlled by the Groq project. Keys stay on the server in authorization headers and are never returned to clients or included in URLs.

The Groq migration clears old Gemini model pins and invalidates their leases for unfinished jobs. Existing failed requests can be retried without recreating the course. Completed courses and human edits are unchanged. New Groq jobs pin their model for consistent generation.

Restart/redeploy the server after changing environment variables. Resume failed jobs from the AI builder once provider access is working. Changing the configured model affects new jobs; start a new course job to switch a job that already pinned another Groq model.
