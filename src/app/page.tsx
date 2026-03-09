'use client'

import dynamic from 'next/dynamic'
import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import type { Shelter } from '@/types'
import ShelterCardCarousel from '@/components/shelter/ShelterCardCarousel'
import ShelterSheet, { prefetchShelter } from '@/components/shelter/ShelterSheet'
import { Input } from '@/components/ui/input'
import { inferCategory } from '@/lib/shelterCategory'

const ShelterMap = dynamic(() => import('@/components/map/ShelterMap'), {
  ssr: false,
  loading: () => <div className="w-full h-full bg-[#f5f3ef]" />,
})

const FILTER_TAGS = [
  { id: 'all',        label: 'הכל' },
  { id: 'open',       label: '✓ פתוח' },
  { id: 'public',     label: '🏛 ציבורי' },
  { id: 'accessible', label: '♿ נגיש' },
  { id: 'official',   label: '★ רשמי' },
  { id: 'schools',    label: '🏫 בתי ספר' },
  { id: 'malls',      label: '🛍 קניונים' },
  { id: 'mamad',      label: '🏠 ממ"ד' },
  { id: 'coffee',     label: '☕ קפה' },
  { id: 'pharmacy',   label: '💊 בית מרקחת' },
]

function applyFilters(shelters: Shelter[], activeFilters: Set<string>, proximityPOIs?: { coffee: [number, number][]; pharmacy: [number, number][] }): Shelter[] {
  if (activeFilters.has('all') || activeFilters.size === 0) return shelters
  return shelters.filter(s => {
    if (activeFilters.has('open') && s.status === 'unverified' && s.verification_count === 0) return false
    if (activeFilters.has('public')) {
      const cat = inferCategory(s)
      const publicCats = ['public_shelter', 'school', 'high_school', 'shopping_mall', 'public_building', 'community_center', 'transport_station', 'hospital']
      if (!publicCats.includes(cat)) return false
    }
    if (activeFilters.has('accessible') && !s.is_accessible) return false
    if (activeFilters.has('official') && s.source !== 'official') return false
    if (activeFilters.has('schools')) {
      const cat = inferCategory(s)
      if (cat !== 'school' && cat !== 'high_school') return false
    }
    if (activeFilters.has('malls') && inferCategory(s) !== 'shopping_mall') return false
    if (activeFilters.has('mamad') && s.shelter_type !== 'mamad') return false
    if (activeFilters.has('coffee') && proximityPOIs) {
      const near = proximityPOIs.coffee.some(([lat, lng]) => {
        const dLat = (lat - s.lat) * 111320
        const dLng = (lng - s.lng) * 111320 * Math.cos(s.lat * Math.PI / 180)
        return Math.sqrt(dLat * dLat + dLng * dLng) < 150
      })
      if (!near) return false
    }
    if (activeFilters.has('pharmacy') && proximityPOIs) {
      const near = proximityPOIs.pharmacy.some(([lat, lng]) => {
        const dLat = (lat - s.lat) * 111320
        const dLng = (lng - s.lng) * 111320 * Math.cos(s.lat * Math.PI / 180)
        return Math.sqrt(dLat * dLat + dLng * dLng) < 150
      })
      if (!near) return false
    }
    return true
  })
}

