import { NextRequest, NextResponse } from 'next/server'
import { verifySessionToken } from '@/lib/auth'

const OPENROUTER_BASE = 'https://openrouter.ai/api/v1/chat/completions'
const MODEL = 'google/gemini-3.1-flash-lite-preview'
const MAX_TOKENS = 1200

// JSON schema forces model to output exactly our plan structure with no deviations
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
              address: { type: 'string' as const },
              walkFromPrevious: { type: 'string' as const },
              notes: { type: 'string' as const },
              rating: { type: 'number' as const },
              mapsUrl: { type: 'string' as const },
            },
            required: ['time', 'type', 'placeName', 'address', 'walkFromPrevious', 'notes', 'rating', 'mapsUrl'],
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

export async function POST(req: NextRequest) {
  // Auth check — verify session before allowing AI plan generation
  const token = await getSessionFromRequest(req)
  if (!token || !await verifySessionToken(token)) {
    return NextResponse.json({ error: 'Unauthorized. Please reload and log in again.' }, { status: 401 })
  }

  try {
    const { city, dayType, startDate, endDate, weather, contextPlaces } = await req.json()

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

    const contextPlacesText = contextPlaces && contextPlaces.length > 0
      ? contextPlaces.map((p: { name: string; primaryType?: string }) =>
          `  - ${p.name} (${p.primaryType || 'place'})`
        ).join('\n')
      : 'No places loaded — suggest real local spots.'

    const systemPrompt = `Generate a ${dayTypeLabels[dayType] || dayType} itinerary for ${city} with exactly 5 stops. Follow the required JSON schema exactly — each stop needs: time (specific like 12:30 PM), type (coffee/activity/meal/evening), placeName, address, walkFromPrevious (or "Starting point"), notes, rating, mapsUrl (Google Maps walking directions URL). Never suggest chains. Prefer the provided places list.`

    const userPrompt = `City: ${city} | Type: ${dayType} | Dates: ${startDate || 'flexible'}–${endDate || 'flexible'}
Places:
${contextPlacesText}
Return JSON only.`

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
        temperature: 0.8,
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

    // With response_format schema, model MUST return valid JSON matching our stops structure
    let content: string | null = null
    if (rawContent && typeof rawContent === 'object') {
      content = (rawContent as Record<string, unknown>)['content'] as string || null
    } else if (typeof rawContent === 'string') {
      content = rawContent
    }

    if (!content) {
      return NextResponse.json({ error: 'No plan generated. Please try again.' }, { status: 500 })
    }

    let plan: { stops?: unknown[] }
    try {
      plan = JSON.parse(content)
    } catch {
      return NextResponse.json({ error: 'Plan format error. Please try again.' }, { status: 500 })
    }

    if (!plan.stops || !Array.isArray(plan.stops)) {
      return NextResponse.json({ error: 'Invalid plan structure. Please try again.' }, { status: 500 })
    }

    return NextResponse.json({ stops: plan.stops, city, dayType })
  } catch (err) {
    console.error('/api/plan error:', err)
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 })
  }
}
