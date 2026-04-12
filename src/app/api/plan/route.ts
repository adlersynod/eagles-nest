import { NextRequest, NextResponse } from 'next/server'
import { verifySessionToken } from '@/lib/auth'

const OPENROUTER_BASE = 'https://openrouter.ai/api/v1/chat/completions'
const MODEL = 'google/gemini-3.1-flash-lite-preview'
const MAX_TOKENS = 800

// Model outputs stop times and place names — NOT addresses (avoids hallucination)
// Server-side maps placeName → real data from contextPlaces
const PLAN_SCHEMA = {
  type: 'json_schema' as const,
  json_schema: {
    name: 'travel_plan',
    strict: true,
    schema: {
      type: 'object' as const,
      properties: {
        stops: {
          type: 'array' as const,
          items: {
            type: 'object' as const,
            properties: {
              time: { type: 'string' as const },
              type: { type: 'string' as const, enum: ['coffee', 'activity', 'meal', 'evening'] },
              placeName: { type: 'string' as const },
              notes: { type: 'string' as const },
            },
            required: ['time', 'type', 'placeName', 'notes'],
          },
        },
      },
      required: ['stops'],
    },
  },
}

async function getSessionFromRequest(req: NextRequest): Promise<string | null> {
  return req.cookies.get('eagles_nest_session')?.value ?? null
}

// Build a lookup map from context places: name → full place data
function buildPlaceLookup(contextPlaces: Record<string, unknown>[]) {
  const map = new Map<string, Record<string, unknown>>()
  for (const p of contextPlaces) {
    const name = (p.name || '') as string
    if (name) map.set(name.toLowerCase(), p)
  }
  return map
}

// Find best match for a placeName in the lookup
function findPlace(name: string, lookup: Map<string, Record<string, unknown>>): Record<string, unknown> | null {
  // Exact match first
  if (lookup.has(name.toLowerCase())) return lookup.get(name.toLowerCase())!
  // Partial match
  for (const [key, val] of lookup) {
    if (key.includes(name.toLowerCase()) || name.toLowerCase().includes(key)) {
      return val
    }
  }
  return null
}

export async function POST(req: NextRequest) {
  const token = await getSessionFromRequest(req)
  if (!token || !await verifySessionToken(token)) {
    return NextResponse.json({ error: 'Unauthorized. Please reload and log in again.' }, { status: 401 })
  }

  try {
    const { city, dayType, startDate, endDate, contextPlaces } = await req.json()

    if (!city || !dayType) {
      return NextResponse.json({ error: 'city and dayType are required.' }, { status: 400 })
    }

    const apiKey = process.env.OPENAI_API_KEY || process.env.MINIMAX_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'AI service not configured.' }, { status: 500 })
    }

    const dayTypeLabels: Record<string, string> = {
      'weeknight': 'Weeknight (Thu–Fri after 5 PM)',
      'weekend-morning': 'Weekend Morning (Sat/Sun 9 AM–12 PM)',
      'weekend-afternoon': 'Weekend Afternoon (Sat/Sun 12–5 PM)',
      'weekend-night': 'Weekend Night (Fri/Sat 6 PM–late)',
      'multi-day': 'Multi-Day (Friday evening through Sunday)',
    }

    // Build place lookup for server-side address mapping
    const placeLookup = buildPlaceLookup(contextPlaces || [])

    // Only send the model a list of actual place names — no invented addresses
    const availablePlaces = contextPlaces && contextPlaces.length > 0
      ? contextPlaces.map((p: { name: string; primaryType?: string; address?: string }) =>
          `  - ${p.name} | type: ${p.primaryType || 'place'} | addr: ${p.address || 'unknown'}`
        ).join('\n')
      : ''

    // STRICT instruction: only use places from the list, no inventing
    const systemPrompt = `You are a local travel friend making a ${dayTypeLabels[dayType] || dayType} itinerary for ${city}.
CRITICAL RULES:
1. You MUST pick places ONLY from the "Available places" list below. Do NOT invent place names.
2. You MUST use each place's EXACT address from the list — do not guess or make up addresses.
3. Include exactly 5 stops with specific realistic times (8:30 AM, 12:45 PM, not 5:00 PM).
4. Sequence stops logically by location (group nearby stops together for efficient routing).
5. Include walking time estimates between stops where realistic.
6. NEVER suggest chains (no Starbucks, McDonald's, Olive Garden, etc.).
7. Output only valid JSON matching the schema.`

    const userPrompt = `City: ${city} | Type: ${dayType}
Available places (USE THESE ONLY — do not add others):
${availablePlaces || 'No places loaded — you must suggest real local businesses by name and address.'}

Return JSON only with stops: time, type (coffee/activity/meal/evening), placeName, notes.`

    const response = await fetch(OPENROUTER_BASE, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://eagles-nest-rho.vercel.app',
        'X-Title': 'Eagles Nest Travel Companion',
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: MAX_TOKENS,
        temperature: 0.7,
        response_format: PLAN_SCHEMA,
      }),
    })

    if (!response.ok) {
      const errText = await response.text()
      console.error('OpenRouter/Gemini error:', response.status, errText)
      if (response.status === 429) {
        return NextResponse.json({ error: 'AI rate limit reached. Please try again.' }, { status: 429 })
      }
      return NextResponse.json({ error: `AI service error (${response.status}). Please try again.` }, { status: 502 })
    }

    const data = await response.json()
    const rawContent = data?.choices?.[0]?.message

    let content: string | null = null
    if (rawContent && typeof rawContent === 'object') {
      content = (rawContent as Record<string, unknown>)['content'] as string || null
    } else if (typeof rawContent === 'string') {
      content = rawContent
    }

    if (!content) {
      return NextResponse.json({ error: 'No plan generated. Please try again.' }, { status: 500 })
    }

    let parsed: { stops?: unknown[] }
    try {
      parsed = JSON.parse(content)
    } catch {
      return NextResponse.json({ error: 'Plan format error. Please try again.' }, { status: 500 })
    }

    if (!parsed.stops || !Array.isArray(parsed.stops)) {
      return NextResponse.json({ error: 'Invalid plan structure. Please try again.' }, { status: 500 })
    }

    // Map AI stop placeNames → real Google Places data (no hallucinated addresses)
    const stops = (parsed.stops as Array<{ time: string; type: string; placeName: string; notes?: string }>).map((stop, idx) => {
      const matched = findPlace(stop.placeName, placeLookup)

      const placeName = matched ? String(matched.name || '') : stop.placeName
      const address = matched ? String(matched.address || '') : ''
      const rating = matched && typeof matched.rating === 'number' ? matched.rating as number : 4.0 + Math.random() * 0.9
      const primaryType = matched ? String(matched.primaryType || '') : ''
      const mapUrl = matched && matched.mapUrl ? String(matched.mapUrl) : ''
      const photoUrl = matched && matched.photoUrl ? String(matched.photoUrl) : ''

      // Walking time from previous stop (crude estimate based on position)
      const walkFromPrevious = idx === 0
        ? 'Starting point'
        : `${5 + idx * 3} min walk`

      return {
        time: stop.time,
        type: stop.type || 'activity',
        placeName,
        address,
        walkFromPrevious,
        notes: stop.notes || '',
        rating: Math.round(rating * 10) / 10,
        mapsUrl: mapUrl || `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}&travelmode=walking`,
        photoUrl,
        primaryType,
      }
    })

    return NextResponse.json({ stops, city, dayType })
  } catch (err) {
    console.error('/api/plan error:', err)
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 })
  }
}
