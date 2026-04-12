import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

// ── In-memory usage tracker ────────────────────────────────────────────────
let monthlyRequestCount = 0
let lastReset = new Date().toISOString().slice(0, 7)

function checkMonthReset() {
  const currentMonth = new Date().toISOString().slice(0, 7)
  if (currentMonth !== lastReset) {
    monthlyRequestCount = 0
    lastReset = currentMonth
  }
}

// ── Saved Parks store ───────────────────────────────────────────────────
const DATA_FILE = path.join(process.cwd(), 'data', 'saved-parks.json')

type AlertPrefs = {
  enabled: boolean
  vacancyChange: boolean
  priceDrop: boolean
  cellBelow: string
  bigRigBelow: number
}

type SavedPark = {
  id: string
  name: string
  city: string
  entityId: string
  dateRange: { start: string; end: string } | null
  lastKnownAvailable: number | null
  lastChecked: string | null
  addedAt: string
  alertPrefs: AlertPrefs
  lastKnownPrice?: string | null
  lastCellScore?: string | null
  lastBigRigScore?: number | null
}

function readStore(): { savedParks: SavedPark[] } {
  try {
    if (fs.existsSync(DATA_FILE)) {
      return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'))
    }
  } catch { /* ignore */ }
  return { savedParks: [] }
}

function writeStore(store: { savedParks: SavedPark[] }): void {
  const dir = path.dirname(DATA_FILE)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(DATA_FILE, JSON.stringify(store, null, 2))
}

// ── Telegram alerts ──────────────────────────────────────────────────────
async function sendTelegramAlert(message: string) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN
  const chatId = process.env.TELEGRAM_CHAT_ID
  if (!botToken || !chatId) return
  try {
    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: `🦅 Eagles Nest Alert\n\n${message}`, parse_mode: 'HTML' }),
    })
  } catch (e) {
    console.error('Telegram send failed:', e)
  }
}

// ── Check availability for one park via Recreation.gov ────────────────
async function checkParkAvailability(park: SavedPark): Promise<number | null> {
  try {
    const query = encodeURIComponent(park.name)
    const res = await fetch(
      `https://www.recreation.gov/api/search?query=${query}&rows=3`,
      { headers: { 'User-Agent': 'EaglesNest/1.0', Accept: 'application/json' } }
    )
    if (!res.ok) return null
    const data = await res.json()
    const items = data?.results || []
    // Find the matching park by entityId or name
    const match = items.find((item: Record<string, unknown>) =>
      park.entityId && String(item.entity_id) === park.entityId ||
      (item.title as string || '').toLowerCase().includes(park.name.toLowerCase())
    )
    if (match && typeof match.accessible_campsites_count === 'number') {
      return match.accessible_campsites_count as number
    }
    // Fallback: use first result if name matches loosely
    if (items.length > 0 && park.name) {
      const first = items[0]
      if ((first.title as string || '').toLowerCase().includes(park.name.toLowerCase().split(' ')[0])) {
        return typeof first.accessible_campsites_count === 'number' ? first.accessible_campsites_count as number : null
      }
    }
    return null
  } catch {
    return null
  }
}

