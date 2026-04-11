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

type WttrResponse = {
  nearest_area: Array<{
    areaName: Array<{ value: string }>
    country: Array<{ value: string }>
  }>
  weather: Array<{
    date: string
    maxtempC: string
    mintempC: string
    hourly: Array<{
      lang_en: Array<{ value: string }>
      weatherDesc: Array<{ value: string }>
    }>
  }>
}

type OpenMeteoGeoResponse = Array<{
  latitude: number
  longitude: number
  name: string
  country: string
}>

type OpenMeteoArchiveResponse = {
  daily: {
    temperature_2m_max: number[]
    temperature_2m_min: number[]
    precipitation_sum: number[]
  } | null
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

  try {
    // ── Step 1: Geocode city for Open-Meteo ──────────────────────────
    let lat = 0
    let lng = 0
    let resolvedName = citySanitized

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
      // geocode failed — proceed with wttr.in location name only
    }

    // ── Step 2: wttr.in forecast ─────────────────────────────────────
    const wttrUrl = dateParam
      ? `https://wttr.in/${encodeURIComponent(citySanitized)}?format=j1&date=${dateParam.replace(/-/g, '')}`
      : `https://wttr.in/${encodeURIComponent(citySanitized)}?format=j1`

    const wttrRes = await fetch(wttrUrl, { next: { revalidate: 3600 } })

    if (!wttrRes.ok) {
      return NextResponse.json({ error: 'Weather service unavailable' }, { status: 502 })
    }

    const wttrData: WttrResponse = await wttrRes.json()
    const area = wttrData.nearest_area?.[0]

    // Always show 3 days starting from today (or the selected date's day)
    const weatherDates = dateParam
      ? [dateParam]
      : (wttrData.weather || []).slice(0, 3).map((d) => d.date)

    const forecast: WeatherDay[] = (wttrData.weather || [])
      .slice(0, 3)
      .map((day, i) => {
        const hourly = day.hourly?.[4]
        const desc = hourly?.weatherDesc?.[0]?.value || ''
        return {
          date: weatherDates[i] || day.date,
          maxTemp: day.maxtempC || '',
          minTemp: day.mintempC || '',
          desc,
          icon: getWeatherIcon(desc),
        }
      })

    // ── Step 3: Open-Meteo historical averages ────────────────────────
    let historical: HistoricalData = { avgHigh: null, avgLow: null, avgPrecipMm: null }

    if (dateParam && lat !== 0 && lng !== 0) {
      try {
        // Same date last year
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
        // historical data optional — don't fail the request
      }
    }

    // ── Step 4: Travel risk computation ───────────────────────────────
    let travelRisk: 'low' | 'moderate' | 'high' = 'low'
    if (historical.avgPrecipMm != null) {
      if (historical.avgPrecipMm > 5) travelRisk = 'high'
      else if (historical.avgPrecipMm > 2) travelRisk = 'moderate'
    }

    return NextResponse.json({
      location: area ? `${area.areaName?.[0]?.value}, ${area.country?.[0]?.value}` : resolvedName,
      date: dateParam || new Date().toISOString().slice(0, 10),
      forecast,
      historical,
      travelRisk,
    })
  } catch (error) {
    console.error('Weather error:', error)
    return NextResponse.json({ error: 'Failed to fetch weather' }, { status: 500 })
  }
}

function getWeatherIcon(desc: string): string {
  const d = desc.toLowerCase()
  if (d.includes('sun') || d.includes('clear')) return '☀️'
  if (d.includes('partly')) return '⛅'
  if (d.includes('cloud') || d.includes('overcast')) return '☁️'
  if (d.includes('rain') || d.includes('drizzle')) return '🌧️'
  if (d.includes('thunder') || d.includes('storm')) return '⛈️'
  if (d.includes('snow')) return '❄️'
  if (d.includes('fog') || d.includes('mist')) return '🌫️'
  return '🌤️'
}
