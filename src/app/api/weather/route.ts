import { NextRequest, NextResponse } from 'next/server'

type WeatherDay = {
  maxTemp: string
  minTemp: string
  desc: string
  icon: string
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

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const city = searchParams.get('city')

  if (!city || city.length > 200) {
    return NextResponse.json({ error: 'Missing or invalid city parameter.' }, { status: 400 })
  }

  const citySanitized = city.replace(/[^a-zA-Z0-9\s\-\.,']/g, '').trim()
  if (!citySanitized) {
    return NextResponse.json({ error: 'Invalid city name.' }, { status: 400 })
  }

  try {
    const url = `https://wttr.in/${encodeURIComponent(citySanitized)}?format=j1`
    const response = await fetch(url, { next: { revalidate: 3600 } })

    if (!response.ok) {
      return NextResponse.json({ error: 'Weather service unavailable' }, { status: 502 })
    }

    const data: WttrResponse = await response.json()
    const area = data.nearest_area?.[0]

    // Get 3-day forecast
    const forecast: WeatherDay[] = (data.weather || []).slice(0, 3).map((day) => {
      // Get mid-day description (~8am index 4)
      const hourly = day.hourly?.[4]
      const desc = hourly?.weatherDesc?.[0]?.value || ''
      return {
        date: day.date,
        maxTemp: day.maxtempC || '',
        minTemp: day.mintempC || '',
        desc,
        icon: getWeatherIcon(desc),
      }
    })

    return NextResponse.json({
      location: area ? `${area.areaName?.[0]?.value}, ${area.country?.[0]?.value}` : citySanitized,
      forecast,
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
