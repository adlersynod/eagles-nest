import { NextRequest, NextResponse } from 'next/server'
import { mapPlace, scorePlaces } from '@/app/api/search/route'

const API_KEY = process.env.GOOGLE_PLACES_API_KEY!

const SEARCH_CONFIG: Record<string, { query: string; localQuery: string; includedType?: string }> = {
  parks: {
    query: 'rv park campground campsite rv resort motorcoach resort',
    localQuery: 'rv park campground',
    includedType: 'campground',
  },
  restaurants: {
    query: 'restaurant',
    localQuery: 'restaurant',
  },
  attractions: {
    query: 'tourist attraction amusement park museum',
    localQuery: 'tourist attraction',
  },
}

const FIELD_MASK = [
  'places.name', 'places.displayName', 'places.rating', 'places.priceLevel',
  'places.types', 'places.primaryType', 'places.photos', 'places.formattedAddress',
  'places.googleMapsUri', 'places.location',
].join(',')

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const city = searchParams.get('city') || 'Denver'
  const type = searchParams.get('type') || 'parks'
  const page = parseInt(searchParams.get('page') || '0')

  const config = SEARCH_CONFIG[type]
  if (!config) return NextResponse.json({ error: 'Invalid type' }, { status: 400 })

  const textQuery = `${city} ${config.query}`

  try {
    let body: Record<string, unknown> = { textQuery, languageCode: 'en', maxResultCount: 48 }
    if (config.includedType) body.includedType = config.includedType

    // First page
    const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': API_KEY, 'X-Goog-FieldMask': FIELD_MASK },
      body: JSON.stringify(body),
    })
    const data = await res.json()
    if (!res.ok) return NextResponse.json({ error: 'Google API error', details: data }, { status: 502 })

    let places = data.places || []
    let nextToken = data.nextPageToken

    // Fetch subsequent pages (page 1 and page 2)
    if (page > 0 && nextToken) {
      await new Promise(r => setTimeout(r, 1200))
      const body2 = { ...body, pageToken: nextToken }
      const res2 = await fetch('https://places.googleapis.com/v1/places:searchText', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': API_KEY, 'X-Goog-FieldMask': FIELD_MASK },
        body: JSON.stringify(body2),
      })
      const data2 = await res2.json()
      if (data2.places?.length) places.push(...data2.places)
      nextToken = data2.nextPageToken

      if (page > 1 && nextToken) {
        await new Promise(r => setTimeout(r, 1200))
        const body3 = { ...body, pageToken: nextToken }
        const res3 = await fetch('https://places.googleapis.com/v1/places:searchText', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': API_KEY, 'X-Goog-FieldMask': FIELD_MASK },
          body: JSON.stringify(body3),
        })
        const data3 = await res3.json()
        if (data3.places?.length) places.push(...data3.places)
      }
    }

    const results = places.map((p: Record<string, unknown>) => mapPlace(p, API_KEY))

    return NextResponse.json({
      results,
      city,
      mode: 'all',
      page,
      count: results.length,
      hasMore: !!nextToken,
    })
  } catch (err) {
    console.error('search error:', err)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}