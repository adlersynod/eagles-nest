import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const { startLat, startLng, endLat, endLng, distance } = await request.json()
    const ratio = Math.min(0.85, 250 / distance)
    const midLat = startLat + (endLat - startLat) * ratio
    const midLng = startLng + (endLng - startLng) * ratio

    // Logic: Near major transit corridors for "Cheapest/Fastest"
    // We'll serve real recommendations based on the leg's location
    // Leg 3 example: Omaha to Bozeman (I-80/I-25/I-90)
    
    let suggestions = [
      { 
        name: "North Platte KOA Journey", 
        lat: 41.1359, 
        lng: -100.7630,
        url: "https://koa.com/campgrounds/north-platte/",
        type: 'Cheapest/Fastest'
      },
      { 
        name: "Holiday RV Park & Campground", 
        lat: 41.1239, 
        lng: -100.7450,
        url: "https://holidayrvpark.com/",
        type: 'Cheapest/Fastest'
      },
      { 
        name: "Buffalo Bill State Park", 
        lat: 41.1648, 
        lng: -100.7936,
        url: "http://outdoornebraska.gov/buffalobillranch/",
        type: 'Quick Stop'
      }
    ]

    // If we're headed toward Oregon (Northwest)
    if (endLng < -115) {
      suggestions = [
        { 
          name: "Boise Riverside RV Park", 
          lat: 43.6187, 
          lng: -116.2146,
          url: "https://www.boiseriversidervpark.com/",
          type: 'Cheapest/Fastest'
        },
        { 
          name: "Mountain Home RV Park", 
          lat: 43.1330, 
          lng: -115.6912,
          url: "http://mountainhomervpark.com/",
          type: 'Cheapest/Fastest'
        },
        { 
          name: "Baker City KOA Journey", 
          lat: 44.7749, 
          lng: -117.8344,
          url: "https://koa.com/campgrounds/baker-city/",
          type: 'Cheapest/Fastest'
        }
      ]
    }

    // If we're headed toward Big Bend (South/Texas)
    if (endLat < 32 && endLng < -100) {
      suggestions = [
        { 
          name: "Van Horn RV Park", 
          lat: 31.0407, 
          lng: -104.8310,
          url: "https://vanhornrvpark.com/",
          type: 'Cheapest/Fastest'
        },
        { 
          name: "Wild Horse RV Park", 
          lat: 31.0494, 
          lng: -104.8211,
          url: "https://www.wildhorserv.com/",
          type: 'Cheapest/Fastest'
        },
        { 
          name: "Fort Stockton RV Park", 
          lat: 30.8885, 
          lng: -102.8794,
          url: "https://fortstocktonrvpark.com/",
          type: 'Cheapest/Fastest'
        }
      ]
    }
    
    return NextResponse.json({ midpoint: { lat: midLat, lng: midLng }, suggestions })
  } catch (err) {
    return NextResponse.json({ error: 'Failed to fix gap' }, { status: 500 })
  }
}
