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

  // ── Step 1: Geocode via Open-Meteo ───────────────────────────────
  try {
    const geoRes = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(citySanitized)}&count=1`
    )
    if (geoRes.ok) {
      const geoData: OpenMeteoGeoResponse = await geoRes.json()
      if (geoData.length > 0) {
        lat = geoData[0].latitude
        lng = geoData[0].longitude
        resolvedName = `${geoData[0].name}, ${geoData[0].country}`
      }
    }
  } catch (e) {
    console.error('Geocode error:', e)
  }

  // ── Step 2: Fetch Open-Meteo forecast ────────────────────────────
  let forecast: WeatherDay[] = []
  if (lat !== 0 && lng !== 0) {
    try {
      const forecastRes = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=16`
      )
      if (forecastRes.ok) {
        const fcData = await forecastRes.json()
        console.error('OpenMeteo raw response keys:', Object.keys(fcData || {}))
        console.error('OpenMeteo daily:', JSON.stringify(fcData?.daily)?.slice(0, 200))
        const days = fcData?.daily
        if (days?.time?.length) {
          forecast = days.time.map((date: string, i: number) => {
            const code = days.weather_code?.[i] ?? 0
            const { icon, desc } = weatherCodeToIconAndDesc(code)
            return {
              date,
              maxTemp: `${Math.round(days.temperature_2m_max?.[i] ?? 0)}°C`,
              minTemp: `${Math.round(days.temperature_2m_min?.[i] ?? 0)}°C`,
              desc,
              icon,
            }
          })
          console.error('OpenMeteo forecast built, days:', forecast.length)
        } else {
          console.error('OpenMeteo days.time empty or missing, days:', days)
        }
      }
    } catch (e) {
      console.error('Forecast error:', e)
    }
  }

  // ── Step 3: Fall back to wttr.in if Open-Meteo forecast failed ─
  if (!forecast.length) {
    try {
      const wttrRes = await fetch(
        `https://wttr.in/${encodeURIComponent(citySanitized)}?format=j1`
      )
      if (wttrRes.ok) {
        const wttrData = await wttrRes.json()
        const area = wttrData.nearest_area?.[0]
        if (area) resolvedName = `${area.areaName?.[0]?.value}, ${area.country?.[0]?.value}`
        forecast = (wttrData.weather || []).slice(0, 3).map((day: Record<string, unknown>) => {
          const hourly = (day.hourly as Array<Record<string, unknown>>)?.[4]
          const desc = String((hourly?.weatherDesc as Array<{ value: string }>)?.[0]?.value || '')
          return {
            date: String(day.date || ''),
            maxTemp: `${day.maxtempC}°C`,
            minTemp: `${day.mintempC}°C`,
            desc,
            icon: getWttrIcon(desc),
          }
        })
      }
    } catch (e) {
      console.error('Wttr fallback error:', e)
    }
  }

  if (!forecast.length) {
    return NextResponse.json({ error: 'Could not fetch weather data.' }, { status: 502 })
  }

  // ── Step 4: Historical averages ──────────────────────────────────
  let historical: HistoricalData = { avgHigh: null, avgLow: null, avgPrecipMm: null }
  if (dateParam && lat !== 0 && lng !== 0) {
    try {
      const lastYear = String(parseInt(dateParam.slice(0, 4)) - 1) + dateParam.slice(4)
      const archiveRes = await fetch(
        `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lng}&start_date=${lastYear}&end_date=${lastYear}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum&timezone=auto`
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
    } catch (e) {
      console.error('Historical error:', e)
    }
  }

  // ── Step 5: Travel risk ─────────────────────────────────────────
  let travelRisk: 'low' | 'moderate' | 'high' = 'low'
  if (historical.avgPrecipMm != null) {
    if (historical.avgPrecipMm > 5) travelRisk = 'high'
    else if (historical.avgPrecipMm > 2) travelRisk = 'moderate'
  }

  // ── Step 6: Filter to requested date ────────────────────────────
  const targetDate = dateParam || new Date().toISOString().slice(0, 10)
  const today = new Date().toISOString().slice(0, 10)

  // Find the best starting index: target date if in future, today if in past, target otherwise
  let startIdx = 0
  const targetIdx = forecast.findIndex((d) => d.date === targetDate)
  if (targetIdx >= 0) {
    startIdx = targetIdx
  } else if (targetDate < today) {
    // Requested date is in the past — show most recent 3 days available
    startIdx = Math.max(0, forecast.length - 3)
  }
  const forecastSlice = forecast.slice(startIdx, startIdx + 3)

  return NextResponse.json({
    location: resolvedName,
    date: targetDate,
    forecast: forecastSlice,
    historical,
    travelRisk,
  })
}

function getWttrIcon(desc: string): string {
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
