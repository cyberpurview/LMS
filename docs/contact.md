# Contact form

`/contact` is public and is linked from the landing page and legal pages. The
recipient is not exposed in client code. Set these server-only variables locally
and in the deployment environment:

- `RESEND_API_KEY`: a Resend key with permission to send from the verified domain.
- `NOTIFICATION_EMAIL_FROM`: the verified sender, for example `CyberPurview <noreply@cyberpurview.com>`.
- `CONTACT_EMAIL_TO`: the support inbox that receives submissions.
- `CRON_SECRET`: used as an HMAC salt for abuse-prevention identifiers.
- The existing Supabase URL, publishable key and server-only key.

Supabase SMTP setup alone does not configure the application's email API key.
Missing settings fail closed with a temporary-unavailability message. No email
is sent to the visitor automatically. Replies to a received submission address
the visitor's validated email through `reply_to`.

Apply migration `20261016010000_contact_messages.sql` before enabling delivery.
Only the service role can call the contact quota functions; browser roles cannot
read quota records. Limits are three submissions per IP and per email in a
rolling hour, and 100 across the platform in 24 hours. These are enforced
transactionally in PostgreSQL across instances. The implementation trusts
Vercel's overwritten `x-forwarded-for` header only on Vercel. Other deployments
share a conservative local/unknown bucket until their trusted proxy is adapted.

The endpoint requires same-origin JSON, bounds streamed request size, validates
all fields and uses plain-text emails, a honeypot and a minimum form-fill delay.
These controls reduce abuse but do not replace a bot challenge under sustained
attack. The form has no attachments. Quota records contain hashed identifiers,
a payload fingerprint and delivery/retry state, not message text or raw emails
or IPs. Records older than two days are pruned on subsequent claims.

Request UUIDs bind to the payload and sender. Delivery retries reuse Resend's
idempotency key, wait 15 seconds and are limited to three sends. A delivered
request is acknowledged without calling Resend again. Provider errors are not
reported as successful delivery. A success response means Resend accepted the
message; inbox placement is verified separately through provider delivery logs
or the receiving mailbox.
