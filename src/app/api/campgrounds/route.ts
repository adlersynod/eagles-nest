import { NextRequest, NextResponse } from 'next/server'

type CampgroundResult = {
  name: string
  rating: number | null
  price: string | null
  amenities: string[]
  photoUrl: string | null
  bookingUrl: string | null
  mapUrl: string | null
  lat?: number
  lng?: number
  vacancyStatus: 'available' | 'limited' | 'likely_full' | 'unknown'
  vacancyNote: string
  bigRigScore: number
  bigRigNotes: string[]
  nearestServices?: {
    gasStation?: string; gasDistanceMi?: number
    groceryStore?: string; groceryDistanceMi?: number
    dumpStation?: string; dumpDistanceMi?: number
  }
  cellSignal?: {
    score: 'excellent' | 'good' | 'fair' | 'poor' | 'unknown'
    carriers: string[]; note: string
  }
  campendium?: {
    url: string; reviewCount: number; summary: string
    cellRating: string; pullThrough: boolean; levelSites: boolean
  }
}

// ── Recreation.gov search ─────────────────────────────────────────────────────
async function fetchRecreationGov(city: string): Promise<CampgroundResult[]> {
  try {
    const res = await fetch(
      `https://www.recreation.gov/api/search?query=${encodeURIComponent(city)}%20campground&rows=8`,
      { headers: { 'User-Agent': 'EaglesNest/1.0', Accept: 'application/json' } }
    )
    if (!res.ok) return []
    const data = await res.json()
    const results: CampgroundResult[] = []

    for (const item of (data?.results || []).slice(0, 8)) {
      const title = (item?.title || item?.name || '').toLowerCase()
      const activities = (item?.activities || [])
        .map((a: { activity_name: string }) => a.activity_name.toLowerCase()).join(' ')
      const campKeywords = ['camp', 'rv', 'park', 'camping', 'trailer', 'cabin']
      if (!campKeywords.some(k => title.includes(k) || activities.includes(k))) continue

      const availCount = item?.accessible_campsites_count || 0
      let vacancyStatus: CampgroundResult['vacancyStatus'] = 'unknown'
      let vacancyNote = 'Check website for availability'
      if (typeof availCount === 'number') {
        if (availCount > 5) { vacancyStatus = 'available'; vacancyNote = `${availCount} sites available` }
        else if (availCount > 0) { vacancyStatus = 'limited'; vacancyNote = `Only ${availCount} sites left` }
        else { vacancyStatus = 'likely_full'; vacancyNote = 'Check for cancellations' }
      }

      const entityId = item?.entity_id || null
      const lat = item?.latitude
      const lng = item?.longitude
      const campName = item?.name || item?.title || ''
      const mapUrl = lat && lng
        ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(campName)}`
        : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(campName)}`

      // Big Rig Score
      const activityNames = (item?.activities || []).map((a: { activity_name: string }) => a.activity_name.toLowerCase())
      const priceRange = item?.price_range as { amount_max?: number } | null
      const maxPrice = priceRange?.amount_max || 0
      const priceScore = maxPrice >= 80 ? 2.5 : maxPrice >= 50 ? 1.5 : maxPrice >= 30 ? 0.5 : 0
      const rating = (item?.average_rating as number) || 0
      const ratingScore = rating >= 4.5 ? 1.5 : rating >= 4.0 ? 1.0 : rating >= 3.5 ? 0.5 : 0
      const amenityScore = Math.min(2, activityNames.length / 4)
      const bigRigScore = Math.round(Math.min(5, Math.max(1, priceScore + ratingScore + amenityScore)) * 10) / 10
      const bigRigNotes: string[] = []
      if (maxPrice >= 80) bigRigNotes.push('premium resort (full hookups likely)')
      else if (maxPrice >= 50) bigRigNotes.push('mid-range park (50-amp likely)')
      if (rating >= 4.0) bigRigNotes.push(`★ ${rating.toFixed(1)} rating`)
      if (amenityScore >= 1.5) bigRigNotes.push('rich amenities')
      if (bigRigScore >= 3.5) bigRigNotes.push('recommended for big rigs')
      else bigRigNotes.push("call ahead for 45'+ rigs")

      results.push({
        name: campName,
        rating,
        price: item?.price_range || null,
        amenities: (item?.activities || []).map((a: { activity_name: string }) => a.activity_name),
        photoUrl: (item?.preview_image_url as string) || null,
        bookingUrl: entityId ? `https://www.recreation.gov/campgroundDetails/${entityId}` : item?.url || null,
        mapUrl,
        lat: lat ?? undefined,
        lng: lng ?? undefined,
        vacancyStatus,
        vacancyNote,
        bigRigScore,
        bigRigNotes,
      })
    }
    return results
  } catch { return [] }
}

