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
  avgHigh: string | null
  avgLow: string | null
  avgPrecipMm: number | null
  trend: string | null
  monthLabel: string
}

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

function parseTemp(tempStr: string): number {
  const m = String(tempStr).match(/^([\d\-]+)/)
  return m ? parseInt(m[1]) : NaN
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

  // Step 1: Geocode via Open-Meteo
  try {
    const geoRes = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(citySanitized)}&count=1`
    )
    if (geoRes.ok) {
      const geoData = await geoRes.json()
      if (geoData.results?.length > 0) {
        lat = geoData.results[0].latitude
        lng = geoData.results[0].longitude
        resolvedName = `${geoData.results[0].name}, ${geoData.results[0].country}`
      }
    }
  } catch (e) {
    console.error('Geocode error:', e)
  }

  // Step 2: Fetch Open-Meteo forecast (Fahrenheit)
  let forecast: WeatherDay[] = []
  if (lat !== 0 && lng !== 0) {
    try {
      const fcRes = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&daily=weather_code,temperature_2m_max,temperature_2m_min&temperature_unit=fahrenheit&timezone=auto&forecast_days=16`
      )
      if (fcRes.ok) {
        const fcData = await fcRes.json()
        const daily = fcData?.daily
        if (daily?.time?.length) {
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
      console.error('Forecast error:', e)
    }
  }

  // Step 3: Fall back to wttr.in if forecast still empty
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
  const monthName = MONTH_NAMES[parseInt(targetDate.slice(5, 7)) - 1]

  // Step 4: Historical averages for exact date (last year)
  let historical: HistoricalData = { avgHigh: null, avgLow: null, avgPrecipMm: null }
  if (dateParam && lat !== 0 && lng !== 0) {
    try {
      const lastYear = String(parseInt(dateParam.slice(0, 4)) - 1) + dateParam.slice(4)
      const arRes = await fetch(
        `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lng}&start_date=${lastYear}&end_date=${lastYear}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum&timezone=auto`
      )
      if (arRes.ok) {
        const arData = await arRes.json()
        const daily = arData?.daily
        if (daily?.temperature_2m_max?.length) {
          historical = {
            avgHigh: `${Math.round((daily.temperature_2m_max[0] * 9) / 5 + 32)}°F`,
            avgLow: `${Math.round((daily.temperature_2m_min[0] * 9) / 5 + 32)}°F`,
            avgPrecipMm: daily.precipitation_sum?.[0] != null ? parseFloat(daily.precipitation_sum[0].toFixed(1)) : null,
          }
        }
      }
    } catch (e) {
      console.error('Historical error:', e)
    }
  }

  // Step 5: Monthly seasonal normals (climate API, most recent available year)
  let seasonal: SeasonalData = { avgHigh: null, avgLow: null, avgPrecipMm: null, trend: null, monthLabel: monthName }
  if (lat !== 0 && lng !== 0) {
    try {
      const mm = targetDate.slice(5, 7)
      const clRes = await fetch(
        `https://climate-api.open-meteo.com/v1/climate?latitude=${lat}&longitude=${lng}&start_date=2024-${mm}-01&end_date=2024-${mm}-28&daily=temperature_2m_max,temperature_2m_min,precipitation_sum&timezone=auto`
      )
      if (clRes.ok) {
        const clData = await clRes.json()
        const daily = clData?.daily
        const maxVals = (daily?.temperature_2m_max as (number | null)[] | undefined)?.filter((v): v is number => v != null) ?? []
        const minVals = (daily?.temperature_2m_min as (number | null)[] | undefined)?.filter((v): v is number => v != null) ?? []
        const precVals = (daily?.precipitation_sum as (number | null)[] | undefined)?.map(v => v ?? 0) ?? []
        if (maxVals.length) {
          const avgHighC = maxVals.reduce((s, v) => s + v, 0) / maxVals.length
          const avgLowC = minVals.reduce((s, v) => s + v, 0) / minVals.length
          const avgPrecip = precVals.reduce((s, v) => s + v, 0)
          seasonal.avgHigh = `${Math.round(avgHighC * 9 / 5 + 32)}°F`
          seasonal.avgLow = `${Math.round(avgLowC * 9 / 5 + 32)}°F`
          seasonal.avgPrecipMm = parseFloat(avgPrecip.toFixed(1))
        }
      }
    } catch (e) {
      console.error('Seasonal error:', e)
    }
  }

  // Step 6: Slice forecast to 3 days starting from target date
  const today = new Date().toISOString().slice(0, 10)
  const targetIdx = forecast.findIndex((d) => d.date === targetDate)
  let beyondForecast = false
  let startIdx = 0
  if (targetIdx >= 0) {
    startIdx = targetIdx
  } else if (targetDate < today) {
    startIdx = Math.max(0, forecast.length - 3)
  } else {
    beyondForecast = true
    startIdx = Math.max(0, forecast.length - 3)
  }
  const forecastSlice = forecast.slice(startIdx, startIdx + 3)

  // Step 7: Compute trend — compare forecast to seasonal normal
  // (done inline with the forecastSlice to avoid any stale closure issues)
  const fcHighF = parseTemp(forecastSlice[0]?.maxTemp ?? '')
  const normHighF = parseTemp(seasonal.avgHigh ?? '')
  if (!isNaN(fcHighF) && !isNaN(normHighF)) {
    const diff = fcHighF - normHighF
    seasonal.trend = diff > 5 ? 'warmer' : diff < -5 ? 'cooler' : 'normal'
  }

  // Step 8: Travel risk
  let travelRisk: 'low' | 'moderate' | 'high' = 'low'
  const precipMm = historical.avgPrecipMm ?? seasonal.avgPrecipMm
  if (precipMm != null) {
    if (precipMm > 10) travelRisk = 'high'
    else if (precipMm > 5) travelRisk = 'moderate'
  }

  return NextResponse.json({
    location: resolvedName,
    date: targetDate,
    forecast: forecastSlice,
    historical,
    seasonal,
    travelRisk,
    beyondForecast,
  })
}
