import Link from 'next/link'
import { LegalPage, LEGAL_CONTACT } from '@/components/marketing/LegalPage'

export const metadata = {
  title: 'Privacy Policy | CyberPurview',
  description:
    'How CyberPurview collects, uses and protects information when you learn and teach on our platform.',
}

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy">
      <section>
        <h2>Who we are</h2>
        <p>
          Cyber Purview LLC operates CyberPurview, a platform for online courses, assessments and
          certificates. This policy explains how we handle information when you browse, create an
          account, learn or teach. Contact us at{' '}
          <a href={`mailto:${LEGAL_CONTACT}`}>{LEGAL_CONTACT}</a> with privacy questions.
        </p>
      </section>
      <section>
        <h2>Information we collect</h2>
        <p>
          We collect account information you provide, including your name, email address and profile
          details. Our authentication provider handles password credentials. If you choose Google
          sign-in, we receive your Google account identifier, name, email address and profile
          picture, where available. Google sign-in does not give us access to your Gmail messages,
          Google Drive files or contacts.
        </p>
        <p>
          We also store learning records, such as enrollments, lesson progress, saved notes, quiz
          answers and attempts, scores and certificates. For instructors, we process course content,
          uploaded resources and authoring activity. Support requests and administrative actions may
          be recorded. Our hosting and security services may process IP addresses, browser/device
          information, request logs and error details to operate and protect the platform.
        </p>
      </section>
      <section>
        <h2>How we use information</h2>
        <p>
          We use information to authenticate users, manage access, deliver lessons and assessments,
          save progress, issue and verify certificates, communicate account or learning updates,
          respond to support requests, and detect misuse. Where applicable law requires a legal
          basis, we rely on providing the service you request, legitimate operational and security
          interests, legal obligations, or consent where required.
        </p>
      </section>
      <section>
        <h2>Who can access information</h2>
        <p>
          Administrators can access information needed to manage the platform. Instructors can
          access relevant learner information and progress for the learning activities they manage.
          Private lesson notes are associated with your account and are not published as course
          content.
        </p>
        <p>
          We use service providers including Supabase for authentication, database and file storage;
          Vercel for hosting; Google for optional sign-in; and Resend for email delivery. They
          process information needed to provide their services. We do not sell personal information
          or use Google account data for advertising. We may disclose information when legally
          required or reasonably necessary to protect users, investigate misuse or defend legal
          rights.
        </p>
      </section>
      <section>
        <h2>Certificates and public information</h2>
        <p>
          Published course information and instructor details can be viewed publicly. Anyone with a
          certificate verification link or QR code can view the credential details made available
          there, including the recipient’s name, course or assessment title, issue date and
          verification status. Avoid sharing a certificate link if you do not want these details
          shared.
        </p>
      </section>
      <section>
        <h2>AI course creation</h2>
        <p>
          If an instructor uses AI course creation, course requirements and related authoring
          context are sent to our AI provider, currently Groq, to generate outlines and lesson
          drafts. This feature is not intended for learner records, private notes or confidential
          client information. Do not include personal or sensitive information in AI instructions.
          Generated content requires instructor review.
        </p>
      </section>
      <section>
        <h2>Cookies and browser storage</h2>
        <p>
          We use authentication cookies and browser storage to keep you signed in, remember
          preferences such as appearance and sound, and preserve parts of your work, such as quiz
          answers during an attempt. Blocking or clearing this storage may affect those features.
          These functions do not require an advertising-cookie consent choice.
        </p>
      </section>
      <section>
        <h2>Retention, security and international processing</h2>
        <p>
          We retain information as needed to provide your account and learning records, support
          certificate verification, meet legal obligations and resolve disputes. Retention depends
          on the record and purpose; some records or backups may remain after account closure where
          needed for those purposes. Our providers may process information outside your country.
          Applicable safeguards depend on the provider and destination.
        </p>
        <p>
          We use access controls and other technical measures to protect information, but no online
          service can guarantee absolute security. Keep your credentials private and report
          suspected account misuse promptly.
        </p>
      </section>
      <section>
        <h2>Your choices and rights</h2>
        <p>
          You can update supported profile settings and notification preferences in your account,
          and disconnect CyberPurview through your Google account settings. Disconnecting Google
          does not itself delete your CyberPurview account. Contact us to request access,
          correction, an available copy of your data, or account/data deletion. We may verify your
          identity and explain any records we must retain. Depending on your location, you may also
          have rights to object, restrict processing, withdraw consent or complain to a privacy
          regulator.
        </p>
      </section>
      <section>
        <h2>Children and policy changes</h2>
        <p>
          CyberPurview is designed for professional learning and is not directed to children under
          13. Contact us if you believe a child has provided personal information without
          appropriate authorization. We may update this policy as our service changes, revise the
          date above and communicate significant changes where appropriate. See also our{' '}
          <Link href="/terms">Terms of Service</Link>.
        </p>
      </section>
    </LegalPage>
  )
}
