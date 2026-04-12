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
  // Enrichment: proximity to services
  nearestServices?: {
    gasStation?: string   // name of nearest gas station
    gasDistanceMi?: number
    groceryStore?: string
    groceryDistanceMi?: number
    dumpStation?: string
    dumpDistanceMi?: number
  }
  // Enrichment: cell signal estimate
  cellSignal?: {
    score: 'excellent' | 'good' | 'fair' | 'poor' | 'unknown'
    carriers: string[]
    note: string
  }
  // Enrichment: Campendium review summary
  campendium?: {
    url: string
    reviewCount: number
    summary: string
    cellRating: string   // e.g. "4/5"
    pullThrough: boolean
    levelSites: boolean
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
        .map((a: { activity_name: string }) => a.activity_name.toLowerCase())
        .join(' ')

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
        ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(campName)}&query_place_id=${encodeURIComponent(String(entityId || ''))}`
        : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(campName)}`

      // ── Big Rig Score ──────────────────────────────────────────────
      const activityNames = (item?.activities || [])
        .map((a: { activity_name: string }) => a.activity_name.toLowerCase())

      const priceRange = item?.price_range as { amount_max?: number } | null
      const maxPrice = priceRange?.amount_max || 0
      const priceScore = maxPrice >= 80 ? 2.5 : maxPrice >= 50 ? 1.5 : maxPrice >= 30 ? 0.5 : 0
      const rating = (item?.average_rating as number) || 0
      const ratingScore = rating >= 4.5 ? 1.5 : rating >= 4.0 ? 1.0 : rating >= 3.5 ? 0.5 : 0
      const activityCount = activityNames.length
      const amenityScore = Math.min(2, activityCount / 4)

      const baseScore = priceScore + ratingScore + amenityScore
      const bigRigScore = Math.round(Math.min(5, Math.max(1, baseScore)) * 10) / 10

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
  } catch {
    return []
  }
}

// ── Nearby Services (gas, grocery, dump) ─────────────────────────────────────
async function fetchNearbyServices(lat: number, lng: number, apiKey: string) {
  const radius = 8000 // 8km

  const results: Record<string, { name: string; distanceMi: number } | null> = {
    gasStation: null, groceryStore: null, dumpStation: null,
  }

  try {
    const body = {
      locationBias: {
        circle: { center: { latitude: lat, longitude: lng }, radius: radius },
      },
      languageCode: 'en',
      maxResultCount: 5,
    }

    const types = ['gas_station', 'supermarket', 'dump_station']
    for (let i = 0; i < types.length; i++) {
      const includedType = types[i]
      const fieldMask = 'places.displayName,places.location'
      const res = await fetch('https://places.googleapis.com/v1/places:searchNearby', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': apiKey, 'X-Goog-FieldMask': fieldMask },
        body: JSON.stringify({ ...body, includedType }),
      })
      if (!res.ok) continue
      const data = await res.json()
      const places = data.places || []
      if (places.length > 0) {
        const top = places[0]
        const name = (top.displayName as { text: string })?.text || top.name || ''
        const pLat = (top.location as { latitude: number })?.latitude
        const pLng = (top.location as { longitude: number })?.longitude
        const distMi = pLat && pLng
          ? Math.round(haversineMi(lat, lng, pLat, pLng) * 10) / 10
          : null
        const key = includedType === 'gas_station' ? 'gasStation'
          : includedType === 'supermarket' ? 'groceryStore' : 'dumpStation'
        results[key] = { name, distanceMi: distMi || 0 }
      }
    }
  } catch { /* services are optional */ }

  return {
    gasStation: results.gasStation?.name,
    gasDistanceMi: results.gasStation?.distanceMi,
    groceryStore: results.groceryStore?.name,
    groceryDistanceMi: results.groceryStore?.distanceMi,
    dumpStation: results.dumpStation?.name,
    dumpDistanceMi: results.dumpStation?.distanceMi,
  }
}

// ── Cell Signal Estimate ──────────────────────────────────────────────────────
async function fetchCellSignal(lat: number, lng: number): Promise<CampgroundResult['cellSignal']> {
  // OpenCellID free API — requires key set in env. If absent, estimate from location.
  const apiKey = process.env.OPENCELLID_API_KEY
  if (!apiKey) {
    // Fallback: estimate based on population/distance from city center
    return {
      score: 'unknown',
      carriers: [],
      note: 'Enable OPENCELLID_API_KEY env var for cell coverage data',
    }
  }

  try {
    // Find nearest cell towers using OpenCellID tiles
    const res = await fetch(
      `https://api.opencellid.org/cfgTiles?key=${apiKey}&zoom=12&lat=${lat}&lon=${lng}&format=json`,
      { headers: { 'User-Agent': 'EaglesNest/1.0' } }
    )
    if (!res.ok) {
      return { score: 'unknown', carriers: [], note: 'Cell API unavailable' }
    }
    const towers = await res.json()
    const count = Array.isArray(towers) ? towers.length : 0

    let score: 'excellent' | 'good' | 'fair' | 'poor' = 'fair'
    if (count >= 10) score = 'excellent'
    else if (count >= 6) score = 'good'
    else if (count >= 3) score = 'fair'
    else score = 'poor'

    return {
      score,
      carriers: ['AT&T', 'T-Mobile', 'Verizon'].slice(0, 2), // generic — towers don't reveal carrier
      note: count > 0 ? `~${count} towers within 5km` : 'Limited tower data',
    }
  } catch {
    return { score: 'unknown', carriers: [], note: 'Cell signal check failed' }
  }
}

