import { NextRequest, NextResponse } from 'next/server'

type CampgroundResult = {
  name: string
  rating: number | null
  price: string | null
  amenities: string[]
  photoUrl: string | null
  bookingUrl: string | null
  mapUrl: string | null
  vacancyStatus: 'available' | 'limited' | 'likely_full' | 'unknown'
  vacancyNote: string
}

async function fetchRecreationGov(city: string): Promise<CampgroundResult[]> {
  try {
    const query = `${city} campground`
    const res = await fetch(
      `https://www.recreation.gov/api/search?query=${encodeURIComponent(query)}&rows=8`,
      {
        headers: {
          'User-Agent': 'EaglesNest/1.0',
          Accept: 'application/json',
        },
      }
    )
    if (!res.ok) return []
    const data = await res.json()
    const results: CampgroundResult[] = []

    const items = data?.results || []
    const campKeywords = ['camp', 'rv', 'park', 'camping', 'trailer', 'cabin']

    for (const item of items.slice(0, 8)) {
      const title = (item?.title || item?.name || '').toLowerCase()
      const activities = (item?.activities || [])
        .map((a: { activity_name: string }) => a.activity_name.toLowerCase())
        .join(' ')

      if (!campKeywords.some((k) => title.includes(k) || activities.includes(k))) continue

      const availCount = item?.accessible_campsites_count || 0
      let vacancyStatus: CampgroundResult['vacancyStatus'] = 'unknown'
      let vacancyNote = 'Check website for availability'
      if (typeof availCount === 'number') {
        if (availCount > 5) {
          vacancyStatus = 'available'
          vacancyNote = `${availCount} sites available`
        } else if (availCount > 0) {
          vacancyStatus = 'limited'
          vacancyNote = `Only ${availCount} sites left`
        } else {
          vacancyStatus = 'likely_full'
          vacancyNote = 'Check for cancellations'
        }
      }

      // Build booking URL from entity_id
      const entityId = item?.entity_id || null
      const bookingUrl = entityId
        ? `https://www.recreation.gov/campgroundDetails/${entityId}`
        : item?.url || null

      // Build map URL from lat/lng
      const lat = item?.latitude
      const lng = item?.longitude
      const campName = item?.name || item?.title || ''
      const mapUrl = lat && lng
        ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(campName)}&query_place_id=${encodeURIComponent(String(entityId || ''))}`
        : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(campName)}`

      results.push({
        name: campName,
        rating: (item?.average_rating as number) || null,
        price: (item?.price_range as string) || null,
        amenities: (item?.activities || []).map((a: { activity_name: string }) => a.activity_name),
        photoUrl: (item?.preview_image_url as string) || null,
        bookingUrl,
        mapUrl,
        vacancyStatus,
        vacancyNote,
      })
    }
    return results
  } catch {
    return []
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const city = searchParams.get('city')

  if (!city || city.length > 200) {
    return NextResponse.json({ error: 'Missing city parameter.' }, { status: 400 })
  }

  const citySanitized = city.replace(/[^a-zA-Z0-9\s\-\.,']/g, '').trim()
  const results = await fetchRecreationGov(citySanitized)

  const month = new Date().getMonth() + 1
  const isPeakSeason = month >= 6 && month <= 9

  return NextResponse.json({
    results,
    city: citySanitized,
    vacancyRisk: isPeakSeason ? 'seasonal' : 'low',
    peakSeason: isPeakSeason,
  })
}
