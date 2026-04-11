import type { Metadata, Viewport } from 'next'
import './globals.css'
import ServiceWorkerRegister from '@/components/ServiceWorkerRegister'

export const metadata: Metadata = {
  title: "Eagle's Nest — RV Travel Companion",
  description: 'Find things to do, restaurants, RV parks, and weather for any destination.',
  manifest: '/manifest.json',
  icons: { icon: '/favicon.ico', apple: '/eagle-clean.png' },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: "Eagle's Nest",
  },
  openGraph: {
    title: "Eagle's Nest",
    description: 'RV Travel Companion',
    type: 'website',
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
        <ServiceWorkerRegister />
        {children}
      </body>
    </html>
  )
}
