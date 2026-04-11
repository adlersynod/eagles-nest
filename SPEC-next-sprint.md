# Eagles Nest — Next Sprint Spec
**Sprint**: Local-first experiences  
**Date**: 2026-04-11  
**Prepared for**: Theo (the customer)  
**Stack**: Next.js 14, Google Places API (v1), OpenAI via OpenRouter, Open-Meteo  

---

## Feature 1: Non-Touristy "Local Gems" Filter

### What It Does
Replaces or supplements the current tourist-optimized Google Places results with places locals actually go. The same tab bar ("Things To Do", "Food & Dining") gets a **segmented toggle** above the card grid: **"Popular"** (current) vs **"Local Gems"**. The Local Gems mode demotes high-review-count tourist destinations and surfaces lower-profile spots — dive bars, food carts, neighborhood parks, weird museums, sunrise viewpoints, roadside attractions.

### UI/UX — What Theo Sees
- Above the card grid on **Attractions** and **Restaurants** tabs, a pill toggle: `[ Popular | Local Gems ]`
- "Popular" is the default and matches current behavior.
- "Local Gems" triggers a re-query with a different search strategy (see Data Sources).
- The card grid shows the same `PlaceCard` component — same photo, name, rating, address — but the *ranking* is completely different.
- A small `🏷️ Local Pick` badge appears on each card in Local Gems mode.

**Interaction**: She searches a city, picks a tab, toggles the pill. She doesn't have to do anything else.

### Data Sources
**Same Google Places API, different query strategy:**

| Mode | Strategy |
|------|----------|
| Popular (current) | `textQuery: "{city} tourist attractions"` + `rankBy=distance` with high rating filter |
| Local Gems | `textQuery: "{city} dive bar OR food cart OR neighborhood park OR weird museum OR local viewpoint"` with `rankBy=distance` (no rating sort), then demote any result with >200 reviews OR labeled as a chain/franchise |

**Refinement via AI re-rank** (optional phase 2): Take top 20 raw results, call OpenAI with a short prompt: *"Which of these are genuine local spots vs. tourist traps? Return a ranked list."* Re-rank accordingly. This costs extra API calls — only do this if the heuristic approach feels wrong.

### API Endpoints Needed
None new. Modify the existing `/api/search` route:
- Add `?mode=popular|local` query param (default `popular`)
- Adjust `textQuery` and ranking logic per mode
- No new endpoints

### Implementation Order
**First**. Walk radius is the most standalone, but Non-touristy is the highest-impact feature for Theo — it's the #1 complaint about current results. Build this second after Walk Radius because it requires re-using the search route and adding a toggle state.

### Risks & Tradeoffs
- **Heuristic gap**: The "dive bar OR food cart" query might miss genuinely great local restaurants that don't match those keywords. The AI re-rank (phase 2) fixes this but adds latency and cost.
- **Fewer results**: Local Gems mode may return fewer total results (8 → potentially 2-4 relevant hits). That's fine — quality over quantity.
- **Google Places rate limits**: Extra queries per search. Mitigate: debounce toggle, don't re-fetch if already loaded for that city.

---

## Feature 2: Walk Radius — "Walk From Here"

### What It Does
Adds a "Walk From Here →" button on every place card. Clicking it opens a bottom-sheet panel showing places within a 5, 10, 15, and 20-minute walk from the selected origin — with estimated walk time, category, and a Google Maps directions link.

### UI/UX — What Theo Sees
1. She's on the Attractions tab, browsing cards. She taps **"🚶 Walk From Here"** on a specific card.
2. A **bottom sheet slides up** anchored to that card's location as the origin.
3. At the top: the origin place name + a Google Maps directions link ("Open in Maps ↗").
4. Below: a **walk-time segmented control**: `[ 5 min | 10 min | 15 min | 20 min ]`
5. A **scrollable list** of nearby places, each showing:
   - Category badge (e.g., "Café", "Park", "Dive Bar")
   - Place name
   - ⏱️ Est. walk time (e.g., "7 min · 0.4 mi")
   - Star rating (if available)
   - "📍 Directions" link → opens Google Maps with walking directions pre-filled
6. She can tap any result to open its Google Maps page.
7. Tapping outside or swiping down dismisses the sheet.

**Example bottom sheet content:**
```
┌─────────────────────────────────────┐
│ Coffee Under  ·  ·  ·  ·  ↗ Open    │
│ ─────────────────────────────────── │
│ [5 min] [10 min] [15 min] [20 min]  │
│ ─────────────────────────────────── │
│ ☕ The Annex Coffee          3 min  │
│    ★ 4.3  ·  0.2 mi  📍 Directions  │
│ 🏞️ Founders Park              5 min │
│    ★ 4.7  ·  0.3 mi  📍 Directions  │
│ 🍺 Buckman Pub               6 min  │
│    ★ 4.1  ·  0.4 mi  📍 Directions  │
│ …                                      │
└─────────────────────────────────────┘
```

