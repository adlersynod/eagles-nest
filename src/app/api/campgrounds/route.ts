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
// ── Nearby Services ────────────────────────────────────────────────────────────
async function fetchNearbyServices(lat: number, lng: number, apiKey: string) {
  const results: Record<string, { name: string; distanceMi: number } | null> = {
    gasStation: null, groceryStore: null, dumpStation: null,
  }
  try {
    const searchTypes = [
      { query: 'gas station near 45.323,-121.905', key: 'gasStation' as const },
      { query: 'grocery store near 45.323,-121.905', key: 'groceryStore' as const },
      { query: 'campground near 45.323,-121.905', key: 'dumpStation' as const },
    ]
    for (let i = 0; i < searchTypes.length; i++) {
      const { query, key } = searchTypes[i]
      // Use Text Search — same API format that works in /api/search
      const fieldMask = 'places.displayName,places.location'
      const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': apiKey, 'X-Goog-FieldMask': fieldMask },
        body: JSON.stringify({
          textQuery: query,
          locationBias: { circle: { center: { latitude: lat, longitude: lng }, radius: 15000 } },
          languageCode: 'en',
          maxResultCount: 1,
        }),
        signal: AbortSignal.timeout(6000),
      })
      if (!res.ok) continue
      const data = await res.json()
      const places = data.places || []
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
// Proxies cell coverage using population density via Google Places cafe count.
// More cafes/restaurants nearby = higher population density = better cell coverage.
async function fetchCellSignal(lat: number, lng: number): Promise<CampgroundResult['cellSignal']> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY
  if (!apiKey) return { score: 'unknown', carriers: [], note: 'Cell signal data unavailable' }

  let statusCode = 0; let errMsg = 'unknown'
  try {
    const nearbyRes = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': apiKey, 'X-Goog-FieldMask': 'places.name' },
      body: JSON.stringify({
        textQuery: 'cafe restaurant',
        locationBias: { circle: { center: { latitude: lat, longitude: lng }, radius: 5000 } },
        languageCode: 'en',
        maxResultCount: 10,
      }),
      signal: AbortSignal.timeout(6000),
    })
    statusCode = nearbyRes.status
    if (!nearbyRes.ok) {
      errMsg = `http_${statusCode}`
      const txt = await nearbyRes.text().catch(() => '')
      errMsg += txt.substring(0, 80)
    } else {
      const data = await nearbyRes.json()
      const count = data.places?.length || 0
      if (count >= 8) return { score: 'excellent', carriers: [], note: `Likely excellent coverage (${count} nearby places)` }
      if (count >= 5) return { score: 'good', carriers: [], note: `Likely good coverage (${count} nearby places)` }
      if (count >= 2) return { score: 'fair', carriers: [], note: `Likely fair coverage (${count} nearby places — rural area)` }
      if (count === 1) return { score: 'poor', carriers: [], note: `Limited coverage (only ${count} place nearby — remote)` }
      return { score: 'poor', carriers: [], note: 'Very remote — cell coverage limited' }
    }
  } catch (e: unknown) {
    errMsg = `catch_${String(e).substring(0, 60)}`
  }
  return { score: 'unknown', carriers: [], note: errMsg }
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
  const debug = searchParams.get('debug') === '1'

  if (!city || city.length > 200) return NextResponse.json({ error: 'Missing city parameter.' }, { status: 400 })
  const citySanitized = city.replace(/[^a-zA-Z0-9\s\-\.,']/g, '').trim()
  let results = await fetchRecreationGov(citySanitized)
  if (bigRigOnly) results = results.filter(r => r.bigRigScore >= 3.0)

  const debugInfo: Record<string, string> = {}
  if (enrich) {
    const apiKey = process.env.GOOGLE_PLACES_API_KEY
    debugInfo['keyPrefix'] = apiKey ? apiKey.substring(0, 8) : 'MISSING'
    const enriched = await Promise.all(
      results.slice(0, 6).map(async (camp) => {
        if (camp.lat != null && camp.lng != null && apiKey) {
          const [services, cellSignal]: [Record<string, unknown>, CampgroundResult['cellSignal']] = await Promise.all([
            fetchNearbyServices(camp.lat, camp.lng, apiKey),
            fetchCellSignal(camp.lat, camp.lng),
          ])
          debugInfo[`${camp.name.substring(0, 15)}_cell`] = JSON.stringify(cellSignal)
          debugInfo[`${camp.name.substring(0, 15)}_svc`] = JSON.stringify(services)
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
    _debug: debugInfo,
  })
}
