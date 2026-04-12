import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

const DATA_FILE = path.join(process.cwd(), 'data', 'saved-parks.json')

export type AlertPrefs = {
  enabled: boolean
  vacancyChange: boolean
  priceDrop: boolean
  cellBelow: string
  bigRigBelow: number
}

export type SavedPark = {
  id: string
  name: string
  city: string
  entityId: string
  dateRange: { start: string; end: string } | null
  lastKnownAvailable: number | null
  lastChecked: string | null
  addedAt: string
  alertPrefs: AlertPrefs
}

type SavedParksStore = {
  savedParks: SavedPark[]
}

function readStore(): SavedParksStore {
  try {
    if (fs.existsSync(DATA_FILE)) {
      return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'))
    }
  } catch { /* ignore */ }
  return { savedParks: [] }
}

function writeStore(store: SavedParksStore): void {
  const dir = path.dirname(DATA_FILE)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(DATA_FILE, JSON.stringify(store, null, 2))
}

export async function GET(): Promise<NextResponse> {
  const store = readStore()
  return NextResponse.json({ parks: store.savedParks })
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json()
    const { name, city, entityId, dateRange } = body

    if (!name || !city) {
      return NextResponse.json({ error: 'name and city are required.' }, { status: 400 })
    }

    const store = readStore()
    const id = `${city.toLowerCase().replace(/\s+/g, '-')}-${name.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`

    const park: SavedPark = {
      id,
      name,
      city,
      entityId: entityId || '',
      dateRange: dateRange || null,
      lastKnownAvailable: null,
      lastChecked: null,
      addedAt: new Date().toISOString(),
      alertPrefs: {
        enabled: true,
        vacancyChange: true,
        priceDrop: true,
        cellBelow: 'any',
        bigRigBelow: 1,
      },
    }

    store.savedParks.push(park)
    writeStore(store)

    return NextResponse.json({ ok: true, park })
  } catch (err) {
    console.error('Error saving park:', err)
    return NextResponse.json({ error: 'Failed to save park.' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'id is required.' }, { status: 400 })
    }

    const store = readStore()
    const before = store.savedParks.length
    store.savedParks = store.savedParks.filter(p => p.id !== id)

    if (store.savedParks.length === before) {
      return NextResponse.json({ error: 'Park not found.' }, { status: 404 })
    }

    writeStore(store)
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Error removing park:', err)
    return NextResponse.json({ error: 'Failed to remove park.' }, { status: 500 })
  }
}




