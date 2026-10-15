import type { Metadata } from 'next'
import { LandingPage } from '@/components/marketing/LandingPage'
import { redirect } from 'next/navigation'
import { getIdentity } from '@/lib/server/auth'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'CyberPurview — A little curiosity. A world of possibility.',
  description:
    'Discover practical courses, learn at your own pace, and build skills for your next chapter. Explore CyberPurview’s learning community.',
}

export default async function Home() {
  // Validate the live session and database role before selecting a dashboard.
  // The public landing page stays available during a temporary auth outage.
  const identity = await getIdentity().catch(() => null)
  if (identity) redirect(`/${identity.user.role}`)
  return <LandingPage />
}
