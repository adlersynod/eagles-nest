import { NextRequest, NextResponse } from 'next/server'

/**
 * ADLER SYNOD SCOUT v3.0 - DYNAMIC GOOGLE-BACKED PROXIMITY
 * Fixed: State bleed (Kansas showing OKC).
 * Fix Strategy: Uses Google Places TextSearch for high-authority local points.
 */
export async function POST(request: NextRequest) {
  try {
    const { startLat, startLng, endLat, endLng, distance } = await request.json()
    const ratio = Math.min(0.85, 250 / distance)
    const midLat = startLat + (endLat - startLat) * ratio
    const midLng = startLng + (endLng - startLng) * ratio

    // 1. Precise City/State Detection
    const geoRes = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${midLat}&lon=${midLng}&format=json`, {
      headers: { 'User-Agent': 'EaglesNest/1.4' }
    })
    const geoData = await geoRes.json()
    const city = geoData.address?.city || geoData.address?.town || geoData.address?.village || geoData.address?.county || "RV Park"
    const state = geoData.address?.state || ""

    // 2. USE GOOGLE PLACES FOR HIGH-LOCALITY ACCURACY
    // Query string designed to force real businesses in the specific location.
    const googleQuery = `top rated RV parks and campgrounds near ${city} ${state} big rig friendly`
    const googleRes = await fetch(
      `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(googleQuery)}&location=${midLat},${midLng}&radius=50000&key=${process.env.GOOGLE_PLACES_API_KEY}`
    )
    
    const googleData = await googleRes.json()
    const results = googleData.results || []

    let suggestions = results
      .filter((p: any) => {
          const name = p.name.toLowerCase()
          // Filter out generic mobile home parks or non-travel parks
          return !name.includes('mobile home') && !name.includes('estates') && !name.includes('apartments')
      })
      .slice(0, 3)
      .map((p: any) => ({
        name: p.name,
        // Since Google Places API returns IDs, we generate a direct Google Maps/Search link for the user
        url: `https://www.google.com/search?q=${encodeURIComponent(p.name + " " + p.formatted_address)}`,
        location: p.formatted_address || `${city}, ${state}`,
        lat: p.geometry?.location?.lat || midLat,
        lng: p.geometry?.location?.lng || midLng,
        rating: p.rating || 0
      }))

    // 3. EMERGENCY LOCALIZED FALLBACK (if Google is empty)
    if (suggestions.length === 0) {
        suggestions = [{
            name: `${city} Area Camping`,
            url: `https://www.google.com/maps/search/rv+parks+near+${midLat},${midLng}`,
            location: `${city}, ${state}`,
            lat: midLat,
            lng: midLng
        }]
    }

    return NextResponse.json({ 
      midpoint: { lat: midLat, lng: midLng, city, state }, 
      suggestions,
      _debug: { query: googleQuery, status: googleData.status }
    })
  } catch (err) {
    console.error('Scout Error:', err)
    return NextResponse.json({ error: 'Scouting failed' }, { status: 500 })
  }
}
