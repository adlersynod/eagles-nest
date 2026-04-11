import { NextRequest, NextResponse } from 'next/server'

type WeatherDay = {
  date: string
  maxTemp: string
  minTemp: string
  desc: string
  icon: string
}

type HistoricalData = {
  avgHigh: string | null
  avgLow: string | null
  avgPrecipMm: number | null
}

type OpenMeteoGeoResponse = Array<{
  latitude: number
  longitude: number
  name: string
  country: string
}>

type OpenMeteoForecastResponse = {
  daily: {
    time: string[]
    weather_code: number[]
    temperature_2m_max: number[]
    temperature_2m_min: number[]
  }
}

type OpenMeteoArchiveResponse = {
  daily: {
    temperature_2m_max: number[]
    temperature_2m_min: number[]
    precipitation_sum: number[]
  } | null
}

// ── Weather code → icon + description ───────────────────────────────
function weatherCodeToIconAndDesc(code: number): { icon: string; desc: string } {
  if (code === 0) return { icon: '☀️', desc: 'Clear sky' }
  if (code === 1) return { icon: '🌤️', desc: 'Mainly clear' }
  if (code === 2) return { icon: '⛅', desc: 'Partly cloudy' }
  if (code === 3) return { icon: '☁️', desc: 'Overcast' }
  if (code === 45 || code === 48) return { icon: '🌫️', desc: 'Foggy' }
  if (code >= 51 && code <= 55) return { icon: '🌧️', desc: 'Drizzle' }
  if (code >= 61 && code <= 65) return { icon: '🌧️', desc: 'Rain' }
  if (code >= 71 && code <= 75) return { icon: '❄️', desc: 'Snow' }
  if (code >= 80 && code <= 82) return { icon: '🌦️', desc: 'Rain showers' }
  if (code >= 95) return { icon: '⛈️', desc: 'Thunderstorm' }
  return { icon: '🌤️', desc: 'Unknown' }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const city = searchParams.get('city')
  const dateParam = searchParams.get('date') // YYYY-MM-DD

  if (!city || city.length > 200) {
    return NextResponse.json({ error: 'Missing or invalid city parameter.' }, { status: 400 })
  }

  const citySanitized = city.replace(/[^a-zA-Z0-9\s\-\.,']/g, '').trim()
  if (!citySanitized) {
    return NextResponse.json({ error: 'Invalid city name.' }, { status: 400 })
  }

  let lat = 0
  let lng = 0
  let resolvedName = citySanitized

  // ── Step 1: Geocode ─────────────────────────────────────────────
  try {
    const geoRes = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(citySanitized)}&count=1`,
      { next: { revalidate: 86400 } }
    )
    if (geoRes.ok) {
      const geoData: OpenMeteoGeoResponse = await geoRes.json()
      if (geoData.length > 0) {
        lat = geoData[0].latitude
        lng = geoData[0].longitude
        resolvedName = `${geoData[0].name}, ${geoData[0].country}`
      }
    }
  } catch {
    // geocode failed
  }

  if (lat === 0 || lng === 0) {
    return NextResponse.json({ error: 'Could not resolve city location.' }, { status: 422 })
  }

  // ── Step 2: Open-Meteo forecast (up to 16 days) ──────────────────
  let forecast: WeatherDay[] = []
  try {
    const forecastRes = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=16`,
      { next: { revalidate: 3600 } }
    )
    if (forecastRes.ok) {
      const fcData: OpenMeteoForecastResponse = await forecastRes.json()
      const days = fcData.daily
      forecast = days.time.map((date, i) => {
        const code = days.weather_code[i]
        const { icon, desc } = weatherCodeToIconAndDesc(code)
        return {
          date,
          maxTemp: `${Math.round(days.temperature_2m_max[i])}°C`,
          minTemp: `${Math.round(days.temperature_2m_min[i])}°C`,
          desc,
          icon,
        }
      })
    }
  } catch {
    // forecast fetch failed
  }

  // If no forecast data, return error
  if (!forecast.length) {
    return NextResponse.json({ error: 'Could not fetch forecast.' }, { status: 502 })
  }

  // ── Step 3: Filter forecast to dateParam or default to 3 days ───
  const today = new Date().toISOString().slice(0, 10)
  const targetDate = dateParam || today

  // Show up to 3 days starting from target date (or first 3 if target not found)
  const targetIdx = forecast.findIndex((d) => d.date === targetDate)
  const startIdx = targetIdx >= 0 ? targetIdx : 0
  const forecastSlice = forecast.slice(startIdx, startIdx + 3)

  // ── Step 4: Historical averages from same date last year ────────
  let historical: HistoricalData = { avgHigh: null, avgLow: null, avgPrecipMm: null }
  if (dateParam) {
    try {
      const lastYear = String(parseInt(dateParam.slice(0, 4)) - 1) + dateParam.slice(4)
      const archiveRes = await fetch(
        `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lng}&start_date=${lastYear}&end_date=${lastYear}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum&timezone=auto`,
        { next: { revalidate: 86400 } }
      )
      if (archiveRes.ok) {
        const archiveData: OpenMeteoArchiveResponse = await archiveRes.json()
        if (archiveData.daily) {
          const temps = archiveData.daily.temperature_2m_max
          const mins = archiveData.daily.temperature_2m_min
          const precips = archiveData.daily.precipitation_sum
          historical = {
            avgHigh: temps[0] != null ? `${Math.round(temps[0])}°C` : null,
            avgLow: mins[0] != null ? `${Math.round(mins[0])}°C` : null,
            avgPrecipMm: precips[0] != null ? parseFloat(precips[0].toFixed(1)) : null,
          }
        }
      }
    } catch {
      // historical optional
    }
  }

  // ── Step 5: Travel risk ─────────────────────────────────────────
  let travelRisk: 'low' | 'moderate' | 'high' = 'low'
  if (historical.avgPrecipMm != null) {
    if (historical.avgPrecipMm > 5) travelRisk = 'high'
    else if (historical.avgPrecipMm > 2) travelRisk = 'moderate'
  }

  return NextResponse.json({
    location: resolvedName,
    date: targetDate,
    forecast: forecastSlice,
    historical,
    travelRisk,
  })
}
