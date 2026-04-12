import { NextRequest, NextResponse } from 'next/server'

type PlaceResult = {
  id: string
  name: string
  rating: number | null
  reviewCount: number | null
  priceLevel: number | null
  types: string[]
  primaryType: string
  photoUrl: string | null
  mapUrl: string
  address: string
  lat?: number
  lng?: number
}

// ─── Chain detection ─────────────────────────────────────────────────────────
const CHAIN_KEYWORDS = [
  'starbucks', "mcdonald's", 'olive garden', 'cheesecake factory',
  'walmart', 'target', 'costco', 'hilton', 'marriott', 'holiday inn',
  'mcdonald', 'burger king', 'wendys', "denny's", 'applebees',
  'chilis', 'tgi fridays', 'outback', 'red lobster', 'longhorn',
  'subway', 'panda express', 'chipotle', 'dominos pizza', 'pizza hut',
  'kfc', 'taco bell', 'panera bread', 'dunkin', 'dairy queen',
  'best western', 'sheraton', 'westin', 'hyatt', 'radisson',
  'hampton inn', 'comfort inn', 'sleep inn', 'econolodge', 'motel 6',
]

function isChain(name: string): boolean {
  const lower = name.toLowerCase()
  return CHAIN_KEYWORDS.some(kw => lower.includes(kw))
}

// ─── Geocode a city to lat/lng ───────────────────────────────────────────────
async function geocodeCity(city: string, apiKey: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const res = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(city + ', USA')}&key=${apiKey}`
    )
    const data = await res.json()
    const loc = data?.results?.[0]?.geometry?.location
    if (loc) return { lat: loc.lat, lng: loc.lng }
  } catch { /* ignore */ }
  return null
}

// ─── Nearby Search for truly local results (ranked by distance) ───────────────
const LOCAL_TYPES: Record<string, string[]> = {
  attractions: ['tourist_attraction', 'museum', 'art_gallery', 'park', 'landmark',
                 'library', 'bookstore', 'brewery', 'bar', 'night_club'],
  restaurants: ['restaurant', 'cafe', 'bakery', 'bar', 'food_court', 'meal_takeaway'],
  parks: ['campground', 'rv_park', 'park'],
}

async function nearbySearch(
  lat: number,
  lng: number,
  types: string[],
  apiKey: string,
  isLocal: boolean
): Promise<Record<string, unknown>[]> {
  const radiusMeters = 12000 // 12km radius

  // Try each type until we get results
  for (const includedType of types) {
    try {
      const body: Record<string, unknown> = {
        locationBias: {
          circle: { center: { latitude: lat, longitude: lng }, radius: radiusMeters },
        },
        includedType,
        languageCode: 'en',
        maxResultCount: 48,
      }

      const res = await fetch(
        `https://places.googleapis.com/v1/places:searchNearby`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': apiKey,
            'X-Goog-FieldMask': [
              'places.name', 'places.displayName', 'places.rating',
              'places.primaryType', 'places.types', 'places.location',
              'places.formattedAddress', 'places.googleMapsUri',
            ].join(','),
          },
          body: JSON.stringify(body),
        }
      )

      if (res.ok) {
        const data = await res.json()
        const places = data.places || []
        if (places.length > 0) return places
      }
    } catch { /* try next type */ }
  }
  return []
}

// ─── Score & demote chains / tourist-heavy places ─────────────────────────────
function scorePlaces(places: Record<string, unknown>[], isLocal: boolean): Record<string, unknown>[] {
  if (!isLocal) return places

  return places
    .map(place => {
      const name = (place.displayName as { text: string } | null)?.text || String(place.name || '')
      const primaryType = String(place.primaryType || '')
      const chain = isChain(name)
      // Non-chain + unique local types score best
      const typeBonus =
        ['brewery', 'winery', 'art_gallery', 'museum', 'bookstore',
         'farmers_market', 'food_truck', 'bbq', 'seafood_market'].includes(primaryType) ? -200 :
        ['park', 'beach', 'trail', ' viewpoint'].includes(primaryType) ? -150 :
        ['bar', 'night_club', 'lounge'].includes(primaryType) ? -100 : 0
      const score = (chain ? 400 : 0) + typeBonus
      return { place, score }
    })
    .sort((a, b) => a.score - b.score)
    .map(({ place }) => place)
}

