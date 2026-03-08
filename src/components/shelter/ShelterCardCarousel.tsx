'use client'

import { useRef, useCallback, useEffect, useState } from 'react'
import type { Shelter } from '@/types'
import { Button } from '@/components/ui/button'
import { inferCategory, CATEGORY_CONFIG } from '@/lib/shelterCategory'

// ─── helpers ────────────────────────────────────────────────────────────────

function walkTime(meters: number) {
  const mins = Math.ceil(meters / 80)
  if (mins < 1) return 'פחות מדקה'
  return `${mins} דק׳`
}

function formatDistance(meters?: number) {
  if (meters === undefined) return ''
  if (meters < 1000) return `${Math.round(meters)} מ׳`
  return `${(meters / 1000).toFixed(1)} ק״מ`
}

function shelterTypeLabel(type: string | null) {
  const m: Record<string, string> = {
    mamad: 'ממ"ד', public_shelter: 'מקלט ציבורי',
    building_shelter: 'מקלט בניין', other: 'מקום מוגן',
  }
  return type ? (m[type] ?? type) : null
}

function relativeTime(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'הרגע'
  if (mins < 60) return `לפני ${mins} דק׳`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `לפני ${hours} שע׳`
  return `לפני ${Math.floor(hours / 24)} ימים`
}

