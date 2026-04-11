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

type SeasonalData = {
  avgHigh: string | null      // monthly normal high (°F)
  avgLow: string | null       // monthly normal low (°F)
  avgPrecipMm: number | null  // monthly normal precip (mm)
  trend: string | null        // "warmer", "cooler", "normal", "unknown"
  monthLabel: string          // e.g. "April"
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

const MONTH_NAMES = ['January','February','March','April','May','June',
                    'July','August','September','October','November','December']

function cToF(c: number): number { return Math.round((c * 9) / 5 + 32) }

async function fetchMonthlyNormals(lat: number, lng: number, yearMonth: string):
  Promise<{ avgHigh: number | null; avgLow: number | null; avgPrecip: number | null }> {
  // Fetch last 3 years of this month for a reliable seasonal average
  const year = parseInt(yearMonth.slice(0, 4))
  const results = { highs: [] as number[], lows: [] as number[], precips: [] as number[] }

  for (let y = year - 1; y >= year - 3; y--) {
    try {
      const start = `${y}-${yearMonth.slice(5)}`
      const daysInMonth = new Date(y, parseInt(yearMonth.slice(5)), 0).getDate()
      const end = `${y}-${yearMonth.slice(5)}-${String(daysInMonth).padStart(2,'0')}`
      const res = await fetch(
        `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lng}&start_date=${start}&end_date=${end}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum&timezone=auto`,
        { signal: AbortSignal.timeout(8000) }
      )
      if (!res.ok) continue
      const data = await res.json()
      const daily = data?.daily
      if (!daily?.temperature_2m_max?.length) continue
      const monthlyAvgHigh = daily.temperature_2m_max.reduce((s: number, v: number) => s + v, 0) / daily.temperature_2m_max.length
      const monthlyAvgLow = daily.temperature_2m_min.reduce((s: number, v: number) => s + v, 0) / daily.temperature_2m_min.length
      const monthlyPrecip = daily.precipitation_sum.reduce((s: number, v: number) => s + (v || 0), 0)
      results.highs.push(monthlyAvgHigh)
      results.lows.push(monthlyAvgLow)
      results.precips.push(monthlyPrecip)
    } catch { /* skip failed year */ }
  }

  const avgHigh = results.highs.length ? results.highs.reduce((s, v) => s + v, 0) / results.highs.length : null
  const avgLow = results.lows.length ? results.lows.reduce((s, v) => s + v, 0) / results.lows.length : null
  const avgPrecip = results.precips.length ? results.precips.reduce((s, v) => s + v, 0) / results.precips.length : null
  return { avgHigh, avgLow, avgPrecip }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const city = searchParams.get('city')
  const dateParam = searchParams.get('date')

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
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(citySanitized)}&count=1`,
      { signal: AbortSignal.timeout(5000) }
    )
    if (geoRes.ok) {
      const geoData = await geoRes.json()
      if (geoData.results && geoData.results.length > 0) {
        lat = geoData.results[0].latitude
        lng = geoData.results[0].longitude
        resolvedName = `${geoData.results[0].name}, ${geoData.results[0].country}`
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
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&daily=weather_code,temperature_2m_max,temperature_2m_min&temperature_unit=fahrenheit&timezone=auto&forecast_days=16`,
        { signal: AbortSignal.timeout(8000) }
      )
      if (forecastRes.ok) {
        const fcData = await forecastRes.json()
        const daily = fcData?.daily
        if (daily && Array.isArray(daily.time) && daily.time.length > 0) {
          forecast = daily.time.map((date: string, i: number) => {
            const code = daily.weather_code?.[i] ?? 0
            const { icon, desc } = weatherCodeToIconAndDesc(code)
            return {
              date,
              maxTemp: `${Math.round(daily.temperature_2m_max?.[i] ?? 0)}°F`,
              minTemp: `${Math.round(daily.temperature_2m_min?.[i] ?? 0)}°F`,
              desc,
              icon,
            }
          })
        }
      }
    } catch (e) {
      console.error('Open-Meteo forecast error:', e)
    }
  }

  // ── Step 3: Fall back to wttr.in if Open-Meteo forecast failed ─
  if (!forecast.length) {
    try {
      const wttrRes = await fetch(
        `https://wttr.in/${encodeURIComponent(citySanitized)}?format=j1`,
        { signal: AbortSignal.timeout(5000) }
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
            maxTemp: `${Math.round(Number(day.maxtempF ?? day.maxtempC))}°F`,
            minTemp: `${Math.round(Number(day.mintempF ?? day.mintempC))}°F`,
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

  const targetDate = dateParam || new Date().toISOString().slice(0, 10)
  const targetMonth = targetDate.slice(0, 7) // YYYY-MM
  const monthName = MONTH_NAMES[parseInt(targetDate.slice(5, 7)) - 1]

  // ── Step 4: Historical averages for exact date ──────────────────
  let historical: HistoricalData = { avgHigh: null, avgLow: null, avgPrecipMm: null }
  if (dateParam && lat !== 0 && lng !== 0) {
    try {
      const lastYear = String(parseInt(dateParam.slice(0, 4)) - 1) + dateParam.slice(4)
      const archiveRes = await fetch(
        `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lng}&start_date=${lastYear}&end_date=${lastYear}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum&timezone=auto`,
        { signal: AbortSignal.timeout(8000) }
      )
      if (archiveRes.ok) {
        const archiveData = await archiveRes.json()
        const daily = archiveData?.daily
        if (daily && Array.isArray(daily.temperature_2m_max) && daily.temperature_2m_max.length > 0) {
          historical = {
            avgHigh: `${cToF(daily.temperature_2m_max[0])}°F`,
            avgLow: `${cToF(daily.temperature_2m_min[0])}°F`,
            avgPrecipMm: daily.precipitation_sum?.[0] != null ? parseFloat(daily.precipitation_sum[0].toFixed(1)) : null,
          }
        }
      }
    } catch (e) {
      console.error('Historical archive error:', e)
    }
  }

  // ── Step 5: Monthly seasonal normals (3-year average) ────────────
  let seasonal: SeasonalData = {
    avgHigh: null, avgLow: null, avgPrecipMm: null, trend: null, monthLabel: monthName
  }
  if (lat !== 0 && lng !== 0) {
    try {
      const normals = await fetchMonthlyNormals(lat, lng, targetMonth)
      if (normals.avgHigh != null) {
        seasonal.avgHigh = `${cToF(normals.avgHigh as number)}°F`
        seasonal.avgLow = `${cToF(normals.avgLow as number)}°F`
        seasonal.avgPrecipMm = normals.avgPrecip != null ? parseFloat(normals.avgPrecip.toFixed(1)) : null

        // Compute trend from forecast vs normals
        const forecastHigh = parseInt(forecast[0]?.maxTemp)
        if (!isNaN(forecastHigh) && (normals.avgHigh as number) > 0) {
          const diff = forecastHigh - cToF(normals.avgHigh as number)
          if (diff > 5) seasonal.trend = 'warmer'
          else if (diff < -5) seasonal.trend = 'cooler'
          else seasonal.trend = 'normal'
        }
      }
    } catch (e) {
      console.error('Seasonal normals error:', e)
    }
  }

  // ── Step 6: Travel risk ─────────────────────────────────────────
  let travelRisk: 'low' | 'moderate' | 'high' = 'low'
  const precipMm = historical.avgPrecipMm ?? seasonal.avgPrecipMm
  if (precipMm != null) {
    if (precipMm > 10) travelRisk = 'high'
    else if (precipMm > 5) travelRisk = 'moderate'
  }

  // ── Step 7: Slice forecast to 3 days starting from target date ──
  const targetIdx = forecast.findIndex((d) => d.date === targetDate)
  const startIdx = targetIdx >= 0 ? targetIdx : 0
  const forecastSlice = forecast.slice(startIdx, startIdx + 3)

  return NextResponse.json({
    location: resolvedName,
    date: targetDate,
    forecast: forecastSlice,
    historical,
    seasonal,
    travelRisk,
  })
}
