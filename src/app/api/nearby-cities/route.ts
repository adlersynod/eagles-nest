import { NextRequest, NextResponse } from 'next/server'

// ── Open-Meteo Geocoding ─────────────────────────────────────────────────────
async function geocodeCity(city: string): Promise<{ lat: number; lng: number; name: string; country: string; admin1?: string } | null> {
  try {
    const res = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=en&feature=city,settlement`
    )
    if (!res.ok) return null
    const data = await res.json()
    const r = data.results?.[0]
    if (!r) return null
    return {
      lat: r.latitude,
      lng: r.longitude,
      name: r.name,
      country: r.country || '',
      admin1: r.admin1,
    }
  } catch {
    return null
  }
}

// ── Find Nearby Cities via Open-Meteo ───────────────────────────────────────
// Returns cities within ~50mi driving radius of the given lat/lng
async function findNearbyCities(lat: number, lng: number, originalCity: string): Promise<Array<{ name: string; country: string; admin1?: string; lat: number; lng: number; distMi: number }>> {
  try {
    // Reverse geocode: find cities/airports near this location
    const res = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?latitude=${lat}&longitude=${lng}&count=15&language=en&feature=city,settlement,airport`
    )
    if (!res.ok) return []
    const data = await res.json()

    // Haversine distance in miles
    const R = 3958.8
    const toRad = (d: number) => d * Math.PI / 180
    const results: Array<{ name: string; country: string; admin1?: string; lat: number; lng: number; distMi: number }> = []

    for (const r of (data.results || [])) {
      const dLat = (r.latitude - lat) * Math.PI / 180
      const dLon = (r.longitude - lng) * Math.PI / 180
      const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(lat * Math.PI / 180) * Math.cos(r.latitude * Math.PI / 180) * Math.sin(dLon / 2) ** 2
      const dist = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))

      // Filter: within ~55mi, exclude the original city, prefer cities
      if (dist > 0 && dist < 55 && r.feature_code !== 'AIRPORT') {
        const nameLower = (r.name || '').toLowerCase()
        const origLower = originalCity.toLowerCase()
        if (nameLower !== origLower && !nameLower.includes(origLower) && !origLower.includes(nameLower)) {
          results.push({
            name: r.name,
            country: r.country || '',
            admin1: r.admin1,
            lat: r.latitude,
            lng: r.longitude,
            distMi: Math.round(dist * 10) / 10,
          })
        }
      }
    }

    // Sort by distance, return top 10
    results.sort((a, b) => a.distMi - b.distMi)
    return results.slice(0, 10)
  } catch {
    return []
  }
}

// ── Count Recreation.gov Parks for a City ───────────────────────────────────
async function countParksForCity(cityName: string): Promise<number> {
  try {
    const res = await fetch(
      `https://www.recreation.gov/api/search?query=${encodeURIComponent(cityName)}%20campground&rows=3`,
      { headers: { 'User-Agent': 'EaglesNest/1.0', Accept: 'application/json' }, signal: AbortSignal.timeout(5000) }
    )
    if (!res.ok) return 0
    const data = await res.json()
    return (data.results || []).length
  } catch {
    return 0
  }
}

// ── Format city display name ─────────────────────────────────────────────────
function formatCityName(city: { name: string; country: string; admin1?: string }): string {
  const parts = [city.name, city.admin1, city.country].filter(Boolean)
  // Dedupe repeated admin1 in name
  const unique = [...new Set(parts)]
  return unique.join(', ')
}

// ── GET ──────────────────────────────────────────────────────────────────────
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const city = searchParams.get('city') || ''

  if (!city || city.length > 200) {
    return NextResponse.json({ error: 'Missing city parameter.' }, { status: 400 })
  }

  const citySanitized = city.replace(/[^a-zA-Z0-9\s\-\.,']/g, '').trim()

  // Step 1: Geocode the original city
  const geo = await geocodeCity(citySanitized)
  if (!geo) {
    return NextResponse.json({ nearbyCities: [] })
  }

  // Step 2: Find nearby cities using Open-Meteo reverse geocoding
  const candidates = await findNearbyCities(geo.lat, geo.lng, citySanitized)

  // Step 3: Check Recreation.gov for each nearby city (parallel, max 8)
  const topCandidates = candidates.slice(0, 8)
  const withCounts = await Promise.all(
    topCandidates.map(async (c) => {
      const displayName = formatCityName(c)
      const count = await countParksForCity(c.name + (c.admin1 ? `, ${c.admin1}` : ''))
      return { displayName, count, distMi: c.distMi }
    })
  )

  // Filter to only cities with at least 1 park, sort by count then distance
  const nearbyCities = withCounts
    .filter(c => c.count > 0)
    .sort((a, b) => b.count - a.count || a.distMi - b.distMi)
    .slice(0, 6)
    .map(c => `${c.displayName} (${c.count} park${c.count !== 1 ? 's' : ''})`)

  return NextResponse.json({ nearbyCities })
}
