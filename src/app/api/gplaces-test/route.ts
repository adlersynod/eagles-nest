import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  return NextResponse.json({
    t: Date.now(),
    mode: request.nextUrl.searchParams.get('mode'),
  })
}