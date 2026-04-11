'use client'

import { useState, useEffect, useRef } from 'react'

type NearbyPlace = {
  name: string
  rating: number | null
  primaryType: string
  types: string[]
  photoUrl: string | null
  address: string
  mapUrl: string
  directionsUrl: string
  walkTime: string
  walkDistance: string
  lat: number
  lng: number
}

type WalkRadiusSheetProps = {
  originLat: number
  originLng: number
  originName: string
  onClose: () => void
}

// Client-side type filter — expanded to match Google Places type taxonomy
function typeMatches(types: string[], filter: string): boolean {
  if (filter === 'all') return true
  const t = filter.toLowerCase()

  // Food: restaurants of any kind + grocery + bakeries + food stores
  if (t === 'restaurant') {
    return types.some(x =>
      ['restaurant', 'food', 'bakery', 'grocery_store', 'supermarket',
        'fast_food_restaurant', 'american_restaurant', 'pizza_restaurant',
        'seafood_restaurant', 'mexican_restaurant', 'asian_restaurant',
        'chicken_restaurant', 'sandwich_shop', 'coffee_shop', 'food_store',
        'donut_shop', 'cupcake_shop', 'dessert_restaurant', 'meal_takeaway',
        'meal_delivery', 'cafe'].includes(x)
    )
  }
  // Coffee: cafes, coffee shops, tea houses
  if (t === 'cafe') {
    return types.some(x =>
      ['cafe', 'coffee_shop', 'tea_house', 'bakery',
        'donut_shop', 'cupcake_shop', 'dessert_restaurant'].includes(x)
    )
  }
  // Drinks: bars, breweries, pubs, nightlife
  if (t === 'bar') {
    return types.some(x =>
      ['bar', 'pub', 'brewery', 'night_club', 'wine_bar',
        'cocktail_bar', 'lounge', 'beer_garden', 'whisky_bar'].includes(x)
    )
  }
  // Outdoors: parks, trails, nature, campgrounds, beaches
  if (t === 'park') {
    return types.some(x =>
      ['park', 'city_park', 'state_park', 'national_park', 'nature_reserve',
        'trail', 'campground', 'rv_park', 'beach', ' lake', 'river',
        'waterfall', 'mountain', 'forest', 'botanical_garden',
        'zoo', 'aquarium', 'amusement_park'].includes(x)
    )
  }
  return true
}

const RADIUS_OPTIONS = [
  { label: '5 min', meters: 400 },
  { label: '10 min', meters: 800 },
  { label: '15 min', meters: 1200 },
  { label: '20 min', meters: 1600 },
]

const TYPE_FILTERS = [
  { label: '✨ All', value: 'all' },
  { label: '🍽️ Food', value: 'restaurant' },
  { label: '☕ Coffee', value: 'cafe' },
  { label: '🍺 Drinks', value: 'bar' },
  { label: '🏞️ Outdoors', value: 'park' },
]

const TYPE_ICONS: Record<string, string> = {
  restaurant: '🍽️', cafe: '☕', coffee_shop: '☕', donut_shop: '🍩',
  bar: '🍺', pub: '🍺', park: '🏞️', city_park: '🏞️', trail: '🥾',
  bookstore: '📚', library: '📚', shopping_mall: '🛍️', store: '🛒',
  hotel: '🏨', lodging: '🏨', airport: '✈️', train_station: '🚂',
  default: '📍',
}

function TypeIcon({ types, primaryType }: { types: string[]; primaryType: string }) {
  const all = [...types, primaryType].map(t => t.toLowerCase())
  for (const [key, emoji] of Object.entries(TYPE_ICONS)) {
    if (key === 'default') continue
    if (all.some(t => t.includes(key))) return <span>{emoji}</span>
  }
  return <span>📍</span>
}

