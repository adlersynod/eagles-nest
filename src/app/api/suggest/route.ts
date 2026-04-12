import { NextRequest, NextResponse } from 'next/server'

const CACHE: Record<string, { suggestions: string[]; ts: number }> = {}
const CACHE_TTL = 60_000 // 1 min

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get('q') || ''
  if (q.length < 2) return NextResponse.json({ suggestions: [] })

  const cached = CACHE[q]
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return NextResponse.json({ suggestions: cached.suggestions })
  }

  try {
    const geoRes = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=6&language=en&feature=city,settlement,airport`
    )
    const geoData = await geoRes.json()
    const suggestions = (geoData.results || []).map((r: { name: string; country: string; admin1?: string }) => {
      const parts = [r.name, r.admin1, r.country].filter(Boolean)
      return [...new Set(parts)].join(', ')
    })

    // Deduplicate while preserving order
    const seen = new Set<string>()
    const deduped = suggestions.filter((s: string) => seen.has(s) ? false : (seen.add(s), true))

    CACHE[q] = { suggestions: deduped, ts: Date.now() }
    return NextResponse.json({ suggestions: deduped })
  } catch {
    return NextResponse.json({ suggestions: [] })
  }
}