### Data Sources
**Google Places Nearby Search API** (`places:searchNearby`):
- `locationRestriction.circle` with radius = walk time → meters:
  - 5 min = 400m
  - 10 min = 800m
  - 15 min = 1200m
  - 20 min = 1600m
- `includedType`: match the current tab context (`restaurant`, `cafe`, `bar`, `park`, `tourist_attraction`) or search ALL types for the full "everything near here" view
- `languageCode: 'en'`
- Fetch top 8 results per radius

**Directions links**: `https://www.google.com/maps/dir/?api=1&origin={lat},{lng}&destination={placeLat},{placeLng}&travelmode=walking`

**Walk time estimate**: Client-side calculation — `distance_meters / 80` (average human walking speed ~5 km/h = ~80m/min). This is accurate enough for a 1-2 min estimate.

### API Endpoints Needed
**New endpoint**: `POST /api/nearby`
```
Request:  { city, originLat, originLng, radiusMeters, includedType? }
Response: { results: PlaceResult[] }
```
`PlaceResult` shape matches existing card schema (name, rating, reviewCount, types, primaryType, photoUrl, mapUrl, address).

**Why POST**: origin lat/lng are floats too long for GET query params cleanly.

### Implementation Order
**First**. Most self-contained. One new API endpoint, one new UI component (bottom sheet + segmented control), no dependency on AI or other features. Can be shipped independently.

### Risks & Tradeoffs
- **Rate limits**: Nearby Search costs 1 unit per 100 requests (batch). If Theo clicks "Walk From Here" on 10 cards, that's 10 × 4 radii = 40 Nearby calls. **Mitigate**: cache results in `sessionStorage` keyed by `{lat},{lng},radius`. Clicking the same origin twice hits cache.
- **Walk time accuracy**: `distance / 80m/min` is a rough average. Real walk time varies with terrain. Use it as a label, not a guarantee.
- **Origin not a named place**: If she uses the "Walk From Here" from a campground card, use that campground's coordinates. Works fine.

---

## Feature 3: AI Trip Plan Proposals

### What It Does
Adds a **"Plans" tab** next to Attractions/Restaurants/Parks/Weather. Based on her selected city, dates, and the places already loaded in-state, OpenAI generates a structured day/evening itinerary that feels like it was made by a local friend — not a travel blog.

### UI/UX — What Theo Sees
1. After searching a city, she taps the new **"📋 Plans" tab**.
2. The Plans view has **two inputs at the top** (already pre-filled from the main search):
   - **"What kind of day?"** — segmented control: `[ Weeknight ] [ Weekend Morning ] [ Weekend Afternoon ] [ Weekend Night ] [ Multi-Day ]`
   - **"Dates"** — shows the date range picker (reuse existing component)
3. She taps **"Generate My Plan"** (large primary button).
4. A loading state: *"Finding local gems…"* (1-3 seconds).
5. The plan renders as a **vertical timeline**:
   ```
   ┌─────────────────────────────────────┐
   │ 🕐  5:30 PM   Coffee Stop          │
   │     › 7 min walk from campground   │
   │     ✓  ▸ Stumptown Coffee (local)  │
   │        814 E Burnside · ★ 4.6     │
   │                                       │
   │ 🕕  6:30 PM   Activity             │
   │     › 12 min walk                   │
   │     ✓  ▸ Mt. Tabor Park hike       │
   │        1.2 mi loop · free          │
   │                                       │
   │ 🕖  8:00 PM   Dinner               │
   │     › 9 min walk                   │
   │     ✓  ▸ Ava's Vietnamese (local)  │
   │        1023 SE 28th · $            │
   └─────────────────────────────────────┘
   ```
6. Each stop shows:
   - **Time** (realistic, e.g., 5:30 PM, not "5:00 PM")
   - **Stop type** (Coffee / Activity / Meal / Evening)
   - **Walk/transit time from previous stop**
   - **Place name** with a local tag (not a chain)
   - **Address + rating**
   - **"📍 Directions" link** → Google Maps walking directions from previous stop
7. For **Multi-Day**: Shows a full Friday evening → Sunday itinerary as a multi-section timeline grouped by day.
8. Tapping "Regenerate" (↻) generates a new alternative plan.
9. Tapping any place name opens Google Maps for that place.

### Data Sources
1. **OpenAI via OpenRouter** (`gpt-4o-mini` for speed/cost): Generates the itinerary. System prompt includes the current Attractions + Restaurants tab results already loaded in React state (passed as context), plus:
   - City name
   - Day type
   - Season / weather context from Open-Meteo (current conditions for that city)
   - Theo's preferences from prior sessions (if any stored in localStorage — "likes hiking", "avoids crowded places", etc.)

