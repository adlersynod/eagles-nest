import { NextRequest, NextResponse } from 'next/server'
import { verifySessionToken, getSessionToken } from '@/lib/auth'

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Public paths — allow without auth
  if (
    pathname.startsWith('/login') ||
    pathname.startsWith('/api/auth') ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    pathname === '/favicon.ico'
  ) {
    return NextResponse.next()
  }

  // Check for valid session
  const token = req.cookies.get('eagles_nest_session')?.value

  if (!token) {
    return NextResponse.redirect(new URL('/login', req.url))
  }

  const valid = await verifySessionToken(token)
  if (!valid) {
    const response = NextResponse.redirect(new URL('/login', req.url))
    response.cookies.delete('eagles_nest_session')
    return response
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico, sitemap.xml, robots.txt
     */
    '/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)',
  ],
}
