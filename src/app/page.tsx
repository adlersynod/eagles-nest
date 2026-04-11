'use client'

import { useState, useEffect } from 'react'
import DatePicker, { DateRangePicker } from './components/DatePicker'
import ExternalLink from '../components/ExternalLink'
import WalkRadiusSheet from '../components/WalkRadiusSheet'

// ── Types ────────────────────────────────────────────────────────────
type TabId = 'attractions' | 'restaurants' | 'parks' | 'weather'

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
function CampgroundCard({ camp, rangeStart, rangeEnd, isPeakSeason, onWalkFromHere }: { camp: CampgroundResult; rangeStart: string; rangeEnd: string; isPeakSeason: boolean; onWalkFromHere?: (lat: number, lng: number, name: string) => void }) {
  const vacancy = VACANCY_LABELS[camp.vacancyStatus]
  const [imgError, setImgError] = useState(false)
  const nights = rangeStart && rangeEnd ? Math.max(0, Math.round((new Date(rangeEnd + 'T00:00:00').getTime() - new Date(rangeStart + 'T00:00:00').getTime()) / 86400000)) : 0
  const rangeLabel = rangeStart && rangeEnd && nights > 0
    ? `${formatDate(rangeStart)} → ${formatDate(rangeEnd)} · ${nights}n`
    : null

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
        {rangeLabel && <p className="date-range-badge">📅 {rangeLabel}</p>}
        {camp.vacancyNote && (
          <p className={`vacancy-note ${camp.vacancyNote.toLowerCase().includes('check for cancellation') ? 'vacancy-urgent' : camp.vacancyNote.toLowerCase().includes('only') || camp.vacancyNote.toLowerCase().includes('left') ? 'vacancy-warn' : ''}`}>
            {camp.vacancyNote}
          </p>
        )}
        <div className="card-actions card-actions-row">
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
  campgrounds, loading, rangeStart, rangeEnd, isPeakSeason, onWalkFromHere,
}: {
  campgrounds: CampgroundResult[]; loading: boolean; rangeStart: string; rangeEnd: string; isPeakSeason: boolean; onWalkFromHere?: (lat: number, lng: number, name: string) => void
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
        <CampgroundCard key={i} camp={camp} rangeStart={rangeStart} rangeEnd={rangeEnd} isPeakSeason={isPeakSeason} onWalkFromHere={onWalkFromHere} />
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
        const cgRes = await fetch(`/api/campgrounds?city=${encodeURIComponent(dest)}`)
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

      {activeTab === 'weather' ? (
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
          <CampgroundsGrid
            campgrounds={campgrounds}
            loading={campgroundsLoading}
            rangeStart={rangeStart}
            rangeEnd={rangeEnd}
            isPeakSeason={peakSeason}
            onWalkFromHere={(lat, lng, name) => setWalkOrigin({ lat, lng, name })}
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

      {walkOrigin && walkOrigin.lat != null && walkOrigin.lng != null && !isNaN(walkOrigin.lat) && !isNaN(walkOrigin.lng) && (
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
