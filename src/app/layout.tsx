import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: "Eagle's Nest — RV Travel Companion",
  description: 'Find things to do, restaurants, RV parks, and weather for any destination.',
  manifest: '/manifest.json',
  icons: { icon: '/favicon.ico', apple: '/icon-192.png' },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: "Eagle's Nest",
  },
  openGraph: {
    title: "Eagle's Nest — RV Travel Companion",
    description: 'Find attractions, restaurants, RV parks, and weather for any destination.',
    type: 'website',
    siteName: "Eagle's Nest",
  },
  twitter: {
    card: 'summary',
    title: "Eagle's Nest — RV Travel Companion",
    description: 'Find attractions, restaurants, RV parks, and weather for any destination.',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0f1923',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
      </body>
    </html>
  )
}
