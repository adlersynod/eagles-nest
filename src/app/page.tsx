'use client'

import { useState, useEffect } from 'react'
import DatePicker, { DateRangePicker } from './components/DatePicker'

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
  price: string | null
  amenities: string[]
  photoUrl: string | null
  bookingUrl: string | null
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

// ── Location Input ───────────────────────────────────────────────────
function LocationInput({
  value, onChange, onSearch, loading,
}: {
  value: string; onChange: (v: string) => void; onSearch: () => void; loading: boolean
}) {
  return (
    <div className="input-row">
      <input
        type="text"
        placeholder="Enter city or destination (e.g. Portland, OR)"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && !loading && onSearch()}
        aria-label="City or destination"
      />
      <button onClick={onSearch} disabled={!value.trim() || loading}>
        {loading ? 'Searching…' : 'Go'}
      </button>
    </div>
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
function PlaceCard({ place }: { place: PlaceResult }) {
  const [imgError, setImgError] = useState(false)
  const category = getCategoryBadge(place.types, place.primaryType)

  return (
    <div className="place-card">
      <a href={place.mapUrl} target="_blank" rel="noopener noreferrer" className="card-photo-link">
        <div className="card-photo">
          {place.photoUrl && !imgError ? (
            <img src={place.photoUrl} alt={place.name} onError={() => setImgError(true)} loading="lazy" />
          ) : (
            <div className="card-photo-placeholder"><span>📍</span></div>
          )}
          <div className="card-photo-overlay">
            <span className="category-badge">{category}</span>
          </div>
        </div>
      </a>
      <div className="card-body">
        <a href={place.mapUrl} target="_blank" rel="noopener noreferrer" className="card-name-link">
          <h3 className="card-name">{place.name}</h3>
        </a>
        {place.address && <p className="card-address">{place.address}</p>}
        <div className="card-meta">
          <StarRating rating={place.rating} />
          <PriceLevel level={place.priceLevel} />
        </div>
        <div className="card-actions">
          <a href={place.mapUrl} target="_blank" rel="noopener noreferrer" className="card-directions-btn">
            📍 View on Maps
          </a>
        </div>
      </div>
    </div>
  )
}

// ── Campground Card (for RV Parks tab) ──────────────────────────────
function CampgroundCard({ camp, rangeStart, rangeEnd, isPeakSeason }: { camp: CampgroundResult; rangeStart: string; rangeEnd: string; isPeakSeason: boolean }) {
  const vacancy = VACANCY_LABELS[camp.vacancyStatus]
  const [imgError, setImgError] = useState(false)
  const nights = rangeStart && rangeEnd ? Math.max(0, Math.round((new Date(rangeEnd + 'T00:00:00').getTime() - new Date(rangeStart + 'T00:00:00').getTime()) / 86400000)) : 0
  const rangeLabel = rangeStart && rangeEnd && nights > 0
    ? `${formatDate(rangeStart)} → ${formatDate(rangeEnd)} · ${nights}n`
    : null

  return (
    <div className="place-card">
      {camp.photoUrl && (
        <a href={camp.bookingUrl || '#'} target="_blank" rel="noopener noreferrer" className="card-photo-link">
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
        </a>
      )}
      <div className="card-body">
        <a href={camp.bookingUrl || '#'} target="_blank" rel="noopener noreferrer" className="card-name-link">
          <h3 className="card-name">{camp.name}</h3>
        </a>
        {camp.price && <p className="card-price">{camp.price}/night</p>}
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
          <a href={camp.bookingUrl || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(camp.name)}&zoom=15`} target="_blank" rel="noopener noreferrer" className="card-directions-btn check-avail-btn">
            {camp.bookingUrl ? 'Check Availability' : 'View on Maps'}
          </a>
          <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(camp.name)}&zoom=15`} target="_blank" rel="noopener noreferrer" className="card-directions-btn">
            📍 Directions
          </a>
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
function ResultGrid({ places, loading, children }: {
  places: PlaceResult[]; loading: boolean; children?: React.ReactNode
}) {
  if (loading) {
    return (
      <div className="card-grid">
        {[1, 2, 3, 4].map((i) => <SkeletonCard key={i} />)}
      </div>
    )
  }
  if (!places.length && !children) {
    return (
      <p className="state-msg">
        <span className="emoji">🔍</span>
        No results found. Try a different city or tab.
      </p>
    )
  }
  return (
    <div className="card-grid">
      {places.map((place) => <PlaceCard key={place.id} place={place} />)}
      {children}
    </div>
  )
}

// ── Campgrounds Grid ─────────────────────────────────────────────────
function CampgroundsGrid({
  campgrounds, loading, rangeStart, rangeEnd, isPeakSeason,
}: {
  campgrounds: CampgroundResult[]; loading: boolean; rangeStart: string; rangeEnd: string; isPeakSeason: boolean
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
        <CampgroundCard key={i} camp={camp} rangeStart={rangeStart} rangeEnd={rangeEnd} isPeakSeason={isPeakSeason} />
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

  if (!weather?.forecast?.length) return null

  const risk = weather.travelRisk === 'high' ? '🔴' : weather.travelRisk === 'moderate' ? '🟡' : '🟢'
  const nightsLabel = nights > 0 ? ` · ${nights} night${nights !== 1 ? 's' : ''}` : ''

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
  const [selectedDate, setSelectedDate] = useState<string>(today)
  const [weather, setWeather] = useState<{
    location: string
    date: string
    forecast: WeatherDay[]
    historical: { avgHigh: string | null; avgLow: string | null; avgPrecipMm: number | null }
    travelRisk: 'low' | 'moderate' | 'high'
  } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const fetchWeather = async (date: string) => {
    if (!city) return
    setLoading(true)
    setError(null)
    try {
      const url = `/api/weather?city=${encodeURIComponent(city)}&date=${date}`
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
    fetchWeather(selectedDate)
  }, [city, selectedDate])

  const handleDateChange = (date: string) => {
    setSelectedDate(date)
  }

  const risk = weather ? TRAVEL_RISK_LABELS[weather.travelRisk] : null

  return (
    <div>
      <div className="weather-header">
        <p className="weather-location">{city}</p>
        <DatePicker
          value={selectedDate}
          onChange={handleDateChange}
          label={selectedDate ? `Forecast for: ${formatDate(selectedDate)}` : 'Select Date'}
        />
        {risk && (
          <div className={`travel-risk-badge risk-${weather!.travelRisk}`}>
            {risk.badge} {risk.label}
            {weather!.historical.avgPrecipMm != null && (
              <span className="risk-precip">
                &nbsp;· Avg precip: {weather!.historical.avgPrecipMm}mm
              </span>
            )}
          </div>
        )}
      </div>

      {loading && (
        <div className="card-grid">
          {[1, 2, 3].map((i) => <SkeletonCard key={i} />)}
        </div>
      )}

      {error && !loading && <div className="error-msg">{error}</div>}

      {weather && !loading && (
        <>
          {weather.historical.avgHigh && (
            <div className="historical-note">
              📊 Historical avg for {formatDate(weather.date)} last year:
              High {weather.historical.avgHigh} / Low {weather.historical.avgLow}
            </div>
          )}
          <div className="weather-grid">
            {weather.forecast.map((day, i) => (
              <div key={i} className="weather-card">
                <p className="weather-day">
                  {i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : formatDate(day.date)}
                </p>
                <div className="weather-icon">{day.icon}</div>
                <div className="weather-temps">
                  <span className="weather-max">{day.maxTemp}°</span>
                  <span className="weather-min">/ {day.minTemp}°</span>
                </div>
                <p className="weather-desc">{day.desc}</p>
              </div>
            ))}
          </div>
        </>
      )}

      {!weather && !loading && !error && (
        <p className="state-msg">
          <span className="emoji">🌤️</span>
          Weather will load when you visit this tab.
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

    const tabs = ['attractions', 'restaurants', 'parks'] as const
    const fresh: Record<string, PlaceResult[]> = { attractions: [], restaurants: [], parks: [] }

    try {
      // Run Google Places searches in parallel
      const promises = tabs.map(async (tab) => {
        const res = await fetch(`/api/search?city=${encodeURIComponent(dest)}&type=${tab}`)
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || 'Search failed')
        return { tab, results: json.results || [] }
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

  return (
    <main className="app">
      <header className="header">
        <h1>🦅 Eagle's Nest</h1>
        <p>Your RV Travel Companion — find places, parks & weather anywhere</p>
      </header>

      <SavedCityChips cities={savedCities} onSelect={(c) => { setCity(c); window.scrollTo({ top: 0, behavior: 'smooth' }) }} />
      <LocationInput value={city} onChange={setCity} onSearch={handleSearch} loading={loading} />

      <TabBar active={activeTab} onChange={setActiveTab} />

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
          />
          {/* Fall back to Google Places parks if no campground data */}
          {(!campgroundsLoading && campgrounds.length === 0) && (
            <ResultGrid places={data.parks || []} loading={false} />
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
          <ResultGrid places={data[activeTab] || []} loading={loading && !!city} />
        </>
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
