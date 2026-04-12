import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const _rawMode = searchParams.get('mode')

  // Exact copy of the search route's mode logic
  const mode: 'local' | 'popular' | 'all' = _rawMode === 'local' || _rawMode === 'all' ? _rawMode as 'local' | 'all' : 'popular'

  return NextResponse.json({
    raw: _rawMode,
    computed: mode,
    type_of: typeof mode,
  })
}