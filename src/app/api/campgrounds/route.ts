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
    officialUrl?: string; bookingType?: string
  }
  nps?: {
    parkName: string; url: string; description: string
    entranceFees: string; contactPhone: string
  }
}

import { createRequire } from 'module'
const _require = createRequire(import.meta.url)

// ── Ookla Cell Coverage Lookup ────────────────────────────────────────────────
// 2,669 US cells, real RVer speedtests from Ookla Open Data
type OoklaCell = { d: number; u: number; lat: number; tier: number; tests: number; n: number; lat_qk: number; lon_qk: number }

// Ookla cells — lazy-loaded on first cell signal lookup (316KB saved from cold-start bundle)
let _ooklaCache: Record<string, OoklaCell> | null = null
async function getOoklaCells(): Promise<Record<string, OoklaCell>> {
  if (_ooklaCache) return _ooklaCache
  try {
    const mod = _require('@/lib/ookla_us_cells.json') as { default?: Record<string, OoklaCell> } & Record<string, OoklaCell>
    _ooklaCache = (mod && 'default' in mod && mod.default) ? mod.default : mod
  } catch {
    _ooklaCache = {}
  }
  return _ooklaCache
}

const NPS_FETCH_TIMEOUT = 8000 // ms

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
  // ── Source 1: Ookla speedtest data (real RVer measurements) — lazy-loaded on first use ──
  try {
    const cache = await getOoklaCells()
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


// ── NPS Campground Search ──────────────────────────────────────────────────────
type NPSCampground = {
  name: string; parkName: string; url: string
  lat?: number; lng?: number; description: string
  entranceFees: string; contactPhone: string
  amenities: string[]; bigRigScore: number; bigRigNotes: string[]
}

function mapNPSCampground(camp: Record<string, unknown>): NPSCampground {
  const name = String(camp.name || '')
  const parkName = String(camp.parkName || '')
  const url = String(camp.url || '')
  const description = String(camp.description || '').replace(/<[^>]+>/g, '').substring(0, 200)
  const entranceFees = Array.isArray(camp.entranceFees)
    ? (camp.entranceFees as Array<{ title: string; cost: string }>).map(f => `${f.title}: ${f.cost}`).join(', ')
    : String(camp.entranceFee || '')
  const contacts = camp.contacts as Record<string, unknown> | undefined
  const phoneNumbers = contacts?.phoneNumbers as Array<{ type: string; phoneNumber: string }> | undefined
  const contactPhone = Array.isArray(phoneNumbers) ? phoneNumbers[0]?.phoneNumber || '' : ''
  const amenities = camp.amenities as Record<string, unknown> | undefined
  const amenityList = amenities
    ? [...((amenities.recreationAreas as string[]) || []), ...((amenities.amenities as string[]) || [])].filter(Boolean)
    : []
  const ada = camp.accessibleProgram === 'Yes' ? 1.5 : 0
  const hasElectric = amenityList.some(a => /electric|hookup/i.test(a)) ? 1.0 : 0
  const hasWater = amenityList.some(a => /water|sewer|dump/i.test(a)) ? 0.5 : 0
  const isReservable = camp.reservationUrl ? 1.0 : 0
  const hasParking = camp.parkingApplies || camp.parkingFee !== undefined ? 0.5 : 0
  const bigRigScore = Math.round(Math.min(5, Math.max(1, ada + hasElectric + hasWater + isReservable + hasParking)) * 10) / 10
  const bigRigNotes: string[] = []
  if (ada >= 1.5) bigRigNotes.push('ADA accessible')
  if (hasElectric >= 1.0) bigRigNotes.push('Electrical hookups')
  if (hasWater >= 0.5) bigRigNotes.push('Water/sewer hookups')
  if (isReservable >= 1.0) bigRigNotes.push('Reservable')
  if (parkName) bigRigNotes.push(`Part of ${parkName}`)
  return {
    name: name.replace(parkName, '').trim() || parkName,
    parkName, url,
    lat: camp.latitude as number, lng: camp.longitude as number,
    description, entranceFees, contactPhone,
    amenities: amenityList.slice(0, 8), bigRigScore, bigRigNotes,
  }
}

async function fetchNPSCampgrounds(city: string): Promise<CampgroundResult[]> {
  const apiKey = process.env.NPS_API_KEY
  if (!apiKey) return []
  let lat: number, lng: number, cityName: string
  try {
    const geoRes = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=en&feature=city,settlement`,
      { signal: AbortSignal.timeout(NPS_FETCH_TIMEOUT) }
    )
    if (!geoRes.ok) return []
    const geoData = await geoRes.json()
    const first = geoData.results?.[0]
    if (!first) return []
    lat = first.latitude; lng = first.longitude; cityName = first.name || city
  } catch { return [] }

  try {
    // NPS lat/lng filter for campgrounds is confirmed broken — work around by
    // first finding nearby parks, then fetching campgrounds per parkCode.
    const parksUrl = `https://developer.nps.gov/api/v1/parks?limit=5&lat=${lat}&lng=${lng}&radius=60&api_key=${apiKey}&q=national+park`
    const parksRes = await fetch(parksUrl, { signal: AbortSignal.timeout(NPS_FETCH_TIMEOUT) })
    if (!parksRes.ok) return []
    const parksData = await parksRes.json()
    const parks = (parksData.data || []) as Array<{
      fullName: string; parkCode: string; latitude: number; longitude: number
      designation: string; url: string; description: string
    }>
    if (parks.length === 0) return []

    // Fetch campgrounds for top 3 nearest parks
    const campResults = await Promise.all(
      parks.slice(0, 3).map(p =>
        fetch(`https://developer.nps.gov/api/v1/campgrounds?parkCode=${p.parkCode}&limit=8&api_key=${apiKey}`, { signal: AbortSignal.timeout(NPS_FETCH_TIMEOUT) })
          .then(r => r.ok ? r.json().catch(() => null) : null)
          .then(d => {
            if (!d) return []
            return (d.data || []) as Record<string, unknown>[]
          })
          .catch(() => [] as Record<string, unknown>[])
      )
    )

    const allCamps = campResults.flat()
    if (allCamps.length === 0) return []

    return allCamps.slice(0, 8).map(camp => {
      const entranceFees = Array.isArray(camp.fees)
        ? (camp.fees as Array<{ title: string; cost: string }>).map(f => `${f.title}: ${f.cost}`).join(', ')
        : String(camp.entranceFee || '')
      const contacts = (camp.contacts as Record<string, unknown> | undefined)
      const phoneNumbers = contacts?.phoneNumbers as Array<{ phoneNumber: string }> | undefined
      const contactPhone = Array.isArray(phoneNumbers) ? phoneNumbers[0]?.phoneNumber || '' : ''
      const amenities = camp.amenities as Record<string, unknown> | undefined
      const amenityList = amenities
        ? [...((amenities.recreationAreas as string[]) || []), ...((amenities.amenities as string[]) || [])].filter(Boolean)
        : []
      const isReservable = Boolean(camp.reservationUrl)
      const bigRigScore = Math.round(Math.min(5, Math.max(1, (isReservable ? 1.5 : 0) + 1.0)) * 10) / 10

      // Find which park this camp belongs to
      const campLat = camp.latitude as number
      const campLng = camp.longitude as number
      const nearestPark = parks.reduce((best, p) => {
        const d = Math.sqrt((p.latitude - campLat) ** 2 + (p.longitude - campLng) ** 2)
        return d < best.dist ? { park: p, dist: d } : best
      }, { park: parks[0], dist: 9999 }).park

      return {
        name: String(camp.name || ''),
        rating: null,
        price: entranceFees || null,
        amenities: amenityList.slice(0, 8),
        photoUrl: null,
        bookingUrl: (camp.reservationUrl as string) || (camp.url as string) || null,
        mapUrl: campLat ? `https://www.google.com/maps/search/?api=1&query=${campLat},${campLng}` : null,
        lat: campLat, lng: campLng,
        vacancyStatus: 'unknown' as const,
        vacancyNote: 'Check NPS website for availability',
        bigRigScore,
        bigRigNotes: ['NPS Campground', ...(isReservable ? ['Reservable'] : []), `Part of ${nearestPark.fullName}`],
        nps: {
          parkName: nearestPark.fullName,
          url: (camp.url as string) || nearestPark.url || 'https://www.nps.gov',
          description: String(camp.description || '').replace(/<[^>]+>/g, '').substring(0, 200),
          entranceFees,
          contactPhone,
        },
      } satisfies CampgroundResult
    })
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


// ── Campendium Campground Search ───────────────────────────────────────────
async function fetchCampendiumCampgrounds(city: string): Promise<CampgroundResult[]> {
  const cleanCity = city.replace(/,/g, '').trim()
  const queryVariants = [
    cleanCity + ' campground',
    cleanCity + ' rv park',
    cleanCity.split(' ')[0] + ' campground',
  ]

  let allResults: any[] = []

  for (const query of queryVariants) {
    try {
      const res = await fetch(
        `https://www.campendium.com/search.json?q=${encodeURIComponent(query)}`,
        { headers: { 'User-Agent': 'EaglesNest/1.0', Accept: 'application/json' }, signal: AbortSignal.timeout(6000) }
      )
      if (!res.ok) continue
      const data = await res.json()
      const results = data?.[0]?.results || []
      for (const r of results) {
        if (r.type === 'campground' && !allResults.some(a => a.url === r.url)) {
          allResults.push(r)
        }
      }
    } catch { continue }
    if (allResults.length > 0) break
  }

  // Fallback: scrape city directory page for private RV parks
  if (allResults.length === 0) {
    const cityUrls = await scrapeCampendiumCityPage(cleanCity)
    if (cityUrls.length > 0) {
      const detailResults = await Promise.all(cityUrls.slice(0, 6).map(async (campUrl) => {
        try {
          const slug = campUrl.replace('https://www.campendium.com/', '')
          const detailRes = await fetch('https://www.campendium.com/' + slug, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36', Accept: 'text/html' },
            signal: AbortSignal.timeout(8000),
          })
          if (!detailRes.ok) return null
          const html = await detailRes.text()
          const ratingMatch = html.match(/content=["']([\d.]+)["'][^>]*itemprop=["']ratingvalue["']/i)
                            || html.match(/itemprop=["']ratingvalue["'][^>]*content=["']([\d.]+)["']/i)
          const reviewCountMatch = html.match(/content=["']([\d]+)["'][^>]*itemprop=["']reviewCount["']/i)
                                || html.match(/itemprop=["']reviewCount["'][^>]*content=["']([\d]+)["']/i)
          const rating = ratingMatch ? parseFloat(ratingMatch[1]) : null
          const reviewCount = reviewCountMatch ? parseInt(reviewCountMatch[1]) : 0
          const pullThrough = /pull[\s-]?through/i.test(html)
          const levelSites = /level\s*(?:sites?|pads?|spots?)/i.test(html)
          const officialUrlMatch = html.match(/id=["']official-website-link["'][^>]+href=["']([^"']+)["']/i)
                                 || html.match(/href=["'](https?:\/\/[^"']+)["'][^>]+id=["']official-website-link["']/i)
          const officialUrl = officialUrlMatch ? officialUrlMatch[1] : undefined
          let bookingType: string | undefined
          const _propRe = new RegExp('window\\.placeDiscoveryProperties\\s*=\s*JSON\\.parse\\(`([^`]+)`\\)')
          const _propMatch = _propRe.exec(html)
          if (_propMatch) { try { bookingType = JSON.parse(_propMatch[1]).booking_type } catch { /* ignore */ } }
          const priceTierMatch = html.match(/place_price_tier["']:\s*["']([^"']+)["']/i)
          const priceMap: Record<string, string> = { '$': 'Under $30', '$$': '$30-$60', '$$$': '$60-$100', '$$$$': '$100+' }
          const price = priceTierMatch ? priceMap[priceTierMatch[1]] || priceTierMatch[1] : null
          let lat: number | undefined, lng: number | undefined
          const latMatch = html.match(/lat["']:\s*([\d.-]+)/i)
          const lngMatch = html.match(/lng["']:\s*([\d.-]+)/i)
          if (latMatch && lngMatch) { lat = parseFloat(latMatch[1]); lng = parseFloat(lngMatch[1]) }
          const nameMatch = html.match(/<title>([^<]+)<\/title>/i)
          const name = nameMatch ? nameMatch[1].replace(/[_-]/g, ' ').trim() : slug.replace(/-/g, ' ')
          return {
            name, rating, price, amenities: [], photoUrl: null,
            bookingUrl: officialUrl || undefined,
            mapUrl: lat && lng ? 'https://www.google.com/maps/search/?api=1&query=' + lat + ',' + lng : null,
            lat, lng,
            vacancyStatus: 'unknown' as const, vacancyNote: '',
            bigRigScore: 3.0, bigRigNotes: [],
            campendium: { url: campUrl, reviewCount, summary: '', cellRating: '', pullThrough, levelSites, officialUrl, bookingType },
          }
        } catch { return null }
      }))
      return detailResults.filter(Boolean) as CampgroundResult[]
    }
    return []
  }

  const limited = allResults.slice(0, 6)
  const enriched = await Promise.all(limited.map(async (r) => {
    try {
      const slug = r.url.replace('https://www.campendium.com/', '').replace(/^\//, '')
      const detailRes = await fetch(`https://www.campendium.com/${slug}`, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36', Accept: 'text/html' },
        signal: AbortSignal.timeout(8000),
      })
      if (!detailRes.ok) return null
      const html = await detailRes.text()

      const ratingMatch = html.match(/content=["']([\d.]+)["'][^>]*itemprop=["']ratingvalue["']/i)
                        || html.match(/itemprop=["']ratingvalue["'][^>]*content=["']([\d.]+)["']/i)
      const reviewCountMatch = html.match(/content=["']([\d]+)["'][^>]*itemprop=["']reviewCount["']/i)
                            || html.match(/itemprop=["']reviewCount["'][^>]*content=["']([\d]+)["']/i)
      const rating = ratingMatch ? parseFloat(ratingMatch[1]) : null
      const reviewCount = reviewCountMatch ? parseInt(reviewCountMatch[1]) : 0

      const pullThrough = /pull[\\s-]?through/i.test(html)
      const levelSites = /level\\s*(?:sites?|pads?|spots?)/i.test(html)

      // Extract official website link
      const officialUrlMatch = html.match(/id=["']official-website-link["'][^>]+href=["']([^"']+)["']/i)
                             || html.match(/href=["'](https?:\/\/[^"']+)["'][^>]+id=["']official-website-link["']/i)
      const officialUrl = officialUrlMatch ? officialUrlMatch[1] : undefined

      // Extract booking_type from placeDiscoveryProperties JSON blob
      let bookingType: string | undefined
      const propMatch = html.match(/window\\.placeDiscoveryProperties\\s*=\s*JSON\\.parse\\(`([^`]+)`)/)
      if (propMatch) {
        try { bookingType = JSON.parse(propMatch[1]).booking_type } catch { /* ignore */ }
      }

      const priceTierMatch = html.match(/place_price_tier["']:\\s*["']([^"']+)["']/i)
      const priceMap: Record<string, string> = { '$': 'Under $30', '$$': '$30-$60', '$$$': '$60-$100', '$$$$': '$100+' }
      const price = priceTierMatch ? priceMap[priceTierMatch[1]] || priceTierMatch[1] : null

      let lat: number | undefined, lng: number | undefined
      const latMatch = html.match(/lat["']:\\s*([\d.-]+)/i)
      const lngMatch = html.match(/lng["']:\\s*([\d.-]+)/i)
      if (latMatch && lngMatch) {
        lat = parseFloat(latMatch[1]); lng = parseFloat(lngMatch[1])
      }

      return {
        name: r.title.split(' - ')[0].trim(),
        rating,
        price,
        amenities: [],
        photoUrl: null,
        bookingUrl: officialUrl || undefined,
        mapUrl: lat && lng ? `https://www.google.com/maps/search/?api=1&query=${lat},${lng}` : null,
        lat,
        lng,
        vacancyStatus: 'unknown' as const,
        vacancyNote: '',
        bigRigScore: 3.0,
        bigRigNotes: [],
        campendium: {
          url: r.url,
          reviewCount,
          summary: '',
          cellRating: '',
          pullThrough,
          levelSites,
          officialUrl,
          bookingType,
        },
      }
    } catch { return null }
  }))

  return enriched.filter(Boolean) as CampgroundResult[]
}


// ── Campendium City Page Scraper (private parks directory) ──────────────────
async function scrapeCampendiumCityPage(city: string): Promise<string[]> {
  try {
    const STATE_MAP: Record<string, string> = {
      'portland': 'oregon', 'mt hood': 'oregon', 'sandy': 'oregon', 'bend': 'oregon',
      'eugene': 'oregon', 'ashland': 'oregon', 'medford': 'oregon',
      'seattle': 'washington', 'tacoma': 'washington', 'olympic': 'washington',
      'vancouver': 'washington', 'olympia': 'washington', 'spokane': 'washington',
      'redmond': 'oregon', 'sisters': 'oregon',
      'las vegas': 'nevada', 'reno': 'nevada',
      'phoenix': 'arizona', 'tucson': 'arizona', 'flagstaff': 'arizona',
      'salt lake city': 'utah', 'zion': 'utah',
      'denver': 'colorado', 'colorado springs': 'colorado',
    }
    const cityLower = city.toLowerCase()
    let state = 'oregon'
    for (const [key, val] of Object.entries(STATE_MAP)) {
      if (cityLower.includes(key)) { state = val; break }
    }
    const citySlug = cityLower.split(' ')[0].replace(/[^a-z0-9]/g, '-')
    const url = 'https://www.campendium.com/' + state + '/' + citySlug
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36', Accept: 'text/html' },
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return []
    const html = await res.text()
    const matches = html.match(/\/campgrounds\/[a-z0-9-]+/gi) || []
    const unique = [...new Set(matches.map(u => 'https://www.campendium.com' + u))]
    return unique.slice(0, 12)
  } catch { return [] }
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

    const reviewMatch = detailHtml.match(/(\d+)\\s*reviews?/i)
    const reviewCount = reviewMatch ? parseInt(reviewMatch[1]) : 0
    const cellMatch = detailHtml.match(/cell(?:ular)?\\s*(?:signal)?[:\\s]*(\d(?:\/\d)?(?:\/5)?)/i)
    const cellRating = cellMatch ? cellMatch[1] : ''
    const pullThrough = /pull[\\s-]?through/i.test(detailHtml)
    const levelSites = /level\\s*(?:sites?|pads?|spots?)/i.test(detailHtml)
    const snippetMatch = detailHtml.match(/<p[^>]*>([^<]{50,200})<\/p>/)
    const summary = snippetMatch ? snippetMatch[1].replace(/<[^>]+>/g, '').trim() : ''

    // Extract official website link
    const officialUrlMatch = detailHtml.match(/id=["']official-website-link["'][^>]+href=["']([^"']+)["']/i)
                           || detailHtml.match(/href=["'](https?:\/\/[^"']+)["'][^>]+id=["']official-website-link["']/i)
    const officialUrl = officialUrlMatch ? officialUrlMatch[1] : undefined

    // Extract booking_type from placeDiscoveryProperties
    let bookingType: string | undefined
    const propMatch = detailHtml.match(/window\\.placeDiscoveryProperties\\s*=\s*JSON\\.parse\\(`([^`]+)`)/)
    if (propMatch) {
      try { bookingType = JSON.parse(propMatch[1]).booking_type } catch { /* ignore */ }
    }

    const result: CampgroundResult['campendium'] = {
      url: `https://www.campendium.com${slugMatch[0]}`,
      reviewCount, summary: summary.substring(0, 200), cellRating, pullThrough, levelSites,
      officialUrl, bookingType,
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

  // Filter + sort params
  const minBigRigScore = parseFloat(searchParams.get('minBigRigScore') || '1')
  const minCellSignal = searchParams.get('minCellSignal') || 'any'
  const pullThrough = searchParams.get('pullThrough') === 'true'
  const levelSites = searchParams.get('levelSites') === 'true'
  const sortBy = searchParams.get('sortBy') || 'bigRigScore'

  if (!city || city.length > 200) return NextResponse.json({ error: 'Missing city parameter.' }, { status: 400 })
  const citySanitized = city.replace(/[^a-zA-Z0-9\\s\-\\.,']/g, '').trim()

  // Fetch from Recreation.gov + Campendium in parallel
  const [recreationResults, campendiumResults, npsResults]: [CampgroundResult[], CampgroundResult[], CampgroundResult[]] = await Promise.all([
    fetchRecreationGov(citySanitized),
    fetchCampendiumCampgrounds(citySanitized),
    fetchNPSCampgrounds(citySanitized),
  ])

  // Merge and deduplicate
  const seen = new Set<string>()
  let allResults: CampgroundResult[] = []
  for (const r of [...recreationResults, ...campendiumResults]) {
    const key = r.name.toLowerCase().replace(/\\s+/g, '')
    if (!seen.has(key)) { seen.add(key); allResults.push(r) }
  }

  // ── Try Nearby Cities ─────────────────────────────────────────────────────────
  let nearbyCities: string[] = []
  if (allResults.length < 3) {
    try {
      const ncRes = await fetch(
        `${request.nextUrl.origin}/api/nearby-cities?city=${encodeURIComponent(citySanitized)}`,
        { headers: { 'User-Agent': 'EaglesNest/1.0' }, signal: AbortSignal.timeout(12000) }
      )
      if (ncRes.ok) {
        const ncData = await ncRes.json()
        nearbyCities = ncData.nearbyCities || []
      }
    } catch {
      // nearby cities are optional — don't break campground search
    }
  }

  if (bigRigOnly) allResults = allResults.filter(r => r.bigRigScore >= 3.0)

  // Apply client filters
  if (minBigRigScore > 1) allResults = allResults.filter(r => r.bigRigScore >= minBigRigScore)
  if (pullThrough) allResults = allResults.filter(r => r.campendium?.pullThrough)
  if (levelSites) allResults = allResults.filter(r => r.campendium?.levelSites)

  if (enrich) {
    const apiKey = process.env.GOOGLE_PLACES_API_KEY
    if (apiKey) {
      // Enrich ALL results in parallel batches of 6
      const chunkSize = 6
      const chunks: CampgroundResult[][] = []
      for (let i = 0; i < allResults.length; i += chunkSize) {
        chunks.push(allResults.slice(i, i + chunkSize))
      }
      const enrichedChunks = await Promise.all(
        chunks.map(chunk =>
          Promise.all(chunk.map(async (camp) => {
            if (camp.lat != null && camp.lng != null) {
              try {
                const [services, cellSignal]: [Record<string, unknown>, CampgroundResult['cellSignal']] = await Promise.all([
                  fetchNearbyServices(camp.lat, camp.lng, apiKey),
                  fetchCellSignal(camp.lat, camp.lng),
                ])
                const campendium = await fetchCampendiumReview(camp.name)
                return { ...camp, nearestServices: services, cellSignal, campendium }
              } catch { return camp }
            }
            return camp
          }))
        )
      )
      allResults = enrichedChunks.flat()

      // Apply cell signal filter after enrichment
      if (minCellSignal !== 'any') {
        const signalOrder = ['poor', 'fair', 'good', 'excellent']
        const minIdx = signalOrder.indexOf(minCellSignal)
        if (minIdx >= 0) {
          allResults = allResults.filter(r => {
            const score = r.cellSignal?.score || 'unknown'
            if (score === 'unknown') return true
            return signalOrder.indexOf(score) >= minIdx
          })
        }
      }
    }
  }

  // Sort
  const cellSignalOrder: Record<string, number> = { excellent: 4, good: 3, fair: 2, poor: 1, unknown: 0 }
  allResults.sort((a, b) => {
    if (sortBy === 'cellSignal') return (cellSignalOrder[b.cellSignal?.score || 'unknown'] || 0) - (cellSignalOrder[a.cellSignal?.score || 'unknown'] || 0)
    if (sortBy === 'rating') return (b.rating || 0) - (a.rating || 0)
    if (sortBy === 'price') {
      const priceA = a.price ? parseFloat(a.price.replace(/[^0-9.]/g, '')) : 999
      const priceB = b.price ? parseFloat(b.price.replace(/[^0-9.]/g, '')) : 999
      return priceA - priceB
    }
    return (b.bigRigScore || 0) - (a.bigRigScore || 0)
  })

  const month = new Date().getMonth() + 1
  return NextResponse.json({
    results: allResults,
    city: citySanitized,
    vacancyRisk: month >= 6 && month <= 9 ? 'seasonal' : 'low',
    peakSeason: month >= 6 && month <= 9,
    bigRigFilter: bigRigOnly,
    nearbyCities: nearbyCities.length > 0 ? nearbyCities : undefined,
  })
}

// Debug endpoint
export async function HEAD(request: NextRequest) {
  return new Response(null, { status: 200 })
}
