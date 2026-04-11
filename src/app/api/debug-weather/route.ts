import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const city = searchParams.get('city') || 'Portland'
  const dateParam = searchParams.get('date') || new Date().toISOString().slice(0, 10)

  // Step 1: Geocode
  const geoRes = await fetch(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1`
  )
  const geoData = await geoRes.json()
  const lat = geoData.results?.[0]?.latitude ?? 0
  const lng = geoData.results?.[0]?.longitude ?? 0

  // Step 2: Open-Meteo forecast
  const fcRes = await fetch(
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&daily=weather_code,temperature_2m_max,temperature_2m_min&temperature_unit=fahrenheit&timezone=auto&forecast_days=16`
  )
  const fcData = await fcRes.json()

  // Step 3: Climate normals
  const mm = dateParam.slice(5, 7)
  const clRes = await fetch(
    `https://climate-api.open-meteo.com/v1/climate?latitude=${lat}&longitude=${lng}&start_date=2024-${mm}-01&end_date=2024-${mm}-28&daily=temperature_2m_max,temperature_2m_min,precipitation_sum&timezone=auto`
  )
  const clData = await clRes.json()

  // Step 4: Historical
  const lastYear = String(parseInt(dateParam.slice(0, 4)) - 1) + dateParam.slice(4)
  const arRes = await fetch(
    `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lng}&start_date=${lastYear}&end_date=${lastYear}&daily=temperature_2m_max,temperature_2m_min,precipation_sum&timezone=auto`
  )
  const arData = await arRes.json()

  return NextResponse.json({
    city,
    dateParam,
    lat,
    lng,
    forecastDays: fcData?.daily?.time?.length ?? 0,
    forecastDates: fcData?.daily?.time ?? [],
    climateDays: clData?.daily?.temperature_2m_max?.length ?? 0,
    historicalOk: arRes.ok,
    lastYear,
  })
}
