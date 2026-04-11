import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: "Eagle's Nest — RV Travel Companion",
  description: 'Find things to do, restaurants, RV parks, and weather for any destination.',
  icons: { icon: '/favicon.ico', apple: '/eagle-clean.png' },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
