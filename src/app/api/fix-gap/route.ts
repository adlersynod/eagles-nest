import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const { startLat, startLng, endLat, endLng, distance } = await request.json()
    
    // 1. Calculate midpoint
    const ratio = Math.min(0.85, 250 / distance)
    const midLat = startLat + (endLat - startLat) * ratio
    const midLng = startLng + (endLng - startLng) * ratio

    // 2. Identify Region for precise fallback recommendations
    let suggestions = []
    let city = "Midpoint Stop"

    if (midLng > -103 && midLng < -98) { // NEBRASKA I-80 CORRIDOR
      city = "North Platte / Sidney, NE"
      suggestions = [
        { name: "North Platte KOA Journey", url: "https://koa.com/campgrounds/north-platte/", lat: 41.1359, lng: -100.7630 },
        { name: "Holiday RV Park & Campground", url: "https://holidayrvpark.com/", lat: 41.1239, lng: -100.7450 },
        { name: "Sidney KOA Holiday", url: "https://koa.com/campgrounds/sidney/", lat: 41.2174, lng: -102.9772 }
      ]
    } else if (midLng <= -103 && midLng > -108 && midLat > 42) { // WYOMING I-90 / I-25
      city = "Buffalo / Sheridan, WY"
      suggestions = [
        { name: "Deer Park RV Resort", url: "https://www.deerparkrv.com/", lat: 44.3338, lng: -106.6853 },
        { name: "Sheridan / Big Horn Mountains KOA", url: "https://koa.com/campgrounds/sheridan/", lat: 44.8322, lng: -106.9664 },
        { name: "Indian Campground", url: "https://www.indiancampground.com/", lat: 44.3541, lng: -106.6022 }
      ]
    } else if (midLng <= -110 && midLat > 40) { // PNW I-84 (BOISE/BAKER)
      city = "Boise / Mountain Home, ID"
      suggestions = [
        { name: "Mountain Home RV Park", url: "http://mountainhomervpark.com/", lat: 43.1330, lng: -115.6912 },
        { name: "Boise Riverside RV Park", url: "https://www.boiseriversidervpark.com/", lat: 43.6187, lng: -116.2146 },
        { name: "Baker City KOA Journey", url: "https://koa.com/campgrounds/baker-city/", lat: 44.7749, lng: -117.8344 }
      ]
    } else if (midLat < 34 && midLng < -100) { // SOUTHWEST I-10 (VAN HORN)
      city = "Van Horn / Ft Stockton, TX"
      suggestions = [
        { name: "Van Horn RV Park", url: "https://vanhornrvpark.com/", lat: 31.0407, lng: -104.8310 },
        { name: "Wild Horse RV Park", url: "https://www.wildhorserv.com/", lat: 31.0494, lng: -104.8211 },
        { name: "Fort Stockton RV Park", url: "https://fortstocktonrvpark.com/", lat: 30.8885, lng: -102.8794 }
      ]
    } else {
      // General LIVE search for all other legs
      const query = `RV parks near ${midLat.toFixed(2)}, ${midLng.toFixed(2)} big rig sites`
      const res = await fetch(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=10`, {
        headers: { 'Accept': 'application/json', 'X-Subscription-Token': process.env.BRAVE_API_KEY || '' }
      })
      if (res.ok) {
        const data = await res.json()
        suggestions = (data.web?.results || [])
          .filter((r: any) => !r.title.toLowerCase().includes('directory') && !r.url.includes('forum'))
          .slice(0, 3)
          .map((r: any) => ({
            name: r.title.split('-')[0].trim(),
            url: r.url,
            lat: midLat,
            lng: midLng
          }))
      }
    }

    return NextResponse.json({ midpoint: { lat: midLat, lng: midLng, city }, suggestions })
  } catch (err) {
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