function SkeletonRow() {
  return (
    <div style={{ display: 'flex', gap: '0.75rem', padding: '0.75rem 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
      <div style={{ width: 40, height: 40, borderRadius: 8, background: 'rgba(255,255,255,0.06)' }} />
      <div style={{ flex: 1 }}>
        <div style={{ height: 14, width: '60%', borderRadius: 4, background: 'rgba(255,255,255,0.06)', marginBottom: 6 }} />
        <div style={{ height: 12, width: '40%', borderRadius: 4, background: 'rgba(255,255,255,0.04)' }} />
      </div>
      <div style={{ width: 50, height: 20, borderRadius: 4, background: 'rgba(110,231,160,0.1)', alignSelf: 'center' }} />
    </div>
  )
}

export default function WalkRadiusSheet({ originLat, originLng, originName, onClose }: WalkRadiusSheetProps) {
  const [selectedRadius, setSelectedRadius] = useState(RADIUS_OPTIONS[1]) // 10 min default
  const [allPlaces, setAllPlaces] = useState<NearbyPlace[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedType, setSelectedType] = useState<string>('all')
  const sheetRef = useRef<HTMLDivElement>(null)

  // Fetch ALL places once per radius change — no includedType sent to API
  const cacheKey = `${Number(originLat).toFixed(4)},${Number(originLng).toFixed(4)}:${selectedRadius.meters}`

  useEffect(() => {
    const cached = sessionStorage.getItem('en_nearby:' + cacheKey)
    if (cached) {
      try {
        setAllPlaces(JSON.parse(cached))
        setLoading(false)
        return
      } catch {}
    }

    setLoading(true)
    setError(null)

    fetch('/api/nearby', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lat: originLat,
        lng: originLng,
        radiusMeters: selectedRadius.meters,
        originName,
      }),
    })
      .then(r => r.json())
      .then(d => {
        if (d.error) throw new Error(d.error)
        const places = d.results || []
        setAllPlaces(places)
        sessionStorage.setItem('en_nearby:' + cacheKey, JSON.stringify(places))
      })
      .catch(err => setError(err instanceof Error ? err.message : 'Failed to load'))
      .finally(() => setLoading(false))
  }, [originLat, originLng, selectedRadius, originName, cacheKey])

  // Client-side filter
  const visiblePlaces = allPlaces.filter(p => typeMatches(p.types || [], selectedType))

  // Close on outside click or Escape
  const handleBackdrop = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose()
  }

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.6)',
        backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'flex-end',
      }}
      onClick={handleBackdrop}
    >
      <div
        ref={sheetRef}
        style={{
          background: '#1a2535',
          borderRadius: '20px 20px 0 0',
          width: '100%',
          maxHeight: '80vh',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Handle */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 4px' }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.2)' }} />
        </div>

        {/* Header */}
        <div style={{ padding: '12px 20px 8px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#fff' }}>🚶 Walk from here</h3>
              <p style={{ margin: '2px 0 0', fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)' }}>{originName}</p>
            </div>
            <button onClick={onClose} style={{
              background: 'rgba(255,255,255,0.08)', border: 'none', borderRadius: '50%',
              width: 32, height: 32, color: '#fff', cursor: 'pointer', fontSize: '1rem',
            }} aria-label="Close">✕</button>
          </div>
        </div>

        {/* Walk time segmented control */}
        <div style={{ padding: '10px 20px 6px' }}>
          <div style={{ display: 'flex', gap: 6, background: 'rgba(255,255,255,0.05)', borderRadius: 10, padding: 4 }}>
            {RADIUS_OPTIONS.map(opt => (
              <button
                key={opt.label}
                onClick={() => setSelectedRadius(opt)}
                style={{
                  flex: 1, padding: '6px 4px', border: 'none', borderRadius: 8,
                  cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600,
                  background: selectedRadius.label === opt.label ? 'rgba(110,231,160,0.2)' : 'transparent',
                  color: selectedRadius.label === opt.label ? '#6ee7a0' : 'rgba(255,255,255,0.45)',
                  transition: 'all 0.15s',
                }}
              >{opt.label}</button>
            ))}
          </div>
        </div>

        {/* Type filters */}
        <div style={{ padding: '4px 20px 8px', display: 'flex', gap: 6, overflowX: 'auto' }}>
          {TYPE_FILTERS.map(f => (
            <button
              key={f.value}
              onClick={() => setSelectedType(f.value)}
              style={{
                padding: '4px 10px', border: '1px solid',
                borderColor: selectedType === f.value ? 'rgba(110,231,160,0.4)' : 'rgba(255,255,255,0.1)',
                borderRadius: 20, cursor: 'pointer', fontSize: '0.72rem', whiteSpace: 'nowrap',
                background: selectedType === f.value ? 'rgba(110,231,160,0.08)' : 'transparent',
                color: selectedType === f.value ? '#6ee7a0' : 'rgba(255,255,255,0.45)',
              }}
            >{f.label}</button>
          ))}
        </div>

        {/* Results */}
        <div style={{ overflowY: 'auto', flex: 1, padding: '0 20px 20px' }}>
          {loading && (
            <div>{[1,2,3,4].map(i => <SkeletonRow key={i} />)}</div>
          )}

          {error && !loading && (
            <p style={{ color: '#f87171', fontSize: '0.85rem', textAlign: 'center', padding: '20px 0' }}>{error}</p>
          )}

          {!loading && !error && visiblePlaces.length === 0 && (
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.85rem', textAlign: 'center', padding: '20px 0' }}>
              No places for this filter — try "All" or a longer walk
            </p>
          )}

          {!loading && !error && visiblePlaces.map((place, i) => (
            <div
              key={i}
              style={{
                display: 'flex', gap: '0.75rem', padding: '0.75rem 0',
                borderBottom: '1px solid rgba(255,255,255,0.05)',
                alignItems: 'center',
              }}
            >
              {/* Icon */}
              <div style={{
                width: 40, height: 40, borderRadius: 8,
                background: 'rgba(110,231,160,0.08)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '1.1rem', flexShrink: 0,
              }}>
                <TypeIcon types={place.types} primaryType={place.primaryType} />
              </div>

              {/* Info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: '0.88rem', fontWeight: 600, color: '#fff',
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {place.name}
                </p>
                <p style={{ margin: '1px 0 0', fontSize: '0.72rem', color: 'rgba(255,255,255,0.35)',
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {place.address || place.primaryType}
                </p>
                {place.rating && (
                  <span style={{ fontSize: '0.68rem', color: '#fbbf24', marginTop: 1, display: 'inline-block' }}>
                    ★ {place.rating.toFixed(1)}
                  </span>
                )}
              </div>

              {/* Walk badge + directions */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
                <span style={{
                  background: 'rgba(110,231,160,0.12)', color: '#6ee7a0',
                  border: '1px solid rgba(110,231,160,0.25)',
                  borderRadius: 6, padding: '2px 7px', fontSize: '0.72rem', fontWeight: 700,
                }}>
                  🚶 {place.walkTime}
                </span>
                <a href={place.directionsUrl} target="_blank" rel="noopener noreferrer"
                  style={{ fontSize: '0.65rem', color: 'rgba(110,231,160,0.6)', textDecoration: 'none' }}>
                  📍 Directions
                </a>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
