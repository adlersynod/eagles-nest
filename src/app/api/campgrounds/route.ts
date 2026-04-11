import { NextRequest, NextResponse } from 'next/server'

type CampgroundResult = {
  name: string
  rating: number | null
  price: string | null
  amenities: string[]
  photoUrl: string | null
  bookingUrl: string | null
  vacancyStatus: 'available' | 'limited' | 'likely_full' | 'unknown'
  vacancyNote: string
}

// Fetch from Recreation.gov public search API
// Note: fq=type:campground returns 0 results, so we search with "campground" keyword
// and filter manually for camp-related results
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

      // Skip non-campground results
      if (!campKeywords.some((k) => title.includes(k) || activities.includes(k))) continue

      // Parse available sites count if present
      let vacancyStatus: CampgroundResult['vacancyStatus'] = 'unknown'
      let vacancyNote = 'Check website for availability'
      const availCount = item?.accessible_campsites_count || 0
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

      results.push({
        name: item?.title || item?.name || '',
        rating: null,
        price: item?.price || null,
        amenities: (item?.activities || []).map((a: { activity_name: string }) => a.activity_name),
        photoUrl: item?.related_images?.[0]?.url || null,
        bookingUrl: item?.url || null,
        vacancyStatus,
        vacancyNote,
      })
    }
    return results
  } catch {
    return []
  }
}

// Campendium HTML scraping (unreliable — JS-rendered, CORS blocked)
async function fetchCampendium(city: string): Promise<CampgroundResult[]> {
  try {
    const res = await fetch(
      `https://www.campendium.com/search?q=${encodeURIComponent(city)}&type=rv`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; EaglesNest/1.0)',
          Accept: 'text/html',
        },
      }
    )
    if (!res.ok) return []
    // HTML scraping is unreliable since content is JS-rendered
    // Just return empty — Recreation.gov is the primary source
    return []
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

  // Try Recreation.gov first
  let results = await fetchRecreationGov(citySanitized)

  // Fall back to Campendium (currently returns empty due to JS rendering)
  if (results.length === 0) {
    results = await fetchCampendium(citySanitized)
  }

  // Compute vacancy risk based on current month
  const month = new Date().getMonth() + 1
  const isPeakSeason = month >= 6 && month <= 9

  return NextResponse.json({
    results,
    city: citySanitized,
    vacancyRisk: isPeakSeason ? 'seasonal' : 'low',
    peakSeason: isPeakSeason,
  })
}
