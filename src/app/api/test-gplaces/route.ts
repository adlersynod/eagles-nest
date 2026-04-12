import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const city = searchParams.get('city') || 'Denver CO'
  const apiKey = process.env.GOOGLE_PLACES_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'No API key' }, { status: 500 })

  // Test the 'all' mode
  const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': apiKey, 'X-Goog-FieldMask': 'places.name,places.nextPageToken,places.formattedAddress' },
    body: JSON.stringify({
      textQuery: `${city} rv park campground`,
      languageCode: 'en',
      maxResultCount: 48,
    }),
  })
  const data = await res.json()
  return NextResponse.json({
    mode: 'all_test',
    city,
    firstPageCount: data.places?.length || 0,
    hasNextPage: !!data.nextPageToken,
    nextPageToken: data.nextPageToken ? '(present)' : null,
  })
}
