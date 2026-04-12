import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const { startLat, startLng, endLat, endLng, distance } = await request.json()
    const ratio = Math.min(0.85, 250 / distance)
    const midLat = startLat + (endLat - startLat) * ratio
    const midLng = startLng + (endLng - startLng) * ratio

    // 1. Perform LIVE search for the specific coordinate to ensure uniqueness
    const query = `RV parks near ${midLat.toFixed(4)}, ${midLng.toFixed(4)} big rig access KOA Good Sam`
    const searchRes = await fetch(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=10`, {
      headers: { 'Accept': 'application/json', 'X-Subscription-Token': process.env.BRAVE_API_KEY || '' }
    })

    let suggestions = []
    if (searchRes.ok) {
      const data = await searchRes.json()
      // Filter for actual RV park results (avoiding broad city pages)
      suggestions = (data.web?.results || [])
        .filter((r: any) => 
          r.url.includes('koa.com') || 
          r.url.includes('campgrounds.rvlife.com') || 
          r.url.includes('goodsam.com') ||
          r.title.toLowerCase().includes('rv park') || 
          r.title.toLowerCase().includes('campground')
        )
        .slice(0, 3)
        .map((r: any) => {
          // Clean up titles: "Holiday RV Park - North Platte, NE - RV LIFE" -> "Holiday RV Park"
          let name = r.title.split('-')[0].split('|')[0].split(':')[0].trim()
          return {
            name,
            url: r.url,
            lat: midLat,
            lng: midLng
          }
        })
    }

    // 2. High-Fidelity Fallback Matrix (Leg-Specific)
    if (suggestions.length < 2) {
      if (midLng > -103 && midLng < -98) { // Leg: AR to Omaha/NE
        suggestions = [
          { name: "North Platte KOA Journey", url: "https://koa.com/campgrounds/north-platte/", lat: 41.1359, lng: -100.7630 },
          { name: "Holiday RV Park & Campground", url: "https://holidayrvpark.com/", lat: 41.1239, lng: -100.7450 },
          { name: "Buffalo Bill State Park", url: "http://outdoornebraska.gov/buffalobillranch/", lat: 41.1648, lng: -100.7936 }
        ]
      } else if (midLng <= -103 && midLng > -108) { // Leg: NE to Bozeman
        suggestions = [
          { name: "Deer Park RV Resort (Buffalo, WY)", url: "https://www.deerparkrv.com/", lat: 44.3338, lng: -106.6853 },
          { name: "Sheridan / Big Horn Mountains KOA", url: "https://koa.com/campgrounds/sheridan/", lat: 44.8322, lng: -106.9664 },
          { name: "Wyoming National Forest (Midpoint)", url: "https://www.fs.usda.gov/btnf", lat: 43.5, lng: -107.5 }
        ]
      } else if (midLng <= -108 && midLat > 40) { // Leg: MT to PNW
        suggestions = [
          { name: "Boise Riverside RV Park", url: "https://www.boiseriversidervpark.com/", lat: 43.6187, lng: -116.2146 },
          { name: "Mountain Home RV Park", url: "http://mountainhomervpark.com/", lat: 43.1330, lng: -115.6912 },
          { name: "Baker City KOA Journey", url: "https://koa.com/campgrounds/baker-city/", lat: 44.7749, lng: -117.8344 }
        ]
      } else if (midLat < 35 && midLng < -100) { // Leg: Southwest/TX
        suggestions = [
          { name: "Van Horn RV Park (TX)", url: "https://vanhornrvpark.com/", lat: 31.0407, lng: -104.8310 },
          { name: "Wild Horse RV Park", url: "https://www.wildhorserv.com/", lat: 31.0494, lng: -104.8211 },
          { name: "Fort Stockton RV Park", url: "https://fortstocktonrvpark.com/", lat: 30.8885, lng: -102.8794 }
        ]
      }
    }

    return NextResponse.json({ midpoint: { lat: midLat, lng: midLng }, suggestions })
  } catch (err) {
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