function navigateTo(shelter: Shelter) {
  const coords = `${shelter.lat},${shelter.lng}`
  if (/iPad|iPhone|iPod/.test(navigator.userAgent)) {
    window.open(`maps://maps.apple.com/?daddr=${coords}&dirflg=w`)
  } else {
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${coords}&travelmode=walking`)
  }
}

function StatusDot({ shelter }: { shelter: Shelter }) {
  if (shelter.source === 'official')
    return <span className="text-xs text-sky-600 font-medium">● מקור רשמי</span>
  if (shelter.status === 'verified')
    return <span className="text-xs text-emerald-600 font-medium">● אומת {relativeTime(shelter.updated_at)}</span>
  if (shelter.status === 'flagged')
    return <span className="text-xs text-orange-500 font-medium">● דווח על בעיה</span>
  return <span className="text-xs text-gray-400">● לא מאומת</span>
}

// ─── Filter tags ──────────────────────────────────────────────────────────────

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

// ─── Main component ───────────────────────────────────────────────────────────

export type { Shelter }

interface Props {
  shelters: Shelter[]
  activeIndex: number
  filter: string
  onActiveChange: (i: number) => void
  onViewDetail: (s: Shelter) => void
  geoState: 'requesting' | 'ready' | 'denied'
  onRequestLocation: () => void
}

export default function ShelterCardCarousel({
  shelters,
  activeIndex,
  filter,
  onActiveChange,
  onViewDetail,
  geoState,
  onRequestLocation,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const programmatic = useRef(false)
  const prevIndex = useRef(activeIndex)

  const filtered = applyFilter(shelters, filter)

  // Scroll to card when active index changes from outside (map pin tap)
  useEffect(() => {
    if (prevIndex.current === activeIndex) return
    prevIndex.current = activeIndex
    const el = scrollRef.current
    if (!el) return
    const card = el.children[activeIndex] as HTMLElement | undefined
    if (!card) return
    programmatic.current = true
    // Scroll so card's left edge aligns with scroll-padding-left (24px)
    el.scrollTo({ left: card.offsetLeft - 24, behavior: 'smooth' })
    setTimeout(() => { programmatic.current = false }, 600)
  }, [activeIndex])

  const handleScroll = useCallback(() => {
    if (programmatic.current || !scrollRef.current) return
    const el = scrollRef.current
    // Detect which card's left edge is closest to scrollLeft + 24 (padding)
    const snapLeft = el.scrollLeft + 24
    let best = 0
    let bestDist = Infinity
    Array.from(el.children).forEach((child, i) => {
      if (i >= filtered.length) return // skip add-card
      const dist = Math.abs((child as HTMLElement).offsetLeft - snapLeft)
      if (dist < bestDist) { bestDist = dist; best = i }
    })
    if (best !== prevIndex.current) {
      prevIndex.current = best
      onActiveChange(best)
    }
  }, [filtered.length, onActiveChange])

  return (
    <div className="absolute bottom-0 left-0 right-0 z-[999]">
      <div className="bg-transparent">
        {/* Card carousel */}
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="flex gap-3 overflow-x-auto pb-8 pt-2 px-6"
          style={{
            scrollSnapType: 'x mandatory',
            scrollPaddingLeft: 24,
            WebkitOverflowScrolling: 'touch',
            scrollbarWidth: 'none',
          }}
        >
          {geoState === 'denied' && filtered.length === 0 && (
            <PermissionCard onRequestLocation={onRequestLocation} />
          )}

          {filtered.map((shelter, i) => (
            <ShelterCard
              key={shelter.id}
              shelter={shelter}
              active={i === activeIndex}
              onNavigate={() => navigateTo(shelter)}
              onDetails={() => onViewDetail(shelter)}
            />
          ))}

          {filtered.length === 0 && geoState !== 'denied' && (
            <EmptyFilterCard />
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Card variants ────────────────────────────────────────────────────────────

function ShelterCard({ shelter, active, onNavigate, onDetails }: {
  shelter: Shelter
  active: boolean
  onNavigate: () => void
  onDetails: () => void
}) {
  const category = shelter.category ?? inferCategory(shelter)
  const cfg = CATEGORY_CONFIG[category]

  return (
    <div
      className={`shrink-0 bg-white rounded-3xl shadow-lg flex flex-col gap-2.5 p-4 cursor-pointer active:scale-[0.98] transition-all select-none ${
        active ? 'shadow-xl ring-2 ring-amber-200' : 'opacity-90'
      }`}
      style={{ scrollSnapAlign: 'start', width: 'calc(100vw - 48px)', minWidth: 260, height: 148 }}
      onClick={onDetails}
    >
      {/* Top row: category icon + name + distance chip */}
      <div className="flex items-start gap-2">
        {/* Category icon circle */}
        <div
          className="shrink-0 w-9 h-9 rounded-2xl flex items-center justify-center text-base"
          style={{ background: cfg.color + '18' }}
        >
          <span>{cfg.emoji}</span>
        </div>

        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-900 leading-snug truncate">{shelter.name}</p>
          <p className="text-xs text-gray-400 mt-0.5 truncate">{cfg.label}</p>
        </div>

        {shelter.distance !== undefined && (
          <div className="shrink-0 text-left bg-amber-50 border border-amber-100 rounded-xl px-2.5 py-1.5">
            <p className="text-sm font-bold text-amber-700 leading-none">{formatDistance(shelter.distance)}</p>
            <p className="text-[10px] text-amber-500 mt-0.5">{walkTime(shelter.distance)}</p>
          </div>
        )}
      </div>

      {/* Status */}
      <StatusDot shelter={shelter} />

      {/* Navigate button */}
      <Button
        size="sm"
        className="w-full h-9 rounded-xl font-semibold text-sm mt-auto"
        onClick={(e) => { e.stopPropagation(); onNavigate() }}
      >
        נווט
      </Button>
    </div>
  )
}

function PermissionCard({ onRequestLocation }: { onRequestLocation: () => void }) {
  return (
    <div
      className="shrink-0 bg-white rounded-3xl shadow-lg flex flex-col items-center justify-center gap-3 p-5 text-center"
      style={{ scrollSnapAlign: 'start', width: 'calc(100vw - 48px)', minWidth: 260, height: 148 }}
    >
      <p className="text-sm font-semibold text-gray-800">מצא מקום מוגן קרוב</p>
      <p className="text-xs text-gray-500">כדי לראות מקלטים בסביבתך, נדרשת גישה למיקום</p>
      <Button size="sm" className="h-9 px-5 rounded-xl font-semibold text-sm" onClick={onRequestLocation}>
        📍 אפשר מיקום
      </Button>
    </div>
  )
}

function EmptyFilterCard() {
  return (
    <div
      className="shrink-0 bg-white rounded-3xl shadow-lg flex flex-col items-center justify-center gap-2 p-5 text-center"
      style={{ scrollSnapAlign: 'start', width: 'calc(100vw - 48px)', minWidth: 260, height: 148 }}
    >
      <p className="text-sm text-gray-500">אין מקלטים התואמים לסינון זה</p>
      <p className="text-xs text-gray-400">נסה לשנות את הסינון למעלה</p>
    </div>
  )
}