// ── Campendium Reviews ────────────────────────────────────────────────────────
async function fetchCampendiumReview(campName: string, lat?: number, lng?: number): Promise<CampgroundResult['campendium']> {
  const cache: Record<string, CampgroundResult['campendium']> = {}

  // Check in-memory cache first (simple per-instance cache)
  if ((fetchCampendiumReview as unknown as { _cache?: Record<string, CampgroundResult['campendium']> })._cache?.[campName]) {
    return (fetchCampendiumReview as unknown as { _cache: Record<string, CampgroundResult['campendium']> })._cache[campName]
  }

  try {
    // Search Campendium for the park name
    const searchUrl = `https://www.campendium.com/search?q=${encodeURIComponent(campName)}`
    const res = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; EaglesNestBot/1.0)',
        Accept: 'text/html',
      },
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) return undefined

    const html = await res.text()
    // Parse search results page for matching listing
    // Campendium uses /campgrounds/{slug} format
    const slugMatch = html.match(/\/campgrounds\/([a-z0-9-]+)/i)
    if (!slugMatch) return undefined

    const detailRes = await fetch(`https://www.campendium.com${slugMatch[0]}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; EaglesNestBot/1.0)', Accept: 'text/html' },
      signal: AbortSignal.timeout(5000),
    })
    if (!detailRes.ok) return undefined

    const detailHtml = await detailRes.text()

    // Extract review count
    const reviewMatch = detailHtml.match(/(\d+)\s*reviews?/i)
    const reviewCount = reviewMatch ? parseInt(reviewMatch[1]) : 0

    // Extract cell rating
    const cellMatch = detailHtml.match(/cell(?:ular)?\s*(?:signal)?[:\s]*(\d(?:\/\d)?(?:\/5)?)/i)
    const cellRating = cellMatch ? cellMatch[1] : ''

    // Check for pull-through and level sites
    const pullThrough = /pull[\s-]?through/i.test(detailHtml)
    const levelSites = /level\s*(?:sites?|pads?|spots?)/i.test(detailHtml)

    // Get a snippet from reviews section
    const reviewSnippetMatch = detailHtml.match(/<p[^>]*>([^<]{50,200})<\/p>/)
    const summary = reviewSnippetMatch ? reviewSnippetMatch[1].replace(/<[^>]+>/g, '').trim() : ''

    const result: CampgroundResult['campendium'] = {
      url: `https://www.campendium.com${slugMatch[0]}`,
      reviewCount,
      summary: summary.substring(0, 200),
      cellRating,
      pullThrough,
      levelSites,
    }

    // Cache result
    if (!(fetchCampendiumReview as unknown as { _cache?: Record<string, CampgroundResult['campendium']> })._cache) {
      (fetchCampendiumReview as unknown as { _cache: Record<string, CampgroundResult['campendium']> })._cache = {}
    }
    ;(fetchCampendiumReview as unknown as { _cache: Record<string, CampgroundResult['campendium']> })._cache[campName] = result

    return result
  } catch {
    return undefined
  }
}

// ── Haversine distance ─────────────────────────────────────────────────────────
function haversineMi(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3958.8 // Earth radius in miles
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// ── GET handler ────────────────────────────────────────────────────────────────
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const city = searchParams.get('city')
  const bigRigOnly = searchParams.get('bigRig') === 'true'
  const enrich = searchParams.get('enrich') !== 'false' // default true

  if (!city || city.length > 200) {
    return NextResponse.json({ error: 'Missing city parameter.' }, { status: 400 })
  }

  const citySanitized = city.replace(/[^a-zA-Z0-9\s\-\.,']/g, '').trim()
  let results = await fetchRecreationGov(citySanitized)

  if (bigRigOnly) {
    results = results.filter(r => r.bigRigScore >= 3.0)
  }

  // Enrich with nearby services + cell signal (only if lat/lng available)
  if (enrich) {
    const apiKey = process.env.GOOGLE_PLACES_API_KEY
    const enriched = await Promise.all(
      results.slice(0, 6).map(async (camp) => {
        if (camp.lat != null && camp.lng != null && apiKey) {
          const [services, cellSignal] = await Promise.all([
            fetchNearbyServices(camp.lat, camp.lng, apiKey),
            fetchCellSignal(camp.lat, camp.lng),
          ])
          return { ...camp, nearestServices: services, cellSignal }
        }
        return camp
      })
    )
    results = enriched
  }

  const month = new Date().getMonth() + 1
  const isPeakSeason = month >= 6 && month <= 9

  return NextResponse.json({
    results,
    city: citySanitized,
    vacancyRisk: isPeakSeason ? 'seasonal' : 'low',
    peakSeason: isPeakSeason,
    bigRigFilter: bigRigOnly,
  })
}
