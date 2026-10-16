# Quiz purpose, attempts and certificates

Quizzes have two independent dimensions: purpose (`practice` or `assessment`) and placement (course-linked or standalone).

Practice quizzes always allow unlimited total attempts, immediate answer review, and no certificate. They never satisfy course assessment requirements. Existing payment/enrollment rules still apply. Operational rate limits continue to protect the database for both purposes.

New assessment drafts default to three attempts and answer release after passing or the final attempt. Creators can choose 1–1,000 attempts or unlimited, a 0–10,080 minute cooldown, and immediate or delayed feedback. Existing quizzes retain unlimited attempts, zero cooldown and immediate feedback for compatibility; their scores and certificates are preserved.

Starting a new attempt consumes a slot. Resuming the same unfinished attempt does not consume another slot. Expired attempts count even when the learner closed the browser. Cooldowns apply to submitted and expired attempts. All enforcement uses server timestamps and per-learner/quiz transaction locks. Course-linked assessments qualify only for the course certificate. Standalone assessments retain their own certificate qualification and approval settings. Any valid passing attempt continues to qualify; later failures do not remove a pass or issue a duplicate certificate.

After the first attempt, purpose, limits, cooldown, feedback and award rules cannot change. Published quizzes cannot move between practice/assessment or courses after enrollment. Existing authoring locks also protect purchased assessments. A new draft copy can be used for different rules.

Correct answers and explanations are stored in `lms_private.quiz_feedback`; the public attempt table contains no answer keys. `submit_quiz` and `quiz_result` filter feedback on the server. Delayed feedback unlocks after a valid pass or exhaustion of a finite limit. Unlimited assessments with delayed feedback unlock only after passing. Once released, feedback remains released even if staff grant another attempt. There is no scheduled closing-date option yet.

Learners can reopen their latest result without consuming an attempt. The UI shows remaining attempts and cooldowns before starting and after submission. In-progress attempts remain resumable when no additional slots remain.

Quiz managers can grant 1–10 additional attempts with a recorded reason. Grants are recorded with actor, learner, quiz and timestamp and use an idempotency key so a retried request does not add attempts twice. They do not erase previous results or waive the configured cooldown. The manager's learner list loads in batches of 100.

Migration: `20261015170000_quiz_purpose_attempts.sql`. Regression tests cover authoring normalization, payment boundaries, practice exclusion from awards, limits/resumption, expiration, feedback privacy, extra-attempt permissions, idempotency, and result reopening.
