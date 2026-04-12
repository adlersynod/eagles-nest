import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  return NextResponse.json({
    mode_param: searchParams.get('mode'),
    city_param: searchParams.get('city'),
    url: request.url,
    timestamp: new Date().toISOString(),
  })
}