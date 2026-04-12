import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  return NextResponse.json({
    endpoint: 'search-v2',
    mode: request.nextUrl.searchParams.get('mode'),
    city: request.nextUrl.searchParams.get('city'),
    timestamp: new Date().toISOString(),
    query: Array.from(request.nextUrl.searchParams.entries()),
  })
}