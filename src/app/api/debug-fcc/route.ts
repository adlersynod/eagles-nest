import { NextRequest, NextResponse } from 'next/server'
import fccTowers from '@/lib/fcc_towers_us.json'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const qk = searchParams.get('qk')
  const fcc = (fccTowers as any).default || fccTowers
  if (qk) {
    return NextResponse.json({ qk, count: fcc[qk] || 0 })
  }
  const keys = Object.keys(fcc)
  return NextResponse.json({
    count: keys.length,
    sample: keys.slice(0, 5),
    firstValue: fcc[keys[0]]
  })
}
