import { NextRequest, NextResponse } from 'next/server'

const BRAVE_API_KEY = process.env.BRAVE_API_KEY

type SearchResult = {
  title: string
  url: string
  description: string
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const city = searchParams.get('city')
  const type = searchParams.get('type')

  if (!BRAVE_API_KEY) {
    return NextResponse.json({ error: 'Search service misconfigured.' }, { status: 500 })
  }

  if (!city) {
    return NextResponse.json({ error: 'Missing city parameter' }, { status: 400 })
  }

  if (!type || !['attractions', 'restaurants', 'parks'].includes(type)) {
    return NextResponse.json({ error: 'Invalid or missing type parameter' }, { status: 400 })
  }

  const queries: Record<string, string> = {
    attractions: `top tourist attractions in ${city} site:tripadvisor.com OR site:lonelyplanet.com`,
    restaurants: `best restaurants in ${city} near me`,
    parks: `best RV parks near ${city}`,
  }

  try {
    const response = await fetch(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(queries[type])}&count=8`, {
      headers: {
        'Accept': 'application/json',
        'X-Subscription-Token': BRAVE_API_KEY,
      },
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('Brave Search API error:', response.status, errorText)
      return NextResponse.json(
        { error: 'Search service unavailable. Please try again.' },
        { status: response.status }
      )
    }

    const data = await response.json()

    // Parse Brave Search results
    const results: SearchResult[] = []
    const webResults = data.web?.results || []

    for (const result of webResults) {
      if (results.length >= 8) break
      results.push({
        title: result.title || '',
        url: result.url || '',
        description: result.description || '',
      })
    }

    return NextResponse.json({ results, city })
  } catch (error) {
    console.error('Search error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch search results. Please try again.' },
      { status: 500 }
    )
  }
}
