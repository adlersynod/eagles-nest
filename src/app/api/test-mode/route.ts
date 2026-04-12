import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const mode = searchParams.get('mode')
  return NextResponse.json({ received_mode: mode, raw_url: request.url })
}
