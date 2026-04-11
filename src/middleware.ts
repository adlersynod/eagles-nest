import { NextRequest, NextResponse } from 'next/server'

// Simple in-memory rate limiter — works per-serverless-instance (Vercel isolates each instance)
const requestCounts = new Map<string, { count: number; resetAt: number }>()
const WINDOW_MS = 60 * 1000 // 1-minute window
const MAX_REQUESTS = 30 // max requests per IP per window

function getClientIp(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown'
  )
}

function isRateLimited(ip: string): boolean {
  const now = Date.now()
  const entry = requestCounts.get(ip)

  if (!entry || now > entry.resetAt) {
    requestCounts.set(ip, { count: 1, resetAt: now + WINDOW_MS })
    return false
  }

  entry.count++
  if (entry.count > MAX_REQUESTS) {
    return true
  }
  return false
}

export function middleware(req: NextRequest) {
  // Only rate-limit API routes
  if (!req.nextUrl.pathname.startsWith('/api')) {
    return NextResponse.next()
  }

  const ip = getClientIp(req)

  if (isRateLimited(ip)) {
    return NextResponse.json(
      { error: 'Too many requests. Please slow down.' },
      { status: 429 }
    )
  }

  return NextResponse.next()
}

export const config = {
  matcher: '/api/:path*',
}
