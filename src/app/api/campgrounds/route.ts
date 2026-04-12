import { NextRequest, NextResponse } from 'next/server'
import ooklaUsCells from '@/lib/ookla_us_cells.json'

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

// ── Ookla Cell Coverage Lookup ────────────────────────────────────────────────
// Bundled from src/lib/ookla_us_cells.json — real speedtest data at zoom-9 (~5km cells)
// 2,669 US cells, real RVer speedtests from Ookla Open Data
type OoklaCell = { d: number; u: number; lat: number; tier: number; tests: number; n: number; lat_qk: number; lon_qk: number }
const OOKLA_CELLS = ooklaUsCells as Record<string, OoklaCell>

function latLonToQuadkey9(lat: number, lon: number): string {
  const z = 9, n = 2 ** z
  const x = Math.floor((lon + 180) / 360 * n)
  const y = Math.floor((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * n)
  const cx = Math.max(0, Math.min(n - 1, x))
  const cy = Math.max(0, Math.min(n - 1, y))
  let qk = ''
  for (let i = z; i > 0; i--) {
    let d = 0, m = 1 << (i - 1)
    if (cx & m) d += 1
    if (cy & m) d += 2
    qk += d
  }
  return qk
}

// ── Cell Signal Estimate (Ookla primary + Google Places fallback) ─────────────
async function fetchCellSignal(lat: number, lng: number): Promise<CampgroundResult['cellSignal']> {
  // ── Source 1: Ookla speedtest data (real RVer measurements) ──
  try {
    const cache = OOKLA_CELLS
    if (!cache || Object.keys(cache).length === 0) {
      console.error('[cell] OOKLA_CELLS empty, keys:', Object.keys(cache || {}).length)
    } else {
      const qk9 = latLonToQuadkey9(lat, lng)
      const cell = cache[qk9]
      if (cell && cell.tests > 0) {
        const score = cell.tier >= 5 ? 'excellent' : cell.tier >= 4 ? 'good' : cell.tier >= 3 ? 'fair' : 'poor'
        return {
          score, carriers: [],
          note: `Ookla: ${cell.d} Mbps down / ${cell.u} Mbps up, ${cell.lat}ms latency (${cell.tests} tests)`,
        }
      } else {
        console.error(`[cell] qk9=${qk9} lat=${lat} lng=${lng} cell=${JSON.stringify(cell)} cacheKeys=${Object.keys(cache).slice(0,3)}`)
      }
    }
  } catch (e: unknown) {
    console.error('[cell] Ookla error:', String(e))
  }

  // ── Source 2: Google Places density proxy (fallback) ──
  const apiKey = process.env.GOOGLE_PLACES_API_KEY
  if (!apiKey) return { score: 'unknown', carriers: [], note: 'No cell data available for this area' }
  try {
    const nearbyRes = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': apiKey, 'X-Goog-FieldMask': 'places.name' },
      body: JSON.stringify({
        textQuery: 'cafe restaurant',
        locationBias: { circle: { center: { latitude: lat, longitude: lng }, radius: 5000 } },
        languageCode: 'en', maxResultCount: 10,
      }),
      signal: AbortSignal.timeout(6000),
    })
    if (!nearbyRes.ok) return { score: 'unknown', carriers: [], note: 'Cell signal data unavailable' }
    const data = await nearbyRes.json()
    const count = data.places?.length || 0
    if (count >= 8) return { score: 'excellent', carriers: [], note: `Likely excellent coverage (${count} nearby places)` }
    if (count >= 5) return { score: 'good', carriers: [], note: `Likely good coverage (${count} nearby places)` }
    if (count >= 2) return { score: 'fair', carriers: [], note: `Likely fair coverage (${count} nearby places)` }
    return { score: 'poor', carriers: [], note: 'Remote — limited cell coverage' }
  } catch {
    return { score: 'unknown', carriers: [], note: 'Cell signal data unavailable' }
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

  if (enrich) {
    const apiKey = process.env.GOOGLE_PLACES_API_KEY
    if (apiKey) {
      results = await Promise.all(
        results.slice(0, 6).map(async (camp) => {
          if (camp.lat != null && camp.lng != null) {
            const [services, cellSignal]: [Record<string, unknown>, CampgroundResult['cellSignal']] = await Promise.all([
              fetchNearbyServices(camp.lat, camp.lng, apiKey),
              fetchCellSignal(camp.lat, camp.lng),
            ])
            const campendium = await fetchCampendiumReview(camp.name)
            return { ...camp, nearestServices: services, cellSignal, campendium }
          }
          return camp
        })
      )
    }
  }

  const month = new Date().getMonth() + 1
  return NextResponse.json({
    results, city: citySanitized,
    vacancyRisk: month >= 6 && month <= 9 ? 'seasonal' : 'low',
    peakSeason: month >= 6 && month <= 9,
    bigRigFilter: bigRigOnly,
  })
}

// Debug endpoint
export async function HEAD(request: NextRequest) {
  return new Response(null, { status: 200 })
}
