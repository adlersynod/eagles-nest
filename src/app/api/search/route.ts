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

const TYPE_QUERIES: Record<string, string> = {
  attractions: 'tourist attractions',
  restaurants: 'restaurants',
  parks: 'RV parks campgrounds',
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const city = searchParams.get('city')
  const type = searchParams.get('type')

  if (!city) {
    return NextResponse.json({ error: 'Missing city parameter' }, { status: 400 })
  }

  if (!type || !['attractions', 'restaurants', 'parks'].includes(type)) {
    return NextResponse.json({ error: 'Invalid or missing type parameter' }, { status: 400 })
  }

  const apiKey = process.env.GOOGLE_PLACES_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'Search service misconfigured.' }, { status: 500 })
  }

  const query = `${city} ${TYPE_QUERIES[type]}`

  try {
    // Search for places
    const searchRes = await fetch(
      `https://places.googleapis.com/v1/places:searchText`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask':
            'places.name,places.displayName,places.rating,places.priceLevel,places.types,places.primaryType',
        },
        body: JSON.stringify({
          textQuery: query,
          languageCode: 'en',
          maxResultCount: 8,
        }),
      }
    )

    if (!searchRes.ok) {
      const err = await searchRes.json().catch(() => ({}))
      console.error('Google Places search error:', err)
      return NextResponse.json({ error: 'Search service unavailable.' }, { status: 502 })
    }

    const searchData = await searchRes.json()
    const places = searchData.places || []

    if (!places.length) {
      return NextResponse.json({ results: [], city })
    }

    const results: PlaceResult[] = []

    // Fetch details for each place (to get photos + address)
    for (const place of places) {
      if (results.length >= 8) break

      const placeId = place.name
      const displayName = place.displayName?.text || place.name
      const rating = place.rating ?? null
      const priceLevel = place.priceLevel ?? null
      const types: string[] = place.types || []
      const primaryType: string = place.primaryType || types[0] || ''
      const mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(displayName)}`

      let photoUrl: string | null = null
      let address = ''
      let gmapsUrl = ''

      try {
        const detailsRes = await fetch(
          `https://places.googleapis.com/v1/${placeId}`,
          {
            headers: {
              'X-Goog-Api-Key': apiKey,
              'X-Goog-FieldMask': 'places.formattedAddress,places.googleMapsUri,places.photos',
            },
          }
        )
        if (detailsRes.ok) {
          const details = await detailsRes.json()
          address = details.formattedAddress || ''
          gmapsUrl = details.googleMapsUri || ''

          // Build photo URL directly from photo resource name
          const photoName = details.photos?.[0]?.name
          if (photoName) {
            photoUrl = `https://places.googleapis.com/v1/${photoName}/media?maxHeightPx=400&key=${apiKey}`
          }
        }
      } catch {
        // Continue without photo
      }

      results.push({
        id: placeId,
        name: displayName,
        rating,
        priceLevel,
        types,
        primaryType,
        photoUrl,
        mapUrl: gmapsUrl || mapUrl,
        address,
      })
    }

    return NextResponse.json({ results, city })
  } catch (error) {
    console.error('Search error:', error)
    return NextResponse.json({ error: 'Failed to fetch results.' }, { status: 500 })
  }
}
