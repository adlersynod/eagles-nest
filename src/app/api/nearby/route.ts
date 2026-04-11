import { NextRequest, NextResponse } from 'next/server'

const WALK_SPEED_M_PER_MIN = 83

// ── Google Places Text Search (used instead of Nearby Search) ──────
// Nearby Search is blocked/rate-limited from Vercel serverless IPs.
// Text Search with locationBias works reliably.
// ─────────────────────────────────────────────────────────────────────
async function fetchPlacesNearby(
  lat: number,
  lng: number,
  radiusMeters: number
): Promise<Record<string, unknown>[]> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY
  if (!apiKey) return []

  const url = new URL('https://places.googleapis.com/v1/places:searchText')
  url.searchParams.set('key', apiKey)

  // Text Search with circle location bias — finds places within the radius
  const body = {
    textQuery: 'restaurants cafes bars parks attractions',
    locationBias: {
      circle: {
        center: { latitude: lat, longitude: lng },
        radius: radiusMeters,
      },
    },
    maxResultCount: 20,
    languageCode: 'en',
  }

  const res = await fetch(url.toString(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': [
        'places.name',
        'places.displayName',
        'places.rating',
        'places.userRatingCount',
        'places.types',
        'places.primaryType',
        'places.photos',
        'places.formattedAddress',
        'places.location',
      ].join(','),
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const errText = await res.text()
    console.error(`Places Text Search HTTP ${res.status}: ${errText.slice(0, 200)}`)
    return []
  }

  const data = await res.json()
  const places = data.places || []

  if (!places.length && data.error) {
    console.error('Google Places error:', JSON.stringify(data.error))
  }

  return places
}

function estimateWalkTime(meters: number): string {
  const mins = Math.round(meters / WALK_SPEED_M_PER_MIN)
  if (mins < 1) return '< 1 min'
  return `${mins} min`
}

function metersToMiles(meters: number): string {
  return `${(meters / 1609.34).toFixed(1)} mi`
}

function buildPhotoUrl(photoName: string, apiKey: string): string {
  return `https://places.googleapis.com/v1/${photoName}/media?maxHeightPx=300&key=${apiKey}`
}

function buildDirectionsUrl(
  originLat: number,
  originLng: number,
  destLat: number,
  destLng: number
): string {
  return `https://www.google.com/maps/dir/?api=1&origin=${originLat},${originLng}&destination=${destLat},${destLng}&travelmode=walking`
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { lat, lng, radiusMeters = 800, originName } = body

    if (!lat || !lng) {
      return NextResponse.json({ error: 'Missing lat/lng' }, { status: 400 })
    }

    const places = await fetchPlacesNearby(lat, lng, radiusMeters)

    const results = places.map((place) => {
      const location = place.location as { latitude: number; longitude: number } | undefined
      const destLat = location?.latitude ?? 0
      const destLng = location?.longitude ?? 0

      // Haversine-inspired street walk estimate
      const dx = (destLng - lng) * Math.cos((lat * Math.PI) / 180) * 111320
      const dy = (destLat - lat) * 110540
      const straightMeters = Math.sqrt(dx * dx + dy * dy)
      const walkMeters = straightMeters * 1.3

      const photos = (place.photos as Array<{ name: string }> | undefined) || []
      const photoUrl = photos[0] ? buildPhotoUrl(photos[0].name, process.env.GOOGLE_PLACES_API_KEY || '') : null

      const types = (place.types as string[] | undefined) || []
      const primaryType = String(
        place.primaryType ||
        types.find(t => !['point_of_interest', 'establishment'].includes(t)) ||
        'place'
      )

      const displayName = (place.displayName as { text?: string } | null)?.text || (place.name as string) || 'Unknown'

      return {
        name: displayName,
        rating: (place.rating as number | null) ?? null,
        reviewCount: (place.userRatingCount as number | null) ?? null,
        primaryType,
        types,
        photoUrl,
        address: (place.formattedAddress as string) || '',
        mapUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(displayName)}&zoom=15`,
        directionsUrl: buildDirectionsUrl(lat, lng, destLat, destLng),
        walkTime: estimateWalkTime(walkMeters),
        walkDistance: metersToMiles(walkMeters),
        lat: destLat,
        lng: destLng,
      }
    })

    // Sort by walk time
    results.sort((a, b) => {
      const aMin = parseInt(a.walkTime) || 99
      const bMin = parseInt(b.walkTime) || 99
      return aMin - bMin
    })

    return NextResponse.json({
      results,
      originName: originName || 'Selected location',
      radiusMeters,
    })
  } catch (err) {
    console.error('Nearby API error:', err)
    return NextResponse.json({ error: 'Failed to fetch nearby places' }, { status: 500 })
  }
}