// ── Nearby Services ───────────────────────────────────────────────────────────
async function fetchNearbyServices(lat: number, lng: number, apiKey: string) {
  const radius = 15000
  const results: Record<string, { name: string; distanceMi: number } | null> = {
    gasStation: null, groceryStore: null, dumpStation: null,
  }
  try {
    const body = {
      locationBias: { circle: { center: { latitude: lat, longitude: lng }, radius } },
      languageCode: 'en', maxResultCount: 3,
    }
    const typeMap = [
      { type: 'gas_station', key: 'gasStation' as const },
      { type: 'supermarket', key: 'groceryStore' as const },
      { type: 'campground', key: 'dumpStation' as const },
    ]
    for (const { type, key } of typeMap) {
      const fieldMask = 'places.displayName,places.location'
      const res = await fetch('https://places.googleapis.com/v1/places:searchNearby', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': apiKey, 'X-Goog-FieldMask': fieldMask },
        body: JSON.stringify({ ...body, includedType: type }),
      })
      if (!res.ok) continue
      const data = await res.json()
      const places: Array<{ displayName?: { text: string }; name?: string; location?: { latitude: number; longitude: number } }> = data.places || []
      if (places.length > 0) {
        const top = places[0]
        const name = top.displayName?.text || top.name || ''
        const pLat = top.location?.latitude
        const pLng = top.location?.longitude
        const distMi = pLat && pLng ? Math.round(haversineMi(lat, lng, pLat, pLng) * 10) / 10 : null
        results[key] = { name, distanceMi: distMi || 0 }
      }
    }
  } catch { /* optional */ }
  return {
    gasStation: results.gasStation?.name || undefined,
    gasDistanceMi: results.gasStation?.distanceMi,
    groceryStore: results.groceryStore?.name || undefined,
    groceryDistanceMi: results.groceryStore?.distanceMi,
    dumpStation: results.dumpStation?.name || undefined,
    dumpDistanceMi: results.dumpStation?.distanceMi,
  }
}

// ── Cell Signal Estimate ──────────────────────────────────────────────────────
async function fetchCellSignal(lat: number, lng: number): Promise<CampgroundResult['cellSignal']> {
  const radius = 8000
  try {
    // Source 1: OSM Overpass — counts mapped cell/comm towers
    const overpassQuery = `data=[out:json][timeout:3];nwr["man_made"="tower"](around:${radius},${lat},${lng});out count;`
    let osmTowerCount = 0
    try {
      const overpassRes = await fetch('https://overpass-api.de/api/interpreter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ data: overpassQuery }),
        signal: AbortSignal.timeout(6000),
      })
      if (overpassRes.ok) {
        const overpassData = await overpassRes.json()
        const countObj = overpassData?.elements?.[0]
        osmTowerCount = countObj ? parseInt(countObj?.tags?.total || '0') : 0
      }
    } catch { /* OSM optional */ }

    // Source 2: Google Places cafe count as population density proxy
    const apiKey = process.env.GOOGLE_PLACES_API_KEY
    let placeCount = 0
    if (apiKey) {
      try {
        const nearbyRes = await fetch('https://places.googleapis.com/v1/places:searchNearby', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': apiKey, 'X-Goog-FieldMask': 'places.name' },
          body: JSON.stringify({
            locationBias: { circle: { center: { latitude: lat, longitude: lng }, radius: 5000 } },
            includedType: 'cafe', languageCode: 'en', maxResultCount: 5,
          }),
          signal: AbortSignal.timeout(5000),
        })
        if (nearbyRes.ok) {
          const nearbyData = await nearbyRes.json()
          placeCount = nearbyData.places?.length || 0
        }
      } catch { /* optional */ }
    }

    // Combine into coverage score
    const rawScore = osmTowerCount * 0.8 + placeCount * 0.4
    let score: 'excellent' | 'good' | 'fair' | 'poor' | 'unknown' = 'unknown'
    if (rawScore >= 4) score = 'excellent'
    else if (rawScore >= 2.5) score = 'good'
    else if (rawScore >= 1) score = 'fair'
    else if (rawScore > 0) score = 'poor'

    let note: string
    if (osmTowerCount > 0) {
      note = `~${osmTowerCount} tower${osmTowerCount !== 1 ? 's' : ''} mapped + ${placeCount} nearby places`
    } else if (placeCount > 0) {
      note = `${placeCount} nearby places — sparse coverage likely`
    } else {
      note = 'Remote area — cell coverage limited'
    }

    return { score, carriers: [], note }
  } catch {
    return { score: 'unknown', carriers: [], note: 'Cell signal data unavailable' }
  }
}

