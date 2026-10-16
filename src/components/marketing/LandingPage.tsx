import Image from 'next/image'
import Link from 'next/link'
import { ArrowRight, ArrowUpRight, Plus } from 'lucide-react'
import { Brand, LandingHeader } from './LandingHeader'
import { FeaturedCourses } from './FeaturedCourses'
import { publishedCourses, courseCategories } from '@/lib/server/catalog'

const button =
  'inline-flex items-center justify-center gap-2.5 rounded-full bg-brand-600 px-6 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700'
const faqs = [
  {
    question: 'Where should I start?',
    answer:
      'Explore the course catalog and choose a subject that interests you. Each course overview includes its level, curriculum, and instructor, so you can find a comfortable starting point.',
  },
  {
    question: 'Can I learn at my own pace?',
    answer:
      'Yes. Work through the lessons whenever you have time. Your progress and private lesson notes are saved, making it easy to pick up where you left off.',
  },
  {
    question: 'How do I earn a certificate?',
    answer:
      'Complete all the lessons in your course and pass its final assessment. Your certificate will appear in your certificate library, ready to view, download, or print.',
  },
  {
    question: 'Can I teach on CyberPurview?',
    answer:
      'Absolutely. Choose the tutor workspace to explore course creation, curriculum building, quizzes, student progress, and teaching analytics.',
  },
  {
    question: 'Can I try the platform before signing up?',
    answer:
      'Explore published courses, then create an account to enroll and save your progress. Free courses are available immediately. Instructor access is assigned by an administrator.',
  },
]

