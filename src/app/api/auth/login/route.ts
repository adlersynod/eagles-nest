import { NextRequest, NextResponse } from 'next/server'
import { createSessionToken, getSessionCookieName } from '@/lib/auth'
import crypto from 'crypto'

const COOKIE_MAX_AGE = 7 * 24 * 60 * 60 // 7 days in seconds

function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password).digest('hex')
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { password } = body

    if (!password || typeof password !== 'string') {
      return NextResponse.json({ error: 'Password required.' }, { status: 400 })
    }

    const storedHash = process.env.LOGIN_PASSWORD_HASH
    if (!storedHash) {
      console.error('LOGIN_PASSWORD_HASH not set in env vars')
      return NextResponse.json({ error: 'Server misconfiguration.' }, { status: 500 })
    }

    const inputHash = hashPassword(password)
    if (inputHash !== storedHash) {
      // Small delay to slow down brute force
      await new Promise((resolve) => setTimeout(resolve, 500))
      return NextResponse.json({ error: 'Incorrect password.' }, { status: 401 })
    }

    const token = await createSessionToken()
    const response = NextResponse.json({ ok: true })

    response.cookies.set(getSessionCookieName(), token, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      maxAge: COOKIE_MAX_AGE,
      path: '/',
    })

    return response
  } catch (error) {
    console.error('Login error:', error)
    return NextResponse.json({ error: 'Login failed.' }, { status: 500 })
  }
}
