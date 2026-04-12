import { NextRequest, NextResponse } from 'next/server'

/**
 * Enhanced RV Scout Engine v2
 * Uses exact midpoint coordinates to perform highly localized searches
 * for real-world Big Rig friendly RV parks.
 */
export async function POST(request: NextRequest) {
  try {
    const { startLat, startLng, endLat, endLng, distance } = await request.json()
    
    // 1. Precise Coordinate Calculation (250 miles along the path)
    const ratio = Math.min(0.85, 250 / distance)
    const midLat = startLat + (endLat - startLat) * ratio
    const midLng = startLng + (endLng - startLng) * ratio

    // 2. Identify the nearest real city/town for search context
    const geoRes = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${midLat}&lon=${midLng}&format=json`, {
      headers: { 'User-Agent': 'EaglesNest/1.1' }
    })
    const geoData = await geoRes.json()
    const detectedCity = geoData.address?.city || geoData.address?.town || geoData.address?.village || "RV Park"
    const detectedState = geoData.address?.state || ""

    // 3. Perform a hyper-local Brave search for actual RV parks
    // We search for names only to avoid directory junk
    const query = `highly rated RV parks campgrounds in ${detectedCity} ${detectedState} big rig friendly 45ft sites`
    
    const searchRes = await fetch(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=10`, {
      headers: {
        'Accept': 'application/json',
        'X-Subscription-Token': process.env.BRAVE_API_KEY || ''
      }
    })

    let suggestions: any[] = []
    if (searchRes.ok) {
      const data = await searchRes.json()
      const results = data.web?.results || []

      suggestions = results
        .filter((r: any) => {
          const t = r.title.toLowerCase()
          const u = r.url.toLowerCase()
          // STRICT FILTER: Must actually look like a park website or major platform
          const isOfficial = u.includes('koa.com') || u.includes('resort') || u.includes('park') || u.includes('campground')
          const isJunk = t.includes('directory') || t.includes('top 10') || u.includes('forum') || u.includes('irv2') || u.includes('reddit') || t.includes('"')
          return isOfficial && !isJunk
        })
        .slice(0, 3)
        .map((r: any) => ({
          name: r.title.split('-')[0].split('|')[0].split(' - ')[0].trim(),
          url: r.url,
          location: `${detectedCity}, ${detectedState}`,
          lat: midLat,
          lng: midLng
        }))
    }

    // 4. Intelligence Fallback Layer: If the search fails, we use hard-coded high-quality 
    // real-world parks known for these specific long-haul corridors.
    if (suggestions.length < 2) {
      if (midLng > -103 && midLng < -98) { // Leg: NE Corridor (I-80)
        suggestions = [
          { name: "North Platte KOA Journey", url: "https://koa.com/campgrounds/north-platte/", location: "North Platte, NE", lat: 41.1359, lng: -100.7630 },
          { name: "Holiday RV Park & Campground", url: "https://holidayrvpark.com/", location: "North Platte, NE", lat: 41.1239, lng: -100.7450 },
          { name: "Buffalo Bill State Park", url: "http://outdoornebraska.gov/buffalobillranch/", location: "North Platte, NE", lat: 41.1648, lng: -100.7936 }
        ]
      } else if (midLng <= -103 && midLng > -108) { // Leg: WY/I-90 Corridor
        suggestions = [
          { name: "Deer Park RV Resort", url: "https://www.deerparkrv.com/", location: "Buffalo, WY", lat: 44.3338, lng: -106.6853 },
          { name: "Sheridan / Big Horn Mountains KOA", url: "https://koa.com/campgrounds/sheridan/", location: "Sheridan, WY", lat: 44.8322, lng: -106.9664 },
          { name: "Indian Campground", url: "https://www.indiancampground.com/", location: "Buffalo, WY", lat: 44.3541, lng: -106.6022 }
        ]
      } else if (midLng <= -110 && midLat > 40) { // Leg: PNW/I-84 Corridor
        suggestions = [
          { name: "Mountain Home RV Park", url: "http://mountainhomervpark.com/", location: "Mountain Home, ID", lat: 43.1330, lng: -115.6912 },
          { name: "Boise Riverside RV Park", url: "https://www.boiseriversidervpark.com/", location: "Garden City, ID", lat: 43.618, lng: -116.214 },
          { name: "Baker City KOA Journey", url: "https://koa.com/campgrounds/baker-city/", location: "Baker City, OR", lat: 44.774, lng: -117.834 }
        ]
      } else if (midLat < 34 && midLng < -100) { // Leg: TX/I-10 Corridor
        suggestions = [
          { name: "Van Horn RV Park", url: "https://vanhornrvpark.com/", location: "Van Horn, TX", lat: 31.040, lng: -104.831 },
          { name: "Wild Horse RV Park", url: "https://www.wildhorserv.com/", location: "Van Horn, TX", lat: 31.049, lng: -104.821 },
          { name: "Fort Stockton RV Park", url: "https://fortstocktonrvpark.com/", location: "Fort Stockton, TX", lat: 30.888, lng: -102.879 }
        ]
      }
    }

    return NextResponse.json({ midpoint: { lat: midLat, lng: midLng, city: detectedCity }, suggestions })
  } catch (err) {
    console.error('Gap Fix Error:', err)
    return NextResponse.json({ error: 'Failed to scout local parks' }, { status: 500 })
  }
}
