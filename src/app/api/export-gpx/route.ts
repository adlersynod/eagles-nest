import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const { stops, tripName = 'EaglesNest_Fixed' } = await request.json()
    
    if (!stops || !Array.isArray(stops)) {
      return NextResponse.json({ error: 'Invalid stops' }, { status: 400 })
    }

    let gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Eagles Nest" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>${tripName}</name>
  </metadata>`

    stops.forEach((stop: any, i: number) => {
      if (stop.lat && stop.lng) {
        gpx += `
  <wpt lat="${stop.lat}" lon="${stop.lng}">
    <name>${i + 1}. ${stop.stopName.replace(/[&<>"']/g, '')}</name>
    <desc>${(stop.comments || '').replace(/[&<>"']/g, '')} - ${stop.miles}mi leg</desc>
    <type>RV Stop</type>
  </wpt>`
      }
    })

    gpx += '\n</gpx>'

    return new NextResponse(gpx, {
      headers: {
        'Content-Type': 'application/gpx+xml',
        'Content-Disposition': `attachment; filename="${tripName.replace(/\s+/g, '_')}.gpx"`,
      },
    })
  } catch (err) {
    return NextResponse.json({ error: 'Failed to generate GPX' }, { status: 500 })
  }
}
