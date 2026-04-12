'use client'

import { useState, useEffect } from 'react'
import DatePicker, { DateRangePicker } from './components/DatePicker'
import ExternalLink from '../components/ExternalLink'
import WalkRadiusSheet from '../components/WalkRadiusSheet'

// ── Types ────────────────────────────────────────────────────────────
type TabId = 'attractions' | 'restaurants' | 'parks' | 'weather' | 'plans'

type PlaceResult = {
  id: string
  name: string
  rating: number | null
  reviewCount: number | null
  priceLevel: number | null
  types: string[]
  primaryType: string
  photoUrl: string | null
  mapUrl: string
  address: string
  lat?: number
  lng?: number
}

type WeatherDay = {
  date: string
  maxTemp: string
  minTemp: string
  desc: string
  icon: string
}

type CampgroundResult = {
  name: string
  rating: number | null
  price: string | { amount_min: number; amount_max: number; per_unit: string } | null
  amenities: string[]
  photoUrl: string | null
  bookingUrl: string | null
  mapUrl: string | null
  lat?: number
  lng?: number
  vacancyStatus: 'available' | 'limited' | 'likely_full' | 'unknown'
  vacancyNote: string
  bigRigScore: number
  bigRigNotes: string[]
  nearestServices?: {
    gasStation?: string; gasDistanceMi?: number
    groceryStore?: string; groceryDistanceMi?: number
    dumpStation?: string; dumpDistanceMi?: number
  }
  cellSignal?: {
    score: 'excellent' | 'good' | 'fair' | 'poor' | 'unknown'
    carriers: string[]; note: string
  }
  campendium?: {
    url: string; reviewCount: number; summary: string
    cellRating: string; pullThrough: boolean; levelSites: boolean
  }
}

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
  lastCellScore?: string
  lastBigRigScore?: number
}

const TRAVEL_RISK_LABELS = {
  low: { label: 'Low Risk', badge: '🟢' },
  moderate: { label: 'Moderate Risk', badge: '🟡' },
  high: { label: 'High Risk', badge: '🔴' },
} as const

const VACANCY_LABELS = {
  available: { label: 'Available', badge: '✅' },
  limited: { label: 'Limited', badge: '⚠️' },
  likely_full: { label: 'Likely Full', badge: '🔴' },
  unknown: { label: 'Unknown', badge: '❓' },
} as const

// ── Helpers ──────────────────────────────────────────────────────────
const TABS: { id: TabId; label: string }[] = [
  { id: 'attractions', label: '🦅 Things To Do' },
  { id: 'restaurants', label: '🍽️ Food & Dining' },
  { id: 'parks', label: '🏕️ RV Parks' },
  { id: 'weather', label: '🌤️ Weather' },
  { id: 'plans', label: '📋 Plans' },
]

type PriceObj = { amount_min: number; amount_max: number; per_unit: string }

function formatPrice(price: unknown): string {
  if (!price) return ''
  if (typeof price === 'string') return price
  const p = price as PriceObj
  if (p.amount_min === p.amount_max) return `$${p.amount_min}/${p.per_unit?.replace('_', 's') || 'night'}`
  return `$${p.amount_min}–$${p.amount_max}/${p.per_unit?.replace('_', 's') || 'night'}`
}

const TYPE_LABELS: Record<string, string> = {
  amusement_park: 'Amusement Park', aquarium: 'Aquarium',
  art_museum: 'Art Museum', art_gallery: 'Gallery', bakery: 'Bakery',
  bar: 'Bar', bookstore: 'Bookstore', brewery: 'Brewery',
  burger_restaurant: 'Burger', cafe: 'Café', campground: 'Campground',
  camping_cabin: 'Campground', casino: 'Casino', church: 'Church',
  clothing_store: 'Store', concert_venue: 'Concert', cultural_center: 'Cultural',
  dance_hall: 'Nightlife', department_store: 'Department Store',
  dessert_restaurant: 'Dessert', display_map: 'Map',
  electronics_store: 'Electronics', establishment: '', event_venue: 'Venue',
  fast_food_restaurant: 'Fast Food', food_market: 'Market',
  fried_chicken_restaurant: 'Fried Chicken', garden: 'Garden',
  gas_station: 'Gas Station', grocery_store: 'Grocery',
  hiking_area: 'Hiking', historic_site: 'Historic', history_museum: 'History Museum',
  hotel: 'Hotel', ice_cream_shop: 'Ice Cream', inn: 'Inn',
  italian_restaurant: 'Italian', lake: 'Lake', landmark: 'Landmark',
  library: 'Library', lodging: 'Lodging', meal_delivery: 'Meal Delivery',
  meal_takeaway: 'Meal Takeaway', mexican_restaurant: 'Mexican',
  miscellaneous_shop: 'Shop', mobile_phone_store: 'Store', mosque: 'Mosque',
  mountain: 'Mountain', movie_theater: 'Cinema', museum: 'Museum',
  music_venue: 'Music Venue', national_park: 'National Park',
  natural_feature: 'Nature', night_club: 'Nightlife', park: 'Park',
  pizza_restaurant: 'Pizza', place_of_interest: 'Attraction',
  playground: 'Playground', point_of_interest: 'Attraction',
  public_tranquil_zone: 'Park', ramen_restaurant: 'Ramen',
  recreation_area: 'Recreation', resort: 'Resort', restaurant: 'Restaurant',
  rocky_shore: 'Shore', rv_park: 'RV Park', sand_dune: 'Dune',
  seafood_restaurant: 'Seafood', shoe_store: 'Shoe Store',
  shopping_mall: 'Mall', sightseeing_tour_agency: 'Tour', ski_resort: 'Ski Resort',
  snack_bar: 'Snacks', spa: 'Spa', state_park: 'State Park',
  steakhouse: 'Steakhouse', supermarket: 'Supermarket', sushi_restaurant: 'Sushi',
  temple: 'Temple', theme_park: 'Theme Park', tourist_attraction: 'Attraction',
  touristDestination: 'Tourist', trail: 'Trail', travel_agency: 'Travel Agency',
  waterfront_development: 'Waterfront', wedding_venue: 'Wedding Venue',
  windmill: 'Historic', winery: 'Winery', wine_bar: 'Wine Bar', zoo: 'Zoo',
}

function getCategoryBadge(types: string[], primaryType: string): string {
  const candidates = [primaryType, ...types].filter(Boolean)
  for (const t of candidates) {
    const label = TYPE_LABELS[t]
    if (label) return label
  }
  return candidates[0]?.replace(/_/g, ' ') || 'Place'
}

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr + 'T00:00:00')
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  } catch {
    return dateStr
  }
}

function StarRating({ rating }: { rating: number | null }) {
  if (!rating) return <span className="rating-none">★ NEW</span>
  const stars = Math.round(rating)
  return (
    <span className="rating">
      {'★'.repeat(stars)}{'☆'.repeat(5 - stars)} <span className="rating-num">{rating.toFixed(1)}</span>
    </span>
  )
}

