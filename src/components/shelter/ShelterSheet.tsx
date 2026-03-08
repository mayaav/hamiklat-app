'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import type { Shelter, Comment } from '@/types'
import { inferCategory, CATEGORY_CONFIG } from '@/lib/shelterCategory'
import { getGuestId } from '@/lib/guestId'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Clock, Users, Wheelchair, Star, ThumbsUp, ThumbsDown, WarningCircle, NavigationArrow, X } from '@phosphor-icons/react'

// ─── helpers ─────────────────────────────────────────────────────────────────

const REPORT_TYPES = [
  { value: 'locked',       label: '🔒 נעול' },
  { value: 'inaccessible', label: '🚧 לא נגיש' },
  { value: 'dirty',        label: '🗑 מלוכלך' },
  { value: 'unsafe',       label: '⚠️ בעיית גישה' },
  { value: 'closed',       label: '🚫 סגור לצמיתות' },
  { value: 'fake',         label: '❌ לא קיים' },
  { value: 'other',        label: 'אחר' },
]

function nav(shelter: Shelter, app: 'waze' | 'google' | 'apple') {
  const { lat, lng } = shelter
  if (app === 'waze')   window.open(`https://waze.com/ul?ll=${lat},${lng}&navigate=yes`)
  else if (app === 'apple') window.open(`maps://maps.apple.com/?daddr=${lat},${lng}&dirflg=w`)
  else window.open(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=walking`)
}

function relTime(d: string) {
  const m = Math.floor((Date.now() - new Date(d).getTime()) / 60000)
  if (m < 1) return 'הרגע'
  if (m < 60) return `לפני ${m} דק׳`
  const h = Math.floor(m / 60)
  if (h < 24) return `לפני ${h} שע׳`
  const days = Math.floor(h / 24)
  return days === 1 ? 'אתמול' : `לפני ${days} ימים`
}

function fmtDist(m?: number) {
  if (!m) return null
  return m < 1000 ? `${Math.round(m)} מ׳` : `${(m / 1000).toFixed(1)} ק״מ`
}

function walkT(m?: number) {
  if (!m) return null
  const mins = Math.ceil(m / 80)
  return mins < 1 ? 'פחות מדקה' : `${mins} דק׳`
}

function Stars({ value, onChange }: { value: number; onChange?: (v: number) => void }) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map(i => (
        <button key={i} type="button" onClick={() => onChange?.(i)}>
          <Star size={22} weight={i <= value ? 'fill' : 'regular'}
            className={i <= value ? 'text-amber-400' : 'text-gray-200'} />
        </button>
      ))}
    </div>
  )
}

// ─── snap constants ───────────────────────────────────────────────────────────

const COLLAPSED_H = 280   // px visible at bottom when collapsed
const EXPANDED_TOP = 56   // px from top when fully expanded

// ─── main component ───────────────────────────────────────────────────────────

interface Props {
  shelterId: string
  userLocation: [number, number] | null
  onClose: () => void
}

export default function ShelterSheet({ shelterId, userLocation, onClose }: Props) {
  // data
  const [shelter, setShelter] = useState<Shelter | null>(null)
  const [comments, setComments] = useState<Comment[]>([])
  const [loading, setLoading] = useState(true)

  // sheet drag (DOM-direct for 60fps — no React re-renders during drag)
  const sheetRef  = useRef<HTMLDivElement>(null)
  const handleRef = useRef<HTMLDivElement>(null)
  const [expanded, setExpanded] = useState(false)

  // interactive state
  const [photoIndex, setPhotoIndex] = useState(0)
  const [showNavPicker, setShowNavPicker] = useState(false)
  const [verified, setVerified]    = useState<boolean | null>(null)
  const [myRating, setMyRating]    = useState(0)
  const [commentText, setCommentText] = useState('')
  const [guestName, setGuestName]  = useState('')
  const [submittingComment, setSubmittingComment] = useState(false)
  const [showReport, setShowReport]   = useState(false)
  const [reportType, setReportType]   = useState('')
  const [reportDesc, setReportDesc]   = useState('')
  const [submittingReport, setSubmittingReport] = useState(false)
  const [reportSent, setReportSent] = useState(false)

  const isIOS = typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent)

  // ── snap helper ──────────────────────────────────────────────────────────────

  const collapsedOffset = useCallback(
    () => (typeof window !== 'undefined' ? window.innerHeight - COLLAPSED_H : 600),
    [],
  )

  const snapTo = useCallback((target: number, animate = true) => {
    const sheet = sheetRef.current
    if (!sheet) return
    sheet.style.transition = animate
      ? 'transform 0.38s cubic-bezier(0.32, 0.72, 0, 1)'
      : 'none'
    sheet.style.transform = `translateY(${target}px)`
    setExpanded(target < collapsedOffset() - 60)
  }, [collapsedOffset])

  // ── drag setup (passive: false touchmove to prevent scroll) ──────────────────

  useEffect(() => {
    const handle = handleRef.current
    if (!handle) return

    let startY = 0, startOffset = 0, startTime = 0

    const getOffset = () => {
      const t = sheetRef.current?.style.transform ?? ''
      const m = t.match(/translateY\(([-\d.]+)px\)/)
      return m ? parseFloat(m[1]) : collapsedOffset()
    }

    const onStart = (y: number) => {
      startY = y
      startOffset = getOffset()
      startTime = Date.now()
      if (sheetRef.current) sheetRef.current.style.transition = 'none'
    }

    const onMove = (y: number) => {
      const dy = y - startY
      const next = Math.max(EXPANDED_TOP, Math.min(collapsedOffset(), startOffset + dy))
      if (sheetRef.current) sheetRef.current.style.transform = `translateY(${next}px)`
    }

    const onEnd = (y: number) => {
      const dy = y - startY
      const dt = Math.max(1, Date.now() - startTime)
      const velocity = dy / dt   // px/ms, positive = downward
      const cur = getOffset()
      const mid = (collapsedOffset() + EXPANDED_TOP) / 2
      const expand = velocity < -0.4 || (Math.abs(velocity) < 0.4 && cur < mid)
      if (!expand && dy > 120) { onClose(); return }
      snapTo(expand ? EXPANDED_TOP : collapsedOffset())
    }

    const onTouchStart = (e: TouchEvent) => onStart(e.touches[0].clientY)
    const onTouchMove  = (e: TouchEvent) => { e.preventDefault(); onMove(e.touches[0].clientY) }
    const onTouchEnd   = (e: TouchEvent) => onEnd(e.changedTouches[0].clientY)

    // mouse (desktop)
    const onMouseDown = (e: MouseEvent) => {
      onStart(e.clientY)
      const mm = (ev: MouseEvent) => onMove(ev.clientY)
      const mu = (ev: MouseEvent) => { onEnd(ev.clientY); window.removeEventListener('mousemove', mm); window.removeEventListener('mouseup', mu) }
      window.addEventListener('mousemove', mm)
      window.addEventListener('mouseup', mu)
    }

    handle.addEventListener('touchstart', onTouchStart, { passive: true })
    handle.addEventListener('touchmove',  onTouchMove,  { passive: false })
    handle.addEventListener('touchend',   onTouchEnd,   { passive: true })
    handle.addEventListener('mousedown',  onMouseDown)

    return () => {
      handle.removeEventListener('touchstart', onTouchStart)
      handle.removeEventListener('touchmove',  onTouchMove)
      handle.removeEventListener('touchend',   onTouchEnd)
      handle.removeEventListener('mousedown',  onMouseDown)
    }
  }, [snapTo, collapsedOffset, onClose])

  // ── initialize position ───────────────────────────────────────────────────────

  useEffect(() => { snapTo(collapsedOffset(), false) }, [snapTo, collapsedOffset])

  // ── load data ─────────────────────────────────────────────────────────────────

  useEffect(() => {
    setLoading(true)
    setShelter(null)
    setComments([])
    setPhotoIndex(0)
    setVerified(null)
    setMyRating(0)
    setShowReport(false)
    setReportSent(false)
    snapTo(collapsedOffset(), false)

    async function load() {
      const [sRes, cRes] = await Promise.all([
        fetch(`/api/shelters/${shelterId}`),
        fetch(`/api/shelters/${shelterId}/comments`),
      ])
      if (sRes.ok) {
        const s: Shelter = await sRes.json()
        if (userLocation) {
          const dLat = (userLocation[0] - s.lat) * 111320
          const dLng = (userLocation[1] - s.lng) * 111320 * Math.cos(s.lat * Math.PI / 180)
          s.distance = Math.sqrt(dLat * dLat + dLng * dLng)
        }
        setShelter(s)
      }
      if (cRes.ok) setComments(await cRes.json())
      setLoading(false)
    }
    load()
  }, [shelterId]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── actions ───────────────────────────────────────────────────────────────────

  const handleVerify = async (positive: boolean) => {
    setVerified(positive)
    await fetch(`/api/shelters/${shelterId}/verify`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_positive: positive, guest_id: getGuestId() }),
    })
  }

  const handleRating = async (score: number) => {
    setMyRating(score)
    await fetch(`/api/shelters/${shelterId}/ratings`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ score, guest_id: getGuestId() }),
    })
  }

  const handleComment = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!commentText.trim()) return
    setSubmittingComment(true)
    const res = await fetch(`/api/shelters/${shelterId}/comments`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: commentText, guest_name: guestName }),
    })
    if (res.ok) {
      const c = await res.json()
      setComments(prev => [c, ...prev])
      setCommentText('')
      setGuestName('')
    }
    setSubmittingComment(false)
  }

  const handleReport = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!reportType) return
    setSubmittingReport(true)
    await fetch(`/api/shelters/${shelterId}/reports`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: reportType, description: reportDesc }),
    })
    setSubmittingReport(false)
    setReportSent(true)
    setShowReport(false)
  }

  const category = shelter ? (shelter.category ?? inferCategory(shelter)) : null
  const cfg      = category ? CATEGORY_CONFIG[category] : null
  const photos   = shelter?.photos ?? []

  // ── render ────────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[1000] transition-colors duration-300"
        style={{ pointerEvents: expanded ? 'auto' : 'none', background: expanded ? 'rgba(0,0,0,0.22)' : 'transparent' }}
        onClick={expanded ? onClose : undefined}
      />

      {/* Sheet */}
      <div
        ref={sheetRef}
        dir="rtl"
        className="fixed inset-x-0 bottom-0 top-0 z-[1001] bg-white flex flex-col"
        style={{
          borderRadius: '20px 20px 0 0',
          boxShadow: '0 -4px 32px rgba(0,0,0,0.13)',
          willChange: 'transform',
        }}
      >
        {/* ── Handle ── */}
        <div
          ref={handleRef}
          className="flex flex-col items-center pt-3 pb-2 shrink-0 select-none cursor-grab active:cursor-grabbing touch-none"
        >
          <div className="w-10 h-1 rounded-full bg-gray-200" />
        </div>

        {/* ── Loading skeleton ── */}
        {loading && (
          <div className="px-5 py-3 flex flex-col gap-3 shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-gray-100 animate-pulse shrink-0" />
              <div className="flex-1 flex flex-col gap-2">
                <div className="h-4 w-2/3 bg-gray-100 rounded-xl animate-pulse" />
                <div className="h-3 w-1/2 bg-gray-100 rounded-xl animate-pulse" />
              </div>
            </div>
            <div className="h-11 w-full bg-gray-100 rounded-2xl animate-pulse" />
          </div>
        )}

        {/* ── Content ── */}
        {!loading && shelter && cfg && (
          <>
            {/* Summary (always visible when collapsed) */}
            <div
              className="px-4 pb-2 flex items-center gap-3 shrink-0"
              onClick={() => !expanded && snapTo(EXPANDED_TOP)}
            >
              <div
                className="w-11 h-11 rounded-2xl flex items-center justify-center text-xl shrink-0"
                style={{ background: cfg.color + '18' }}
              >
                {cfg.emoji}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-900 leading-snug truncate">{shelter.name}</p>
                <p className="text-xs text-gray-400 mt-0.5 truncate">
                  {shelter.address}{shelter.city ? `, ${shelter.city}` : ''}
                </p>
              </div>
              {shelter.distance !== undefined && (
                <div className="shrink-0 bg-amber-50 border border-amber-100 rounded-xl px-2.5 py-1.5 text-left">
                  <p className="text-sm font-bold text-amber-700 leading-none">{fmtDist(shelter.distance)}</p>
                  <p className="text-[10px] text-amber-500 mt-0.5">{walkT(shelter.distance)} הליכה</p>
                </div>
              )}
              <button
                onClick={e => { e.stopPropagation(); onClose() }}
                className="shrink-0 w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500"
              >
                <X size={16} />
              </button>
            </div>

            {/* Status badges */}
            <div className="px-4 pb-2 flex items-center gap-2 flex-wrap shrink-0">
              {shelter.source === 'official' && (
                <span className="inline-flex items-center gap-1 text-xs font-medium bg-gray-900 text-white px-2.5 py-1 rounded-full">✓ מקור רשמי</span>
              )}
              {shelter.status === 'verified' && shelter.source !== 'official' && (
                <span className="inline-flex items-center gap-1 text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-1 rounded-full">✓ אומת קהילה</span>
              )}
              {shelter.status === 'flagged' && (
                <span className="inline-flex items-center gap-1 text-xs font-medium bg-orange-50 text-orange-700 border border-orange-200 px-2.5 py-1 rounded-full">⚠ דווח על בעיה</span>
              )}
              {shelter.is_accessible && (
                <span className="inline-flex items-center gap-1 text-xs font-medium bg-blue-50 text-blue-700 border border-blue-100 px-2.5 py-1 rounded-full">♿ נגיש</span>
              )}
              <span className="text-xs text-gray-400">עודכן {relTime(shelter.updated_at)}</span>
            </div>

            {/* Navigate button */}
            <div className="px-4 pb-3 shrink-0 relative">
              <Button
                className="w-full h-11 rounded-2xl text-base font-semibold gap-2"
                onClick={() => setShowNavPicker(p => !p)}
              >
                <NavigationArrow size={18} weight="fill" />
                נווט למקום
              </Button>
              {showNavPicker && (
                <div className="absolute bottom-14 left-4 right-4 bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden z-10">
                  {([
                    { app: 'waze'   as const, icon: '🗺', label: 'Waze' },
                    { app: 'google' as const, icon: '📍', label: 'Google Maps' },
                    ...(isIOS ? [{ app: 'apple' as const, icon: '🍎', label: 'Apple Maps' }] : []),
                  ]).map(({ app, icon, label }, i, arr) => (
                    <button
                      key={app}
                      className={`w-full flex items-center gap-3 px-4 py-3 text-sm text-right hover:bg-gray-50 ${i < arr.length - 1 ? 'border-b border-gray-50' : ''}`}
                      onClick={() => { nav(shelter, app); setShowNavPicker(false) }}
                    >
                      <span className="text-xl">{icon}</span>
                      <span className="font-medium">{label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* ── Expanded content (scrollable) ── */}
            <div
              className="flex-1 overflow-y-auto border-t border-gray-50"
              style={{ WebkitOverflowScrolling: 'touch' }}
            >
              {/* Photos */}
              {photos.length > 0 && (
                <div className="relative" style={{ height: 200 }}>
                  <div
                    className="flex overflow-x-auto h-full"
                    style={{ scrollSnapType: 'x mandatory', scrollbarWidth: 'none' }}
                    onScroll={e => setPhotoIndex(Math.round(e.currentTarget.scrollLeft / e.currentTarget.offsetWidth))}
                  >
                    {photos.map(p => (
                      <img key={p.id} src={p.url} alt=""
                        className="shrink-0 w-full h-full object-cover"
                        style={{ scrollSnapAlign: 'start' }} />
                    ))}
                  </div>
                  {photos.length > 1 && (
                    <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-1.5">
                      {photos.map((_, i) => (
                        <div key={i} className="rounded-full"
                          style={{ width: i === photoIndex ? 16 : 6, height: 6, background: i === photoIndex ? 'white' : 'rgba(255,255,255,0.5)' }} />
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Quick info */}
              <div className="px-5 py-4 border-b border-gray-50 flex flex-col gap-3">
                {shelter.shelter_type && (
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 text-base" style={{ background: `${cfg.color}18` }}>{cfg.emoji}</div>
                    <div>
                      <p className="text-sm font-medium text-gray-800">{cfg.label}</p>
                      {shelter.floor && <p className="text-xs text-gray-400">קומה {shelter.floor}</p>}
                    </div>
                  </div>
                )}
                {shelter.capacity && (
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-xl bg-purple-50 flex items-center justify-center shrink-0"><Users size={16} className="text-purple-500" /></div>
                    <p className="text-sm font-medium text-gray-800">קיבולת {shelter.capacity} אנשים</p>
                  </div>
                )}
                {shelter.hours && (
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-xl bg-teal-50 flex items-center justify-center shrink-0"><Clock size={16} className="text-teal-500" /></div>
                    <p className="text-sm font-medium text-gray-800">{shelter.hours}</p>
                  </div>
                )}
                {shelter.is_accessible && (
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-xl bg-sky-50 flex items-center justify-center shrink-0"><Wheelchair size={16} className="text-sky-500" /></div>
                    <div>
                      <p className="text-sm font-medium text-gray-800">נגיש לנכים</p>
                      {shelter.accessibility_notes && <p className="text-xs text-gray-400">{shelter.accessibility_notes}</p>}
                    </div>
                  </div>
                )}
                {shelter.notes && <p className="text-sm text-gray-500 leading-relaxed">{shelter.notes}</p>}
              </div>

              {/* Flagged warning */}
              {shelter.status === 'flagged' && (
                <div className="mx-5 my-3 p-4 bg-orange-50 border border-orange-200 rounded-2xl flex gap-3">
                  <WarningCircle size={18} className="shrink-0 text-orange-500 mt-0.5" />
                  <p className="text-sm text-orange-700">מקום זה דווח על ידי משתמשים. מומלץ לאמת לפני הגעה.</p>
                </div>
              )}

              {/* Verify */}
              {shelter.source === 'community' && (
                <div className="px-5 py-4 border-b border-gray-50">
                  <h2 className="text-sm font-semibold text-gray-900 mb-1">האם המקום קיים ונגיש?</h2>
                  <p className="text-xs text-gray-400 mb-3">
                    {shelter.verification_count > 0 ? `${shelter.verification_count} משתמשים דיווחו` : 'היה הראשון לדווח'}
                  </p>
                  <div className="flex gap-2">
                    {([
                      { positive: true,  icon: <ThumbsUp size={15} />,   label: 'כן, קיים', active: 'bg-emerald-500 text-white border-emerald-500' },
                      { positive: false, icon: <ThumbsDown size={15} />, label: 'לא נמצא',  active: 'bg-red-500 text-white border-red-500' },
                    ]).map(({ positive, icon, label, active }) => (
                      <button
                        key={String(positive)}
                        onClick={() => handleVerify(positive)}
                        className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium border transition-colors ${verified === positive ? active : 'border-gray-200 text-gray-700 hover:bg-gray-50'}`}
                      >{icon}{label}</button>
                    ))}
                  </div>
                </div>
              )}

              {/* Rating */}
              <div className="px-5 py-4 border-b border-gray-50">
                <h2 className="text-sm font-semibold text-gray-900 mb-2">דרג את המקום</h2>
                {shelter.avg_rating != null && (
                  <p className="text-xs text-gray-400 mb-2">
                    ממוצע {Number(shelter.avg_rating).toFixed(1)} · {shelter.rating_count ?? 0} דירוגים
                  </p>
                )}
                <Stars value={myRating} onChange={handleRating} />
              </div>

              {/* Comments */}
              <div className="px-5 py-4 border-b border-gray-50">
                <h2 className="text-sm font-semibold text-gray-900 mb-3">
                  עדכוני קהילה {comments.length > 0 && <span className="font-normal text-gray-400 text-sm">({comments.length})</span>}
                </h2>
                <form onSubmit={handleComment} className="mb-4">
                  <div className="bg-gray-50 rounded-2xl p-3 flex flex-col gap-2">
                    <Textarea
                      placeholder="הוסף עדכון..."
                      value={commentText}
                      onChange={e => setCommentText(e.target.value)}
                      rows={2}
                      className="resize-none text-sm rounded-xl border-0 bg-transparent p-0 focus-visible:ring-0"
                      maxLength={300}
                    />
                    <div className="flex items-center gap-2">
                      <input type="text" placeholder="שם (אופציונלי)" value={guestName}
                        onChange={e => setGuestName(e.target.value)}
                        className="flex-1 text-xs bg-transparent outline-none text-gray-500 placeholder-gray-400" />
                      <button type="submit" disabled={!commentText.trim() || submittingComment}
                        className="text-xs font-semibold text-gray-900 disabled:opacity-40">
                        {submittingComment ? 'שולח...' : 'שלח'}
                      </button>
                    </div>
                  </div>
                </form>
                <div className="flex flex-col gap-3">
                  {comments.slice(0, 8).map(c => {
                    const name = (c as unknown as { guest_name?: string }).guest_name
                      ?? c.users?.display_name
                      ?? null
                    return (
                      <div key={c.id} className="flex gap-3">
                        <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center shrink-0 text-xs font-bold text-gray-500">
                          {(name || 'א').charAt(0)}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="text-xs font-medium text-gray-700">{name || 'אנונימי'}</span>
                            <span className="text-xs text-gray-400">{relTime(c.created_at)}</span>
                          </div>
                          <p className="text-sm text-gray-600 leading-relaxed">{c.content}</p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Report */}
              <div className="px-5 py-4 border-b border-gray-50">
                {reportSent ? (
                  <p className="text-sm text-gray-400 text-center">תודה! הקהילה תבדוק את הבעיה.</p>
                ) : showReport ? (
                  <form onSubmit={handleReport} className="flex flex-col gap-3">
                    <h2 className="text-sm font-semibold text-gray-900">מה הבעיה?</h2>
                    <div className="grid grid-cols-2 gap-2">
                      {REPORT_TYPES.map(t => (
                        <button key={t.value} type="button"
                          className={`py-2 px-3 rounded-xl text-sm border text-right transition-colors ${reportType === t.value ? 'bg-gray-900 text-white border-gray-900' : 'border-gray-200 text-gray-700 hover:bg-gray-50'}`}
                          onClick={() => setReportType(t.value)}>{t.label}
                        </button>
                      ))}
                    </div>
                    <Textarea placeholder="פרטים נוספים (אופציונלי)" value={reportDesc}
                      onChange={e => setReportDesc(e.target.value)} rows={2}
                      className="resize-none text-sm rounded-xl" maxLength={300} />
                    <div className="flex gap-2">
                      <Button type="submit" size="sm" disabled={!reportType || submittingReport} className="flex-1 h-10 rounded-xl">
                        {submittingReport ? 'שולח...' : 'שלח דיווח'}
                      </Button>
                      <Button type="button" variant="outline" size="sm" className="h-10 rounded-xl"
                        onClick={() => setShowReport(false)}>ביטול</Button>
                    </div>
                  </form>
                ) : (
                  <button className="text-sm text-gray-400 flex items-center gap-1.5" onClick={() => setShowReport(true)}>
                    <WarningCircle size={14} />
                    דווח על בעיה
                  </button>
                )}
              </div>

              {/* Disclaimer */}
              <div className="px-5 py-4 text-center">
                <p className="text-[11px] text-gray-400 leading-relaxed">
                  המידע עשוי להיות קהילתי ואינו מובטח כמדויק.{' '}
                  <a href="/about" className="underline underline-offset-2">פרטים נוספים</a>
                </p>
              </div>

              <div style={{ height: 'max(1.5rem, env(safe-area-inset-bottom))' }} />
            </div>
          </>
        )}
      </div>
    </>
  )
}
