import { NextRequest, NextResponse } from 'next/server'

type PlaceResult = {
  id: string
  name: string
  rating: number | null
  priceLevel: number | null
  types: string[]
  primaryType: string
  photoUrl: string | null
  mapUrl: string
  address: string
}

// Google Places New API supports type filtering via includedType
const SEARCH_CONFIG: Record<string, { query: string; includedType?: string }> = {
  attractions: {
    query: 'tourist attractions',
    includedType: 'tourist_attraction',
  },
  restaurants: {
    query: 'restaurants',
    includedType: 'restaurant',
  },
  parks: {
    // Query specifically for large-rig parks (Brinkley 4100 = 45' 11")
    query: 'large rig RV park 45 foot sites',
    includedType: 'campground',
  },
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const city = searchParams.get('city')
  const type = searchParams.get('type')

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
  const textQuery = `${citySanitized} ${config.query}`

  try {
    const body: Record<string, unknown> = {
      textQuery,
      languageCode: 'en',
      maxResultCount: 8,
    }

    if (config.includedType) {
      body.includedType = config.includedType
    }

    const searchRes = await fetch(
      `https://places.googleapis.com/v1/places:searchText`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask':
            'places.name,places.displayName,places.rating,places.priceLevel,places.types,places.primaryType,places.photos,places.formattedAddress,places.googleMapsUri',
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
    const places = searchData.places || []

    const results: PlaceResult[] = places.slice(0, 8).map((place: Record<string, unknown>) => {
      const placeId = String(place.name || '')
      const displayName = (place.displayName as { text: string } | null)?.text || placeId
      const rating = (place.rating as number | null) ?? null
      const priceLevel = (place.priceLevel as number | null) ?? null
      const types = (place.types as string[]) || []
      const primaryType = String(place.primaryType || types[0] || '')
      const address = String(place.formattedAddress || '')
      const gmapsUrl = String(place.googleMapsUri || '')
      const mapUrl = gmapsUrl || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(displayName)}`

      const photos = (place.photos as Array<{ name: string }>) || []
      const photoName = photos[0]?.name
      const photoUrl = photoName
        ? `https://places.googleapis.com/v1/${photoName}/media?maxHeightPx=400&key=${apiKey}`
        : null

      return {
        id: placeId,
        name: displayName,
        rating,
        priceLevel,
        types,
        primaryType,
        photoUrl,
        mapUrl,
        address,
      }
    })

    return NextResponse.json({ results, city })
  } catch (error) {
    console.error('Search error:', error)
    return NextResponse.json({ error: 'Failed to fetch results.' }, { status: 500 })
  }
}
