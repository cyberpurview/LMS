import type { Metadata } from 'next'
import './globals.css'
import './dashboard-theme.css'
import { BRAND_NAME } from '@/lib/brand'
import { loadingThemeBootstrap } from '@/lib/lms/theme'

export const metadata: Metadata = {
  title: `${BRAND_NAME} LMS`,
  applicationName: BRAND_NAME,
  description: 'Learn, practice, and grow with CyberPurview.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <script dangerouslySetInnerHTML={{ __html: loadingThemeBootstrap() }} />
        {children}
      </body>
    </html>
  )
}
