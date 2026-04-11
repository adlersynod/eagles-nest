import { NextRequest, NextResponse } from 'next/server'

// Average human walking speed: ~5 km/h ≈ 83m/min
const WALK_SPEED_M_PER_MIN = 83

// Google Places Nearby Search — always fetches ALL types
// Type filtering is done entirely client-side (Google Places v1 Nearby does not support
// includedType on all API key configurations)
async function fetchNearby(lat: number, lng: number, radiusMeters: number) {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY
  if (!apiKey) return []

  const url = new URL('https://places.googleapis.com/v1/places:searchNearby')
  url.searchParams.set('key', apiKey)

  const body = {
    locationRestriction: {
      circle: {
        center: { latitude: lat, longitude: lng },
        radius: radiusMeters,
      },
    },
    maxResultCount: 20, // fetch more — client-side filter is strict
    languageCode: 'en',
  }

  const res = await fetch(url.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  const status = res.status
  const text = await res.text()

  if (status !== 200) {
    console.error(`Nearby search HTTP ${status}: ${text.slice(0, 200)}`)
    return []
  }

  let data: { places?: unknown[]; error?: { message?: string } }
  try {
    data = JSON.parse(text)
  } catch {
    console.error('Nearby: failed to parse Google response:', text.slice(0, 100))
    return []
  }

  if (data.error && (data.error as { code?: number }).code) {
    console.error('Google Places error:', JSON.stringify(data.error))
    return []
  }

  return data.places || []
}

function estimateWalkTime(meters: number): string {
  const mins = Math.round(meters / WALK_SPEED_M_PER_MIN)
  if (mins < 1) return '< 1 min'
  return `${mins} min`
}

function metersToMiles(meters: number): string {
  const mi = meters / 1609.34
  return `${mi.toFixed(1)} mi`
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

    // Always fetch ALL places — no includedType (not supported by this API key config)
    const rawPlaces = await fetchNearby(lat, lng, radiusMeters)
    const places = rawPlaces as Record<string, unknown>[]
    const apiKey = process.env.GOOGLE_PLACES_API_KEY || ''

    console.log(`[nearby] Google returned ${places.length} places for ${lat},${lng} within ${radiusMeters}m`)

    const results = places.map((place) => {
      const location = place.location as { latitude: number; longitude: number } | undefined
      const destLat = location?.latitude ?? 0
      const destLng = location?.longitude ?? 0

      // Approximate street walk distance = straight-line × 1.3
      const dx = (destLng - lng) * Math.cos((lat * Math.PI) / 180) * 111320
      const dy = (destLat - lat) * 110540
      const straightLineMeters = Math.sqrt(dx * dx + dy * dy)
      const walkMeters = straightLineMeters * 1.3

      const photos = (place.photos as Array<{ name: string }> | undefined) || []
      const photoUrl = photos[0]
        ? buildPhotoUrl(photos[0].name, apiKey)
        : null

      const types = (place.types as string[] | undefined) || []
      // Find best display type — prefer non-generic types
      const primaryType = String(
        place.primaryType ||
        types.find(t => !['point_of_interest', 'establishment', 'point_of_interest'].includes(t)) ||
        'place'
      )

      const displayNameObj = place.displayName as { text?: string } | null | undefined
      const name = displayNameObj?.text || (place.name as string) || 'Unknown'

      return {
        name,
        rating: (place.rating as number | null) ?? null,
        reviewCount: (place.userRatingCount as number | null) ?? null,
        primaryType,
        types,
        photoUrl,
        address: (place.formattedAddress as string) || (place.shortFormattedAddress as string) || '',
        mapUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name)}&zoom=15`,
        directionsUrl: buildDirectionsUrl(lat, lng, destLat, destLng),
        walkTime: estimateWalkTime(walkMeters),
        walkDistance: metersToMiles(walkMeters),
        lat: destLat,
        lng: destLng,
      }
    })

    // Sort by walk time
    results.sort((a: { walkTime: string }, b: { walkTime: string }) => {
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
