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
        body: JSON.stringify({
          textQuery: query,
          languageCode: 'en',
          maxResultCount: 8,
        }),
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

      // Build photo URL from first photo reference
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