function PriceLevel({ level }: { level: number | null }) {
  if (!level) return <span className="price-badge">Find Prices</span>
  return <span className="price-badge price-active">{'$'.repeat(level)}</span>
}

// ── Saved City Chips ────────────────────────────────────────────────
function SavedCityChips({ cities, onSelect }: { cities: string[]; onSelect: (city: string) => void }) {
  if (!cities.length) return null
  return (
    <div className="saved-cities-row">
      {cities.map((c) => (
        <button key={c} className="saved-city-chip" onClick={() => onSelect(c)}>
          ⭐ {c}
        </button>
      ))}
    </div>
  )
}

// ── Search Status ───────────────────────────────────────────────────
function SearchStatus({ loading, city }: { loading: boolean; city: string }) {
  if (!loading || !city) return null
  return (
    <div className="search-status">
      <span className="search-status-dot" />
      <span>Searching {city}…</span>
    </div>
  )
}

// ── Location Input ───────────────────────────────────────────────────
const QUICK_DESTINATIONS = [
  'Portland, OR', 'Seattle, WA', 'Phoenix, AZ', 'San Diego, CA',
  'Denver, CO', 'Las Vegas, NV', 'Austin, TX', 'Nashville, TN',
  'Moab, UT', 'Jackson Hole, WY', 'Asheville, NC', 'Savannah, GA',
]

function LocationInput({
  value, onChange, onSearch, loading,
}: {
  value: string; onChange: (v: string) => void; onSearch: () => void; loading: boolean
}) {
  const [showTips, setShowTips] = useState(false)
  return (
    <>
      <div className="input-row">
        <input
          type="text"
          placeholder="Enter city or destination (e.g. Portland, OR)"
          value={value}
          onChange={(e) => { onChange(e.target.value); setShowTips(e.target.value.length < 2) }}
          onKeyDown={(e) => (e.key === 'Enter' || (e.metaKey && e.key === 'Enter')) && !loading && onSearch()}
          onFocus={() => setShowTips(value.length < 2)}
          onBlur={() => setTimeout(() => setShowTips(false), 150)}
          aria-label="City or destination"
        />
        {value && (
          <button className="clear-btn" onClick={() => { onChange(''); setShowTips(false) }} aria-label="Clear">
            ✕
          </button>
        )}
        <button className="go-btn" onClick={onSearch} disabled={!value.trim() || loading}>
          {loading ? '⏳' : 'Go'}
        </button>
      </div>
      {showTips && (
        <div className="quick-dests">
          <span className="quick-dests-label">Try:</span>
          {QUICK_DESTINATIONS.map((d) => (
            <button key={d} className="quick-dest-chip" onClick={() => { onChange(d); setShowTips(false) }}>
              {d}
            </button>
          ))}
        </div>
      )}
    </>
  )
}

