import { NextResponse } from 'next/server'

export async function GET() {
  const results: Record<string, unknown> = {}

  // Test archive API for April 2025 (full month)
  try {
    const t0 = Date.now()
    const res = await fetch(
      `https://archive-api.open-meteo.com/v1/archive?latitude=47.6062&longitude=-122.3321&start_date=2025-04-01&end_date=2025-04-30&daily=temperature_2m_max,temperature_2m_min,precipitation_sum&timezone=auto`,
      { signal: AbortSignal.timeout(6000) }
    )
    const ms = Date.now() - t0
    const data = await res.json()
    const daily = data?.daily
    if (daily?.temperature_2m_max?.length) {
      const avgHigh = daily.temperature_2m_max.reduce((s: number, v: number) => s + v, 0) / daily.temperature_2m_max.length
      const avgLow = daily.temperature_2m_min.reduce((s: number, v: number) => s + v, 0) / daily.temperature_2m_min.length
      const avgPrecip = daily.precipitation_sum.reduce((s: number, v: number) => s + (v || 0), 0)
      results.archive = { ms, ok: true, days: daily.temperature_2m_max.length, avgHigh: Math.round(avgHigh * 9/5 + 32), avgLow: Math.round(avgLow * 9/5 + 32), avgPrecip: parseFloat(avgPrecip.toFixed(1)) }
    } else {
      results.archive = { ms, ok: false, keys: Object.keys(daily || {}) }
    }
  } catch (e: unknown) {
    results.archive = { error: String(e) }
  }

  return NextResponse.json(results)
}