// ── Campendium Reviews ────────────────────────────────────────────────────────
const campendiumCache: Record<string, CampgroundResult['campendium']> = {}

async function fetchCampendiumReview(campName: string): Promise<CampgroundResult['campendium'] | undefined> {
  if (campendiumCache[campName]) return campendiumCache[campName]
  try {
    const res = await fetch(
      `https://www.campendium.com/search?q=${encodeURIComponent(campName)}`,
      { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; EaglesNestBot/1.0)', Accept: 'text/html' }, signal: AbortSignal.timeout(5000) }
    )
    if (!res.ok) return undefined
    const html = await res.text()
    const slugMatch = html.match(/\/campgrounds\/([a-z0-9-]+)/i)
    if (!slugMatch) return undefined

    const detailRes = await fetch(`https://www.campendium.com${slugMatch[0]}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; EaglesNestBot/1.0)', Accept: 'text/html' },
      signal: AbortSignal.timeout(5000),
    })
    if (!detailRes.ok) return undefined
    const detailHtml = await detailRes.text()

    const reviewMatch = detailHtml.match(/(\d+)\s*reviews?/i)
    const reviewCount = reviewMatch ? parseInt(reviewMatch[1]) : 0
    const cellMatch = detailHtml.match(/cell(?:ular)?\s*(?:signal)?[:\s]*(\d(?:\/\d)?(?:\/5)?)/i)
    const cellRating = cellMatch ? cellMatch[1] : ''
    const pullThrough = /pull[\s-]?through/i.test(detailHtml)
    const levelSites = /level\s*(?:sites?|pads?|spots?)/i.test(detailHtml)
    const snippetMatch = detailHtml.match(/<p[^>]*>([^<]{50,200})<\/p>/)
    const summary = snippetMatch ? snippetMatch[1].replace(/<[^>]+>/g, '').trim() : ''

    const result: CampgroundResult['campendium'] = {
      url: `https://www.campendium.com${slugMatch[0]}`,
      reviewCount, summary: summary.substring(0, 200), cellRating, pullThrough, levelSites,
    }
    campendiumCache[campName] = result
    return result
  } catch { return undefined }
}

// ── Haversine ────────────────────────────────────────────────────────────────
function haversineMi(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3958.8
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// ── GET ──────────────────────────────────────────────────────────────────────
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const city = searchParams.get('city')
  const bigRigOnly = searchParams.get('bigRig') === 'true'
  const enrich = searchParams.get('enrich') !== 'false'

  if (!city || city.length > 200) return NextResponse.json({ error: 'Missing city parameter.' }, { status: 400 })
  const citySanitized = city.replace(/[^a-zA-Z0-9\s\-\.,']/g, '').trim()
  let results = await fetchRecreationGov(citySanitized)
  if (bigRigOnly) results = results.filter(r => r.bigRigScore >= 3.0)

  if (enrich) {
    const apiKey = process.env.GOOGLE_PLACES_API_KEY
    const enriched = await Promise.all(
      results.slice(0, 6).map(async (camp) => {
        if (camp.lat != null && camp.lng != null) {
          const [services, cellSignal]: [Record<string, unknown>, CampgroundResult['cellSignal']] = await Promise.all([
            apiKey ? fetchNearbyServices(camp.lat, camp.lng, apiKey) : Promise.resolve({}),
            fetchCellSignal(camp.lat, camp.lng),
          ])
          const campendium = await fetchCampendiumReview(camp.name)
          return { ...camp, nearestServices: services, cellSignal, campendium }
        }
        return camp
      })
    )
    results = enriched
  }

  const month = new Date().getMonth() + 1
  return NextResponse.json({
    results, city: citySanitized,
    vacancyRisk: month >= 6 && month <= 9 ? 'seasonal' : 'low',
    peakSeason: month >= 6 && month <= 9,
    bigRigFilter: bigRigOnly,
  })
}
