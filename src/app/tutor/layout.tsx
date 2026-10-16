import { themeBootstrap } from '@/lib/lms/theme'
import { DashboardThemeProvider } from '@/components/shared/DashboardThemeProvider'
import { LmsProvider } from '@/lib/lms/store'
import { requireRole } from '@/lib/server/auth'
export default async function Layout({ children }: { children: React.ReactNode }) {
  const { user } = await requireRole('tutor')
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: themeBootstrap(user.id) }} />
      <DashboardThemeProvider key={user.id} userId={user.id}>
        <LmsProvider key={user.id} user={user}>
          {children}
        </LmsProvider>
      </DashboardThemeProvider>
    </>
  )
}