2. **Prompt strategy** (structured output):
   ```
   Generate a {dayType} itinerary for {city}.
   Rules:
   - Never suggest chain restaurants or tourist traps (no Olive Garden, no Cheesecake Factory)
   - Include realistic walking times between stops
   - Return valid JSON:
   {
     "stops": [
       {
         "time": "5:30 PM",
         "type": "coffee" | "activity" | "meal" | "evening",
         "placeName": "string",
         "address": "string",
         "walkFromPrevious": "7 min walk",
         "notes": "string (why this place, what to order, what to see)",
         "rating": number | null,
         "mapsUrl": "https://..."  // pre-filled with walking directions
       }
     ]
   }
   ```

3. **In-state place data**: Pass the currently-loaded `data.attractions` and `data.restaurants` arrays to the API so it can reference real places, not hallucinate. Tell it to prefer places already in the result set.

### API Endpoints Needed
**New endpoint**: `POST /api/plan`
```
Request: {
  city: string,
  dayType: "weeknight" | "weekend-morning" | "weekend-afternoon" | "weekend-night" | "multi-day",
  startDate: string,       // ISO date
  endDate: string,          // ISO date
  weatherCondition?: string, // e.g., "sunny, 72°F" from Open-Meteo
  contextPlaces: PlaceResult[]  // current in-memory attractions + restaurants
}
Response: {
  stops: PlanStop[]
}
```

**No new infrastructure**: reuse existing OpenRouter `OPENAI_API_KEY` env var (already in use via the OpenClaw stack or add to Vercel).

### Implementation Order
**Third and last**. Depends on Features 1 and 2 being in place — the AI works better when it has better source data. Also the most complex UI (timeline renderer with state management).

### Risks & Tradeoffs
- **AI hallucination**: Model may suggest a place that doesn't exist or is closed. **Mitigate**: Pass in-state Google Places results as hard context — "only suggest from this list". If suggestion isn't in the list, flag it with a ⚠️ "Verified by us" vs "Suggested by AI" label.
- **Latency**: OpenAI calls take 1-4 seconds. Show explicit loading state with message that changes ("Finding coffee spots…", "Checking trails…"). Never leave her staring at a frozen button.
- **Cost**: `gpt-4o-mini` is ~$0.15/1M tokens. A single plan generation is ~500-800 tokens. Negligible, but track usage.
- **No two-way sync**: If she saves a plan and then searches a new city, the plan is discarded. Consider adding a "Save Plan" button that writes to localStorage (phase 2).
- **Weather dependency**: Plans generated for a weekend afternoon in January should differ from July. Include weather context in the prompt, but note that a 5-day forecast is unreliable — use it as a hint, not a guarantee.

---

## Implementation Order & Reasoning

| # | Feature | Why First |
|---|---------|-----------|
| 1 | **Walk Radius** | Most self-contained. One new API endpoint, one component. No AI dependency. Can ship and validate independently. Tests Theo says "I want to know what's walkable from where I'm staying" — this answers that exactly. |
| 2 | **Local Gems Toggle** | High impact for Theo. Uses existing search API with modified queries — minimal new backend. Tiered toggle (Popular / Local Gems) fits naturally in the existing tab UX. No new endpoints. |
| 3 | **AI Trip Plans** | Most complex, most dependent on quality data. Benefits from #1 and #2 being live (better places data → better plans). Timeline UI is new and needs careful component design. |

**Total new API endpoints this sprint: 2** (`POST /api/nearby`, `POST /api/plan`).

---

## Cross-Cutting Concerns

### Caching Strategy
- `sessionStorage` keyed by `{city}:{tab}:{mode}` for search results (5 min TTL)
- `sessionStorage` keyed by `{lat},{lng}:{radius}` for nearby results (5 min TTL)
- Plan generation: no cache (always fresh, small payload)

### Rate Limit Guardrails
- All Google Places calls through a thin proxy that tracks `X-Search-Count` header in responses
- If count > 80% of daily limit, show a soft banner: "Search Paused — resuming shortly" — don't hard fail
- Plan endpoint retries once on 429 from OpenAI

### Environment Variables (Vercel)
```
GOOGLE_PLACES_API_KEY=    # existing
OPENAI_API_KEY=           # new — add to Vercel project settings
OPENROUTER_API_KEY=       # alias for OpenAI-compatible endpoint
```

### No Backend Database
All state in `sessionStorage` / `localStorage`. Plans are ephemeral. This keeps the sprint scope manageable and avoids auth complexity.

---

## Out of Scope (Phase 2)
- Save/export plans (PDF, share link)
- User accounts or preference persistence beyond localStorage
- Real-time weather override on plans
- Integration with actual booking (Recreation.gov checkout flow)
- Map view for Walk Radius (just card list this sprint)
