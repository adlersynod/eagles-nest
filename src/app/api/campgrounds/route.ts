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

// Try to parse Campendium search results
async function fetchCampendium(city: string): Promise<CampgroundResult[]> {
  try {
    const res = await fetch(
      `https://www.campendium.com/search?q=${encodeURIComponent(city)}&type=rv`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; EaglesNest/1.0)',
          Accept: 'text/html',
        },
        next: { revalidate: 3600 },
      }
    )
    if (!res.ok) return []
    const html = await res.text()
    // Campendium renders via JS — static HTML won't have results.
    // Try extracting JSON-LD or structured data
    const results: CampgroundResult[] = []
    const nameMatches = [...html.matchAll(/<h2[^>]*class="[^"]*listing-title[^"]*"[^>]*>([^<]+)<\/h2>/gi)]
    const ratingMatches = [...html.matchAll(/class="[^"]*rating[^"]*"[^>]*>([^<]+)<\/[^>]+>/gi)]
    const priceMatches = [...html.matchAll(/class="[^"]*price[^"]*"[^>]*>\$([^<]+)<\/[^>]+>/gi)]

    for (let i = 0; i < Math.min(nameMatches.length, 8); i++) {
      results.push({
        name: nameMatches[i]?.[1]?.trim() || '',
        rating: ratingMatches[i] ? parseFloat(ratingMatches[i][1]) || null : null,
        price: priceMatches[i] ? `$${priceMatches[i][1]?.trim()}` : null,
        amenities: [],
        photoUrl: null,
        bookingUrl: null,
        vacancyStatus: 'unknown',
        vacancyNote: 'Check website for availability',
      })
    }
    return results
  } catch {
    return []
  }
}

// Fetch from Recreation.gov public search API
async function fetchRecreationGov(city: string): Promise<CampgroundResult[]> {
  try {
    const res = await fetch(
      `https://www.recreation.gov/api/search?query=${encodeURIComponent(city)}&fq=type:campground&rows=8`,
      {
        headers: {
          'User-Agent': 'EaglesNest/1.0',
          Accept: 'application/json',
        },
        next: { revalidate: 3600 },
      }
    )
    if (!res.ok) return []
    const data = await res.json()
    const results: CampgroundResult[] = []

    const items = data?.results || []
    for (const item of items.slice(0, 8)) {
      const name: string = item?.title || item?.name || ''
      if (!name) continue

      // Parse available sites count if present
      let vacancyStatus: CampgroundResult['vacancyStatus'] = 'unknown'
      let vacancyNote = 'Check website for availability'
      const availCount = item?.available_sites_count || item?.campsites?.length || 0
      if (typeof availCount === 'number') {
        if (availCount > 5) {
          vacancyStatus = 'available'
          vacancyNote = `${availCount} sites available`
        } else if (availCount > 0) {
          vacancyStatus = 'limited'
          vacancyNote = `Only ${availCount} sites left`
        } else {
          vacancyStatus = 'likely_full'
          vacancyNote = 'Likely full — check for cancellations'
        }
      }

      results.push({
        name,
        rating: item?.rating ? parseFloat(item.rating) || null : null,
        price: item?.price || null,
        amenities: item?.amenities || [],
        photoUrl: item?.image_url || item?.photo_url || null,
        bookingUrl: item?.url || `https://www.recreation.gov/search?query=${encodeURIComponent(city)}`,
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

  // Try Recreation.gov first (has a public API with CORS support)
  let results = await fetchRecreationGov(citySanitized)

  // Fall back to Campendium
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
