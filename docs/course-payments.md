# Course and standalone quiz payments

## Access rules

Free published courses use `enroll_course`. A positive price is rejected by that RPC, even when called directly. Lesson text, worksheets, PDFs and course assessments require enrollment (or course management permission). An order by itself never grants enrollment.

Paid checkout is currently unavailable in the interface. There is no browser API, return-page handler or mock payment that can grant paid access. Existing enrollments are preserved when a course price changes; new learners pay the current price.

Standalone quiz creators choose Free or Paid and a USD price. Linked quizzes must have zero separate price and inherit course access. Published standalone metadata and question counts remain discoverable, while questions and starting/submitting attempts require free access, a verified purchase or a historical attempt. Existing free attempts retain access. Purchase alone never satisfies certificate requirements. Purchased quizzes, like attempted quizzes, are locked for editing; creators can make a new draft copy.

Courses and quizzes share `lms_private.purchase_orders`, including unique checkout/payment IDs. A quiz purchase grants a private `quiz_access` entitlement and covers retakes under the existing attempt rules. Browser clients cannot create entitlements or mark orders paid.

## Stripe integration boundary

1. A future same-origin, authenticated checkout endpoint calls `create_course_order` or `create_quiz_order` using the learner's Supabase session. The database derives the learner, current published subject price and USD currency. Clients cannot supply a price or another learner. The RPCs reuse matching unexpired orders and share a limit of 20 checkout requests per learner per hour.
2. Create a Stripe Checkout session server-side using the returned integer cents, currency and order UUID as the idempotency key. Bind it with server-only `bind_purchase_checkout`. Align session expiry with the order's 30-minute quote. Do not redirect to an unbound session; reconcile uncertain failures using the same idempotency key.
3. A future Stripe webhook must verify the signature against the raw request body, retrieve the authoritative Checkout session and payment from Stripe, and verify paid/captured status, merchant account, live/test mode, order metadata, session ID, payment ID, amount and currency. Browser success redirects and asynchronous payment initiation are not payment proof.
4. Only after verification, use the server key to call `fulfill_purchase_order`. It matches the bound session and exact quote, records a unique payment ID, and creates course enrollment or quiz access in one transaction. Repeated delivery returns the same access ID; mismatches and reuse of another order's payment fail. The captured timestamp must be within the quote window; delayed webhook delivery can still fulfill a valid timely payment. Legacy course fulfillment and checkout RPCs remain compatible.
5. A success screen should poll the learner's enrollment with bounded retries while webhook fulfillment completes. It must never enroll the learner itself. Do not enable the paid button until checkout, signature verification and webhook reconciliation are implemented and tested.

The order table is private, indexed and protected from browser reads/writes. Restrictive foreign keys preserve purchase history. USD matches the existing course editor; additional currencies require explicit pricing and minor-unit rules. No payment SDK or credentials are required yet.

## Before launch

Implement reconciliation for webhook failures, expiry cleanup/retention for abandoned orders, and bounded administrative purchase history. Honor a valid paid quote even if the course price or enrollment-open setting changes after checkout. Archived courses remain accessible to existing enrolled learners.

Define refund and dispute policy before enabling payments: record provider events and refund amounts, then explicitly decide whether to revoke enrollment and how to treat historical certificates. This foundation does not process refunds or disputes. Never delete a purchase to represent a refund.
