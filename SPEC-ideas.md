# SPEC — Ideas Sprint (Apr 11 2026)

## Feature 1: Big Rig Scout

**Problem:** Generic campground apps show "RV friendly" but don't know if a 45' 11" / 22,500 lb rig fits.

**Solution:** Every campground card gets a "🚐 Big Rig Score" (1–5) and a "45'+ sites" filter.

### Scoring Algorithm (server-side)
Uses Recreation.gov `accessible_campsites_count` and activity list:
- `siteScore` = % of accessible campsites (more = better)
- `hookupScore` = 2 if "ELECTRICITY" activity present, +1 if "WATER" + "SEWER"
- `activityScore` = min(2, floor(amenityCount / 3))
- `bigRigScore` = clamp(1, 5, round((siteScore×2 + hookupScore + activityScore) / 1.5))

### UI Changes
- Parks tab: show 🚐 badge + score on each card (e.g. "🚐 4.5")
- Filter pill: `[ All | 45'+ Sites ]` above park list
- Score breakdown: tap badge → tooltip showing what drove the score

### API Changes
- `GET /api/campgrounds?city=X` → adds `bigRigScore`, `siteLength`, `pullThrough`, `hookups` to each result
- `GET /api/campgrounds?city=X&bigRig=true` → filter to score ≥ 4.0

---

## Feature 2: Saved Parks + Telegram Alerts

**Problem:** You save parks for a trip but have to manually check availability.

**Solution:** Saved Parks list + daily Telegram alert when availability changes.

### Data Model
```json
{
  "savedParks": [
    {
      "id": "portland-trillium-lake",
      "name": "Trillium Lake Campground",
      "city": "Portland",
      "entityId": "232577",
      "dateRange": { "start": "2026-05-15", "end": "2026-05-20" },
      "lastKnownAvailable": null,
      "lastChecked": null
    }
  ]
}
```

### API Endpoints
- `GET /api/saved-parks` → returns saved parks list
- `POST /api/saved-parks` → add a park (body: `{ name, city, entityId, dateRange }`)
- `DELETE /api/saved-parks?id=X` → remove a park
- `GET /api/saved-parks/check` → manually trigger availability check (for testing)

### Telegram Alert Flow
`/api/monitor` (cron, 9 AM daily):
1. Load saved parks
2. For each park: fetch `https://www.recreation.gov/api/search?query={name}&rows=1`
3. Compare `accessible_campsites_count` to `lastKnownAvailable`
4. If changed: send Telegram message, update `lastKnownAvailable`

**Telegram message format:**
```
🚐 Trillium Lake Campground
📅 May 15–20 · Portland area
{'🟢 4 sites open' | '🔴 Fully booked — check for cancellations'}
Last checked: 9:00 AM
```

### Frontend
- Parks tab: "★ Save" button on each card → saves to list
- New "Saved Parks" section in a collapsible panel or dedicated tab
- Shows: park name, city, date range, last-known availability status
- "Remove" button on each saved park

### Storage
- `data/saved-parks.json` in the repo (commits = audit log)
- Written via API endpoint (fs.writeFileSync in serverless context)
- Initialized with empty `{ savedParks: [] }` if file doesn't exist

---

## Constraints
- Telegram bot: `EaglesNestAlertBot` token `8126951240:AAFkjoKSYD8u8X7OXlBn8XZDNcWR9j6OgRU`
- Telegram chat ID: `8670178503`
- BRAVE_API_KEY still exposed in git history — must rotate before launch
