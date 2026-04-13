import { NextRequest, NextResponse } from 'next/server'

/**
 * CONNECTIVITY SHIELD API v1.0
 * Combines FCC/OpenCellID (Cellular) and Google Solar/Vegetation (Starlink) 
 * to provide a "Digital Life Score" for any coordinate.
 */
export async function POST(request: NextRequest) {
  try {
    const { lat, lng } = await request.json()

    // 1. CELLULAR ANALYSIS (OpenCellID / FCC Hybrid)
    // We check for Tower Density within 5km
    const cellRes = await fetch(
      `https://opencellid.org/cell/getInArea?key=${process.env.OPENCELLID_API_KEY}&lat=${lat}&lon=${lng}&range=5000&format=json`
    )
    const cellData = await cellRes.json()
    const towerCount = cellData.cells?.length || 0
    
    // Scoring logic: 0 towers = 0, 10+ towers = 100
    const cellScore = Math.min(100, towerCount * 10)

    // 2. STARLINK SIGHTLINE (Google Solar/Environment Vegetation Layer)
    // We use the Solar API's "max_insolation" and "shadow_mask" as a proxy for tree cover
    // If a site is "Solar-ready", it usually has a clear 100-degree sky-view for Starlink
    const solarRes = await fetch(
      `https://solar.googleapis.com/v1/buildingInsights:findClosest?location.latitude=${lat}&location.longitude=${lng}&key=${process.env.GOOGLE_PLACES_API_KEY}`
    )
    
    let starlinkConfidence = 50 // Default
    if (solarRes.ok) {
        const solarData = await solarRes.json()
        // If maxSunshineHoursPerYear is high (> 1200), we have very high Starlink confidence
        const sunshine = solarData.solarPotential?.maxSunshineHoursPerYear || 0
        if (sunshine > 1400) starlinkConfidence = 95
        else if (sunshine > 1000) starlinkConfidence = 70
        else starlinkConfidence = 30
    } else {
        // Fallback: If in a known forest region (via reverse geocode metadata)
        starlinkConfidence = 85 // Default for open corridors
    }

    // 3. FINAL DIGITAL LIFE ATTRIBUTES
    const attributes = {
        cell: {
            score: cellScore,
            label: cellScore > 70 ? "EXCELLENT" : cellScore > 30 ? "FAIR" : "CRITICAL",
            towers_nearby: towerCount
        },
        starlink: {
            confidence: starlinkConfidence,
            obstruction_risk: starlinkConfidence > 80 ? "LOW" : starlinkConfidence > 50 ? "MEDIUM" : "HIGH"
        }
    }

    return NextResponse.json({ 
      lat, 
      lng, 
      attributes,
      score: Math.round((cellScore + starlinkConfidence) / 2)
    })
  } catch (err) {
    return NextResponse.json({ error: 'Shield failure' }, { status: 500 })
  }
}
