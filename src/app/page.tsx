'use client'

import { useState, useEffect } from 'react'

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

// ── Helpers ──────────────────────────────────────────────────────────
const TABS: { id: TabId; label: string }[] = [
  { id: 'attractions', label: '🦅 Things To Do' },
  { id: 'restaurants', label: '🍽️ Food & Dining' },
  { id: 'parks', label: '🏕️ RV Parks' },
  { id: 'weather', label: '🌤️ Weather' },
]

const TYPE_LABELS: Record<string, string> = {
  amusement_park: 'Amusement Park',
  aquarium: 'Aquarium',
  art_museum: 'Art Museum',
  art_gallery: 'Gallery',
  bakery: 'Bakery',
  bar: 'Bar',
  bookstore: 'Bookstore',
  brewery: 'Brewery',
  burger_restaurant: 'Burger',
  cafe: 'Café',
  campground: 'Campground',
  camping_cabin: 'Campground',
  casino: 'Casino',
  church: 'Church',
  clothing_store: 'Store',
  concert_venue: 'Concert',
  cultural_center: 'Cultural',
  dance_hall: 'Nightlife',
  department_store: 'Shopping',
  dessert_restaurant: 'Dessert',
  display_map: 'Map',
  electronics_store: 'Electronics',
  establishment: '',
  event_venue: 'Venue',
  fast_food_restaurant: 'Fast Food',
  food_market: 'Market',
  fried_chicken_restaurant: 'Fried Chicken',
  garden: 'Garden',
  gas_station: 'Gas Station',
  grocery_store: 'Grocery',
  hiking_area: 'Hiking',
  historic_site: 'Historic',
  history_museum: 'Museum',
  hotel: 'Hotel',
  ice_cream_shop: 'Ice Cream',
  inn: 'Inn',
  italian_restaurant: 'Italian',
  lake: 'Lake',
  landmark: 'Landmark',
  library: 'Library',
  lodging: 'Lodging',
  meal_delivery: 'Delivery',
  meal_takeaway: 'Takeaway',
  mexican_restaurant: 'Mexican',
  miscellaneous_shop: 'Shop',
  mobile_phone_store: 'Store',
  mosque: 'Mosque',
  mountain: 'Mountain',
  movie_theater: 'Cinema',
  museum: 'Museum',
  music_venue: 'Music',
  national_park: 'National Park',
  natural_feature: 'Nature',
  night_club: 'Nightlife',
  park: 'Park',
  pizza_restaurant: 'Pizza',
  place_of_interest: 'Attraction',
  playground: 'Playground',
  point_of_interest: 'Attraction',
  public_tranquil_zone: 'Park',
  ramen_restaurant: 'Ramen',
  recreation_area: 'Recreation',
  resort: 'Resort',
  restaurant: 'Restaurant',
  rocky_shore: 'Shore',
  rv_park: 'RV Park',
  sand_dune: 'Dune',
  seafood_restaurant: 'Seafood',
  shoe_store: 'Shoe Store',
  shopping_mall: 'Mall',
  sightseeing_tour_agency: 'Tour',
  ski_resort: 'Ski Resort',
  snack_bar: 'Snacks',
  spa: 'Spa',
  state_park: 'State Park',
  steakhouse: 'Steakhouse',
  supermarket: 'Market',
  sushi_restaurant: 'Sushi',
  temple: 'Temple',
  theme_park: 'Theme Park',
  tourist_attraction: 'Attraction',
  touristDestination: 'Tourist',
  trail: 'Trail',
  travel_agency: 'Travel',
  waterfront_development: 'Waterfront',
  wedding_venue: 'Wedding',
  windmill: 'Historic',
  winery: 'Winery',
  wine_bar: 'Wine Bar',
  zoo: 'Zoo',
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

// ── Location Input ───────────────────────────────────────────────────
function LocationInput({
  value,
  onChange,
  onSearch,
  loading,
}: {
  value: string
  onChange: (v: string) => void
  onSearch: () => void
  loading: boolean
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
          key={tab.id}
          role="tab"
          aria-selected={active === tab.id}
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
            <img
              src={place.photoUrl}
              alt={place.name}
              onError={() => setImgError(true)}
              loading="lazy"
            />
          ) : (
            <div className="card-photo-placeholder">
              <span>📍</span>
            </div>
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
          <a
            href={place.mapUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="card-directions-btn"
          >
            📍 View on Maps
          </a>
        </div>
      </div>
    </div>
  )
}

// ── Result Grid ──────────────────────────────────────────────────────
function ResultGrid({ places, loading }: { places: PlaceResult[]; loading: boolean }) {
  if (loading) {
    return (
      <div className="card-grid">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="place-card place-card-skeleton">
            <div className="skeleton-photo" />
            <div className="card-body">
              <div className="skeleton-line skeleton-title" />
              <div className="skeleton-line skeleton-meta" />
              <div className="skeleton-line skeleton-btn" />
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (!places.length) {
    return (
      <p className="state-msg">
        <span className="emoji">🔍</span>
        No results found. Try a different city or tab.
      </p>
    )
  }

  return (
    <div className="card-grid">
      {places.map((place) => (
        <PlaceCard key={place.id} place={place} />
      ))}
    </div>
  )
}

// ── Weather Display ─────────────────────────────────────────────────
function WeatherDisplay({ city }: { city: string }) {
  const [weather, setWeather] = useState<{
    location: string
    forecast: WeatherDay[]
  } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const fetchWeather = async () => {
    if (!city) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/weather?city=${encodeURIComponent(city)}`)
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
    fetchWeather()
  }, [city])

  return (
    <div>
      <p className="weather-location">{city}</p>
      {loading && (
        <p className="state-msg">
          <span className="emoji">⏳</span>Loading weather…
        </p>
      )}
      {error && <div className="error-msg">{error}</div>}
      {weather && !loading && (
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
  const [data, setData] = useState<Record<TabId, PlaceResult[]>>({
    attractions: [],
    restaurants: [],
    parks: [],
    weather: [],
  })

  const handleSearch = async () => {
    if (!city.trim()) return
    const dest = city.trim()
    setLoading(true)
    setError(null)
    setActiveTab('attractions')

    const tabs = ['attractions', 'restaurants', 'parks'] as const
    const fresh: Record<string, PlaceResult[]> = { attractions: [], restaurants: [], parks: [] }

    try {
      for (const tab of tabs) {
        const res = await fetch(`/api/search?city=${encodeURIComponent(dest)}&type=${tab}`)
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || 'Search failed')
        fresh[tab] = json.results || []
      }
      setData(fresh as Record<TabId, PlaceResult[]>)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="app">
      <header className="header">
        <h1>🦅 Eagle's Nest</h1>
        <p>Your RV Travel Companion — find places, parks & weather anywhere</p>
      </header>

      <LocationInput
        value={city}
        onChange={setCity}
        onSearch={handleSearch}
        loading={loading}
      />

      <TabBar active={activeTab} onChange={setActiveTab} />

      {activeTab === 'weather' ? (
        <WeatherDisplay city={city} />
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
    </main>
  )
}
