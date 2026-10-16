import Link from 'next/link'
import { LandingHeader } from '@/components/marketing/LandingHeader'
import { ContactForm } from '@/components/marketing/ContactForm'

export const metadata = {
  title: 'Contact us | CyberPurview',
  description:
    'Contact CyberPurview for help with your account, courses, certificates or privacy requests.',
}
export default function ContactPage() {
  return (
    <div className="min-h-screen bg-[#faf9f6] text-navy">
      <LandingHeader />
      <main
        id="main-content"
        className="mx-auto grid max-w-5xl gap-10 px-5 py-12 sm:px-8 sm:py-16 md:grid-cols-[0.8fr_1.2fr] md:gap-16"
      >
        <div>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Contact us</h1>
          <p className="mt-4 max-w-sm leading-8 text-slate-600">
            Need help with your learning, account or a privacy request? Send us a message.
          </p>
          <p className="mt-6 text-sm leading-7 text-slate-500">
            Include the course or assessment name if your question relates to one.
          </p>
          <nav aria-label="Legal" className="mt-8 flex flex-wrap gap-5 text-sm text-brand-600">
            <Link href="/privacy">Privacy Policy</Link>
            <Link href="/terms">Terms of Service</Link>
          </nav>
        </div>
        <ContactForm />
      </main>
    </div>
  )
}
