import { NextResponse } from 'next/server'
import path from 'path'
import fs from 'fs'

function latLonToQuadkey12(lat: number, lon: number): string {
  const z = 12, n = 2 ** z
  const x = Math.floor((lon + 180) / 360 * n)
  const y = Math.floor((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * n)
  let qk = ''
  for (let i = z; i > 0; i--) {
    let d = 0, m = 1 << (i - 1)
    if (x & m) d += 1
    if (y & m) d += 2
    qk += String(d)
  }
  return qk
}

function countTowersInRadius(lat: number, lng: number, towers: Record<string, number>): number {
  const z = 12, n = 2 ** z
  const x = Math.floor((lng + 180) / 360 * n)
  const y = Math.floor((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * n)
  let count = 0
  const seenQks = new Set<string>()
  for (let dx = -2; dx <= 2; dx++) {
    for (let dy = -2; dy <= 2; dy++) {
      const nx = Math.max(0, Math.min(n - 1, x + dx))
      const ny = Math.max(0, Math.min(n - 1, y + dy))
      let qk = ''
      for (let i = z; i > 0; i--) {
        let d = 0, m = 1 << (i - 1)
        if (nx & m) d += 1
        if (ny & m) d += 2
        qk += String(d)
      }
      if (!seenQks.has(qk)) {
        if (towers[qk]) count += towers[qk]
        seenQks.add(qk)
      }
    }
  }
  return count
}

export async function GET() {
  const filePath = path.join(process.cwd(), 'src/lib/fcc_towers_us.json')
  let towers: Record<string, number> = {}
  try {
    towers = JSON.parse(fs.readFileSync(filePath, 'utf8'))
  } catch(e: unknown) {
    return NextResponse.json({ error: 'Failed to load FCC: ' + String(e), filePath })
  }
  
  const testPoints = [
    { lat: 45.270695, lng: -121.734511, name: 'TRILLIUM' },
    { lat: 45.5234, lng: -122.6762, name: 'Portland' },
  ]
  
  const results = testPoints.map(pt => {
    const qk = latLonToQuadkey12(pt.lat, pt.lng)
    const count = countTowersInRadius(pt.lat, pt.lng, towers)
    return { name: pt.name, lat: pt.lat, lng: pt.lng, qk, count, score: count >= 50 ? 'excellent' : count >= 20 ? 'good' : count >= 5 ? 'fair' : 'poor' }
  })
  
  return NextResponse.json({ towersLoaded: Object.keys(towers).length, results })
}