'use client'

import { useState, useEffect, useRef } from 'react'

type NearbyPlace = {
  name: string
  rating: number | null
  primaryType: string
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

const RADIUS_OPTIONS = [
  { label: '5 min', meters: 400, type: 'restaurant' },
  { label: '10 min', meters: 800, type: 'restaurant' },
  { label: '15 min', meters: 1200, type: 'restaurant' },
  { label: '20 min', meters: 1600, type: 'restaurant' },
]

const TYPE_LABELS: Record<string, string> = {
  restaurant: '🍽️',
  cafe: '☕',
  bar: '🍺',
  park: '🏞️',
  lodging: '🏨',
  store: '🛍️',
  gym: '💪',
  bakery: '🥐',
  food: '🍜',
  default: '📍',
}

function TypeIcon({ type }: { type: string }) {
  const t = type?.toLowerCase() || ''
  for (const [key, emoji] of Object.entries(TYPE_LABELS)) {
    if (key !== 'default' && t.includes(key)) return <span>{emoji}</span>
  }
  return <span>{TYPE_LABELS.default}</span>
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
  const [places, setPlaces] = useState<NearbyPlace[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedType, setSelectedType] = useState<'restaurant' | 'cafe' | 'bar' | 'park' | 'all'>('all')
  const sheetRef = useRef<HTMLDivElement>(null)

  // Build cache key
  const cacheKey = `${originLat.toFixed(4)},${originLng.toFixed(4)}:${selectedRadius.meters}:${selectedType}`

  useEffect(() => {
    const cached = sessionStorage.getItem('en_nearby:' + cacheKey)
    if (cached) {
      try {
        setPlaces(JSON.parse(cached))
        setLoading(false)
        return
      } catch {}
    }

    setLoading(true)
    setError(null)

    const body: Record<string, unknown> = {
      lat: originLat,
      lng: originLng,
      radiusMeters: selectedRadius.meters,
      originName,
    }
    if (selectedType !== 'all') body.includedType = selectedType

    fetch('/api/nearby', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
      .then(r => r.json())
      .then(d => {
        if (d.error) throw new Error(d.error)
        setPlaces(d.results || [])
        sessionStorage.setItem('en_nearby:' + cacheKey, JSON.stringify(d.results || []))
      })
      .catch(err => setError(err instanceof Error ? err.message : 'Failed to load'))
      .finally(() => setLoading(false))
  }, [originLat, originLng, selectedRadius, selectedType, originName, cacheKey])

  // Close on outside click
  const handleBackdrop = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose()
  }

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  const TYPE_FILTERS: { label: string; value: 'restaurant' | 'cafe' | 'bar' | 'park' | 'all' }[] = [
    { label: '🍽️ Food', value: 'restaurant' },
    { label: '☕ Coffee', value: 'cafe' },
    { label: '🍺 Drinks', value: 'bar' },
    { label: '🏞️ Outdoors', value: 'park' },
    { label: '✨ All', value: 'all' },
  ]

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
        {/* Handle bar */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 4px' }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.2)' }} />
        </div>

        {/* Header */}
        <div style={{ padding: '12px 20px 8px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#fff' }}>
                🚶 Walk from here
              </h3>
              <p style={{ margin: '2px 0 0', fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)' }}>
                {originName}
              </p>
            </div>
            <button
              onClick={onClose}
              style={{
                background: 'rgba(255,255,255,0.08)', border: 'none', borderRadius: '50%',
                width: 32, height: 32, color: '#fff', cursor: 'pointer', fontSize: '1rem',
              }}
              aria-label="Close"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Walk time segmented control */}
        <div style={{ padding: '10px 20px 6px' }}>
          <div style={{
            display: 'flex', gap: 6, background: 'rgba(255,255,255,0.05)',
            borderRadius: 10, padding: 4,
          }}>
            {RADIUS_OPTIONS.map(opt => (
              <button
                key={opt.label}
                onClick={() => setSelectedRadius(opt)}
                style={{
                  flex: 1, padding: '6px 4px', border: 'none', borderRadius: 8,
                  cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600,
                  background: selectedRadius.label === opt.label
                    ? 'rgba(110,231,160,0.2)' : 'transparent',
                  color: selectedRadius.label === opt.label ? '#6ee7a0' : 'rgba(255,255,255,0.45)',
                  transition: 'all 0.15s',
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Place type filters */}
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
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Results */}
        <div style={{ overflowY: 'auto', flex: 1, padding: '0 20px 20px' }}>
          {loading && (
            <div>
              {[1,2,3,4].map(i => <SkeletonRow key={i} />)}
            </div>
          )}

          {error && !loading && (
            <p style={{ color: '#f87171', fontSize: '0.85rem', textAlign: 'center', padding: '20px 0' }}>
              {error}
            </p>
          )}

          {!loading && !error && places.length === 0 && (
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.85rem', textAlign: 'center', padding: '20px 0' }}>
              No places found — try a longer walk
            </p>
          )}

          {!loading && !error && places.map((place, i) => (
            <div
              key={i}
              style={{
                display: 'flex', gap: '0.75rem', padding: '0.75rem 0',
                borderBottom: '1px solid rgba(255,255,255,0.05)',
                alignItems: 'center',
              }}
            >
              {/* Place icon */}
              <div style={{
                width: 40, height: 40, borderRadius: 8,
                background: 'rgba(110,231,160,0.08)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '1.1rem', flexShrink: 0,
              }}>
                <TypeIcon type={place.primaryType} />
              </div>

              {/* Info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: '0.88rem', fontWeight: 600, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {place.name}
                </p>
                <p style={{ margin: '1px 0 0', fontSize: '0.72rem', color: 'rgba(255,255,255,0.35)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
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
                  background: 'rgba(110,231,160,0.12)',
                  color: '#6ee7a0',
                  border: '1px solid rgba(110,231,160,0.25)',
                  borderRadius: 6, padding: '2px 7px',
                  fontSize: '0.72rem', fontWeight: 700,
                }}>
                  🚶 {place.walkTime}
                </span>
                <a
                  href={place.directionsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    fontSize: '0.65rem', color: 'rgba(110,231,160,0.6)',
                    textDecoration: 'none',
                  }}
                >
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
