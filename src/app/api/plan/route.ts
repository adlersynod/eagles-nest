import { NextRequest, NextResponse } from 'next/server'
import { verifySessionToken } from '@/lib/auth'

const OPENROUTER_BASE = 'https://openrouter.ai/api/v1/chat/completions'
const MODEL = 'minimax/MiniMax-M2.7'
const MAX_TOKENS = 2000

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

    // Route through OpenRouter using OPENAI_API_KEY (sk-or-v1 OpenRouter key)
    const apiKey = process.env.OPENAI_API_KEY || process.env.MINIMAX_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'AI service not configured. Add OPENAI_API_KEY to Vercel env vars.' }, { status: 500 })
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

    const systemPrompt = `Generate a ${dayTypeLabels[dayType] || dayType} itinerary for ${city}. Return EXACTLY 5 stops as JSON: {"stops":[{"time":"","type":"","placeName":"","address":"","walkFromPrevious":"","notes":"","rating":0,"mapsUrl":""}]}. No markdown, no explanation.
Times: specific (8:30 AM, 12:45 PM). NEVER chains. Prefer the provided places list. Include real addresses.`

    const userPrompt = `City: ${city} | Type: ${dayType} | Dates: ${startDate || 'flexible'}–${endDate || 'flexible'}
Places: ${contextPlacesText}
Respond with only valid JSON starting with {`

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 55_000);

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
      }),
      signal: controller.signal as RequestInit['signal'],
    })
    clearTimeout(timeout)

    if (!response.ok) {
      const errText = await response.text()
      console.error('OpenRouter/MiniMax error:', response.status, errText)
      if (response.status === 429) {
        return NextResponse.json({ error: 'AI rate limit reached. Please wait a moment and try again.' }, { status: 429 })
      }
      return NextResponse.json({ error: `AI service error (${response.status}). Please try again.` }, { status: 502 })
    }

    const data = await response.json()
    console.error('Plan API - response data:', JSON.stringify(data).substring(0, 300))
    const rawContent = data?.choices?.[0]?.message

    // MiniMax-M2.7: content field has the clean JSON response
    let content: string | null = null
    if (rawContent && typeof rawContent === 'object') {
      const msg = rawContent as Record<string, unknown>
      const contentField = msg['content']
      const reasoningField = msg['reasoning']
      if (typeof contentField === 'string' && contentField.trim().length > 0) {
        content = contentField
      } else if (typeof reasoningField === 'string' && reasoningField.trim().length > 0) {
        // MiniMax-Text-01 sometimes returns the actual text in the reasoning field
        content = reasoningField
      } else {
        console.error('Plan API - content field issue:', JSON.stringify(msg).substring(0, 300))
      }
    } else if (typeof rawContent === 'string') {
      content = rawContent
    }

    console.error('Plan API - extracted content length:', content ? content.length : 'null')

    if (!content || content.trim() === '') {
      console.error('Plan API - empty content, rawContent:', JSON.stringify(rawContent)?.substring(0, 300))
      return NextResponse.json({ error: 'No plan generated. The AI returned an empty response. Please try again.' }, { status: 500 })
    }

    // Strip markdown code fences
    const jsonStr = content.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim()

    let plan
    try {
      plan = JSON.parse(jsonStr)
    } catch {
      const jsonMatch = jsonStr.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        try {
          plan = JSON.parse(jsonMatch[0])
        } catch {
          const snippet = jsonStr.substring(0, 150).replace(/\n/g, ' ')
          console.error('Plan JSON parse failed. Content snippet:', snippet)
          return NextResponse.json({ error: `Plan format error. The AI returned invalid JSON. Please try again. (Got: ${snippet})` }, { status: 500 })
        }
      } else {
        const snippet = jsonStr.substring(0, 150).replace(/\n/g, ' ')
        return NextResponse.json({ error: `Plan format error. Expected JSON but got: ${snippet}` }, { status: 500 })
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