function haversine(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371000
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

type GeoState = 'requesting' | 'ready' | 'denied'

export default function Home() {
  const router = useRouter()
  const [geoState, setGeoState] = useState<GeoState>('requesting')
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null)
  const [shelters, setShelters] = useState<Shelter[]>([])
  const [activeIndex, setActiveIndex] = useState(0)
  const [flyTarget, setFlyTarget] = useState<{ coords: [number, number]; seq: number } | undefined>()
  const flySeq = useRef(0)
  const [selectedShelterId, setSelectedShelterId] = useState<string | null>(null)
  const [selectedShelter, setSelectedShelter] = useState<Shelter | null>(null)
  const [activeFilters, setActiveFilters] = useState<Set<string>>(new Set(['all']))
  const [proximityPOIs, setProximityPOIs] = useState<{ coffee: [number, number][]; pharmacy: [number, number][] }>({ coffee: [], pharmacy: [] })
  const poiFetchedFor = useRef<{ coffee: string; pharmacy: string }>({ coffee: '', pharmacy: '' })
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<{ place_name: string; center: [number, number]; mapbox_id?: string }[]>([])
  const searchSessionToken = useRef(crypto.randomUUID())
  const [showSearch, setShowSearch] = useState(false)
  const searchTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const userPickedLocation = useRef(false)
  const lastBounds = useRef<{ south: number; west: number; north: number; east: number } | null>(null)
  const loadAbort = useRef<AbortController | null>(null)
  const boundsTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const fetchProximityPOIs = useCallback(async (type: 'coffee' | 'pharmacy') => {
    const b = lastBounds.current
    if (!b) return
    const boundsKey = `${b.south},${b.west},${b.north},${b.east}`
    if (poiFetchedFor.current[type] === boundsKey) return
    poiFetchedFor.current[type] = boundsKey
    const amenity = type === 'coffee' ? 'cafe' : 'pharmacy'
    const query = `[out:json][timeout:8];node[amenity=${amenity}](${b.south},${b.west},${b.north},${b.east});out body;`
    try {
      const res = await fetch('https://overpass-api.de/api/interpreter', { method: 'POST', body: query })
      if (!res.ok) return
      const data = await res.json()
      const coords: [number, number][] = (data.elements ?? []).map((el: { lat: number; lon: number }) => [el.lat, el.lon])
      setProximityPOIs(prev => ({ ...prev, [type]: coords }))
    } catch { /* silent */ }
  }, [])

  const flyTo = useCallback((coords: [number, number]) => {
    flySeq.current += 1
    setFlyTarget({ coords, seq: flySeq.current })
  }, [])

  const loadShelters = useCallback(async (bounds?: { south: number; west: number; north: number; east: number }): Promise<Shelter[]> => {
    // Cancel any in-flight request so stale responses never overwrite fresh ones
    loadAbort.current?.abort()
    const ctrl = new AbortController()
    loadAbort.current = ctrl
    try {
      const params = new URLSearchParams()
      if (bounds) {
        params.set('bbox', [bounds.south, bounds.west, bounds.north, bounds.east].join(','))
      }
      const res = await fetch(`/api/shelters?${params}`, { signal: ctrl.signal })
      if (res.ok) {
        const data: Shelter[] = await res.json()
        setShelters(data)
        return data
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name !== 'AbortError') {
        console.error('Failed to load shelters', err)
      }
    }
    return []
  }, [])

  // Refresh shelters when user returns to the page (e.g. after adding a shelter)
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && lastBounds.current) {
        loadShelters(lastBounds.current)
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [loadShelters])

  // Periodic refresh every 30s so newly added shelters appear without map interaction
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === 'visible' && lastBounds.current) {
        loadShelters(lastBounds.current)
      }
    }, 30_000)
    return () => clearInterval(id)
  }, [loadShelters])

  // Fetch proximity POIs when those filters are activated
  useEffect(() => {
    if (activeFilters.has('coffee')) fetchProximityPOIs('coffee')
    if (activeFilters.has('pharmacy')) fetchProximityPOIs('pharmacy')
  }, [activeFilters, fetchProximityPOIs])

  const computeNearest = useCallback((_coords: [number, number], _data: Shelter[]) => {
    setActiveIndex(0)
  }, [])

  // On mount: use cached location instantly, then refresh silently in background
  useEffect(() => {
    if (!navigator.geolocation) {
      setGeoState('denied')
      loadShelters()
      return
    }

    const applyPosition = async (lat: number, lng: number) => {
      if (userPickedLocation.current) return
      const coords: [number, number] = [lat, lng]
      setUserLocation(coords)
      setGeoState('ready')
      // Only fly if the map has no saved position (first visit, not returning from shelter page)
      const hasSavedPos = !!sessionStorage.getItem('mapLastPos')
      if (!hasSavedPos) {
        flyTo(coords)
      }
      // Load shelters within ~5km of user so we get local results, not Israel-wide
      const delta = 0.05 // ~5km
      const data = await loadShelters({ south: lat - delta, west: lng - delta, north: lat + delta, east: lng + delta })
      computeNearest(coords, data)
    }

    const refinePosition = (lat: number, lng: number) => {
      if (userPickedLocation.current) return
      setUserLocation([lat, lng])
    }

    // Step 1: fast low-accuracy fix — triggers permission prompt, returns quickly
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        applyPosition(pos.coords.latitude, pos.coords.longitude)

        // Step 2: silent high-accuracy refinement (no re-fly)
        navigator.geolocation.getCurrentPosition(
          (pos2) => refinePosition(pos2.coords.latitude, pos2.coords.longitude),
          () => { /* ignore — we already have a position */ },
          { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        )
      },
      () => { setGeoState('denied'); loadShelters() },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }
    )
  }, [loadShelters, computeNearest, flyTo])

  const requestLocation = useCallback(() => {
    setGeoState('requesting')
    if (!navigator.geolocation) { setGeoState('denied'); return }

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        // Always honour recenter — reset the "user picked a search result" flag
        userPickedLocation.current = false
        const coords: [number, number] = [pos.coords.latitude, pos.coords.longitude]
        setUserLocation(coords)
        setGeoState('ready')
        flyTo(coords)
        const { latitude: lat, longitude: lng } = pos.coords
        const delta = 0.05
        const data = await loadShelters({ south: lat - delta, west: lng - delta, north: lat + delta, east: lng + delta })
        computeNearest(coords, data)
      },
      () => setGeoState('denied'),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 0 }
    )
  }, [loadShelters, computeNearest, flyTo])

  const handleSearch = useCallback((q: string) => {
    setSearchQuery(q)
    clearTimeout(searchTimer.current)
    if (q.length < 2) { setSearchResults([]); return }
    searchTimer.current = setTimeout(async () => {
      try {
        const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
        // Mapbox Search Box API v1 — better Hebrew autocomplete than geocoding v5
        let url = `https://api.mapbox.com/search/searchbox/v1/suggest?q=${encodeURIComponent(q)}`
        url += `&country=il&language=he,en&limit=6`
        url += `&session_token=${searchSessionToken.current}`
        url += `&access_token=${token}`
        if (userLocation) {
          url += `&proximity=${userLocation[1]},${userLocation[0]}`
        }
        const res = await fetch(url)
        const data = await res.json()
        // Search Box returns suggestions — retrieve coords for each
        const suggestions = (data.suggestions ?? []) as { name: string; place_formatted?: string; mapbox_id: string }[]
        setSearchResults(suggestions.map(s => ({
          place_name: [s.name, s.place_formatted].filter(Boolean).join(', '),
          center: [0, 0] as [number, number], // filled on click via retrieve
          mapbox_id: s.mapbox_id,
        })))
      } catch { /* silent */ }
    }, 350)
  }, [userLocation])

  const handleBoundsChange = useCallback((bounds: { getSouth: () => number; getWest: () => number; getNorth: () => number; getEast: () => number; zoom?: number }) => {
    const b = { south: bounds.getSouth(), west: bounds.getWest(), north: bounds.getNorth(), east: bounds.getEast() }
    lastBounds.current = b
    // Don't fetch at country-level zoom — pins would all disappear while a huge bbox returns sparse results
    if ((bounds.zoom ?? 99) < 10) return
    // Debounce so rapid pan/zoom only fires one fetch when the map settles
    clearTimeout(boundsTimer.current)
    boundsTimer.current = setTimeout(() => loadShelters(b), 300)
  }, [loadShelters])

  // Which shelters to show in carousel — prefer pre-computed nearest; fall back to on-the-fly sort
  const baseShelters = useMemo(() => {
    if (userLocation && shelters.length > 0) {
      return [...shelters]
        .map(s => ({ ...s, distance: haversine(userLocation[0], userLocation[1], s.lat, s.lng) }))
        .sort((a, b) => a.distance - b.distance)
        .slice(0, 20)
    }
    return shelters.slice(0, 20)
  }, [shelters, userLocation])
  const carouselShelters = applyFilters(baseShelters, activeFilters, proximityPOIs)

  // Prefetch top 3 carousel shelters so the sheet opens instantly
  useEffect(() => {
    carouselShelters.slice(0, 3).forEach(s => prefetchShelter(s.id))
  }, [carouselShelters])

  // Active shelter drives the highlighted map pin
  const activeShelter = carouselShelters[activeIndex] ?? null

  // Tapping a map pin or carousel card opens the bottom sheet
  const handleMapPinClick = useCallback((shelter: Shelter) => {
    setSelectedShelter(shelter)
    setSelectedShelterId(shelter.id)
  }, [])

  // Long press on map → navigate to add page with coords pre-filled
  const handleLongPress = useCallback((lat: number, lng: number) => {
    router.push(`/add?lat=${lat.toFixed(6)}&lng=${lng.toFixed(6)}`)
  }, [router])

  return (
    <div className="relative w-screen overflow-hidden" style={{ height: '100dvh' }}>
      {/* Map fills screen */}
      <div className="absolute inset-0">
        <ShelterMap
          shelters={shelters}
          userLocation={userLocation}
          flyTarget={flyTarget}
          highlightedShelterId={selectedShelterId ?? activeShelter?.id}
          sheetFraction={0.22}
          carouselOffsetPx={200}
          onShelterClick={handleMapPinClick}
          onBoundsChange={handleBoundsChange}
          onRecenter={userLocation ? requestLocation : undefined}
          onLongPress={handleLongPress}
        />
      </div>

      {/* Info button — bottom left, above carousel */}
      <button
        onClick={() => router.push('/about')}
        className="absolute bottom-[calc(var(--carousel-h,200px)+12px)] left-4 z-[999] w-8 h-8 rounded-full bg-white/90 backdrop-blur shadow-md flex items-center justify-center text-gray-400 hover:text-gray-600 transition-colors text-sm font-medium"
        aria-label="אודות המפה"
        style={{ bottom: 'calc(172px + 12px)' }}
      >
        ℹ
      </button>

      {/* Top bar: search row + filter chips */}
      <div className="absolute top-0 left-0 right-0 z-[1000] px-4 pt-3 pb-2 flex flex-col gap-2">
        {/* Row 1: search + add button */}
        <div className="flex items-center gap-2">
          <div className="flex-1 relative">
            {showSearch ? (
              <>
                <Input
                  autoFocus
                  placeholder="חיפוש עיר, שכונה, כתובת..."
                  value={searchQuery}
                  onChange={e => handleSearch(e.target.value)}
                  className="bg-white/95 backdrop-blur shadow-md border-0 h-11 text-base rounded-2xl pr-4"
                />
                {searchResults.length > 0 && (
                  <div className="absolute top-full mt-1 w-full bg-white rounded-2xl shadow-xl overflow-hidden z-10">
                    {searchResults.map(r => {
                      // Split "Main Name, Context" for cleaner display
                      const [mainName, ...rest] = r.place_name.split(',')
                      const context = rest.join(',').trim()
                      return (
                        <button
                          key={r.center[0] + ',' + r.center[1]}
                          className="w-full text-right px-4 py-3 hover:bg-gray-50 border-b border-gray-50 last:border-0"
                          onClick={async () => {
                            setSearchResults([])
                            setShowSearch(false)
                            setSearchQuery('')
                            let coords: [number, number]
                            if (r.mapbox_id) {
                              // Search Box API: retrieve full feature to get coordinates
                              const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
                              const rv = await fetch(
                                `https://api.mapbox.com/search/searchbox/v1/retrieve/${r.mapbox_id}?session_token=${searchSessionToken.current}&access_token=${token}`
                              )
                              const rd = await rv.json()
                              const [lng, lat] = rd.features?.[0]?.geometry?.coordinates ?? [0, 0]
                              coords = [lat, lng]
                            } else {
                              // Fallback: geocoding v5 result
                              coords = [r.center[1], r.center[0]]
                            }
                            userPickedLocation.current = true
                            setUserLocation(coords)
                            setGeoState('ready')
                            flyTo(coords)
                            const [lat, lng] = coords
                            const delta = 0.05
                            const data = await loadShelters({ south: lat - delta, west: lng - delta, north: lat + delta, east: lng + delta })
                            computeNearest(coords, data)
                          }}
                        >
                          <div className="text-sm font-medium text-gray-900">{mainName}</div>
                          {context && <div className="text-xs text-gray-400 mt-0.5 truncate">{context}</div>}
                        </button>
                      )
                    })}
                  </div>
                )}
              </>
            ) : (
              <button
                className="flex items-center gap-2 w-full bg-white/95 backdrop-blur shadow-md rounded-2xl h-11 px-4 text-sm text-muted-foreground"
                onClick={() => setShowSearch(true)}
              >
                <span>🔍</span>
                <span>חיפוש מקום</span>
              </button>
            )}
          </div>
          {showSearch ? (
            <button
              className="text-sm text-muted-foreground bg-white/95 backdrop-blur shadow-md rounded-2xl h-11 px-4 shrink-0"
              onClick={() => { setShowSearch(false); setSearchQuery(''); setSearchResults([]) }}
            >
              ביטול
            </button>
          ) : (
            <button
              className="shrink-0 bg-gray-900 text-white shadow-md rounded-2xl h-11 px-4 text-sm font-semibold flex items-center gap-1.5"
              onClick={() => router.push('/add')}
            >
              <span className="text-base leading-none">+</span>
              <span>הוסף</span>
            </button>
          )}
        </div>

        {/* Row 2: filter chips */}
        {!showSearch && (
          <div
            className="flex gap-2 overflow-x-auto"
            style={{ scrollbarWidth: 'none' }}
          >
            {FILTER_TAGS.map(tag => {
              const isActive = activeFilters.has(tag.id)
              return (
                <button
                  key={tag.id}
                  onClick={() => {
                    setActiveFilters(prev => {
                      const next = new Set(prev)
                      if (tag.id === 'all') return new Set(['all'])
                      if (isActive) {
                        next.delete(tag.id)
                        return next.size === 0 ? new Set(['all']) : next
                      } else {
                        next.delete('all')
                        next.add(tag.id)
                        return next
                      }
                    })
                    setActiveIndex(0)
                  }}
                  className={`shrink-0 text-xs font-medium px-3 py-1.5 rounded-full transition-colors ${
                    isActive
                      ? 'bg-gray-900 text-white shadow-sm'
                      : 'bg-white/90 backdrop-blur text-gray-600 shadow-sm border border-gray-100'
                  }`}
                >
                  {tag.label}
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Locating indicator */}
      {geoState === 'requesting' && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[1000]">
          <div className="bg-white/90 backdrop-blur rounded-2xl shadow-lg px-6 py-4 text-sm text-gray-600 flex items-center gap-2">
            <span className="animate-pulse">●</span>
            <span>מאתר מיקום...</span>
          </div>
        </div>
      )}

      {/* Card carousel — hidden when a shelter sheet is open */}
      {!selectedShelterId && (carouselShelters.length > 0 || geoState === 'denied') && (
        <ShelterCardCarousel
          shelters={carouselShelters}
          activeIndex={activeIndex}
          filter={activeFilters.has('all') ? 'all' : [...activeFilters].join(',')}
          onActiveChange={setActiveIndex}
          onViewDetail={s => { setSelectedShelter(s); setSelectedShelterId(s.id) }}
          geoState={geoState}
          onRequestLocation={requestLocation}
        />
      )}

      {/* Bottom sheet — shown when a shelter is selected */}
      {selectedShelterId && (
        <ShelterSheet
          shelterId={selectedShelterId}
          initialShelter={selectedShelter ?? undefined}
          userLocation={userLocation}
          onClose={() => { setSelectedShelterId(null); setSelectedShelter(null) }}
        />
      )}
    </div>
  )
}
