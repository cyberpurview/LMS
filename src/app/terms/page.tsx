import Link from 'next/link'
import { LegalPage, LEGAL_CONTACT } from '@/components/marketing/LegalPage'

export const metadata = {
  title: 'Terms of Service | CyberPurview',
  description:
    'Terms for using CyberPurview courses, assessments, certificates and teaching tools.',
}

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service">
      <section>
        <h2>Using CyberPurview</h2>
        <p>
          These terms govern your use of the learning platform operated by Cyber Purview LLC. By
          creating an account or using the service, you agree to these terms. If you do not agree,
          do not use the service. You must be legally able to accept these terms or have any
          permission required from a parent, guardian or organization. Our{' '}
          <Link href="/privacy">Privacy Policy</Link> explains how we handle personal information.
        </p>
      </section>
      <section>
        <h2>Your account</h2>
        <p>
          Provide accurate account information, keep your sign-in credentials secure and use only
          accounts you are authorized to access. You are responsible for activity you authorize
          through your account. Report suspected unauthorized access to{' '}
          <Link href={LEGAL_CONTACT}>our contact form</Link>. Registering a learner account does not
          grant instructor or administrator permissions; those permissions are assigned by
          authorized administrators.
        </p>
      </section>
      <section>
        <h2>Courses and access</h2>
        <p>
          You may browse published course information without an account. Learning content and
          assessments may require registration, enrollment and, where a paid offering is enabled,
          confirmed payment. Free access applies only to offerings designated free. A displayed
          price does not mean checkout is currently available. Do not attempt to bypass access or
          payment controls.
        </p>
        <p>
          Course availability, content, access conditions and features may change. We will
          communicate material changes affecting an existing paid entitlement where appropriate.
          Access is for your own learning or authorized teaching, not resale or sharing an account
          with others.
        </p>
      </section>
      <section>
        <h2>Assessments and certificates</h2>
        <p>
          Assessment rules may include time limits, attempt limits, waiting periods, completion
          requirements and restrictions on when answers are shown. Practice quizzes do not award
          certificates or satisfy required assessments. A certificate is issued only when the
          applicable conditions are met; some offerings require instructor approval or do not offer
          a certificate.
        </p>
        <p>
          Do not impersonate another learner, share restricted answers or falsify completion
          records. We may investigate and correct or revoke credentials obtained through fraud or a
          material error. A CyberPurview certificate documents the stated learning achievement; it
          does not by itself confer a professional licence, academic accreditation, employment or
          third-party certification.
        </p>
      </section>
      <section>
        <h2>Acceptable use</h2>
        <p>
          Do not use the service to violate the law, harass others, upload malicious files, infringe
          intellectual-property rights, expose confidential information, interfere with
          availability, scrape restricted data or gain unauthorized access. Cybersecurity exercises
          and techniques must be used only in environments where you have permission. Report
          vulnerabilities privately rather than testing against other users or disrupting the
          service.
        </p>
      </section>
      <section>
        <h2>Content and teaching</h2>
        <p>
          CyberPurview and its licensors retain their rights in platform software, branding and
          learning materials. You receive permission to use materials through the service for the
          authorized purpose, subject to any stated resource licence.
        </p>
        <p>
          You retain rights you hold in content you submit. You grant us permission to host, store,
          display and process that content as needed to provide and protect the service. Instructors
          must have the necessary rights and permissions for their course materials, maintain
          accurate descriptions and review content before publication. Do not upload personal or
          confidential information you are not authorized to share.
        </p>
      </section>
      <section>
        <h2>AI features</h2>
        <p>
          AI authoring features generate drafts and may produce inaccurate, incomplete or unsuitable
          material. The creator must check the output for accuracy, rights and suitability before
          using or publishing it. AI features may be subject to quotas and interruptions and must
          not be used to generate unlawful or harmful content.
        </p>
      </section>
      <section>
        <h2>Payments and refunds</h2>
        <p>
          When purchasing becomes available, the price, currency, applicable taxes, access
          conditions and any offer-specific cancellation or refund terms must be presented before
          checkout. Contact us about billing issues. Nothing in these terms removes refund,
          cancellation or other consumer rights provided by applicable law.
        </p>
      </section>
      <section>
        <h2>Availability and responsibility</h2>
        <p>
          We work to provide a useful service but cannot promise uninterrupted availability,
          error-free content or a particular learning or career outcome. Maintenance, provider
          outages and security measures may affect access. Learning material is educational and does
          not replace professional advice where that is needed.
        </p>
        <p>
          To the extent permitted by applicable law, the service is provided as available, and we
          are not responsible for indirect or consequential losses arising from its use. Nothing
          excludes liability or statutory rights that cannot legally be excluded.
        </p>
      </section>
      <section>
        <h2>Suspension, closure and changes</h2>
        <p>
          We may restrict or suspend access when reasonably necessary to investigate misuse, address
          security risks or enforce these terms. Where practical and legally permitted, we will
          explain the reason and allow you to contact us about a disputed decision. You may request
          account closure by contacting us; retention of related records is described in our Privacy
          Policy.
        </p>
        <p>
          We may update these terms and will revise the date above. We will communicate material
          changes where appropriate and obtain further agreement where required. Contact{' '}
          <Link href={LEGAL_CONTACT}>our contact form</Link> about these terms or disputes.
          Mandatory laws and consumer rights applicable to you continue to apply.
        </p>
      </section>
    </LegalPage>
  )
}
