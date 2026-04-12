import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const mode = searchParams.get('mode') || 'NONE'

  return NextResponse.json({
    echo_mode: mode,
    timestamp: Date.now(),
    url: request.url,
    searchParamsMode: searchParams.get('mode'),
  })
}