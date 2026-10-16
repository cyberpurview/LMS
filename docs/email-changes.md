# Verified email changes

Email changes keep the account UUID, enrollments, progress, quiz attempts and certificates intact. Profile saves cannot change an email address.

The dedicated settings flow requires a fresh code sent to the current address, followed by Supabase's confirmation links to both the current and new addresses. A short-lived database permission binds the verified request to that account and destination. Completion revokes existing sessions and requires sign-in again. Linked Google identities remain linked.

## Delivery setup

Keep `AUTH_EMAIL_CHANGE_ENABLED=false` until all of these steps are complete:

1. Configure a production SMTP sender in Supabase Auth. For Resend, use a verified sending domain and server-side SMTP credentials. The free built-in Supabase sender currently rejects custom email templates.
2. Install `supabase/templates/magic-link.html` as the Magic Link template and `supabase/templates/email-change.html` as the Change Email Address template. The first displays the verification code; the second uses the app confirmation screen. Local Supabase configuration references these files; hosted templates must be configured separately.
3. Keep secure email change (confirmation on both addresses) enabled. Enable the email-address-changed notification to the old address. Configure the app origin and `/auth/confirm` redirect allowlist for each deployment.
4. Validate delivery, expiry, cancellation, both confirmation orders and session revocation using dedicated test accounts.
5. Set the server-only `AUTH_EMAIL_CHANGE_ENABLED=true` environment variable and rebuild/restart the deployment.

Without the flag, both the interface and API block new requests; cancellation remains available. Never expose SMTP credentials or the Supabase server key in public environment variables.
