import { NextRequest, NextResponse } from 'next/server'

const MINIMAX_BASE = 'https://api.minimax.chat/v1/chat/completions'
// MiniMax Text-01 is their latest high-intelligence model; abab6.5s-chat is the fast fallback
const MODEL = 'MiniMax-Text-01'
const MAX_TOKENS = 1200

export async function POST(req: NextRequest) {
  try {
    const { city, dayType, startDate, endDate, weather, contextPlaces } = await req.json()

    if (!city || !dayType) {
      return NextResponse.json({ error: 'city and dayType are required.' }, { status: 400 })
    }

    const apiKey = process.env.MINIMAX_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'AI service not configured. MINIMAX_API_KEY env var missing.' }, { status: 500 })
    }

    const dayTypeLabels: Record<string, string> = {
      'weeknight': 'Weeknight (Thu–Fri after 5 PM)',
      'weekend-morning': 'Weekend Morning (Sat/Sun 9 AM–12 PM)',
      'weekend-afternoon': 'Weekend Afternoon (Sat/Sun 12–5 PM)',
      'weekend-night': 'Weekend Night (Fri/Sat 6 PM–late)',
      'multi-day': 'Multi-Day (Friday evening through Sunday)',
    }

    const contextPlacesText = contextPlaces && contextPlaces.length > 0
      ? contextPlaces.map((p: { name: string; address?: string; rating?: number | null; primaryType?: string }) =>
          `  - ${p.name}${p.rating ? ` ★${p.rating}` : ''} (${p.primaryType || 'place'})${p.address ? ` — ${p.address}` : ''}`
        ).join('\n')
      : 'No places loaded — suggest real local spots.'

    const systemPrompt = `You are a local friend giving travel advice. Generate a realistic ${dayTypeLabels[dayType] || dayType} itinerary for ${city}.
RULES:
- Times are specific and realistic — 5:30 PM, not 5:00 PM. Morning starts at 8-9 AM, not 6 AM.
- NEVER suggest chain restaurants or tourist traps (no Olive Garden, Cheesecake Factory, Starbucks, McDonald's, etc.)
- Prefer places from the provided list. If suggesting something not in the list, it must be a real specific local business.
- Include exact addresses for every stop.
- Return ONLY valid JSON in this exact format, no markdown, no explanation:
{"stops":[{"time":"5:30 PM","type":"coffee|activity|meal|evening","placeName":"string","address":"string","walkFromPrevious":"7 min walk","notes":"string","rating":4.6,"mapsUrl":"https://www.google.com/maps/dir/?api=1&destination=ENCODED_ADDRESS&travelmode=walking"}]}`

    const userPrompt = `City: ${city}
Day type: ${dayType}
Dates: ${startDate || 'not set'} → ${endDate || 'not set'}
Current weather: ${weather || 'not available'}
Available places:
${contextPlacesText}
Generate a ${dayTypeLabels[dayType] || dayType} itinerary for ${city} with exactly 5 stops. Return JSON only.`

    const response = await fetch(MINIMAX_BASE, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: MAX_TOKENS,
        temperature: 0.8,
      }),
    })

    if (!response.ok) {
      const errText = await response.text()
      console.error('MiniMax error:', response.status, errText)
      if (response.status === 429) {
        return NextResponse.json({ error: 'AI rate limit reached. Please wait a moment and try again.' }, { status: 429 })
      }
      return NextResponse.json({ error: 'AI service temporarily unavailable.' }, { status: 502 })
    }

    const data = await response.json()
    const content = data?.choices?.[0]?.message?.content?.trim()

    if (!content) {
      return NextResponse.json({ error: 'No plan generated. Please try again.' }, { status: 500 })
    }

    // Strip any markdown code fences
    let jsonStr = content.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim()

    let plan
    try {
      plan = JSON.parse(jsonStr)
    } catch {
      const jsonMatch = jsonStr.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        try {
          plan = JSON.parse(jsonMatch[0])
        } catch {
          return NextResponse.json({ error: 'Plan format error. Please try again.' }, { status: 500 })
        }
      } else {
        return NextResponse.json({ error: 'Plan format error. Please try again.' }, { status: 500 })
      }
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