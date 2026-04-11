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

// Google Places New API supports type filtering via includedType
const SEARCH_CONFIG: Record<string, { query: string; includedType?: string; localQuery?: string }> = {
  attractions: {
    query: 'tourist attractions',
    includedType: 'tourist_attraction',
    localQuery: 'neighborhood park OR local bar OR weird museum OR food cart OR hidden gem OR local viewpoint',
  },
  restaurants: {
    query: 'restaurants',
    includedType: 'restaurant',
    localQuery: 'local restaurant OR food cart pod OR dive bar OR neighborhood cafe OR ethnic restaurant',
  },
  parks: {
    // Query specifically for large-rig parks (Brinkley 4100 = 45' 11")
    query: 'large rig RV park 45 foot sites',
    includedType: 'campground',
  },
}

const CHAIN_KEYWORDS = [
  'starbucks', "mcdonald's", 'olive garden', 'cheesecake factory',
  'walmart', 'target', 'costco', 'hilton', 'marriott', 'holiday inn',
  'mcdonald', 'burger king', 'wendys', "denny's", 'applebees',
  'chilis', 'tgi fridays', 'outback', 'red lobster', 'longhorn',
  'subway', 'panda express', 'chipotle', 'dominos pizza', 'pizza hut',
  'kfc', 'taco bell', 'panera bread', 'dunkin', 'dairy queen',
  'best western', 'sheraton', 'westin', 'hyatt', 'radisson',
]

function isChainPlace(name: string): boolean {
  const lower = name.toLowerCase()
  return CHAIN_KEYWORDS.some(kw => lower.includes(kw))
}

function demoteResults(places: Record<string, unknown>[]): Record<string, unknown>[] {
  // Sort by quality, pushing chains and tourist-heavy spots down — don't remove them
  return places
    .map((place) => {
      const reviewCount = (place.reviews as Array<{ originalRatingCount?: { value?: number } }> | undefined)?.[0]?.originalRatingCount?.value ?? 0
      const displayName = (place.displayName as { text: string } | null)?.text || ''
      const isChain = isChainPlace(displayName)
      // Demotion score: chains and >500 reviews get penalized heavily, 200-500 gets light penalty
      const chainPenalty = isChain ? 300 : 0
      const reviewPenalty = reviewCount > 500 ? 300 : reviewCount > 200 ? 100 : 0
      const score = -(chainPenalty + reviewPenalty)
      return { place, score }
    })
    .sort((a, b) => a.score - b.score)
    .map(({ place }) => place)
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const city = searchParams.get('city')
  const type = searchParams.get('type')
  const mode = searchParams.get('mode') === 'local' ? 'local' : 'popular'

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

  const config = SEARCH_CONFIG[type]
  const isLocal = mode === 'local'
  const textQuery = isLocal && config.localQuery
    ? `${citySanitized} ${config.localQuery}`
    : `${citySanitized} ${config.query}`

  try {
    const body: Record<string, unknown> = {
      textQuery,
      languageCode: 'en',
      maxResultCount: isLocal ? 16 : 8,
    }

    if (config.includedType) {
      body.includedType = config.includedType
    }

    // Local mode: rank by distance to find nearby hidden gems
    if (isLocal) {
      body.rankBy = 'distance'
    }

    const fieldMask = [
      'places.name', 'places.displayName', 'places.rating', 'places.priceLevel',
      'places.types', 'places.primaryType', 'places.photos', 'places.formattedAddress',
      'places.googleMapsUri', 'places.location',
      ...(isLocal ? ['places.reviews'] : []),
    ].join(',')

    const searchRes = await fetch(
      `https://places.googleapis.com/v1/places:searchText`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask': fieldMask,
        },
        body: JSON.stringify(body),
      }
    )

    if (!searchRes.ok) {
      const err = await searchRes.json().catch(() => ({}))
      console.error('Google Places error:', err)
      return NextResponse.json({ error: 'Search service unavailable.' }, { status: 502 })
    }

    const searchData = await searchRes.json()
    let places = searchData.places || []

    // Demote chain/high-review-count results in local mode
    if (isLocal) {
      places = demoteResults(places)
    }

    const results: PlaceResult[] = places.slice(0, 8).map((place: Record<string, unknown>) => {
      const placeId = String(place.name || '')
      const displayName = (place.displayName as { text: string } | null)?.text || placeId
      const rating = (place.rating as number | null) ?? null
      const priceLevel = (place.priceLevel as number | null) ?? null
      const types = (place.types as string[]) || []
      const primaryType = String(place.primaryType || types[0] || '')
      const address = String(place.formattedAddress || '')
      const photos = (place.photos as Array<{ name: string }>) || []
      const photoName = photos[0]?.name
      const photoUrl = photoName
        ? `https://places.googleapis.com/v1/${photoName}/media?maxHeightPx=400&key=${apiKey}`
        : null
      const reviews = place.reviews as Array<{ originalRatingCount?: { value?: number } }> | undefined
      const reviewCount = reviews?.[0]?.originalRatingCount?.value ?? null

      const mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(displayName)}&zoom=15`
      const location = place.location as { latitude: number; longitude: number } | undefined

      return {
        id: placeId,
        name: displayName,
        rating,
        reviewCount,
        priceLevel,
        types,
        primaryType,
        photoUrl,
        mapUrl,
        address,
        lat: location?.latitude,
        lng: location?.longitude,
      }
    })

    // Fire-and-forget usage tracker — doesn't block response
    fetch(new URL('/api/monitor', process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000').toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    }).catch(() => {}) // intentionally ignored

    return NextResponse.json({ results, city, mode })
  } catch (error) {
    console.error('Search error:', error)
    return NextResponse.json({ error: 'Failed to fetch results.' }, { status: 500 })
  }
}
