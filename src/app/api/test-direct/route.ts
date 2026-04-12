import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const city = searchParams.get('city') || 'Denver CO'
  const apiKey = process.env.GOOGLE_PLACES_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'no key' }, { status: 500 })

  const body = {
    textQuery: `${city} rv park`,
    languageCode: 'en',
    maxResultCount: 48,
  }

  const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': 'places.name,places.nextPageToken',
    },
    body: JSON.stringify(body),
  })

  const data = await res.json()
  return NextResponse.json({
    count: data.places?.length || 0,
    hasNextPage: !!data.nextPageToken,
    firstThree: data.places?.slice(0, 3).map((p: Record<string, unknown>) => p.name) || [],
  })
}
