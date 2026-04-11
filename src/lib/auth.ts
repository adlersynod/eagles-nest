import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'

const SESSION_COOKIE = 'eagles_nest_session'
const SECRET = new TextEncoder().encode(
  process.env.SESSION_SECRET || 'dev-secret-change-in-vercel-env'
)

export async function createSessionToken(): Promise<string> {
  return new SignJWT({ app: 'eagles-nest' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(SECRET)
}

export async function verifySessionToken(token: string): Promise<boolean> {
  try {
    const { payload } = await jwtVerify(token, SECRET)
    return !!payload
  } catch {
    return false
  }
}

export function getSessionCookieName(): string {
  return SESSION_COOKIE
}

export async function getSessionToken(): Promise<string | undefined> {
  const cookieStore = await cookies()
  return cookieStore.get(SESSION_COOKIE)?.value
}
