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
  const mode = searchParams.get('mode')
  
  // STUB: Return hardcoded all mode to verify deployment is current
  return NextResponse.json({ 
    mode: 'all',  // hardcoded!
    city: searchParams.get('city'),
    results: [{ id: 'stub', name: 'STUB_RESULT' }],
    _stub: true
  })
}
