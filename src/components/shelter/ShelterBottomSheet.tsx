'use client'

import { useRef, useState, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import type { Shelter } from '@/types'
import { Button } from '@/components/ui/button'

type SnapState = 'peek' | 'card' | 'list'

const PEEK_HEIGHT = 80
const CARD_FRACTION = 0.46
const LIST_FRACTION = 0.87

export const SNAP_FRACTIONS: Record<SnapState, number> = {
  peek: 0.08,
  card: CARD_FRACTION,
  list: LIST_FRACTION,
}

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

interface ShelterBottomSheetProps {
  shelter: Shelter | null
  shelters: Shelter[]
  geoState: 'requesting' | 'ready' | 'denied'
  onRequestLocation: () => void
  onAddPlace: () => void
  onViewDetail: (shelter: Shelter) => void
  onSelectShelter: (shelter: Shelter) => void
  onSnapChange?: (snap: SnapState) => void
  onClearFocus?: () => void
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function walkTime(meters: number) {
  const mins = Math.ceil(meters / 80)
  if (mins < 1) return 'פחות מדקה'
  return `${mins} דק׳`
}

function formatDistance(meters?: number) {
  if (!meters) return ''
  if (meters < 1000) return `${Math.round(meters)} מ׳`
  return `${(meters / 1000).toFixed(1)} ק״מ`
}

function relativeTime(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  const hours = Math.floor(mins / 60)
  const days = Math.floor(hours / 24)
  if (mins < 1) return 'הרגע'
  if (mins < 60) return `לפני ${mins} דק׳`
  if (hours < 24) return `לפני ${hours} שע׳`
  if (days === 1) return 'אתמול'
  return `לפני ${days} ימים`
}

function shelterTypeLabel(type: string | null) {
  const labels: Record<string, string> = {
    mamad: 'ממ"ד',
    public_shelter: 'מקלט ציבורי',
    building_shelter: 'מקלט בניין',
    other: 'מקום מוגן',
  }
  return type ? (labels[type] ?? type) : null
}

function navigateTo(shelter: Shelter) {
  const coords = `${shelter.lat},${shelter.lng}`
  if (/iPad|iPhone|iPod/.test(navigator.userAgent)) {
    window.open(`maps://maps.apple.com/?daddr=${coords}&dirflg=w`)
  } else {
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${coords}&travelmode=walking`)
  }
}

function StatusLine({ shelter }: { shelter: Shelter }) {
  if (shelter.source === 'official') {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-sky-700">
        <span className="w-1.5 h-1.5 rounded-full bg-sky-500 inline-block" />
        מקור רשמי
      </span>
    )
  }
  if (shelter.status === 'verified') {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
        אומת {relativeTime(shelter.updated_at)}
      </span>
    )
  }
  if (shelter.status === 'flagged') {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-orange-600">
        <span className="w-1.5 h-1.5 rounded-full bg-orange-500 inline-block" />
        דווח על בעיה
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs text-gray-400">
      <span className="w-1.5 h-1.5 rounded-full bg-gray-300 inline-block" />
      לא מאומת
    </span>
  )
}

// ─────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────

export default function ShelterBottomSheet({
  shelter,
  shelters,
  geoState,
  onRequestLocation,
  onAddPlace,
  onViewDetail,
  onSelectShelter,
  onSnapChange,
  onClearFocus,
}: ShelterBottomSheetProps) {
  const router = useRouter()
  const [snap, setSnap] = useState<SnapState>('card')
  const [filter, setFilter] = useState('all')
  const [dragging, setDragging] = useState(false)
  const [liveHeight, setLiveHeight] = useState<number | null>(null)

  const filteredShelters = applyFilter(shelters, filter)

  const dragStart = useRef({ y: 0, h: 0 })
  const windowHeight = useRef(typeof window !== 'undefined' ? window.innerHeight : 800)

  useEffect(() => {
    if (typeof window !== 'undefined') {
      windowHeight.current = window.innerHeight
    }
  }, [])

  // When shelter arrives, bump to card
  useEffect(() => {
    if (shelter) { setSnap('card'); onSnapChange?.('card') }
  }, [shelter?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const snapHeights = useCallback((): Record<SnapState, number> => {
    const wh = windowHeight.current
    return {
      peek: PEEK_HEIGHT,
      card: Math.round(wh * CARD_FRACTION),
      list: Math.round(wh * LIST_FRACTION),
    }
  }, [])

  const snapToNearest = useCallback(
    (currentH: number) => {
      const heights = snapHeights()
      const options: SnapState[] = ['peek', 'card', 'list']
      let best: SnapState = 'card'
      let bestDist = Infinity
      for (const s of options) {
        const d = Math.abs(heights[s] - currentH)
        if (d < bestDist) {
          bestDist = d
          best = s
        }
      }
      setSnap(best)
      onSnapChange?.(best)
      setLiveHeight(null)
      setDragging(false)
    },
    [snapHeights, onSnapChange]
  )

  const onDragStart = useCallback((clientY: number) => {
    const heights = snapHeights()
    dragStart.current = {
      y: clientY,
      h: liveHeight ?? heights[snap],
    }
    setDragging(true)
  }, [snap, liveHeight, snapHeights])

  const onDragMove = useCallback((clientY: number) => {
    if (!dragging) return
    const delta = dragStart.current.y - clientY
    const newH = Math.max(PEEK_HEIGHT - 10, Math.min(windowHeight.current * 0.92, dragStart.current.h + delta))
    setLiveHeight(newH)
  }, [dragging])

  const onDragEnd = useCallback((clientY: number) => {
    const delta = dragStart.current.y - clientY
    const newH = Math.max(PEEK_HEIGHT, Math.min(windowHeight.current * 0.92, dragStart.current.h + delta))
    snapToNearest(newH)
  }, [snapToNearest])

  const currentHeight = dragging && liveHeight !== null ? liveHeight : snapHeights()[snap]

  const heights = snapHeights()

  return (
    <div
      className="absolute bottom-0 left-0 right-0 z-[999] bg-white rounded-t-[28px] shadow-2xl flex flex-col overflow-hidden"
      style={{
        height: currentHeight,
        transition: dragging ? 'none' : 'height 0.38s cubic-bezier(0.32, 0.72, 0, 1)',
      }}
    >
      {/* Drag handle */}
      <div
        className="flex justify-center items-center pt-3 pb-2 shrink-0 cursor-grab active:cursor-grabbing touch-none"
        onTouchStart={(e) => onDragStart(e.touches[0].clientY)}
        onTouchMove={(e) => onDragMove(e.touches[0].clientY)}
        onTouchEnd={(e) => onDragEnd(e.changedTouches[0].clientY)}
        onMouseDown={(e) => {
          onDragStart(e.clientY)
          const moveHandler = (ev: MouseEvent) => onDragMove(ev.clientY)
          const upHandler = (ev: MouseEvent) => {
            onDragEnd(ev.clientY)
            window.removeEventListener('mousemove', moveHandler)
            window.removeEventListener('mouseup', upHandler)
          }
          window.addEventListener('mousemove', moveHandler)
          window.addEventListener('mouseup', upHandler)
        }}
      >
        <div className="w-10 h-1 bg-gray-200 rounded-full" />
      </div>

      {/* ── PEEK content ── */}
      {snap === 'peek' && !dragging && (
        <PeekContent
          shelter={shelter}
          geoState={geoState}
          onExpand={() => setSnap('card')}
          onRequestLocation={onRequestLocation}
        />
      )}

      {/* ── CARD content ── */}
      {(snap === 'card' || (dragging && liveHeight !== null && liveHeight > heights.peek + 20)) && (
        <div
          className="flex flex-col overflow-hidden"
          style={{ opacity: snap === 'card' && !dragging ? 1 : dragging && liveHeight && liveHeight > heights.peek + 60 ? 1 : 0.7 }}
        >
          {geoState === 'denied' ? (
            <DeniedCard onRequestLocation={onRequestLocation} onAddPlace={onAddPlace} />
          ) : !shelter ? (
            <div className="px-5 py-6 flex items-center gap-3 text-sm text-gray-500">
              <span className="animate-pulse text-lg">●</span>
              <span>מאתר מקומות מוגנים קרובים...</span>
            </div>
          ) : (
            <NearestCard
              shelter={shelter}
              sheltersCount={filteredShelters.length}
              onNavigate={() => navigateTo(shelter)}
              onDetails={() => onViewDetail(shelter)}
              onShowList={() => { setSnap('list'); onSnapChange?.('list') }}
              onAddPlace={onAddPlace}
              onClearFocus={onClearFocus}
            />
          )}
        </div>
      )}

      {/* ── LIST content ── */}
      {snap === 'list' && !dragging && (
        <div className="flex flex-col overflow-hidden flex-1 min-h-0">
          {/* Filter chips */}
          <div
            className="flex gap-2 overflow-x-auto px-5 pb-3 shrink-0"
            style={{ scrollbarWidth: 'none' }}
          >
            {FILTER_TAGS.map(tag => (
              <button
                key={tag.id}
                onClick={() => setFilter(tag.id)}
                className={`shrink-0 text-xs font-medium px-3 py-1.5 rounded-full transition-colors ${
                  filter === tag.id
                    ? 'bg-gray-900 text-white'
                    : 'bg-gray-100 text-gray-600'
                }`}
              >
                {tag.label}
              </button>
            ))}
          </div>
          <ListContent
            shelters={filteredShelters}
            onSelect={(s) => { onSelectShelter(s); setSnap('card'); onSnapChange?.('card') }}
            onCollapse={() => { setSnap('card'); onSnapChange?.('card') }}
            onAddPlace={onAddPlace}
            router={router}
          />
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────
// Sub-views
// ─────────────────────────────────────────────

function PeekContent({
  shelter,
  geoState,
  onExpand,
  onRequestLocation,
}: {
  shelter: Shelter | null
  geoState: 'requesting' | 'ready' | 'denied'
  onExpand: () => void
  onRequestLocation: () => void
}) {
  if (geoState === 'denied' || !shelter) {
    return (
      <button
        className="flex items-center justify-between px-5 pb-3"
        onClick={geoState === 'denied' ? onRequestLocation : onExpand}
      >
        <span className="text-sm font-medium text-gray-700">📍 מצא מקום מוגן קרוב</span>
        <span className="text-xs text-amber-600 font-medium">הפעל מיקום</span>
      </button>
    )
  }

  return (
    <button
      className="flex items-center justify-between px-5 pb-3 gap-3"
      onClick={onExpand}
    >
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-900 truncate">{shelter.name}</p>
        <p className="text-xs text-gray-500">{formatDistance(shelter.distance)} · {shelter.distance ? walkTime(shelter.distance) : ''} הליכה</p>
      </div>
      <button
        className="shrink-0 bg-amber-400 text-gray-900 text-xs font-bold px-4 py-2 rounded-full"
        onClick={(e) => {
          e.stopPropagation()
          navigateTo(shelter)
        }}
      >
        נווט
      </button>
    </button>
  )
}

function NearestCard({
  shelter,
  sheltersCount,
  onNavigate,
  onDetails,
  onShowList,
  onAddPlace,
  onClearFocus,
}: {
  shelter: Shelter
  sheltersCount: number
  onNavigate: () => void
  onDetails: () => void
  onShowList: () => void
  onAddPlace: () => void
  onClearFocus?: () => void
}) {
  const typeLabel = shelterTypeLabel(shelter.shelter_type)
  const isFromPin = !!onClearFocus

  return (
    <div className="px-5 flex flex-col gap-4 pb-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs text-gray-400 font-medium tracking-wide uppercase">
            {isFromPin ? 'מקום נבחר' : 'המקום הקרוב ביותר'}
          </p>
          <h2 className="text-xl font-semibold mt-0.5 text-gray-900 leading-snug">{shelter.name}</h2>
          {shelter.address && (
            <p className="text-sm text-gray-500 mt-0.5 truncate">{shelter.address}</p>
          )}
        </div>
        {isFromPin && (
          <button
            className="shrink-0 text-xs text-gray-400 hover:text-gray-700 transition-colors mt-1"
            onClick={onClearFocus}
          >
            ← חזור
          </button>
        )}
      </div>

      {/* Distance + chips */}
      <div className="flex flex-wrap gap-2">
        {shelter.distance !== undefined && (
          <div className="flex items-center gap-1.5 bg-amber-50 border border-amber-200 rounded-full px-3 py-1.5">
            <span className="text-sm font-bold text-amber-700">{formatDistance(shelter.distance)}</span>
            <span className="text-xs text-amber-400">·</span>
            <span className="text-xs text-amber-600">~{walkTime(shelter.distance)} הליכה</span>
          </div>
        )}
        {typeLabel && (
          <span className="text-xs text-gray-600 bg-gray-100 rounded-full px-3 py-1.5">{typeLabel}</span>
        )}
        {shelter.is_accessible && (
          <span className="text-xs text-gray-600 bg-gray-100 rounded-full px-3 py-1.5">♿ נגיש</span>
        )}
      </div>

      {/* Status + rating */}
      <div className="flex items-center gap-3">
        <StatusLine shelter={shelter} />
        {shelter.avg_rating != null && (
          <span className="text-xs text-gray-400">
            ★ {Number(shelter.avg_rating).toFixed(1)}
            {shelter.rating_count ? ` (${shelter.rating_count})` : ''}
          </span>
        )}
      </div>

      {/* Flagged warning */}
      {shelter.status === 'flagged' && (
        <div className="bg-orange-50 border border-orange-200 rounded-xl px-4 py-3 text-sm text-orange-700">
          ⚠️ דווח שמקום זה אינו זמין כרגע. בדוק לפני הגעה.
        </div>
      )}

      {/* CTAs */}
      <div className="flex gap-3">
        <Button
          className="flex-1 h-12 text-base rounded-xl font-bold"
          onClick={onNavigate}
        >
          נווט למקום
        </Button>
        <Button
          variant="outline"
          className="h-12 px-5 rounded-xl font-medium"
          onClick={onDetails}
        >
          פרטים
        </Button>
      </div>

      {/* Footer actions */}
      <div className="flex items-center justify-between">
        <button
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors"
          onClick={onShowList}
        >
          <span>כל המקומות הקרובים</span>
          <span className="text-xs bg-gray-100 rounded-full px-2 py-0.5 text-gray-600">{sheltersCount}</span>
        </button>
        <button
          className="text-sm text-gray-400 hover:text-gray-700 transition-colors"
          onClick={onAddPlace}
        >
          + הוסף מקום
        </button>
      </div>
    </div>
  )
}

function DeniedCard({
  onRequestLocation,
  onAddPlace,
}: {
  onRequestLocation: () => void
  onAddPlace: () => void
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<{ display_name: string; lat: string; lon: string }[]>([])
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const handleSearch = (q: string) => {
    setQuery(q)
    clearTimeout(timer.current)
    if (q.length < 2) { setResults([]); return }
    timer.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&countrycodes=il&limit=4`,
          { headers: { 'Accept-Language': 'he' } }
        )
        setResults(await res.json())
      } catch { /* silent */ }
    }, 400)
  }

  return (
    <div className="px-5 flex flex-col gap-4 pb-4">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">מצא מקום מוגן קרוב</h2>
        <p className="text-sm text-gray-500 mt-0.5">חפש לפי עיר או כתובת, או אפשר גישה למיקום</p>
      </div>

      {/* Search input */}
      <div className="relative">
        <input
          type="text"
          placeholder="עיר, שכונה, כתובת..."
          value={query}
          onChange={(e) => handleSearch(e.target.value)}
          className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 bg-gray-50"
          dir="rtl"
        />
        {results.length > 0 && (
          <div className="absolute top-full mt-1 w-full bg-white rounded-xl shadow-xl border border-gray-100 overflow-hidden z-10">
            {results.map((r) => (
              <button
                key={r.lat + r.lon}
                className="w-full text-right px-4 py-3 text-sm hover:bg-gray-50 border-b border-gray-50 last:border-0"
                onClick={() => {
                  setResults([])
                  setQuery('')
                  // Trigger a location-based search by dispatching custom event
                  window.dispatchEvent(new CustomEvent('search-location', {
                    detail: { lat: parseFloat(r.lat), lon: parseFloat(r.lon), label: r.display_name }
                  }))
                }}
              >
                {r.display_name}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center gap-3">
        <div className="flex-1 h-px bg-gray-100" />
        <span className="text-xs text-gray-400">או</span>
        <div className="flex-1 h-px bg-gray-100" />
      </div>

      <Button
        variant="outline"
        className="h-11 rounded-xl font-medium border-amber-200 text-amber-700 hover:bg-amber-50"
        onClick={onRequestLocation}
      >
        📍 אפשר גישה למיקום
      </Button>

      <p className="text-xs text-gray-400 text-center">
        אם המיקום חסום בדפדפן — לחץ על סמל המנעול בשורת הכתובת ואפשר מיקום
      </p>
    </div>
  )
}

function ListContent({
  shelters,
  onSelect,
  onCollapse,
  onAddPlace,
  router,
}: {
  shelters: Shelter[]
  onSelect: (s: Shelter) => void
  onCollapse: () => void
  onAddPlace: () => void
  router: ReturnType<typeof useRouter>
}) {
  return (
    <>
      <div className="px-5 pb-3 shrink-0 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">מקומות מוגנים קרובים</h2>
        <button
          className="text-sm text-gray-400 hover:text-gray-700 transition-colors"
          onClick={onCollapse}
        >
          ↓ מזער
        </button>
      </div>

      <div className="overflow-y-auto flex-1 pb-6">
        {shelters.map((shelter, i) => (
          <button
            key={shelter.id}
            className="w-full text-right px-5 py-4 hover:bg-gray-50 active:bg-gray-100 transition-colors border-b border-gray-50 last:border-0"
            onClick={() => onSelect(shelter)}
          >
            <div className="flex items-center gap-3">
              {/* Number badge */}
              <div className="shrink-0 w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-xs font-bold text-gray-500">
                {i + 1}
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900">{shelter.name}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <StatusLine shelter={shelter} />
                  {shelter.shelter_type && (
                    <span className="text-xs text-gray-400">{shelterTypeLabel(shelter.shelter_type)}</span>
                  )}
                </div>
              </div>

              {shelter.distance !== undefined && (
                <div className="shrink-0 text-left">
                  <p className="text-sm font-bold text-amber-600">{formatDistance(shelter.distance)}</p>
                  <p className="text-xs text-gray-400">{walkTime(shelter.distance)}</p>
                </div>
              )}
            </div>
          </button>
        ))}

        <div className="px-5 pt-4">
          <button
            className="w-full border-2 border-dashed border-gray-200 rounded-2xl py-4 text-sm text-gray-400 hover:border-gray-300 hover:text-gray-600 transition-colors"
            onClick={onAddPlace}
          >
            + הוסף מקום מוגן לרשימה
          </button>
        </div>
      </div>
    </>
  )
}