export async function LandingPage() {
  const [published, categories] = await Promise.all([publishedCourses(), courseCategories()])
  return (
    <div className="bg-[#faf9f6] text-navy selection:bg-brand-100 selection:text-brand-900">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-xl focus:bg-white focus:p-4"
      >
        Skip to content
      </a>
      <LandingHeader />
      <main id="main-content">
        <section className="overflow-hidden border-b border-slate-200/70">
          <div className="mx-auto grid max-w-[1200px] items-center gap-10 px-5 pb-16 pt-12 sm:px-8 sm:py-20 lg:grid-cols-[1.05fr_1fr] lg:gap-16 lg:py-20">
            <div>
              <div className="mb-7 inline-flex items-center gap-2.5 rounded-full border border-brand-200/70 bg-brand-50/70 px-3.5 py-2 text-[11px] font-semibold text-brand-700">
                <span className="h-1.5 w-1.5 rounded-full bg-brand-500" />A little curiosity. A
                world of possibility.
              </div>
              <h1 className="text-[45px] font-semibold leading-[1.08] tracking-[-.045em] sm:text-[60px] xl:text-[68px]">
                Your next chapter
                <br className="hidden sm:block" /> starts with
                <br />
                <span className="font-serif italic font-normal text-brand-600">something new.</span>
              </h1>
              <p className="mb-8 mt-6 max-w-[430px] text-base leading-7 text-slate-500">
                Learn a new skill. Follow an interest. Take a step toward the future you want. We’ll
                help you find your flow.
              </p>
              <div className="flex flex-wrap items-center gap-5">
                <Link href="/catalog" className={button}>
                  Explore courses <ArrowUpRight className="h-4 w-4" />
                </Link>
                <a
                  href="#how-it-works"
                  className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-brand-600"
                >
                  See how it works <ArrowRight className="h-4 w-4" />
                </a>
              </div>
              <div className="mt-8 flex flex-wrap gap-x-5 gap-y-2 text-[11px] text-slate-500">
                <span className="flex items-center gap-1.5">Learn at your pace</span>
                <span className="flex items-center gap-1.5">Practical lessons</span>
                <span className="flex items-center gap-1.5">Celebrate your progress</span>
              </div>
            </div>
            <div className="relative mx-auto w-full max-w-[520px] pb-7 pl-3 lg:max-w-none">
              <div className="absolute bottom-0 left-0 right-7 top-7 rounded-[28px] bg-[#e7ede7]" />
              <div className="relative h-[360px] overflow-hidden rounded-[24px] sm:h-[450px] lg:h-[470px]">
                <Image
                  src="/images/learning-hero.jpg"
                  alt="A woman working thoughtfully at her laptop in a bright workspace"
                  fill
                  priority
                  sizes="(max-width: 1023px) 100vw, 50vw"
                  className="object-cover object-[48%_center]"
                />
              </div>
            </div>
          </div>
        </section>

        <section aria-label="Learning benefits" className="bg-white">
          <div className="mx-auto grid max-w-[1200px] gap-6 px-5 py-9 sm:grid-cols-3 sm:px-8">
            {[
              {
                title: 'Specialist courses',
                description: 'Explore cybersecurity, audit, governance, and cloud security.',
              },
              {
                title: 'Learn at your pace',
                description: 'Study when it suits you and pick up where you left off.',
              },
              {
                title: 'Earn certificates',
                description: 'Build skills and earn course certificates.',
              },
            ].map((item, i) => (
              <div
                key={item.title}
                className={`flex items-center gap-4 ${i ? 'sm:border-l sm:border-slate-200 sm:pl-6' : ''}`}
              >
                <div>
                  <h2 className="text-sm font-semibold">{item.title}</h2>
                  <p className="mt-1.5 text-xs leading-5 text-slate-500">{item.description}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <FeaturedCourses published={published} categoryNames={categories} />

        <section
          id="why-cyberpurview"
          className="scroll-mt-8 border-y border-slate-200/70 py-20 sm:py-24"
        >
          <div className="mx-auto grid max-w-[1200px] items-center gap-12 px-5 sm:px-8 lg:grid-cols-2 lg:gap-20">
            <div className="relative">
              <div className="relative h-[320px] overflow-hidden rounded-[24px] sm:h-[420px]">
                <Image
                  src="/images/learning-together.jpg"
                  alt="Three people learning and sharing ideas together with their laptops"
                  fill
                  sizes="(max-width: 1023px) 100vw, 50vw"
                  className="object-cover"
                />
              </div>
            </div>
            <div className="pt-5 lg:pt-0">
              <p className="mb-3 text-xs font-semibold uppercase tracking-[.18em] text-brand-600">
                Built around your growth
              </p>
              <h2 className="text-3xl font-semibold leading-tight tracking-tight sm:text-[40px]">
                Learning that feels
                <br />
                like moving forward.
              </h2>
              <p className="mb-7 mt-5 text-sm leading-7 text-slate-500">
                The right learning experience makes the next step feel possible. CyberPurview gives
                you a clear path from your first lesson to your next achievement.
              </p>
              <div className="space-y-6">
                {[
                  {
                    title: 'Learn with a clear direction',
                    text: 'Structured courses and practical lessons help you focus on what matters.',
                  },
                  {
                    title: 'Make the knowledge your own',
                    text: 'Take notes, work through exercises, and check your understanding with quizzes.',
                  },
                  {
                    title: 'See how far you’ve come',
                    text: 'Track your progress and earn a certificate when you complete your course.',
                  },
                ].map((item) => (
                  <div key={item.title} className="flex gap-4">
                    <div>
                      <h3 className="text-sm font-semibold">{item.title}</h3>
                      <p className="mt-1.5 text-xs leading-6 text-slate-500">{item.text}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section id="how-it-works" className="scroll-mt-8 bg-white py-20 sm:py-24">
          <div className="mx-auto max-w-[1200px] px-5 sm:px-8">
            <div className="mb-12 text-center">
              <p className="mb-3 text-xs font-semibold uppercase tracking-[.18em] text-brand-600">
                Getting started is simple
              </p>
              <h2 className="text-3xl font-semibold tracking-tight sm:text-[40px]">
                A fresh start, in three small steps.
              </h2>
            </div>
            <div className="grid gap-8 sm:grid-cols-3">
              {[
                {
                  number: '01',
                  title: 'Follow your curiosity',
                  text: 'Browse the catalog. Find the subject, level, and instructor that feel right for you.',
                  href: '/catalog',
                  action: 'Find your course',
                },
                {
                  number: '02',
                  title: 'Find your rhythm',
                  text: 'Make room for a lesson. Save your notes, practice what you learn, and build momentum.',
                  href: '/login?role=learner',
                  action: 'Start your journey',
                },
                {
                  number: '03',
                  title: 'Make it a milestone',
                  text: 'Complete your course, pass the assessment, and celebrate a skill you can take with you.',
                  href: '/learner/certificates',
                  action: 'Explore certificates',
                },
              ].map((step) => (
                <div key={step.number} className="border-t border-slate-200 pt-6">
                  <span className="text-sm font-medium text-brand-600">
                    {step.number}
                    <span className="ml-3 text-slate-300">/</span>
                  </span>
                  <h3 className="mb-3 mt-6 text-xl font-semibold tracking-tight">{step.title}</h3>
                  <p className="max-w-xs text-sm leading-7 text-slate-500">{step.text}</p>
                  <Link
                    href={step.href}
                    className="mt-5 inline-flex items-center gap-2 text-xs font-semibold text-slate-700 hover:text-brand-600"
                  >
                    {step.action}
                    <ArrowUpRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="teach" className="scroll-mt-8 px-5 pb-10 pt-4 sm:px-8">
          <div className="relative mx-auto grid max-w-[1136px] items-center gap-10 overflow-hidden rounded-[24px] bg-navy p-7 text-white sm:p-12 lg:grid-cols-[1.35fr_1fr] lg:gap-16">
            <div className="relative z-10">
              <p className="mb-4 text-xs font-medium uppercase tracking-[.18em] text-brand-200">
                For the people who love to teach
              </p>
              <h2 className="text-3xl font-semibold leading-tight tracking-tight sm:text-[40px]">
                What you know could
                <br />
                change someone’s next step.
              </h2>
              <p className="mb-7 mt-5 max-w-lg text-sm leading-7 text-slate-300">
                Bring your expertise to CyberPurview. Create thoughtful courses, support your
                students, and make learning a little more accessible.
              </p>
              <Link
                href="/login?role=tutor"
                className="inline-flex items-center gap-2 rounded-full bg-white px-6 py-3.5 text-sm font-semibold text-navy transition-colors hover:bg-brand-50"
              >
                Explore the tutor studio <ArrowUpRight className="h-4 w-4" />
              </Link>
            </div>
            <div className="relative z-10 rounded-2xl border border-white/15 bg-white/[.04] p-6 sm:p-7">
              <div className="mb-5 flex items-center gap-3">
                <div>
                  <h3 className="text-sm font-semibold">Your ideas. Your classroom.</h3>
                  <p className="mt-1 text-xs text-slate-400">The tools to bring it all together.</p>
                </div>
              </div>
              {[
                'Build courses and organize your curriculum',
                'Create quizzes that encourage understanding',
                'Follow student progress and learning outcomes',
              ].map((t) => (
                <div
                  key={t}
                  className="flex items-start gap-3 border-t border-white/10 py-4 text-xs leading-6 text-slate-300"
                >
                  {t}
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="faq" className="scroll-mt-8 py-16 sm:py-20">
          <div className="mx-auto grid max-w-[1200px] gap-10 px-5 sm:px-8 lg:grid-cols-[.85fr_1.4fr] lg:gap-24">
            <div>
              <p className="mb-3 text-xs font-semibold uppercase tracking-[.18em] text-brand-600">
                A little clarity
              </p>
              <h2 className="text-3xl font-semibold leading-tight tracking-tight sm:text-[40px]">
                Good questions.
                <br />
                Simple answers.
              </h2>
              <p className="mt-5 max-w-xs text-sm leading-7 text-slate-500">
                A few things you might be wondering before taking your first step.
              </p>
              <Link
                href="/learner/help"
                className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-brand-600"
              >
                Visit the help center <ArrowUpRight className="h-4 w-4" />
              </Link>
            </div>
            <div>
              {faqs.map((faq) => (
                <details
                  key={faq.question}
                  className="group border-b border-slate-200 py-5 first:border-t"
                >
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-6 text-sm font-semibold text-slate-800 [&::-webkit-details-marker]:hidden">
                    <span>{faq.question}</span>
                    <Plus className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-open:rotate-45" />
                  </summary>
                  <p className="pt-4 pr-8 text-sm leading-7 text-slate-500">{faq.answer}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="border-t border-slate-200 bg-[#e9efec] py-16 sm:py-20">
          <div className="mx-auto max-w-[1200px] px-5 text-center sm:px-8">
            <h2 className="text-3xl font-semibold tracking-tight sm:text-[44px]">
              Your future is a work in progress.
              <br />
              <span className="font-serif font-normal italic text-brand-600">
                Make a little room for it.
              </span>
            </h2>
            <p className="mb-7 mt-5 text-sm text-slate-500">
              The next thing you learn could be the start of something good.
            </p>
            <Link href="/catalog" className={button}>
              Find your next course <ArrowUpRight className="h-4 w-4" />
            </Link>
          </div>
        </section>
      </main>
      <footer className="bg-white">
        <div className="mx-auto max-w-[1200px] px-5 pb-7 pt-14 sm:px-8">
          <div className="grid gap-10 pb-10 sm:grid-cols-[1.5fr_1fr_1fr_1fr]">
            <div>
              <Brand />
              <p className="mt-4 max-w-xs text-xs leading-6 text-slate-500">
                A little curiosity. A world of possibility.
                <br />A better place to learn, teach, and grow.
              </p>
            </div>
            {[
              {
                title: 'Discover',
                links: [
                  { label: 'Explore courses', href: '/catalog' },
                  { label: 'How it works', href: '#how-it-works' },
                  { label: 'Why CyberPurview', href: '#why-cyberpurview' },
                ],
              },
              {
                title: 'Your next step',
                links: [
                  { label: 'Start learning', href: '/login?role=learner' },
                  { label: 'Become an instructor', href: '/login?role=tutor' },
                  { label: 'Sign in', href: '/login' },
                ],
              },
              {
                title: 'Here to help',
                links: [
                  { label: 'Frequently asked questions', href: '#faq' },
                  { label: 'Help center', href: '/learner/help' },
                  { label: 'Contact us', href: '/contact' },
                ],
              },
            ].map((group) => (
              <div key={group.title}>
                <h3 className="mb-4 text-xs font-semibold text-slate-800">{group.title}</h3>
                <ul className="space-y-3">
                  {group.links.map((l) => (
                    <li key={l.label}>
                      <Link href={l.href} className="text-xs text-slate-500 hover:text-brand-600">
                        {l.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap justify-between gap-3 border-t border-slate-100 pt-6 text-[10px] text-slate-400">
            <p>© {new Date().getFullYear()} CyberPurview. Keep learning.</p>
            <nav aria-label="Legal" className="flex gap-5 text-xs text-slate-500">
              <Link href="/privacy" className="hover:text-brand-600">
                Privacy Policy
              </Link>
              <Link href="/terms" className="hover:text-brand-600">
                Terms of Service
              </Link>
            </nav>
          </div>
        </div>
      </footer>
    </div>
  )
}

