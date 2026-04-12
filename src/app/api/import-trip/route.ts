import { NextRequest, NextResponse } from 'next/server'
import { readFile } from 'fs/promises'
import path from 'path'

export const config = { api: { bodyParser: false } }

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json({ error: 'No file provided.' }, { status: 400 })
    }

    const allowedTypes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'text/csv',
    ]
    if (!allowedTypes.includes(file.type) && !file.name.endsWith('.xlsx') && !file.name.endsWith('.xls') && !file.name.endsWith('.csv')) {
      return NextResponse.json({ error: 'Invalid file type. Please upload an XLSX or CSV export from RV Trip Wizard.' }, { status: 400 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const tempPath = path.join('/tmp', `rv_trip_${Date.now()}_${file.name}`)

    // Write to temp file for xlsx parsing
    const { writeFile } = await import('fs/promises')
    await writeFile(tempPath, buffer)

    let stops: Record<string, unknown>[] = []

    if (file.name.endsWith('.csv') || file.type === 'text/csv') {
      stops = parseCSV(buffer.toString('utf-8'))
    } else {
      try {
        stops = await parseXLSX(tempPath)
      } catch {
        // Fallback: try parsing as CSV
        stops = parseCSV(buffer.toString('utf-8', 'ignore'))
      }
    }

    if (stops.length === 0) {
      return NextResponse.json({ error: 'Could not parse any stops from the file. Make sure you exported the Trip Summary sheet.' }, { status: 422 })
    }

    // Clean up
    writeFile(tempPath).catch(() => {})

    return NextResponse.json({
      tripName: stops[0]?.tripName || 'Imported Trip',
      startDate: stops[0]?.arrivalDate || null,
      totalMiles: stops[stops.length - 1]?.totalMiles || 0,
      stops,
      stopCount: stops.length,
    })
  } catch (err) {
    console.error('Trip import error:', err)
    return NextResponse.json({ error: 'Failed to parse trip file.' }, { status: 500 })
  }
}

function parseCSV(content: string): Record<string, unknown>[] {
  const lines = content.split('\n').map(l => l.trim()).filter(Boolean)
  if (lines.length < 2) return []

  const header = splitCSVLine(lines[0])
  const stops: Record<string, unknown>[] = []

  for (let i = 1; i < lines.length; i++) {
    const values = splitCSVLine(lines[i])
    if (values.length < 4) continue

    const row: Record<string, unknown> = {}
    header.forEach((col, idx) => {
      row[col.trim()] = values[idx]?.trim() || ''
    })

    const stopName = String(row['Stop Name'] || row['StopName'] || row['Name'] || '')
    const miles = parseFloat(String(row['Miles'] || row['Distance'] || row['miles'] || '0').replace(/,/g, '')) || 0

    if (!stopName || stopName === 'None') continue

    const lat = parseFloat(String(row['Latitude'] || row['lat'] || '0')) || 0
    const lng = parseFloat(String(row['Longitude'] || row['lng'] || '0')) || 0
    const arrivalDate = parseDate(String(row['Arrival Date'] || row['arrivalDate'] || row['Date'] || ''))
    const departureDate = parseDate(String(row['Departure Date'] || row['departureDate'] || ''))
    const nights = parseInt(String(row['Nights'] || row['nights'] || '0')) || 0

    stops.push({
      stopName,
      miles,
      totalMiles: parseFloat(String(row['Total'] || row['totalMiles'] || '0').replace(/,/g, '')) || 0,
      travelTime: String(row['Estimated Travel Time'] || row['Travel Time'] || ''),
      arrivalDay: String(row['Arrival Day'] || ''),
      arrivalDate,
      departureDay: String(row['Departure Day'] || ''),
      departureDate,
      nights,
      comments: String(row['Comments'] || row['Notes'] || ''),
      reservationNumber: String(row['Reservation Number'] || row['Confirmation'] || ''),
      features: String(row['Features'] || row['Amenities'] || ''),
      location: String(row['Location'] || row['address'] || ''),
      url: String(row['Url'] || row['URL'] || row['website'] || ''),
      phone: String(row['Phone'] || row['telephone'] || ''),
      lat,
      lng,
      campingCost: parseFloat(String(row['Camping Cost'] || row['campingCost'] || '0').replace(/[$,]/g, '')) || 0,
      fuelCost: parseFloat(String(row['Fuel Cost'] || row['fuelCost'] || '0').replace(/[$,]/g, '')) || 0,
      stopTotalCost: parseFloat(String(row['Stop Total Cost'] || row['totalCost'] || '0').replace(/[$,]/g, '')) || 0,
      isCityWaypoint: !String(row['Features'] || row['url'] || '').includes('http'),
    })
  }

  return stops
}

function splitCSVLine(line: string): string[] {
  const result: string[] = []
  let inQuotes = false
  let current = ''
  for (const char of line) {
    if (char === '"') {
      inQuotes = !inQuotes
    } else if (char === ',' && !inQuotes) {
      result.push(current)
      current = ''
    } else {
      current += char
    }
  }
  result.push(current)
  return result
}

async function parseXLSX(filePath: string): Promise<Record<string, unknown>[]> {
  // Use Python to parse xlsx since we have openpyxl available
  const { exec } = await import('child_process')
  const pythonScript = `
import openpyxl, json, sys

wb = openpyxl.load_workbook(${JSON.stringify(filePath)}, data_only=True)
ws = wb['Trip Summary']

rows = list(ws.iter_rows(values_only=True))

# Find header row (has Stop Name)
header_idx = None
for i, row in enumerate(rows):
    if row and ('Stop Name' in str(row) or 'Stop Name' in str(row)):
        header_idx = i
        break

if header_idx is None:
    for i, row in enumerate(rows):
        if row and row[1] and 'Stop' in str(row[1]):
            header_idx = i
            break

if header_idx is None:
    print('[]')
    sys.exit()

header = [str(c) if c is not None else '' for c in rows[header_idx]]
stops = []

trip_name = ''
if rows and rows[0] and rows[0][0]:
    trip_name = str(rows[0][0])

for i in range(header_idx + 1, len(rows)):
    row = rows[i]
    if not row or not row[1] or str(row[1]).strip() in ('', 'None'):
        continue
    
    d = {'tripName': trip_name}
    for j, col in enumerate(header):
        if j < len(row):
            val = row[j]
            if hasattr(val, 'strftime'):
                val = val.strftime('%Y-%m-%d')
            d[col.strip()] = str(val) if val is not None else ''
        else:
            d[col.strip()] = ''
    
    miles = float(str(d.get('Miles', '0') or '0').replace(',', '')) or 0
    stop_name = str(d.get('Stop Name', '') or '')
    if not stop_name or stop_name == 'None':
        continue
    
    lat = float(str(d.get('Latitude', '0') or '0').replace(',', '')) or 0
    lng = float(str(d.get('Longitude', '0') or '0').replace(',', '')) or 0
    total = float(str(d.get('Total', '0') or '0').replace(',', '')) or 0
    
    arrival_date_str = str(d.get('Arrival Date', '') or '')
    departure_date_str = str(d.get('Departure Date', '') or '')
    
    # Parse dates
    arrival_date = ''
    departure_date = ''
    nights = 0
    
    import re
    def parse_date(s):
        if not s or s == 'None': return ''
        # MM/DD/YY format
        m = re.match(r'(\d+)/(\d+)/(\d+)', s)
        if m:
            month, day, year = int(m.group(1)), int(m.group(2)), int(m.group(3))
            year = 2000 + year if year < 100 else year
            return f'{year}-{month:02d}-{day:02d}'
        return s
    
    arrival_date = parse_date(arrival_date_str)
    departure_date = parse_date(departure_date_str)
    
    try:
        nights = int(float(str(d.get('Nights', '0') or '0').replace(',', '')) or 0)
    except:
        nights = 0
    
    # Cost parsing
    camping_cost = 0
    fuel_cost = 0
    try:
        camping_cost = float(str(d.get('Camping Cost', '0') or '0').replace('$', '').replace(',', '')) or 0
    except: pass
    try:
        fuel_cost = float(str(d.get('Fuel Cost', '0') or '0').replace('$', '').replace(',', '')) or 0
    except: pass
    
    stops.append({
        'stopName': stop_name,
        'miles': miles,
        'totalMiles': total,
        'travelTime': str(d.get('Estimated Travel Time', '') or ''),
        'arrivalDay': str(d.get('Arrival Day', '') or ''),
        'arrivalDate': arrival_date,
        'departureDay': str(d.get('Departure Day', '') or ''),
        'departureDate': departure_date,
        'nights': nights,
        'comments': str(d.get('Comments', '') or ''),
        'reservationNumber': str(d.get('Reservation Number', '') or ''),
        'features': str(d.get('Features', '') or ''),
        'location': str(d.get('Location', '') or ''),
        'url': str(d.get('Url', '') or ''),
        'phone': str(d.get('Phone', '') or ''),
        'lat': lat,
        'lng': lng,
        'campingCost': camping_cost,
        'fuelCost': fuel_cost,
        'isCityWaypoint': not bool(str(d.get('Url', '') or '').strip()) or str(d.get('Features', '') or '') == '',
    })

print(json.dumps(stops, default=str))
`

  return new Promise((resolve, reject) => {
    exec(`python3 -c ${JSON.stringify(pythonScript)}`, { timeout: 15000 }, (err, stdout) => {
      if (err) {
        reject(err)
        return
      }
      try {
        const parsed = JSON.parse(stdout.trim() || '[]')
        resolve(parsed)
      } catch {
        resolve([])
      }
    })
  })
}

function parseDate(dateStr: string): string {
  if (!dateStr || dateStr === 'None') return ''
  // MM/DD/YY → YYYY-MM-DD
  const m = dateStr.match(/(\d+)\/(\d+)\/(\d+)/)
  if (m) {
    const year = parseInt(m[3]) < 50 ? 2000 + parseInt(m[3]) : 2000 + parseInt(m[3])
    return `${year}-${parseInt(m[1]).toString().padStart(2,'0')}-${parseInt(m[2]).toString().padStart(2,'0')}`
  }
  return dateStr
}