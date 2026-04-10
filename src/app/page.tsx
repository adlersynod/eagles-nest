'use client'

import { useState } from 'react'

// ── Types ────────────────────────────────────────────────────────────
type TabId = 'attractions' | 'restaurants' | 'parks' | 'weather'

type SearchResult = {
  title: string
  url: string
  description: string
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

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr + 'T00:00:00')
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  } catch {
    return dateStr
  }
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

// ── Result Cards ────────────────────────────────────────────────────
function ResultCard({ result }: { result: SearchResult }) {
  return (
    <div className="card">
      <div className="card-title">
        <a href={result.url} target="_blank" rel="noopener noreferrer">
          {result.title}
        </a>
      </div>
      {result.description && (
        <p className="card-desc">{result.description}</p>
      )}
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

  // Auto-fetch when this tab becomes active
  return (
    <div>
      <p className="weather-location">{city}</p>
      {loading && <p className="state-msg"><span className="emoji">⏳</span>Loading weather…</p>}
      {error && <div className="error-msg">{error}</div>}
      {weather && !loading && (
        <div className="weather-grid">
          {weather.forecast.map((day, i) => (
            <div key={i} className="weather-card">
              <p className="weather-day">{i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : formatDate(day.date)}</p>
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
        <p className="state-msg">Weather will load when you visit this tab.</p>
      )}
    </div>
  )
}

// ── Tab Content ──────────────────────────────────────────────────────
type DataState = {
  attractions: SearchResult[]
  restaurants: SearchResult[]
  parks: SearchResult[]
}

function TabContent({
  activeTab,
  data,
  error,
  loading,
  city,
}: {
  activeTab: TabId
  data: DataState
  error: string | null
  loading: boolean
  city: string
}) {
  if (activeTab === 'weather') {
    return <WeatherDisplay city={city} />
  }

  const items = data[activeTab as keyof DataState] || []

  if (loading) {
    return (
      <div>
        {[1, 2, 3].map((i) => (
          <div key={i} className="card" style={{ opacity: 0.5 - i * 0.1 }}>
            <div className="card-title" style={{ width: `${60 + i * 10}%`, height: '1em', background: 'rgba(255,255,255,0.1)', borderRadius: '4px', marginBottom: '0.5rem' }} />
            <div style={{ width: '90%', height: '0.8em', background: 'rgba(255,255,255,0.07)', borderRadius: '4px' }} />
          </div>
        ))}
      </div>
    )
  }

  if (error) {
    return <div className="error-msg">{error}</div>
  }

  if (!city) {
    return (
      <p className="state-msg">
        <span className="emoji">🗺️</span>
        Enter a destination above to get started.
      </p>
    )
  }

  if (items.length === 0) {
    return (
      <p className="state-msg">
        <span className="emoji">🔍</span>
        No results found. Try a different city.
      </p>
    )
  }

  return (
    <div className="card-grid">
      {items.map((item, i) => (
        <ResultCard key={i} result={item} />
      ))}
    </div>
  )
}

// ── Main Page ────────────────────────────────────────────────────────
export default function Home() {
  const [city, setCity] = useState('')
  const [activeTab, setActiveTab] = useState<TabId>('attractions')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<DataState>({
    attractions: [],
    restaurants: [],
    parks: [],
  })

  const handleSearch = async () => {
    if (!city.trim()) return
    const dest = city.trim()
    setLoading(true)
    setError(null)
    setActiveTab('attractions')

    const tabs = ['attractions', 'restaurants', 'parks'] as const
    const fresh: DataState = { attractions: [], restaurants: [], parks: [] }

    try {
      for (const tab of tabs) {
        const res = await fetch(`/api/search?city=${encodeURIComponent(dest)}&type=${tab}`)
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || 'Search failed')
        fresh[tab] = json.results || []
      }
      setData(fresh)
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

      <TabContent
        activeTab={activeTab}
        data={data}
        error={error}
        loading={loading}
        city={city}
      />
    </main>
  )
}