// ── Tab Bar ──────────────────────────────────────────────────────────
function TabBar({ active, onChange }: { active: TabId; onChange: (t: TabId) => void }) {
  return (
    <div className="tabs" role="tablist">
      {TABS.map((tab) => (
        <button
          key={tab.id} role="tab" aria-selected={active === tab.id}
          className={`tab${active === tab.id ? ' active' : ''}`}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}

// ── Visual Place Card ───────────────────────────────────────────────
function PlaceCard({ place, onWalkFromHere, badge }: { place: PlaceResult; onWalkFromHere?: (lat: number, lng: number, name: string) => void; badge?: string }) {
  const [imgError, setImgError] = useState(false)
  const category = getCategoryBadge(place.types, place.primaryType)

  return (
    <div className="place-card">
      <ExternalLink href={place.mapUrl} className="card-photo-link">
        <div className="card-photo">
          {place.photoUrl && !imgError ? (
            <img src={place.photoUrl} alt={place.name} onError={() => setImgError(true)} loading="lazy" />
          ) : (
            <div className="card-photo-placeholder"><span>📍</span></div>
          )}
          <div className="card-photo-overlay">
            {badge && <span className="category-badge">{badge}</span>}
            {!badge && <span className="category-badge">{category}</span>}
          </div>
        </div>
      </ExternalLink>
      <div className="card-body">
        <ExternalLink href={place.mapUrl} className="card-name-link">
          <h3 className="card-name">{place.name}</h3>
        </ExternalLink>
        {place.address && <p className="card-address">{place.address}</p>}
        <div className="card-meta">
          <StarRating rating={place.rating} />
          <PriceLevel level={place.priceLevel} />
        </div>
        <div className="card-actions">
          {onWalkFromHere && place.lat != null && place.lng != null ? (
            <button
              className="card-walk-btn"
              onClick={(e) => { e.preventDefault(); onWalkFromHere(place.lat!, place.lng!, place.name) }}
            >
              🚶 Walk from here
            </button>
          ) : (
            <ExternalLink href={place.mapUrl} className="card-directions-btn">
              📍 View on Maps
            </ExternalLink>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Campground Card (for RV Parks tab) ──────────────────────────────
function CampgroundCard({ camp, rangeStart, rangeEnd, isPeakSeason, onWalkFromHere, onSave, saved }: { camp: CampgroundResult; rangeStart: string; rangeEnd: string; isPeakSeason: boolean; onWalkFromHere?: (lat: number, lng: number, name: string) => void; onSave?: (camp: CampgroundResult) => void; saved?: boolean }) {
  const vacancy = VACANCY_LABELS[camp.vacancyStatus]
  const [imgError, setImgError] = useState(false)
  const nights = rangeStart && rangeEnd ? Math.max(0, Math.round((new Date(rangeEnd + 'T00:00:00').getTime() - new Date(rangeStart + 'T00:00:00').getTime()) / 86400000)) : 0
  const rangeLabel = rangeStart && rangeEnd && nights > 0
    ? `${formatDate(rangeStart)} → ${formatDate(rangeEnd)} · ${nights}n`
    : null

  const scoreColor = camp.bigRigScore >= 4.5 ? '#22c55e' : camp.bigRigScore >= 4.0 ? '#84cc16' : camp.bigRigScore >= 3.0 ? '#eab308' : '#f97316'
  const cell = camp.cellSignal

  return (
    <div className="place-card">
      {camp.photoUrl && (
        <ExternalLink href={camp.mapUrl || camp.bookingUrl || '#'} className="card-photo-link">
          <div className="card-photo">
            {!imgError ? (
              <img src={camp.photoUrl} alt={camp.name} onError={() => setImgError(true)} loading="lazy" />
            ) : (
              <div className="card-photo-placeholder"><span>🏕️</span></div>
            )}
            <div className="card-photo-overlay">
              <span className="category-badge">RV Park</span>
              <span className="vacancy-badge">
                {vacancy.badge} {vacancy.label}
              </span>
              <span className="big-rig-badge" style={{ background: scoreColor }} title={camp.bigRigNotes?.join(' · ') || 'Big Rig Score'}>
                🚐 {camp.bigRigScore}
              </span>
            </div>
          </div>
        </ExternalLink>
      )}
      <div className="card-body">
        <ExternalLink href={camp.mapUrl || camp.bookingUrl || '#'} className="card-name-link">
          <h3 className="card-name">{camp.name}</h3>
        </ExternalLink>
        {camp.price && <p className="card-price">{formatPrice(camp.price)}</p>}
        <div className="card-meta">
          {camp.rating && <StarRating rating={camp.rating} />}
          {isPeakSeason && (
            <span className="book-early-badge">📅 Book Early</span>
          )}
        </div>
        {camp.amenities?.length > 0 && (
          <div className="amenity-row">
            {camp.amenities.slice(0, 6).map((a) => {
              const icon = a.includes('wifi') ? '📶' : a.includes('pet') ? '🐾' : a.includes('water') ? '💧' : a.includes('electr') ? '⚡' : a.includes('dump') ? '🚰' : a.includes('laundry') ? '🧺' : a.includes('playground') ? '🎢' : a.includes('campfire') || a.includes('fire') ? '🔥' : '•'
              return <span key={a} className="amenity-chip" title={a}>{icon}</span>
            })}
          </div>
        )}
        {/* Enrichment: Nearby services + cell signal */}
        {(camp.nearestServices || camp.cellSignal) && (
          <div className="enrichment-row">
            {camp.nearestServices?.gasStation && (
              <span className="enrich-chip" title="Nearest gas station">⛽ {camp.nearestServices.gasStation.substring(0, 20)}{camp.nearestServices.gasDistanceMi ? ` (${camp.nearestServices.gasDistanceMi}mi)` : ''}</span>
            )}
            {camp.nearestServices?.groceryStore && (
              <span className="enrich-chip" title="Nearest grocery">🛒 {camp.nearestServices.groceryStore.substring(0, 18)}{camp.nearestServices.groceryDistanceMi ? ` (${camp.nearestServices.groceryDistanceMi}mi)` : ''}</span>
            )}
            {camp.nearestServices?.dumpStation && (
              <span className="enrich-chip" title="Nearest dump station">🚰 Dump {camp.nearestServices.dumpDistanceMi ? ` (${camp.nearestServices.dumpDistanceMi}mi)` : ''}</span>
            )}
            {cell && cell.score !== 'unknown' && (
              <span className={`enrich-chip cell-signal-${cell.score}`} title={cell.note}>
                {cell.score === 'excellent' ? '📶 Excellent cell' :
                 cell.score === 'good' ? '📶 Good cell' :
                 cell.score === 'fair' ? '📶 Fair cell' : '📶 Poor cell'}
                {cell.note ? (() => {
                  const m = cell.note.match(/FCC_ASR:(\d+):/)
                  return m ? ` · ${m[1]} towers` : ` · ${cell.note}`
                })() : ''}
              </span>
            )}
            {cell && cell.score === 'unknown' && (
              <span className="enrich-chip enrich-chip-muted" title="Cell data unavailable">📶 Unknown cell signal</span>
            )}
          </div>
        )}
        {/* Campendium reviews */}
        {camp.campendium && camp.campendium.reviewCount > 0 && (
          <div className="campendium-row">
            <ExternalLink href={camp.campendium.url} className="campendium-badge">
              📋 Campendium · {camp.campendium.reviewCount} reviews
              {camp.campendium.cellRating ? ` · 📶 Cell ${camp.campendium.cellRating}` : ''}
              {camp.campendium.pullThrough ? ' · 🔄 Pull-through sites' : ''}
              {camp.campendium.levelSites ? ' · ⬜ Level sites' : ''}
            </ExternalLink>
          </div>
        )}
        {rangeLabel && <p className="date-range-badge">📅 {rangeLabel}</p>}
        {camp.vacancyNote && (
          <p className={`vacancy-note ${camp.vacancyNote.toLowerCase().includes('check for cancellation') ? 'vacancy-urgent' : camp.vacancyNote.toLowerCase().includes('only') || camp.vacancyNote.toLowerCase().includes('left') ? 'vacancy-warn' : ''}`}>
            {camp.vacancyNote}
          </p>
        )}
        <div className="card-actions card-actions-row">
          {onSave && (
            <button
              className={`card-save-btn ${saved ? 'saved' : ''}`}
              onClick={() => onSave(camp)}
              title={saved ? 'Remove from Saved Parks' : 'Save Park + Enable Price Alerts'}
            >
              {saved ? '★ Saved' : '☆ Save Park'}
            </button>
          )}
          <ExternalLink href={camp.bookingUrl || camp.mapUrl || '#'} className="card-directions-btn check-avail-btn">
            {camp.bookingUrl ? '🎟️ Check Availability' : '🗺️ View on Maps'}
          </ExternalLink>
          {camp.mapUrl && (
            <ExternalLink href={camp.mapUrl} className="card-directions-btn">
              📍 Directions
            </ExternalLink>
          )}
          {onWalkFromHere && camp.lat != null && camp.lng != null && (
            <button
              className="card-walk-btn"
              onClick={(e) => { e.preventDefault(); onWalkFromHere(camp.lat!, camp.lng!, camp.name) }}
            >
              🚶 Walk from here
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Skeleton Card ───────────────────────────────────────────────────
function SkeletonCard() {
  return (
    <div className="place-card place-card-skeleton">
      <div className="skeleton-photo" />
      <div className="card-body">
        <div className="skeleton-line skeleton-title" />
        <div className="skeleton-line skeleton-meta" />
        <div className="skeleton-line skeleton-btn" />
      </div>
    </div>
  )
}

// ── Result Grid ──────────────────────────────────────────────────────
const EMPTY_MESSAGES: Record<TabId, { emoji: string; text: string }> = {
  attractions: { emoji: '🎯', text: 'No attractions found. Try a different destination.' },
  restaurants: { emoji: '🍽️', text: 'No restaurants found. Try expanding your search.' },
  parks: { emoji: '🌲', text: 'No parks found. Try a nearby city.' },
  weather: { emoji: '🌤️', text: 'Weather data unavailable for this location.' },
  plans: { emoji: '📋', text: 'Generate a plan above.' },
}

function ResultGrid({ places, loading, children, tabId, onWalkFromHere, badge }: {
  places: PlaceResult[]; loading: boolean; children?: React.ReactNode; tabId?: TabId; onWalkFromHere?: (lat: number, lng: number, name: string) => void; badge?: string
}) {
  if (loading) {
    return (
      <div className="card-grid">
        {[1, 2, 3, 4].map((i) => <SkeletonCard key={i} />)}
      </div>
    )
  }
  if (!places.length && !children) {
    const msg = tabId ? EMPTY_MESSAGES[tabId] : { emoji: '🔍', text: 'No results found.' }
    return (
      <p className="state-msg">
        <span className="emoji">{msg.emoji}</span>
        {msg.text}
      </p>
    )
  }
  return (
    <div className="card-grid">
      {places.map((place) => <PlaceCard key={place.id} place={place} onWalkFromHere={onWalkFromHere} badge={badge} />)}
      {children}
    </div>
  )
}

// ── Campgrounds Grid ─────────────────────────────────────────────────
function CampgroundsGrid({
  campgrounds, loading, rangeStart, rangeEnd, isPeakSeason, onWalkFromHere, onSave, savedParks, city,
}: {
  campgrounds: CampgroundResult[]; loading: boolean; rangeStart: string; rangeEnd: string; isPeakSeason: boolean; onWalkFromHere?: (lat: number, lng: number, name: string) => void; onSave?: (camp: CampgroundResult, city: string) => void; savedParks?: SavedPark[]; city?: string
}) {
  if (loading) {
    return (
      <div className="card-grid">
        {[1, 2, 3, 4].map((i) => <SkeletonCard key={i} />)}
      </div>
    )
  }
  if (!campgrounds.length) {
    return (
      <p className="state-msg">
        <span className="emoji">🏕️</span>
        No campground data available. Showing Google Places RV parks below.
      </p>
    )
  }
  return (
    <div className="card-grid">
      {campgrounds.map((camp, i) => (
        <CampgroundCard key={i} camp={camp} rangeStart={rangeStart} rangeEnd={rangeEnd} isPeakSeason={isPeakSeason} onWalkFromHere={onWalkFromHere} onSave={onSave ? (camp: CampgroundResult) => onSave(camp, city || '') : undefined} saved={savedParks?.some(p => p.name === camp.name)} />
      ))}
    </div>
  )
}

// ── Parks Weather Banner ─────────────────────────────────────────
function ParksWeatherBanner({ city, rangeStart, rangeEnd }: { city: string; rangeStart: string; rangeEnd: string }) {
  const [weather, setWeather] = useState<{
    location: string; forecast: WeatherDay[]; travelRisk: string
    seasonal: { avgHigh: string | null; avgLow: string | null; avgPrecipMm: number | null; trend: string | null; monthLabel: string }
  } | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!city || !rangeStart) return
    setLoading(true)
    fetch(`/api/weather?city=${encodeURIComponent(city)}&date=${rangeStart}`)
      .then(r => r.json())
      .then(d => { setWeather(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [city, rangeStart])

  if (!city) return null

  const nights = rangeStart && rangeEnd
    ? Math.max(0, Math.round((new Date(rangeEnd + 'T00:00:00').getTime() - new Date(rangeStart + 'T00:00:00').getTime()) / 86400000))
    : 0

  if (loading) {
    return <div className="parks-weather-banner parks-weather-loading"><span>🌤️ Checking weather…</span></div>
  }

  // When beyond the 16-day forecast window, show seasonal normals + historical
  // instead of misleading last-available forecast days (which are from a different season)
  const beyondForecast = (weather as unknown as { beyondForecast?: boolean })?.beyondForecast

  if (!weather) return null

  const risk = weather.travelRisk === 'high' ? '🔴' : weather.travelRisk === 'moderate' ? '🟡' : '🟢'
  const nightsLabel = nights > 0 ? ` · ${nights} night${nights !== 1 ? 's' : ''}` : ''

  if (beyondForecast) {
    // Show seasonal normals for the trip month instead of stale forecast
    const s = weather.seasonal
    return (
      <div className="parks-weather-banner">
        <div className="parks-weather-location">🌤️ {weather.location}{nightsLabel}</div>
        <div className="parks-weather-beyond">
          {s?.avgHigh && s?.avgLow && (
            <span className="parks-weather-normals">
              📅 {s.monthLabel} normals: {s.avgHigh}/{s.avgLow}
              {s.avgPrecipMm != null && ` · ${s.avgPrecipMm}mm avg precip`}
            </span>
          )}
          {s?.trend && (
            <span className="parks-seasonal-trend"> · {s.trend} than normal</span>
          )}
          <span className="parks-weather-risk"> {risk} {weather.travelRisk} travel risk</span>
        </div>
        <div className="parks-weather-note">
          📈 16-day forecast unavailable — tap Weather tab for historical averages
        </div>
      </div>
    )
  }

  if (!weather.forecast?.length) return null

  return (
    <div className="parks-weather-banner">
      <div className="parks-weather-location">🌤️ {weather.location}{nightsLabel}</div>
      <div className="parks-weather-days">
        {weather.forecast.slice(0, Math.min(3, nights || 3)).map((day, i) => (
          <span key={i} className="parks-weather-day">
            <span className="parks-weather-icon">{day.icon}</span>
            <span className="parks-weather-temps">{day.maxTemp} · {day.minTemp}</span>
          </span>
        ))}
      </div>
      {weather.seasonal && (
        <span className="parks-weather-risk">
          {risk} Travel risk: {weather.travelRisk}
          {weather.seasonal.avgPrecipMm != null && ` · ${weather.seasonal.avgPrecipMm}mm avg precip`}
          {weather.seasonal.trend && ` · ${weather.seasonal.trend} than normal`}
        </span>
      )}
    </div>
  )
}

// ── Weather Display ─────────────────────────────────────────────────
function WeatherDisplay({ city }: { city: string }) {
  const today = new Date().toISOString().slice(0, 10)
  const [rangeStart, setRangeStart] = useState<string>(today)
  const [rangeEnd, setRangeEnd] = useState<string>(() => {
    const d = new Date(); d.setDate(d.getDate() + 3); return d.toISOString().slice(0, 10)
  })
  const [weather, setWeather] = useState<{
    location: string; date: string; forecast: WeatherDay[]; travelRisk: string
    historical: { avgHigh: string | null; avgLow: string | null; avgPrecipMm: number | null }
    seasonal: { avgHigh: string | null; avgLow: string | null; avgPrecipMm: number | null; trend: string | null; monthLabel: string }
    beyondForecast: boolean
  } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const fetchWeather = async (startDate: string) => {
    if (!city) return
    setLoading(true)
    setError(null)
    try {
      const url = `/api/weather?city=${encodeURIComponent(city)}&date=${startDate}`
      const res = await fetch(url)
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Could not load weather.')
      } else {
        setWeather(data)
      }
    } catch {
      setError('Network error. Check your connection.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchWeather(rangeStart)
  }, [city, rangeStart])

  const risk = weather ? TRAVEL_RISK_LABELS[weather.travelRisk as 'low' | 'moderate' | 'high'] : null
  const s = weather?.seasonal
  const trendEmoji = s?.trend === 'warmer' ? '↗' : s?.trend === 'cooler' ? '↘' : '→'

  const nights = rangeStart && rangeEnd
    ? Math.max(0, Math.round((new Date(rangeEnd + 'T00:00:00').getTime() - new Date(rangeStart + 'T00:00:00').getTime()) / 86400000))
    : 0

  return (
    <div>
      <div className="weather-header">
        <p className="weather-location">{city}</p>
        <DateRangePicker
          startValue={rangeStart}
          endValue={rangeEnd}
          onStartChange={setRangeStart}
          onEndChange={setRangeEnd}
          label="Trip dates"
          maxDays={180}
          maxNights={14}
        />

        {/* Prominent seasonal average banner when beyond forecast */}
        {weather?.beyondForecast && (
          <div className="weather-seasonal-banner">
            <span className="seasonal-badge">📅 SEASONAL AVERAGE</span>
            <span className="seasonal-label">
              {s?.monthLabel} normals for {city}: <strong>{s?.avgHigh}/{s?.avgLow}</strong>
              {s?.avgPrecipMm != null && <> · {s.avgPrecipMm}mm avg precipitation</>}
              {s?.trend && <span className="seasonal-trend"> · {trendEmoji} {s.trend} than normal</span>}
            </span>
          </div>
        )}

        {/* Travel risk and historical */}
        {risk && !weather?.beyondForecast && (
          <div className={`travel-risk-badge risk-${weather!.travelRisk}`}>
            {risk.badge} {risk.label}
            {weather!.historical.avgPrecipMm != null && (
              <span className="risk-precip"> · {weather!.historical.avgPrecipMm}mm avg precip last year</span>
            )}
          </div>
        )}

        {s?.avgHigh && !weather?.beyondForecast && (
          <div className="seasonal-note">
            📅 {s.monthLabel} normal: <strong>{s.avgHigh}/{s.avgLow}</strong>
            {s.trend && <> · {trendEmoji} {s.trend} than normal</>}
          </div>
        )}

        {weather?.beyondForecast && weather?.historical?.avgHigh && (
          <div className="historical-note">
            📊 Last year on {formatDate(weather.date)}: {weather.historical.avgHigh}/{weather.historical.avgLow}
          </div>
        )}
      </div>

      {loading && (
        <div className="weather-grid">
          {[1, 2, 3, 4, 5].map((i) => <SkeletonCard key={i} />)}
        </div>
      )}

      {error && !loading && <div className="error-msg">{error}</div>}

      {/* Show all nights in the selected range */}
      {weather && !loading && (
        <>
          {weather.historical.avgHigh && !weather.beyondForecast && (
            <div className="historical-note">
              📊 Last year on {formatDate(weather.date)}: {weather.historical.avgHigh}/{weather.historical.avgLow}
            </div>
          )}
          <div className={`weather-grid${weather.beyondForecast ? ' weather-grid-dimmed' : ''}`}>
            {Array.from({ length: Math.max(1, nights) }, (_, i) => {
              const fcDay = weather.forecast[i] ?? null
              const isAvg = weather.beyondForecast || fcDay === null
              return (
                <div key={i} className={`weather-card${isAvg ? ' weather-card-dimmed' : ''}`}>
                  {isAvg && <span className="card-avg-label">{weather.beyondForecast ? 'avg' : 'est'}</span>}
                  <p className="weather-day">
                    Night {i + 1} · {formatDate(new Date(new Date(rangeStart + 'T00:00:00').getTime() + i * 86400000).toISOString().slice(0, 10))}
                  </p>
                  <div className="weather-icon">{fcDay?.icon ?? (isAvg ? '📅' : '—')}</div>
                  <div className="weather-temps">
                    {fcDay ? (
                      <>
                        <span className="weather-max">{fcDay.maxTemp}°</span>
                        <span className="weather-min">/ {fcDay.minTemp}°</span>
                      </>
                    ) : (
                      <span className="weather-max seasonal-temp">{s?.avgHigh ?? '—'}°</span>
                    )}
                  </div>
                  <p className="weather-desc">{fcDay?.desc ?? (isAvg ? `${s?.monthLabel} avg` : '—')}</p>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

// ── Plans Panel ─────────────────────────────────────────────────────
type PlanStop = {
  time: string
  type: 'coffee' | 'activity' | 'meal' | 'evening'
  placeName: string
  address: string
  walkFromPrevious: string
  notes: string
  rating: number | null
  mapsUrl: string
}

const DAY_TYPES = [
  { value: 'weeknight', label: '🌙 Weeknight' },
  { value: 'weekend-morning', label: '🌅 Weekend Morning' },
  { value: 'weekend-afternoon', label: '☀️ Weekend Afternoon' },
  { value: 'weekend-night', label: '🌃 Weekend Night' },
  { value: 'multi-day', label: '🗓️ Multi-Day' },
] as const

const STOP_ICONS: Record<string, string> = {
  coffee: '☕', activity: '🥾', meal: '🍽️', evening: '🌙',
}

const STOP_LABELS: Record<string, string> = {
  coffee: 'Coffee Stop', activity: 'Activity', meal: 'Meal', evening: 'Evening',
}

const LOADING_MESSAGES = [
  'Finding local coffee spots…',
  'Checking nearby trails…',
  'Scouting dinner options…',
  'Mapping out the evening…',
  'Putting together your itinerary…',
]

function PlansPanel({ city, rangeStart, rangeEnd, attractions, restaurants }: {
  city: string
  rangeStart: string
  rangeEnd: string
  attractions: PlaceResult[]
  restaurants: PlaceResult[]
}) {
  const [dayType, setDayType] = useState<string>('weekend-afternoon')
  const [stops, setStops] = useState<PlanStop[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loadingMsg, setLoadingMsg] = useState('')
  const [planCity, setPlanCity] = useState('')

  const generate = async () => {
    if (!city.trim()) return
    setLoading(true)
    setError(null)
    setStops(null)
    setPlanCity(city.trim())

    // Cycle through loading messages
    let msgIdx = 0
    const msgInterval = setInterval(() => {
      setLoadingMsg(LOADING_MESSAGES[msgIdx % LOADING_MESSAGES.length])
      msgIdx++
    }, 1200)

    const contextPlaces = [...attractions, ...restaurants].slice(0, 30)

    try {
      const res = await fetch('/api/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          city: city.trim(),
          dayType,
          startDate: rangeStart,
          endDate: rangeEnd,
          contextPlaces,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to generate plan')
      setStops(json.stops || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      clearInterval(msgInterval)
      setLoading(false)
      setLoadingMsg('')
    }
  }

  if (!city) {
    return (
      <p className="state-msg">
        <span className="emoji">📋</span>
        Search a city above to generate a trip plan.
      </p>
    )
  }

  return (
    <div className="plans-panel">
      <div className="plans-controls">
        <div className="day-type-selector">
          {DAY_TYPES.map(dt => (
            <button
              key={dt.value}
              className={`day-type-btn ${dayType === dt.value ? 'active' : ''}`}
              onClick={() => setDayType(dt.value)}
            >
              {dt.label}
            </button>
          ))}
        </div>
        <button
          className="generate-btn"
          onClick={generate}
          disabled={loading || !city.trim()}
        >
          {loading ? `⏳ ${loadingMsg}` : '✨ Generate My Plan'}
        </button>
      </div>

      {error && <div className="error-msg">{error}</div>}

      {stops && stops.length > 0 && (
        <div className="plan-timeline">
          <div className="plan-header">
            <h3>📍 {planCity} — {DAY_TYPES.find(d => d.value === dayType)?.label.replace(/^[🌙🌅☀️🌃🗓️]\s/, '') || dayType}</h3>
            <button className="regen-btn" onClick={generate} title="Regenerate">↻</button>
          </div>
          {stops.map((stop, i) => (
            <div key={i} className="plan-stop">
              <div className="stop-time-col">
                <span className="stop-icon">{STOP_ICONS[stop.type] || '📍'}</span>
                <span className="stop-time">{stop.time}</span>
              </div>
              <div className="stop-connector">
                <div className="stop-dot" />
                {i < stops.length - 1 && <div className="stop-line" />}
              </div>
              <div className="stop-content">
                <div className="stop-type-label">{STOP_LABELS[stop.type] || stop.type}</div>
                <div className="stop-place">{stop.placeName}</div>
                <div className="stop-address">{stop.address}</div>
                {stop.rating && <div className="stop-rating">★ {stop.rating.toFixed(1)}</div>}
                {stop.notes && <div className="stop-notes">{stop.notes}</div>}
                <div className="stop-actions">
                  <span className="walk-badge">🚶 {stop.walkFromPrevious}</span>
                  <a href={stop.mapsUrl} target="_blank" rel="noopener noreferrer" className="directions-link">
                    📍 Directions
                  </a>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && !stops && !error && (
        <p className="state-msg">
          <span className="emoji">✨</span>
          Select a day type above and tap Generate to create your itinerary.
        </p>
      )}
    </div>
  )
}

// ── Main Page ────────────────────────────────────────────────────────
export default function Home() {
  const [city, setCity] = useState('')
  const [activeTab, setActiveTab] = useState<TabId>('attractions')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<Record<'attractions' | 'restaurants' | 'parks', PlaceResult[]>>({
    attractions: [], restaurants: [], parks: [],
  })
  // Campground vacancy data
  const [campgrounds, setCampgrounds] = useState<CampgroundResult[]>([])
  const [campgroundsLoading, setCampgroundsLoading] = useState(false)
  const [isPeakSeason, setIsPeakSeason] = useState(false)
  const [campgroundsUpdated, setCampgroundsUpdated] = useState<string>('')
  const todayStr = new Date().toISOString().slice(0, 10)
  const [selectedDate, setSelectedDate] = useState(todayStr)
  const [rangeStart, setRangeStart] = useState(todayStr)
  const [rangeEnd, setRangeEnd] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() + 3); return d.toISOString().slice(0, 10)
  })
  const [savedCities, setSavedCities] = useState<string[]>([])
  const [walkOrigin, setWalkOrigin] = useState<{ lat: number; lng: number; name: string } | null>(null)
  // Big Rig Scout filter
  const [bigRigFilter, setBigRigFilter] = useState(false)
  // Advanced campground filters
  const [minBigRigScore, setMinBigRigScore] = useState('1')
  const [minCellSignal, setMinCellSignal] = useState('any')
  const [pullThrough, setPullThrough] = useState(false)
  const [levelSites, setLevelSites] = useState(false)
  const [sortBy, setSortBy] = useState('bigRigScore')
  const [showFilters, setShowFilters] = useState(false)
  // Saved Parks for alerts
  const [savedParks, setSavedParks] = useState<SavedPark[]>([])
  // Per-tab search mode: 'popular' or 'local'
  const [searchMode, setSearchMode] = useState<Record<'attractions' | 'restaurants', 'popular' | 'local'>>({
    attractions: 'popular',
    restaurants: 'popular',
  })

  // Load saved cities and last city from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem('en_saved_cities')
      if (stored) setSavedCities(JSON.parse(stored))
      const lastCity = localStorage.getItem('en_last_city')
      if (lastCity) setCity(lastCity)
    } catch {}
  }, [])

  // Load saved parks from API on mount
  useEffect(() => {
    fetch('/api/saved-parks')
      .then(r => r.json())
      .then(d => { if (Array.isArray(d.parks)) setSavedParks(d.parks) })
      .catch(() => {})
  }, [])

  const loadSavedParks = () => {
    fetch('/api/saved-parks')
      .then(r => r.json())
      .then(d => { if (Array.isArray(d.parks)) setSavedParks(d.parks) })
      .catch(() => {})
  }

  const savePark = async (camp: CampgroundResult, campCity: string) => {
    const res = await fetch('/api/saved-parks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: camp.name,
        city: campCity,
        entityId: '',
        dateRange: rangeStart && rangeEnd ? { start: rangeStart, end: rangeEnd } : null,
      }),
    })
    const d = await res.json()
    if (d.ok) { setSavedParks(prev => [...prev, d.park]) }
  }

  const updateAlertPrefs = async (id: string, alertPrefs: AlertPrefs) => {
    const res = await fetch('/api/saved-parks', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, alertPrefs }),
    })
    if (res.ok) {
      const d = await res.json()
      setSavedParks(prev => prev.map(p => p.id === id ? { ...p, alertPrefs: d.park.alertPrefs } : p))
    }
  }

  const removePark = async (id: string) => {
    const res = await fetch(`/api/saved-parks?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
    if (res.ok) setSavedParks(prev => prev.filter(p => p.id !== id))
  }

  const isParkSaved = (name: string) => savedParks.some(p => p.name === name)

  const saveCity = (c: string) => {
    try {
      const next = [c, ...savedCities.filter(s => s !== c)].slice(0, 5)
      setSavedCities(next)
      localStorage.setItem('en_saved_cities', JSON.stringify(next))
      localStorage.setItem('en_last_city', c)
    } catch {}
  }

  const handleSearch = async () => {
    if (!city.trim()) return
    const dest = city.trim()
    setLoading(true)
    setError(null)
    setActiveTab('attractions')
    setCampgrounds([])
    // Reset date range to today..today+3 when searching a new city
    setRangeStart(todayStr)
    setRangeEnd(new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10))

    const tabs = ['attractions', 'restaurants', 'parks'] as const
    const fresh: Record<string, PlaceResult[]> = { attractions: [], restaurants: [], parks: [] }

    try {
      // Run Google Places searches in parallel — use current mode per tab
      const promises = tabs.map(async (tab) => {
        const mode = tab === 'parks' ? 'popular' : (searchMode[tab as 'attractions' | 'restaurants'] || 'popular')
        const res = await fetch(`/api/search?city=${encodeURIComponent(dest)}&type=${tab}&mode=${mode}`)
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || 'Search failed')
        return { tab, results: json.results || [], mode }
      })

      const settled = await Promise.all(promises)
      for (const { tab, results } of settled) {
        fresh[tab] = results
      }

      setData(fresh as Record<'attractions' | 'restaurants' | 'parks', PlaceResult[]>)
        saveCity(dest)

      // Fetch campground vacancy data
      setCampgroundsLoading(true)
      try {
        const cgRes = await fetch(`/api/campgrounds?city=${encodeURIComponent(dest)}&bigRig=${bigRigFilter}&minBigRigScore=${minBigRigScore}&minCellSignal=${minCellSignal}&pullThrough=${pullThrough}&levelSites=${levelSites}&sortBy=${sortBy}`)
        const cgData = await cgRes.json()
        if (cgRes.ok && cgData.results) {
          setCampgrounds(cgData.results)
          setIsPeakSeason(cgData.peakSeason || false)
          setCampgroundsUpdated(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))
        }
      } catch {
        // vacancy data optional — don't break search
      } finally {
        setCampgroundsLoading(false)
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const tripMonth = rangeStart ? new Date(rangeStart + 'T00:00:00').getMonth() + 1 : new Date().getMonth() + 1
  const peakSeason = tripMonth >= 6 && tripMonth <= 9
  const daysUntilTrip = rangeStart
    ? Math.max(0, Math.round((new Date(rangeStart + 'T00:00:00').getTime() - Date.now()) / 86400000))
    : null

  return (
    <main className="app">
      <header className="header">
        <h1>🦅 Eagle's Nest</h1>
        <p>Your RV Travel Companion — find places, parks & weather anywhere</p>
      </header>

      <SavedCityChips cities={savedCities} onSelect={(c) => { setCity(c); window.scrollTo({ top: 0, behavior: 'smooth' }) }} />
      <LocationInput value={city} onChange={setCity} onSearch={handleSearch} loading={loading} />
      <SearchStatus loading={loading} city={city} />

      <TabBar active={activeTab} onChange={setActiveTab} />

      {/* Mode toggle: Popular / Local Gems — only on attractions + restaurants */}
      {(activeTab === 'attractions' || activeTab === 'restaurants') && city && (
        <div className="mode-toggle">
          <button
            className={`mode-btn ${searchMode[activeTab as 'attractions' | 'restaurants'] === 'popular' ? 'active' : ''}`}
            onClick={() => setSearchMode(prev => ({ ...prev, [activeTab]: 'popular' }))}
          >
            🌍 Popular
          </button>
          <button
            className={`mode-btn ${searchMode[activeTab as 'attractions' | 'restaurants'] === 'local' ? 'active' : ''}`}
            onClick={() => {
              const newMode = searchMode[activeTab as 'attractions' | 'restaurants'] === 'local' ? 'popular' : 'local'
              setSearchMode(prev => ({ ...prev, [activeTab]: newMode }))
              if (!city.trim()) return
              setLoading(true)
              const tab = activeTab as 'attractions' | 'restaurants'
              fetch(`/api/search?city=${encodeURIComponent(city)}&type=${tab}&mode=${newMode}`)
                .then(r => r.json())
                .then(d => { if (d.results) setData(prev => ({ ...prev, [tab]: d.results })) })
                .catch(() => {})
                .finally(() => setLoading(false))
            }}
          >
            🗺️ Local Gems
          </button>
        </div>
      )}

      {activeTab === 'plans' ? (
        <PlansPanel
          city={city}
          rangeStart={rangeStart}
          rangeEnd={rangeEnd}
          attractions={data.attractions}
          restaurants={data.restaurants}
        />
      ) : activeTab === 'weather' ? (
        <WeatherDisplay city={city} />
      ) : activeTab === 'parks' ? (
        <>
          {error && <div className="error-msg">{error}</div>}
          {!city && (
            <p className="state-msg">
              <span className="emoji">🗺️</span>
              Enter a destination above to get started.
            </p>
          )}
          {/* Vacancy risk header */}
          {city && (
            <div className="parks-header">
              <div className="vacancy-risk-bar">
                <span className="vacancy-risk-label">Vacancy Risk:</span>
                <span className={`vacancy-risk-badge ${peakSeason ? 'risk-seasonal' : 'risk-low'}`}>
                  {peakSeason ? '🟡 Seasonal Risk (Jun–Sep)' : '🟢 Usually Available'}
                </span>
                {peakSeason && (
                  <span className="book-early-global">📅 Book Early Recommended</span>
                )}
                {campgroundsUpdated && (
                  <span className="vacancy-timestamp">Recreation.gov · Updated {campgroundsUpdated}</span>
                )}
              </div>
              {daysUntilTrip !== null && daysUntilTrip > 0 && (
                <div className="trip-countdown">
                  <span className="countdown-badge">⏱️ {daysUntilTrip} days until your trip</span>
                </div>
              )}
              {/* ── Advanced Filter Bar ── */}
              <div className="parks-filter-bar">
                <div className="filter-bar-row">
                  <span className="filter-bar-label">🚐 Min Score:</span>
                  <select
                    className="filter-select"
                    value={minBigRigScore}
                    onChange={e => { setMinBigRigScore(e.target.value); setBigRigFilter(e.target.value !== '1'); setTimeout(() => handleSearch(), 0) }}
                  >
                    <option value="1">Any</option>
                    <option value="3">≥ 3.0 — Budget</option>
                    <option value="3.5">≥ 3.5 — Good</option>
                    <option value="4">≥ 4.0 — Recommended</option>
                    <option value="4.5">≥ 4.5 — Premium</option>
                  </select>

                  <span className="filter-bar-label">📶 Cell:</span>
                  <select
                    className="filter-select"
                    value={minCellSignal}
                    onChange={e => { setMinCellSignal(e.target.value); setTimeout(() => handleSearch(), 0) }}
                  >
                    <option value="any">Any</option>
                    <option value="poor">≥ Poor</option>
                    <option value="fair">≥ Fair</option>
                    <option value="good">≥ Good</option>
                    <option value="excellent">Excellent Only</option>
                  </select>

                  <span className="filter-bar-label">Sort:</span>
                  <select
                    className="filter-select"
                    value={sortBy}
                    onChange={e => { setSortBy(e.target.value); setTimeout(() => handleSearch(), 0) }}
                  >
                    <option value="bigRigScore">🚐 Big Rig</option>
                    <option value="cellSignal">📶 Cell</option>
                    <option value="rating">⭐ Rating</option>
                    <option value="price">💲 Price</option>
                  </select>
                </div>
                <div className="filter-bar-row filter-bar-row-2">
                  <button
                    className={`filter-toggle-btn ${pullThrough ? 'active' : ''}`}
                    onClick={() => { setPullThrough(v => !v); setTimeout(() => handleSearch(), 0) }}
                  >
                    🔄 Pull-Through
                  </button>
                  <button
                    className={`filter-toggle-btn ${levelSites ? 'active' : ''}`}
                    onClick={() => { setLevelSites(v => !v); setTimeout(() => handleSearch(), 0) }}
                  >
                    🏗️ Level Pads
                  </button>
                  <span className="filter-result-count">
                    {campgrounds.length > 0 ? `${campgrounds.length} parks` : ''}
                  </span>
                </div>
              </div>
              <DateRangePicker
                startValue={rangeStart}
                endValue={rangeEnd}
                onStartChange={setRangeStart}
                onEndChange={setRangeEnd}
                label="Trip dates"
                maxDays={180}
                maxNights={30}
              />
              <ParksWeatherBanner city={city} rangeStart={rangeStart} rangeEnd={rangeEnd} />
            </div>
          )}
          {/* Saved Parks for Telegram Alerts */}
          {savedParks.length > 0 && (
            <details className="saved-parks-panel" open>
              <summary className="saved-parks-header">
                🐾 Saved Parks ({savedParks.length}) — Alerts via Telegram daily at 9 AM
              </summary>
              <div className="saved-parks-list">
                {savedParks.map(park => {
                  const prefs = park.alertPrefs || { enabled: true, vacancyChange: true, priceDrop: true, cellBelow: 'any', bigRigBelow: 1 }
                  return (
                    <div key={park.id} className="saved-park-item">
                      <div className="saved-park-info">
                        <div className="saved-park-top-row">
                          <strong>{park.name}</strong>
                          <label className="alert-master-toggle" title="Enable/disable all alerts for this park">
                            <input
                              type="checkbox"
                              checked={prefs.enabled}
                              onChange={e => updateAlertPrefs(park.id, { ...prefs, enabled: e.target.checked })}
                            />
                            🔔 Alerts {prefs.enabled ? 'ON' : 'OFF'}
                          </label>
                        </div>
                        <span className="saved-park-meta">
                          {park.city}
                          {park.dateRange ? ` · ${park.dateRange.start} → ${park.dateRange.end}` : ''}
                        </span>
                        <span className={`saved-park-avail ${park.lastKnownAvailable === null ? 'unknown' : park.lastKnownAvailable > 0 ? 'available' : 'full'}`}>
                          {park.lastKnownAvailable === null ? '⏳ Not checked yet'
                            : park.lastKnownAvailable > 0 ? `🟢 ${park.lastKnownAvailable} sites available`
                            : '🔴 Fully booked'}
                        </span>
                        {/* Alert preference toggles */}
                        {prefs.enabled && (
                          <div className="saved-park-alert-prefs">
                            <label className={`pref-toggle ${prefs.vacancyChange ? 'active' : ''}`}>
                              <input
                                type="checkbox"
                                checked={prefs.vacancyChange}
                                onChange={e => updateAlertPrefs(park.id, { ...prefs, vacancyChange: e.target.checked })}
                              />
                              🟢 Vacancy changes
                            </label>
                            <label className={`pref-toggle ${prefs.priceDrop ? 'active' : ''}`}>
                              <input
                                type="checkbox"
                                checked={prefs.priceDrop}
                                onChange={e => updateAlertPrefs(park.id, { ...prefs, priceDrop: e.target.checked })}
                              />
                              💲 Price drops
                            </label>
                            <select
                              className="pref-select"
                              value={prefs.cellBelow}
                              onChange={e => updateAlertPrefs(park.id, { ...prefs, cellBelow: e.target.value })}
                              title="Alert when cell signal drops below..."
                            >
                              <option value="any">📶 Any cell signal</option>
                              <option value="excellent">📶 ≥ Excellent</option>
                              <option value="good">📶 ≥ Good</option>
                              <option value="fair">📶 ≥ Fair</option>
                            </select>
                            <select
                              className="pref-select"
                              value={prefs.bigRigBelow}
                              onChange={e => updateAlertPrefs(park.id, { ...prefs, bigRigBelow: Number(e.target.value) })}
                              title="Alert when Big Rig Score drops below..."
                            >
                              <option value={1}>🚐 Any Big Rig Score</option>
                              <option value={3}>🚐 ≥ 3.0</option>
                              <option value={3.5}>🚐 ≥ 3.5</option>
                              <option value={4}>🚐 ≥ 4.0</option>
                              <option value={4.5}>🚐 ≥ 4.5</option>
                            </select>
                          </div>
                        )}
                      </div>
                      <button
                        className="saved-park-remove"
                        onClick={() => removePark(park.id)}
                        title="Remove from Saved Parks"
                      >
                        ✕
                      </button>
                    </div>
                  )
                })}
              </div>
              <p className="saved-parks-note">📱 Alerts sent to Telegram — make sure EaglesNestAlertBot can message you.</p>
            </details>
          )}
          <CampgroundsGrid
            campgrounds={campgrounds}
            loading={campgroundsLoading}
            rangeStart={rangeStart}
            rangeEnd={rangeEnd}
            isPeakSeason={peakSeason}
            onWalkFromHere={(lat, lng, name) => setWalkOrigin({ lat, lng, name })}
            onSave={savePark}
            savedParks={savedParks}
            city={city}
          />
          {/* Fall back to Google Places parks if no campground data */}
          {(!campgroundsLoading && campgrounds.length === 0) && (
            <>
              <p className="state-msg">
                <span className="emoji">🌲</span>
                No Recreation.gov data for this area — showing Google Places RV parks below.
              </p>
              <ResultGrid places={data.parks || []} loading={false} tabId="parks" onWalkFromHere={(lat, lng, name) => setWalkOrigin({ lat, lng, name })} />
            </>
          )}
          {campgroundsLoading && (
            <div className="card-grid">
              {[1, 2, 3, 4].map((i) => <SkeletonCard key={i} />)}
            </div>
          )}
        </>
      ) : (
        <>
          {error && <div className="error-msg">{error}</div>}
          {!city && (
            <p className="state-msg">
              <span className="emoji">🗺️</span>
              Enter a destination above to get started.
            </p>
          )}
          <ResultGrid
            places={data[activeTab] || []}
            loading={loading && !!city}
            tabId={activeTab}
            onWalkFromHere={(lat, lng, name) => setWalkOrigin({ lat, lng, name })}
            badge={
              (activeTab === 'attractions' || activeTab === 'restaurants') &&
              searchMode[activeTab] === 'local'
                ? '🏷️ Local Pick'
                : undefined
            }
          />
        </>
      )}

      {walkOrigin != null && typeof walkOrigin.lat === 'number' && typeof walkOrigin.lng === 'number' && (
        <WalkRadiusSheet
          originLat={walkOrigin.lat}
          originLng={walkOrigin.lng}
          originName={walkOrigin.name}
          onClose={() => setWalkOrigin(null)}
        />
      )}

      <footer className="app-footer">
        <span>Powered by</span>
        <span>Google Places</span>
        <span className="footer-dot">·</span>
        <span>Open-Meteo</span>
        <span className="footer-dot">·</span>
        <span>Recreation.gov</span>
      </footer>
    </main>
  )
}
