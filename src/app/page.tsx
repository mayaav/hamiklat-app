'use client'

import dynamic from 'next/dynamic'
import { useState, useCallback, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import type { Shelter } from '@/types'
import ShelterCardCarousel from '@/components/shelter/ShelterCardCarousel'
import { Input } from '@/components/ui/input'

const ShelterMap = dynamic(() => import('@/components/map/ShelterMap'), {
  ssr: false,
  loading: () => <div className="w-full h-full bg-[#f5f3ef]" />,
})

const FILTER_TAGS = [
  { id: 'all',        label: 'הכל' },
  { id: 'official',   label: '★ רשמי' },
  { id: 'verified',   label: '✓ מאומת' },
  { id: 'accessible', label: '♿ נגיש' },
  { id: 'mamad',      label: 'ממ"ד' },
  { id: 'public',     label: 'ציבורי' },
]

function applyFilter(shelters: Shelter[], filter: string): Shelter[] {
  switch (filter) {
    case 'official':   return shelters.filter(s => s.source === 'official')
    case 'verified':   return shelters.filter(s => s.status === 'verified' || s.source === 'official')
    case 'accessible': return shelters.filter(s => s.is_accessible)
    case 'mamad':      return shelters.filter(s => s.shelter_type === 'mamad')
    case 'public':     return shelters.filter(s => s.shelter_type === 'public_shelter')
    default:           return shelters
  }
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
  const [nearestShelters, setNearestShelters] = useState<Shelter[]>([])
  const [activeIndex, setActiveIndex] = useState(0)
  const [flyTarget, setFlyTarget] = useState<{ coords: [number, number]; seq: number } | undefined>()
  const flySeq = useRef(0)
  const [filter, setFilter] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<{ place_name: string; center: [number, number] }[]>([])
  const [showSearch, setShowSearch] = useState(false)
  const searchTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const userPickedLocation = useRef(false)
  const lastBounds = useRef<{ south: number; west: number; north: number; east: number } | null>(null)

  const flyTo = useCallback((coords: [number, number]) => {
    flySeq.current += 1
    setFlyTarget({ coords, seq: flySeq.current })
  }, [])

  const loadShelters = useCallback(async (bounds?: { south: number; west: number; north: number; east: number }): Promise<Shelter[]> => {
    try {
      const params = new URLSearchParams()
      if (bounds) {
        params.set('bbox', [bounds.south, bounds.west, bounds.north, bounds.east].join(','))
      }
      const res = await fetch(`/api/shelters?${params}`)
      if (res.ok) {
        const data: Shelter[] = await res.json()
        setShelters(data)
        return data
      }
    } catch (err) {
      console.error('Failed to load shelters', err)
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

  const computeNearest = useCallback((coords: [number, number], data: Shelter[]) => {
    const withDist = data
      .map(s => ({ ...s, distance: haversine(coords[0], coords[1], s.lat, s.lng) }))
      .sort((a, b) => (a.distance ?? 0) - (b.distance ?? 0))
    setNearestShelters(withDist.slice(0, 20))
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
        if (userPickedLocation.current) return
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
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }
    )
  }, [loadShelters, computeNearest, flyTo])

  const handleSearch = useCallback((q: string) => {
    setSearchQuery(q)
    clearTimeout(searchTimer.current)
    if (q.length < 2) { setSearchResults([]); return }
    searchTimer.current = setTimeout(async () => {
      try {
        const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
        const res = await fetch(
          `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json?country=il&language=he&limit=5&access_token=${token}`
        )
        const data = await res.json()
        setSearchResults(data.features ?? [])
      } catch { /* silent */ }
    }, 400)
  }, [])

  const handleBoundsChange = useCallback((bounds: { getSouth: () => number; getWest: () => number; getNorth: () => number; getEast: () => number }) => {
    const b = { south: bounds.getSouth(), west: bounds.getWest(), north: bounds.getNorth(), east: bounds.getEast() }
    lastBounds.current = b
    loadShelters(b)
  }, [loadShelters])

  // Which shelters to show in carousel — if we have distance data, use sorted list; else show all
  const baseShelters = nearestShelters.length > 0 ? nearestShelters : shelters.slice(0, 20)
  const carouselShelters = applyFilter(baseShelters, filter)

  // Active shelter drives the highlighted map pin
  const activeShelter = carouselShelters[activeIndex] ?? null

  // Tapping a map pin opens the shelter page directly
  const handleMapPinClick = useCallback((shelter: Shelter) => {
    router.push(`/shelter/${shelter.id}`)
  }, [router])

  return (
    <div className="relative w-screen h-screen overflow-hidden">
      {/* Map fills screen */}
      <div className="absolute inset-0">
        <ShelterMap
          shelters={shelters}
          userLocation={userLocation}
          flyTarget={flyTarget}
          highlightedShelterId={activeShelter?.id}
          sheetFraction={0.22}
          onShelterClick={handleMapPinClick}
          onBoundsChange={handleBoundsChange}
          onRecenter={userLocation ? () => flyTo(userLocation) : undefined}
        />
      </div>

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
                    {searchResults.map(r => (
                      <button
                        key={r.center[0] + ',' + r.center[1]}
                        className="w-full text-right px-4 py-3 text-sm hover:bg-gray-50 border-b border-gray-50 last:border-0"
                        onClick={async () => {
                          setSearchResults([])
                          setShowSearch(false)
                          setSearchQuery('')
                          // Mapbox center is [lng, lat]
                          const coords: [number, number] = [r.center[1], r.center[0]]
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
                        {r.place_name}
                      </button>
                    ))}
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
            {FILTER_TAGS.map(tag => (
              <button
                key={tag.id}
                onClick={() => { setFilter(tag.id); setActiveIndex(0) }}
                className={`shrink-0 text-xs font-medium px-3 py-1.5 rounded-full transition-colors ${
                  filter === tag.id
                    ? 'bg-gray-900 text-white shadow-sm'
                    : 'bg-white/90 backdrop-blur text-gray-600 shadow-sm border border-gray-100'
                }`}
              >
                {tag.label}
              </button>
            ))}
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

      {/* Card carousel — visible as soon as we have any shelters OR location was denied */}
      {(carouselShelters.length > 0 || geoState === 'denied') && (
        <ShelterCardCarousel
          shelters={carouselShelters}
          activeIndex={activeIndex}
          filter={filter}
          onActiveChange={setActiveIndex}
          onViewDetail={s => router.push(`/shelter/${s.id}`)}
          geoState={geoState}
          onRequestLocation={requestLocation}
        />
      )}
    </div>
  )
}
