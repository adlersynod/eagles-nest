import { NextRequest, NextResponse } from 'next/server'

// Average human walking speed: ~5 km/h = ~83m/min
const WALK_SPEED_M_PER_MIN = 83

// Google Places Nearby Search via REST
async function fetchNearby(
  lat: number,
  lng: number,
  radiusMeters: number,
  includedType?: string
) {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY
  if (!apiKey) return []

  const url = new URL('https://places.googleapis.com/v1/places:searchNearby')
  url.searchParams.set('key', apiKey)

  const body: Record<string, unknown> = {
    locationRestriction: {
      circle: {
        center: { latitude: lat, longitude: lng },
        radius: radiusMeters,
      },
    },
    includedType: includedType || 'restaurant',
    maxResultCount: 8,
    languageCode: 'en',
  }

  const res = await fetch(url.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    console.error('Nearby search failed:', res.status, await res.text())
    return []
  }

  const data = await res.json()
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
    const { lat, lng, radiusMeters = 800, includedType, originName } = body

    if (!lat || !lng) {
      return NextResponse.json({ error: 'Missing lat/lng' }, { status: 400 })
    }

    const places = await fetchNearby(lat, lng, radiusMeters, includedType)
    const apiKey = process.env.GOOGLE_PLACES_API_KEY || ''

    const results = places.map((place: Record<string, unknown>) => {
      const location = place.location as { latitude: number; longitude: number } | undefined
      const destLat = location?.latitude ?? 0
      const destLng = location?.longitude ?? 0

      // Estimate straight-line walk time (rough)
      const dx = (destLng - lng) * Math.cos((lat * Math.PI) / 180) * 111320
      const dy = (destLat - lat) * 110540
      const straightLineMeters = Math.sqrt(dx * dx + dy * dy)
      // Add 30% for street walking (not straight line)
      const walkMeters = straightLineMeters * 1.3

      const photos = (place.photos as Array<{ name: string }> | undefined) || []
      const photoUrl = photos[0]
        ? buildPhotoUrl(photos[0].name, apiKey)
        : null

      const primaryType = (
        (place.types as string[] | undefined) || []
      ).find(t => !['point_of_interest', 'establishment'].includes(t)) || 'place'

      const displayNameObj = place.displayName as { text?: string } | null | undefined
      const name = displayNameObj?.text || (place.name as string) || 'Unknown'

      return {
        name,
        rating: place.rating ?? null,
        reviewCount: place.userRatingCount ?? null,
        primaryType,
        types: (place.types as string[] | undefined) || [],
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
      includedType: includedType || 'all',
    })
  } catch (err) {
    console.error('Nearby API error:', err)
    return NextResponse.json({ error: 'Failed to fetch nearby places' }, { status: 500 })
  }
}
