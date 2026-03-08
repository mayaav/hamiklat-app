import type { Metadata, Viewport } from 'next'
import { DM_Sans } from 'next/font/google'
import './globals.css'

const dmSans = DM_Sans({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'המקלט | מצא מקלט קרוב',
  description: 'מפת מקלטים קהילתית לישראל — מצא את המקלט הקרוב אליך במהירות. מקלטים ציבוריים, ממ"דים ומרחבים מוגנים על המפה.',
  keywords: ['מקלט', 'מקלט ציבורי', 'ממד', 'חדר ביטחון', 'ישראל', 'shelter', 'israel'],
  openGraph: {
    title: 'המקלט — מצא מקלט קרוב',
    description: 'מפת מקלטים קהילתית לישראל. מצא את המקלט הקרוב אליך במהירות.',
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
      <body className="antialiased font-sans">{children}</body>
    </html>
  )
}
