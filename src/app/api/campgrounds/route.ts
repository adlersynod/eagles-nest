import { NextRequest, NextResponse } from 'next/server'

type CampgroundResult = {
  name: string
  rating: number | null
  price: string | null
  amenities: string[]
  photoUrl: string | null
  bookingUrl: string | null
  mapUrl: string | null
  lat?: number
  lng?: number
  vacancyStatus: 'available' | 'limited' | 'likely_full' | 'unknown'
  vacancyNote: string
  // Big Rig Scout fields
  bigRigScore: number       // 1–5 score for 45'+ rigs
  bigRigNotes: string[]     // short reasons behind the score
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

      // ── Big Rig Score ──────────────────────────────────────────────
      // Recreation.gov activities are generic — use price + rating + activity count as proxies
      const activityNames = (item?.activities || [])
        .map((a: { activity_name: string }) => a.activity_name.toLowerCase())

      // Price: higher price suggests full-hookup resort (proxy for big-rig friendly)
      const priceRange = item?.price_range as { amount_max?: number } | null
      const maxPrice = priceRange?.amount_max || 0
      const priceScore = maxPrice >= 80 ? 2.5 : maxPrice >= 50 ? 1.5 : maxPrice >= 30 ? 0.5 : 0

      // Rating: above 4 is a quality park
      const rating = (item?.average_rating as number) || 0
      const ratingScore = rating >= 4.5 ? 1.5 : rating >= 4.0 ? 1.0 : rating >= 3.5 ? 0.5 : 0

      // Activity richness: more activities = more amenities
      const activityCount = activityNames.length
      const amenityScore = Math.min(2, activityCount / 4)

      // Basic camping amenities present
      const hasCamping = activityNames.some((a: string) => a.includes('camp') || a.includes('rv'))
      const hasFishing = activityNames.some((a: string) => a.includes('fish'))
      const hasHiking = activityNames.some((a: string) => a.includes('hik'))
      const hasSwimming = activityNames.some((a: string) => a.includes('swim') || a.includes('beach'))

      const baseScore = priceScore + ratingScore + amenityScore
      const bigRigScore = Math.round(Math.min(5, Math.max(1, baseScore)) * 10) / 10

      const bigRigNotes: string[] = []
      if (maxPrice >= 80) bigRigNotes.push('premium resort (full hookups likely)')
      else if (maxPrice >= 50) bigRigNotes.push('mid-range park (50-amp likely)')
      if (rating >= 4.0) bigRigNotes.push(`★ ${rating} rating`)
      if (amenityScore >= 1.5) bigRigNotes.push('rich amenities')
      if (bigRigScore >= 3.5) bigRigNotes.push('recommended for big rigs')
      else bigRigNotes.push('call ahead for 45\'+ rigs')

      results.push({
        name: campName,
        rating: (item?.average_rating as number) || null,
        price: (item?.price_range as string) || null,
        amenities: (item?.activities || []).map((a: { activity_name: string }) => a.activity_name),
        photoUrl: (item?.preview_image_url as string) || null,
        bookingUrl,
        mapUrl,
        lat: lat ?? undefined,
        lng: lng ?? undefined,
        vacancyStatus,
        vacancyNote,
        bigRigScore,
        bigRigNotes,
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
  const bigRigOnly = searchParams.get('bigRig') === 'true'

  if (!city || city.length > 200) {
    return NextResponse.json({ error: 'Missing city parameter.' }, { status: 400 })
  }

  const citySanitized = city.replace(/[^a-zA-Z0-9\s\-\.,']/g, '').trim()
  let results = await fetchRecreationGov(citySanitized)

  // Filter: 45'+ sites only — show only high big-rig-score parks
  if (bigRigOnly) {
    results = results.filter(r => r.bigRigScore >= 3.0)
  }

  const month = new Date().getMonth() + 1
  const isPeakSeason = month >= 6 && month <= 9

  return NextResponse.json({
    results,
    city: citySanitized,
    vacancyRisk: isPeakSeason ? 'seasonal' : 'low',
    peakSeason: isPeakSeason,
    bigRigFilter: bigRigOnly,
  })
}