// ── GET /api/monitor — daily cron: usage warn + saved parks check ────────
export async function GET() {
  checkMonthReset()

  const alerts: string[] = []
  const checked: Array<{ name: string; available: number | null; previously: number | null }> = []

  // Check saved parks availability
  const store = readStore()
  const now = new Date().toISOString()

  // Cell signal score order for threshold comparison
  const CELL_ORDER = ['excellent', 'good', 'fair', 'poor', 'unknown']

  for (const park of store.savedParks) {
    const prefs = park.alertPrefs || { enabled: true, vacancyChange: true, priceDrop: true, cellBelow: 'any', bigRigBelow: 1 }

    // Skip entirely if alerts are disabled for this park
    if (!prefs.enabled) continue

    // ── Vacancy check ──────────────────────────────────────────────
    if (prefs.vacancyChange) {
      const available = await checkParkAvailability(park)
      const previously = park.lastKnownAvailable
      checked.push({ name: park.name, available, previously })

      if (available !== null && available !== previously && previously !== null) {
        if (available > 0) {
          alerts.push(
            `🟢 <b>${park.name}</b>\n` +
            `📅 ${park.dateRange ? `${park.dateRange.start} → ${park.dateRange.end}` : 'No dates set'}\n` +
            `🎉 ${available} site${available !== 1 ? 's' : ''} now available!`
          )
        } else if (previously > 0) {
          alerts.push(
            `🔴 <b>${park.name}</b>\n` +
            `📅 ${park.dateRange ? `${park.dateRange.start} → ${park.dateRange.end}` : 'No dates set'}\n` +
            `⚠️  Fully booked — check for cancellations`
          )
        }
      }
      park.lastKnownAvailable = available
      park.lastChecked = now
    }

    // ── Price drop check ──────────────────────────────────────────
    if (prefs.priceDrop) {
      try {
        const searchRes = await fetch(
          `https://www.recreation.gov/api/search?query=${encodeURIComponent(park.name)}&rows=2`,
          { headers: { 'User-Agent': 'EaglesNestBot/1.0', Accept: 'application/json' } }
        )
        if (searchRes.ok) {
          const searchData = await searchRes.json()
          const items = searchData?.results || []
          const match = items.find((item: Record<string, unknown>) =>
            park.entityId && String(item.entity_id) === park.entityId ||
            (item.title as string || '').toLowerCase().includes(park.name.toLowerCase())
          )
          if (match) {
            const priceRange = match.price_range as { amount_max?: number } | null
            const currentPrice = priceRange?.amount_max ? `$${priceRange.amount_max}` : null
            if (currentPrice && park.lastKnownPrice && park.lastKnownPrice !== currentPrice) {
              alerts.push(
                `💲 <b>${park.name}</b>\n` +
                `📉 Price changed: ${park.lastKnownPrice} → ${currentPrice}`
              )
            }
            if (currentPrice) park.lastKnownPrice = currentPrice
          }
        }
      } catch { /* skip */ }
    }

    // ── Cell signal drop check ─────────────────────────────────────
    if (prefs.cellBelow && prefs.cellBelow !== 'any' && park.lastCellScore) {
      const thresholdIdx = CELL_ORDER.indexOf(prefs.cellBelow)
      const currentIdx = CELL_ORDER.indexOf(park.lastCellScore)
      if (currentIdx >= 0 && currentIdx > thresholdIdx) {
        // Signal dropped below threshold
        alerts.push(
          `📶 <b>${park.name}</b>\n` +
          `⚠️  Cell signal dropped to ${park.lastCellScore} (below your ${prefs.cellBelow} threshold)`
        )
      }
    }

    // ── Big rig score drop check ───────────────────────────────────
    if (prefs.bigRigBelow > 1 && park.lastBigRigScore && park.lastBigRigScore < prefs.bigRigBelow) {
      alerts.push(
        `🚐 <b>${park.name}</b>\n` +
        `⚠️  Big Rig Score dropped to ${park.lastBigRigScore} (below your ${prefs.bigRigBelow} threshold)`
      )
    }

    if (!park.lastChecked) {
      park.lastChecked = now
      if (!park.lastKnownAvailable && prefs.vacancyChange) {
        const available = await checkParkAvailability(park)
        park.lastKnownAvailable = available
      }
    }
  }

  writeStore(store)

  // Send Telegram alerts
  for (const alert of alerts) {
    await sendTelegramAlert(alert)
  }

  // Usage warnings
  const USAGE_WARN = 2000
  const USAGE_CRIT = 5000
  if (monthlyRequestCount >= USAGE_CRIT) {
    await sendTelegramAlert(
      `🔴 CRITICAL: Eagles Nest at ${monthlyRequestCount.toLocaleString()} requests this month. $${(monthlyRequestCount * 0.032).toFixed(2)} / $200 free tier used.`
    )
  } else if (monthlyRequestCount >= USAGE_WARN) {
    await sendTelegramAlert(
      `🟡 WARNING: Eagles Nest at ${monthlyRequestCount.toLocaleString()} requests this month. $${(monthlyRequestCount * 0.032).toFixed(2)} of $200 free tier used.`
    )
  }

  return NextResponse.json({
    checked: checked.map(c => ({
      name: c.name,
      available: c.available,
      previously: c.previously,
      changed: c.available !== c.previously,
    })),
    alertsSent: alerts.length,
    monthlyRequests: monthlyRequestCount,
    status: 'ok',
  })
}

// POST /api/monitor — increment usage counter
export async function POST() {
  checkMonthReset()
  monthlyRequestCount++
  return NextResponse.json({ count: monthlyRequestCount })
}