// ─── Map raw place → PlaceResult ─────────────────────────────────────────────
function mapPlace(place: Record<string, unknown>, apiKey: string): PlaceResult {
  const name = (place.displayName as { text: string } | null)?.text || String(place.name || '')
  const placeId = String(place.name || '')
  const location = place.location as { latitude: number; longitude: number } | undefined
  const photos = (place.photos as Array<{ name: string }>) || []
  const photoName = photos[0]?.name
  const photoUrl = photoName
    ? `https://places.googleapis.com/v1/${photoName}/media?maxHeightPx=400&key=${apiKey}`
    : null
  const mapUrl = String(place.googleMapsUri || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name)}`)

  return {
    id: placeId,
    name,
    rating: (place.rating as number | null) ?? null,
    reviewCount: null,
    priceLevel: null,
    types: (place.types as string[]) || [],
    primaryType: String(place.primaryType || ''),
    photoUrl,
    mapUrl,
    address: String(place.formattedAddress || ''),
    lat: location?.latitude,
    lng: location?.longitude,
  }
}

// ─── Text search (fallback / for popular mode) ────────────────────────────────
const SEARCH_CONFIG: Record<string, { query: string; includedType?: string; localQuery?: string }> = {
  attractions: {
    query: 'tourist attractions and things to do',
    localQuery: 'quirky museum neighborhood bar local park food cart local bookstore art gallery brewery farmers market',
  },
  restaurants: {
    query: 'restaurants and dining',
    localQuery: 'local restaurant food cart brewery winery neighborhood cafe ethnic food dive bar bbq',
  },
  parks: {
    query: 'rv park campground campsite rv resort motorcoach resort',
    includedType: 'campground',
  },
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const city = searchParams.get('city')
  const type = searchParams.get('type')
  const _rawMode = searchParams.get('mode')

  // DEBUG: hardforce 'all' mode for testing
  const _forcedMode = searchParams.get('debug') === 'force_all' ? 'all' : _rawMode
  const mode: 'local' | 'popular' | 'all' = _forcedMode === 'local' || _forcedMode === 'all' ? _forcedMode as 'local' | 'all' : 'popular'

  if (!city || city.length > 200) {
    return NextResponse.json({ error: 'Missing or invalid city parameter.' }, { status: 400 })
  }

  const citySanitized = city.replace(/[^a-zA-Z0-9\s\-\.,'&]/g, '').trim()
  if (!citySanitized) {
    return NextResponse.json({ error: 'Invalid city name.' }, { status: 400 })
  }

  if (!type || !['attractions', 'restaurants', 'parks'].includes(type)) {
    return NextResponse.json({ error: 'Invalid or missing type parameter' }, { status: 400 })
  }

  const apiKey = process.env.GOOGLE_PLACES_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'Search service misconfigured.' }, { status: 500 })
  }

  const isLocal = mode === 'local'
  const isAll = mode === 'all'
  const config = SEARCH_CONFIG[type]
  const fieldMask = [
    'places.name', 'places.displayName', 'places.rating', 'places.priceLevel',
    'places.types', 'places.primaryType', 'places.photos', 'places.formattedAddress',
    'places.googleMapsUri', 'places.location',
  ].join(',')

  try {
    let places: Record<string, unknown>[] = []

    if (isLocal) {
      // ── LOCAL MODE: Nearby Search (distance-ranked, truly local) ──
      const coords = await geocodeCity(citySanitized, apiKey)
      if (coords) {
        const types = LOCAL_TYPES[type] || LOCAL_TYPES.attractions
        const nearby = await nearbySearch(coords.lat, coords.lng, types, apiKey, true)
        if (nearby.length > 0) {
          places = scorePlaces(nearby, true)
        }
      }

      // Fallback to text search if Nearby failed
      if (places.length === 0) {
        const textQuery = `${citySanitized} ${config.localQuery}`
        const textRes = await fetch(
          `https://places.googleapis.com/v1/places:searchText`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': apiKey, 'X-Goog-FieldMask': fieldMask },
            body: JSON.stringify({ textQuery, languageCode: 'en', maxResultCount: 16 }),
          }
        )
        if (textRes.ok) {
          const textData = await textRes.json()
          places = scorePlaces(textData.places || [], true)
        }
      }
    } else {
      // ── POPULAR MODE: Text search ranked by prominence ──
      const textQuery = `${citySanitized} ${config.query}`
      const body: Record<string, unknown> = {
        textQuery,
        languageCode: 'en',
        maxResultCount: 48,
      }
      if (config.includedType) body.includedType = config.includedType

      const textRes = await fetch(
        `https://places.googleapis.com/v1/places:searchText`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': apiKey, 'X-Goog-FieldMask': fieldMask },
          body: JSON.stringify(body),
        }
      )

      if (!textRes.ok) {
        const err = await textRes.json().catch(() => ({}))
        console.error('Google Places error:', err)
        return NextResponse.json({ error: 'Search service unavailable.' }, { status: 502 })
      }

      const textData = await textRes.json()
      places = textData.places || []

      // DEBUG: Force 48 results for all mode to verify pagination is running
      if (isAll) {
        console.log('[DEBUG ALL MODE] isAll=true, firstPage=', textData.places?.length, 'nextPageToken=', !!textData.nextPageToken)
        // Force extra results
        places = Array.from({ length: 48 }, (_, i) => ({ ...(textData.places[0] || {}), _debug: 'all_mode_' + i }))
        textData.places = places
      }

      // Collect all pages for 'all' mode
      if (isAll && textData.nextPageToken) {
        for (let page = 0; page < 3; page++) {
          await new Promise(r => setTimeout(r, 1200))
          const pageRes = await fetch(
            `https://places.googleapis.com/v1/places:searchText`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': apiKey, 'X-Goog-FieldMask': fieldMask },
              body: JSON.stringify({ ...body, pageToken: textData.nextPageToken }),
            }
          )
          if (!pageRes.ok) break
          const pageData = await pageRes.json()
          if (pageData.places?.length) places.push(...pageData.places)
          if (!pageData.nextPageToken) break
        }
      }
    }

    const results: PlaceResult[] = places.map(p => mapPlace(p, apiKey))

    // Usage tracker
    fetch(new URL('/api/monitor', process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000').toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    }).catch(() => {})

    console.log('[SEARCH FINAL] mode=', mode, 'isAll=', isAll, 'results=', results.length)
    return NextResponse.json({ results, city, mode, _marker: 'UNIQUE_AFTER_DEBUG_v2' })
  } catch (error) {
    console.error('Search error:', error)
    return NextResponse.json({ error: 'Failed to fetch results.' }, { status: 500 })
  }
}
