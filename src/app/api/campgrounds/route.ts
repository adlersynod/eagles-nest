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
      const activityNames = (item?.activities || [])
        .map((a: { activity_name: string }) => a.activity_name.toLowerCase())

      const hasElectric = activityNames.some((a: string) => a.includes('electric'))
      const hasWater = activityNames.some((a: string) => a.includes('water'))
      const hasSewer = activityNames.some((a: string) => a.includes('sewer'))
      const hasWifi = activityNames.some((a: string) => a.includes('wifi') || a.includes('internet'))
      const hasPool = activityNames.some((a: string) => a.includes('pool'))
      const isCamping = activityNames.some((a: string) => a.includes('camping') || a.includes('camp'))

      // Score based on hookup level and amenities (accessible_campsites_count is ADA count, not 45'+ length — use sparingly)
      let hookupScore = 0
      if (hasElectric) hookupScore += 1.5
      if (hasWater) hookupScore += 0.5
      if (hasSewer) hookupScore += 1.0
      const amenityScore = Math.min(2, [hasWifi, hasPool, isCamping, activityNames.length > 5].filter(Boolean).length)
      // Base score from infrastructure
      const rawBigRig = Math.min(5, (hookupScore + amenityScore))
      const bigRigScore = Math.round(Math.max(1, rawBigRig) * 10) / 10

      const bigRigNotes: string[] = []
      if (hasElectric) bigRigNotes.push('50-amp sites')
      if (hasSewer && hasWater) bigRigNotes.push('full hookups')
      else if (hasWater) bigRigNotes.push('water hookup')
      if (hasWifi) bigRigNotes.push('WiFi')
      if (rawBigRig >= 4) bigRigNotes.push('excellent for big rigs')
      else if (rawBigRig >= 3) bigRigNotes.push('good for large rigs')
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
