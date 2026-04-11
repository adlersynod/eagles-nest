import { NextResponse } from 'next/server'

// In-memory usage tracker (per Vercel edge function instance)
// Resets on cold start — this is a secondary signal, not authoritative
// Primary: GCP Budget Alerts (set up in Google Cloud Console)
let monthlyRequestCount = 0
let lastReset = new Date().toISOString().slice(0, 7) // YYYY-MM

function checkMonthReset() {
  const currentMonth = new Date().toISOString().slice(0, 7)
  if (currentMonth !== lastReset) {
    monthlyRequestCount = 0
    lastReset = currentMonth
  }
}

async function sendTelegramAlert(message: string) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN
  const chatId = process.env.TELEGRAM_CHAT_ID

  if (!botToken || !chatId) return

  try {
    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: `🦅 Eagles Nest Alert\n\n${message}`,
        parse_mode: 'HTML',
      }),
    })
  } catch (e) {
    console.error('Telegram send failed:', e)
  }
}

// GET /api/monitor — called daily by Vercel Cron
export async function GET() {
  checkMonthReset()

  const USAGE_THRESHOLD_WARN = 2000  // warn at 2K requests (~$64 of $200 credit)
  const USAGE_THRESHOLD_CRIT = 5000  // critical at 5K requests (~$160 of $200 credit)

  if (monthlyRequestCount >= USAGE_THRESHOLD_CRIT) {
    await sendTelegramAlert(
      `🔴 <b>CRITICAL:</b> Eagles Nest Google Places quota at ${monthlyRequestCount.toLocaleString()} requests this month.\n\nEstimated cost: $${(monthlyRequestCount * 0.032).toFixed(2)} / $200 free tier.\n\nVisit: https://console.cloud.google.com/apis/credentials`
    )
  } else if (monthlyRequestCount >= USAGE_THRESHOLD_WARN) {
    await sendTelegramAlert(
      `🟡 <b>WARNING:</b> Eagles Nest at ${monthlyRequestCount.toLocaleString()} requests this month.\n\n$${(monthlyRequestCount * 0.032).toFixed(2)} of $200 free tier used.`
    )
  }

  return NextResponse.json({
    month: lastReset,
    estimatedRequests: monthlyRequestCount,
    estimatedCostUsd: (monthlyRequestCount * 0.032).toFixed(2),
    thresholds: {
      warn: USAGE_THRESHOLD_WARN,
      critical: USAGE_THRESHOLD_CRIT,
    },
    status: 'ok',
  })
}

// POST /api/monitor — called after each Places API request to increment counter
export async function POST() {
  checkMonthReset()
  monthlyRequestCount++
  return NextResponse.json({ count: monthlyRequestCount })
}
