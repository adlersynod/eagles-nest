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
}

const TYPE_QUERIES: Record<string, string> = {
  attractions: 'tourist attractions',
  restaurants: 'restaurants',
  parks: 'RV parks campgrounds camping',
}

async function getPhotoUrl(placeName: string, apiKey: string): Promise<string | null> {
  try {
    const searchRes = await fetch(
      `https://places.googleapis.com/v1/places:searchText`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask': 'places.photos',
        },
        body: JSON.stringify({
          textQuery: placeName,
          languageCode: 'en',
          maxResultCount: 1,
        }),
      }
    )
    const searchData = await searchRes.json()
    const photoName = searchData?.places?.[0]?.photos?.[0]?.name
    if (!photoName) return null

    // Fetch the photo — returns redirect to the actual image
    const photoRes = await fetch(
      `https://places.googleapis.com/v1/${photoName}/media?maxHeightPx=400`,
      {
        headers: { 'X-Goog-Api-Key': apiKey },
        redirect: 'follow',
      }
    )
    // Follow the redirect to get the actual image URL
    return photoRes.url || null
  } catch {
    return null
  }
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
      console.error('Google Places error:', err)
      return NextResponse.json({ error: 'Search service unavailable.' }, { status: 502 })
    }

    const searchData = await searchRes.json()
    const places = searchData.places || []

    if (!places.length) {
      return NextResponse.json({ results: [], city })
    }

    // Fetch details + photo for each place
    const results: PlaceResult[] = []
    for (const place of places) {
      if (results.length >= 8) break

      const placeId = place.name
      const displayName = place.displayName?.text || place.name
      const rating = place.rating ?? null
      const priceLevel = place.priceLevel ?? null
      const types: string[] = place.types || []
      const primaryType: string = place.primaryType || types[0] || ''

      // Get details for address + map URL
      let mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(displayName)}`
      let address = ''

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
          mapUrl = details.googleMapsUri || mapUrl

          // Get photo URL from first photo reference
          const photoName = details.photos?.[0]?.name
          if (photoName) {
            try {
              const photoRes = await fetch(
                `https://places.googleapis.com/v1/${photoName}/media?maxHeightPx=400`,
                {
                  headers: { 'X-Goog-Api-Key': apiKey },
                  redirect: 'follow',
                }
              )
              if (photoRes.ok && photoRes.url) {
                results.push({
                  id: placeId,
                  name: displayName,
                  rating,
                  reviewCount: null,
                  priceLevel,
                  types,
                  primaryType,
                  photoUrl: photoRes.url,
                  mapUrl,
                })
                continue
              }
            } catch {
              // Fall through to no-photo result
            }
          }
        }
      } catch {
        // Details fetch failed — continue with basic info
      }

      results.push({
        id: placeId,
        name: displayName,
        rating,
        reviewCount: null,
        priceLevel,
        types,
        primaryType,
        photoUrl: null,
        mapUrl,
      })
    }

    return NextResponse.json({ results, city })
  } catch (error) {
    console.error('Search error:', error)
    return NextResponse.json({ error: 'Failed to fetch results.' }, { status: 500 })
  }
}
