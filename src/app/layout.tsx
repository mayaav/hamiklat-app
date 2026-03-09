import type { Metadata, Viewport } from 'next'
import { DM_Sans } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { SpeedInsights } from '@vercel/speed-insights/next'
import './globals.css'

const dmSans = DM_Sans({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
})

export const metadata: Metadata = {
  icons: {
    icon: '/shield.png',
    apple: '/shield.png',
  },
  title: 'המקלט | מצא מקלט קרוב',
  description: 'מפת מקלטים קהילתית. המידע במפה מתעדכן על ידי משתמשי הקהילה ומסייע לאנשים לשתף מיקומים של מקלטים נגישים, ציבוריים או פתוחים בסביבה שלהם.',
  keywords: ['מקלט', 'מקלט ציבורי', 'ממד', 'חדר ביטחון', 'ישראל', 'shelter', 'israel'],
  openGraph: {
    title: 'המקלט — מצא מקלט קרוב',
    description: 'מפת מקלטים קהילתית. המידע מתעדכן על ידי משתמשי הקהילה ומסייע לאנשים לשתף מיקומים של מקלטים נגישים, ציבוריים או פתוחים בסביבה שלהם.',
    locale: 'he_IL',
    type: 'website',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'המקלט',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#ffffff',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl" className={dmSans.variable}>
      <body className="antialiased font-sans">{children}<Analytics /><SpeedInsights /></body>
    </html>
  )
}
