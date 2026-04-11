import { NextResponse } from 'next/server'

export async function GET() {
  const results: Record<string, unknown> = {}

  // Test 1: Open-Meteo geocode
  try {
    const geoRes = await fetch('https://geocoding-api.open-meteo.com/v1/search?name=Seattle&count=1', { signal: AbortSignal.timeout(5000) })
    const geoData = await geoRes.json()
    results.geocode = { ok: geoRes.ok, count: geoData.results?.length ?? 0, first: geoData.results?.[0] ? { lat: geoData.results[0].latitude, lng: geoData.results[0].longitude } : null }
  } catch (e: unknown) {
    results.geocode = { error: String(e) }
  }

  // Test 2: Open-Meteo forecast
  try {
    const fcRes = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=47.6062&longitude=-122.3321&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=16`,
      { signal: AbortSignal.timeout(5000) }
    )
    results.forecastStatus = { ok: fcRes.ok, status: fcRes.status, contentLength: fcRes.headers.get('content-length'), contentType: fcRes.headers.get('content-type') }
    const fcData = await fcRes.json()
    results.forecastData = {
      hasDaily: !!fcData?.daily,
      dailyKeys: Object.keys(fcData?.daily || {}),
      timeLength: fcData?.daily?.time?.length,
      timeFirst: fcData?.daily?.time?.[0],
      timeLast: fcData?.daily?.time?.[fcData?.daily?.time?.length - 1],
    }
  } catch (e: unknown) {
    results.forecast = { error: String(e) }
  }

  // Test 3: wttr.in
  try {
    const wttrRes = await fetch(`https://wttr.in/Seattle?format=j1`, { signal: AbortSignal.timeout(5000) })
    const wttrData = await wttrRes.json()
    results.wttr = { ok: wttrRes.ok, weatherDays: wttrData.weather?.length, firstDate: wttrData.weather?.[0]?.date }
  } catch (e: unknown) {
    results.wttr = { error: String(e) }
  }

  return NextResponse.json(results)
}
