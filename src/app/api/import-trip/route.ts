import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json({ error: 'No file provided.' }, { status: 400 })
    }

    const buffer = await file.arrayBuffer()
    const workbook = XLSX.read(buffer, { type: 'array', cellDates: true })
    
    // RV Trip Wizard exports typically have "Trip Summary" as the first important sheet
    const sheetName = workbook.SheetNames.find(n => n.includes('Summary')) || workbook.SheetNames[0]
    const worksheet = workbook.Sheets[sheetName]
    const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][]

    if (!jsonData || jsonData.length === 0) {
      return NextResponse.json({ error: 'Could not read spreadsheet data.' }, { status: 422 })
    }

    // Find the header row (usually contains "Stop Name")
    let headerIdx = -1
    for (let i = 0; i < Math.min(jsonData.length, 10); i++) {
      const row = jsonData[i]
      if (row.some(c => String(c).includes('Stop Name'))) {
        headerIdx = i
        break
      }
    }

    if (headerIdx === -1) {
      // Fallback for different versions: look for row with "Stop" in column 1
      for (let i = 0; i < 15; i++) {
        if (String(jsonData[i]?.[1] || '').includes('Stop')) {
          headerIdx = i
          break
        }
      }
    }

    if (headerIdx === -1) {
      return NextResponse.json({ error: 'Could not find the trip summary header in the file.' }, { status: 422 })
    }

    const headers = jsonData[headerIdx].map(h => String(h || '').trim())
    const stops: any[] = []
    const tripName = String(jsonData[0]?.[0] || 'Imported Trip')

    for (let i = headerIdx + 1; i < jsonData.length; i++) {
      const row = jsonData[i]
      if (!row || !row[1] || String(row[1]).trim() === '' || String(row[1]) === 'None') continue

      const d: Record<string, any> = { tripName }
      headers.forEach((h, idx) => {
        if (h) d[h] = row[idx]
      })

      const stopName = String(d['Stop Name'] || d['StopName'] || d['Name'] || '')
      if (!stopName || stopName === 'None') continue

      // Normalize dates
      const arrivalDateRaw = d['Arrival Date']
      const departureDateRaw = d['Departure Date']
      
      const arrivalDate = arrivalDateRaw instanceof Date 
        ? arrivalDateRaw.toISOString().split('T')[0] 
        : String(arrivalDateRaw || '')
      
      const departureDate = departureDateRaw instanceof Date 
        ? departureDateRaw.toISOString().split('T')[0] 
        : String(departureDateRaw || '')

      stops.push({
        stopName,
        miles: parseFloat(String(d['Miles'] || '0').replace(/,/g, '')) || 0,
        totalMiles: parseFloat(String(d['Total'] || '0').replace(/,/g, '')) || 0,
        travelTime: String(d['Estimated Travel Time'] || ''),
        arrivalDay: String(d['Arrival Day'] || ''),
        arrivalDate,
        departureDay: String(d['Departure Day'] || ''),
        departureDate,
        nights: parseInt(String(d['Nights'] || '0')) || 0,
        features: String(d['Features'] || ''),
        url: String(d['Url'] || ''),
        lat: parseFloat(String(d['Latitude'] || '0')) || 0,
        lng: parseFloat(String(d['Longitude'] || '0')) || 0,
        isCityWaypoint: !String(d['Url'] || '').includes('http') || String(d['Features'] || '') === '',
      })
    }

    return NextResponse.json({
      tripName,
      startDate: stops[0]?.arrivalDate || null,
      totalMiles: stops[stops.length - 1]?.totalMiles || 0,
      stops,
      stopCount: stops.length,
    })
  } catch (err) {
    console.error('Import error:', err)
    return NextResponse.json({ error: 'Failed to process trip file.' }, { status: 500 })
  }
}
