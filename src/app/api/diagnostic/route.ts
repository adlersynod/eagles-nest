import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const city = searchParams.get('city') || 'Denver CO'
  const requestedMode = searchParams.get('mode') || 'NOT_PROVIDED'

  // Call Google Places directly with 48 results
  const apiKey = process.env.GOOGLE_PLACES_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'No API key' }, { status: 500 })
  }

  const searchQuery = `${city} rv park campground campsite rv resort motorcoach resort`

  // First call
  const res1 = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': 'places.name,places.nextPageToken,totalResults',
    },
    body: JSON.stringify({ textQuery: searchQuery, languageCode: 'en', maxResultCount: 48 }),
  })

  const data1 = await res1.json()
  let allPlaces = data1.places || []
  let nextToken = data1.nextPageToken
  let total = data1.totalResults || allPlaces.length

  // Page 2
  if (nextToken) {
    await new Promise(r => setTimeout(r, 1200))
    const res2 = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': apiKey, 'X-Goog-FieldMask': 'places.name,places.nextPageToken' },
      body: JSON.stringify({ textQuery: searchQuery, languageCode: 'en', maxResultCount: 48, pageToken: nextToken }),
    })
    const data2 = await res2.json()
    if (data2.places?.length) allPlaces.push(...data2.places)
    nextToken = data2.nextPageToken

    // Page 3
    if (nextToken) {
      await new Promise(r => setTimeout(r, 1200))
      const res3 = await fetch('https://places.googleapis.com/v1/places:searchText', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': apiKey, 'X-Goog-FieldMask': 'places.name,places.nextPageToken' },
        body: JSON.stringify({ textQuery: searchQuery, languageCode: 'en', maxResultCount: 48, pageToken: nextToken }),
      })
      const data3 = await res3.json()
      if (data3.places?.length) allPlaces.push(...data3.places)
    }
  }

  return NextResponse.json({
    mode_used: requestedMode,
    requestedMode_raw: searchParams.get('mode'),
    query: searchQuery,
    totalReported: total,
    pages_returned: nextToken ? 3 : (allPlaces.length > 48 ? 2 : 1),
    results_count: allPlaces.length,
    first_10_names: allPlaces.slice(0, 10).map((p: Record<string, unknown>) => p.name),
  })
}