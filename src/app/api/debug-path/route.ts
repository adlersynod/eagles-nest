import { NextResponse } from 'next/server'
import path from 'path'
import fs from 'fs'

export async function GET() {
  const cwd = process.cwd()
  const filePath = path.join(cwd, 'src/lib/fcc_towers_us.json')
  const exists = fs.existsSync(filePath)
  let data: Record<string, number> | null = null
  if (exists) {
    try {
      data = JSON.parse(fs.readFileSync(filePath, 'utf8'))
    } catch(e: unknown) {
      data = { error: String(e) } as unknown as Record<string, number>
    }
  }
  return NextResponse.json({
    cwd,
    filePath,
    exists,
    keyCount: data ? Object.keys(data).length : 0,
    sampleKeys: data ? Object.keys(data).slice(0, 3) : [],
  })
}