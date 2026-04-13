import { NextRequest, NextResponse } from 'next/server'
import koaMajorCampsitesRaw from '@/app/data/koa-major-campsites.json'

// Static KOA dataset — loaded at build/bundle time via resolveJsonModule
const KOA_CAMPSITES = koaMajorCampsitesRaw as Array<{ name: string; lat: number; lng: number }>

// ── Open-Meteo Geocoding ─────────────────────────────────────────────────────
async function geocodeCity(city: string): Promise<{ lat: number; lng: number; name: string; country: string; admin1?: string } | null> {
  try {
    const res = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=en&feature=city,settlement`,
      { signal: AbortSignal.timeout(8000) }
    )
    if (!res.ok) return null
    const data = await res.json()
    const r = data.results?.[0]
    if (!r) return null
    return { lat: r.latitude, lng: r.longitude, name: r.name, country: r.country || '', admin1: r.admin1 }
  } catch { return null }
}

// ── Haversine ─────────────────────────────────────────────────────────────────
function haversineMi(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3958.8
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// ── Find Nearby Cities via Open-Meteo ───────────────────────────────────────
async function findNearbyCities(lat: number, lng: number, originalCity: string): Promise<Array<{ name: string; country: string; admin1?: string; lat: number; lng: number; distMi: number }>> {
  try {
    const res = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?latitude=${lat}&longitude=${lng}&count=20&language=en&feature=city,settlement,airport`,
      { signal: AbortSignal.timeout(8000) }
    )
    if (!res.ok) return []
    const data = await res.json()
    const results: Array<{ name: string; country: string; admin1?: string; lat: number; lng: number; distMi: number }> = []

    for (const r of (data.results || [])) {
      const dist = haversineMi(lat, lng, r.latitude, r.longitude)
      if (dist > 0 && dist < 70 && r.feature_code !== 'AIRPORT') {
        const nameLower = (r.name || '').toLowerCase()
        const origLower = originalCity.toLowerCase()
        if (nameLower !== origLower && !nameLower.includes(origLower) && !origLower.includes(nameLower)) {
          results.push({ name: r.name, country: r.country || '', admin1: r.admin1, lat: r.latitude, lng: r.longitude, distMi: Math.round(dist * 10) / 10 })
        }
      }
    }
    results.sort((a, b) => a.distMi - b.distMi)
    return results.slice(0, 10)
  } catch { return [] }
}

// ── Count Recreation.gov Parks for a city using LAT/LNG + radius (P1+P3) ──────
async function countRecGovParks(lat: number, lng: number, cityName: string): Promise<{ count: number; totalResults: number }> {
  try {
    const url = `https://www.recreation.gov/api/search?q=campground&latitude=${lat}&longitude=${lng}&radius=50&activity=CAMPING&rows=20&extended=true`
    const res = await fetch(url, {
      headers: { 'User-Agent': 'EaglesNest/1.0', Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return { count: 0, totalResults: 0 }
    const data = await res.json()
    const totalResults = data?.meta?.totalResults ?? (data.results || []).length
    // Filter to actual campground results (exclude lodging, day-use areas)
    const campCount = (data.results || []).filter((item: any) => {
      const title = (item.title || '').toLowerCase()
      const activities = ((item.activities || []) as string[]).join(' ').toLowerCase()
      const campKeywords = ['camp', 'rv', 'camping', 'trailer', 'cabin', 'tent']
      return campKeywords.some(k => title.includes(k) || activities.includes(k))
    }).length
    return { count: campCount, totalResults }
  } catch { return { count: 0, totalResults: 0 } }
}

// ── Count NPS Campgrounds (P4) ───────────────────────────────────────────────
async function countNPSParks(lat: number, lng: number): Promise<number> {
  const apiKey = process.env.NPS_API_KEY
  if (!apiKey) return -1 // -1 = not configured, should not show as 0
  try {
    const url = `https://developer.nps.gov/api/v1/campgrounds?limit=50&lat=${lat}&lng=${lng}&radius=50&api_key=${apiKey}`
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
    if (!res.ok) return 0
    const data = await res.json()
    return data?.data?.length ?? 0
  } catch { return 0 }
}

// ── Static KOA check (P4) ────────────────────────────────────────────────────
async function countKOAParks(lat: number, lng: number): Promise<number> {
  if (!KOA_CAMPSITES?.length) return 0
  let nearby = 0
  for (const k of KOA_CAMPSITES) {
    if (haversineMi(lat, lng, k.lat, k.lng) <= 30) nearby++
  }
  return nearby
}

// ── Format city display name ─────────────────────────────────────────────────
function formatCityName(city: { name: string; country: string; admin1?: string }): string {
  const parts = [city.name, city.admin1, city.country].filter(Boolean)
  return [...new Set(parts)].join(', ')
}

// ── Main GET ─────────────────────────────────────────────────────────────────
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const city = searchParams.get('city') || ''
  const radiusMiles = parseInt(searchParams.get('radius') || '50')

  if (!city || city.length > 200) {
    return NextResponse.json({ error: 'Missing city parameter.' }, { status: 400 })
  }

  const citySanitized = city.replace(/[^a-zA-Z0-9\s\-\.,']/g, '').trim()

  // Step 1: Geocode
  const geo = await geocodeCity(citySanitized)
  if (!geo) return NextResponse.json({ nearbyCities: [], totalResults: 0 })

  // Step 1b: Get total for original city (P3)
  const origCounts = await countRecGovParks(geo.lat, geo.lng, citySanitized)
  const npsOrig = await countNPSParks(geo.lat, geo.lng)
  const koaOrig = await countKOAParks(geo.lat, geo.lng)
  const origTotal = origCounts.totalResults + (npsOrig >= 0 ? npsOrig : 0) + (koaOrig > 0 ? koaOrig : 0)

  // Step 2: Find nearby cities
  const candidates = await findNearbyCities(geo.lat, geo.lng, citySanitized)

  // Step 3: Check each nearby city in parallel (rows=20, location-based)
  const topCandidates = candidates.slice(0, 8)
  const withCounts = await Promise.all(
    topCandidates.map(async (c) => {
      const displayName = formatCityName(c)
      const [recGov, nps, koa] = await Promise.all([
        countRecGovParks(c.lat, c.lng, c.name),
        countNPSParks(c.lat, c.lng),
        countKOAParks(c.lat, c.lng),
      ])
      const recCount = recGov.count + recGov.totalResults
      const npsCount = nps >= 0 ? nps : null  // null = NPS not configured
      const koaCount = koa > 0 ? koa : null
      return { displayName, distMi: c.distMi, recCount, npsCount, koaCount }
    })
  )

  // Filter to cities with >= 1 park (Rec.gov text results), sort by rec count desc then distance
  const nearbyCities = withCounts
    .filter(c => c.recCount > 0 || c.npsCount === 0 || c.koaCount === 0)
    .sort((a, b) => b.recCount - a.recCount || a.distMi - b.distMi)
    .slice(0, 6)
    .map(c => {
      const parts = []
      if (c.recCount > 0) parts.push(`${c.recCount} Rec.gov parks`)
      if (c.npsCount !== null && c.npsCount > 0) parts.push(`${c.npsCount} NPS campgrounds`)
      if (c.koaCount !== null && c.koaCount > 0) parts.push(`${c.koaCount} KOA sites`)
      const detail = parts.length > 1 ? parts.join(' + ') : parts[0] || '0 parks'
      return `${c.displayName} · ${detail} · ${c.distMi}mi`
    })

  return NextResponse.json({
    nearbyCities,
    originalTotal: origTotal,
    originalCity: geo.name,
  })
}