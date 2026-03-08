'use client'

import { useEffect, useState, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import type { Shelter, Comment } from '@/types'
import { getGuestId } from '@/lib/guestId'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { inferCategory, CATEGORY_CONFIG } from '@/lib/shelterCategory'
import {
  MapPin, Clock, Users, Wheelchair, Star, CaretRight,
  ThumbsUp, ThumbsDown, WarningCircle, Camera, NavigationArrow,
} from '@phosphor-icons/react'

// ─── helpers ──────────────────────────────────────────────────────────────────

const REPORT_TYPES = [
  { value: 'locked', label: '🔒 נעול' },
  { value: 'inaccessible', label: '🚧 לא נגיש' },
  { value: 'dirty', label: '🗑 מלוכלך' },
  { value: 'unsafe', label: '⚠️ לא בטוח' },
  { value: 'closed', label: '🚫 סגור לצמיתות' },
  { value: 'fake', label: '❌ לא קיים' },
  { value: 'other', label: 'אחר' },
]

function navigateTo(shelter: Shelter, app: 'waze' | 'google' | 'apple') {
  const { lat, lng } = shelter
  if (app === 'waze') {
    window.open(`https://waze.com/ul?ll=${lat},${lng}&navigate=yes`)
  } else if (app === 'apple') {
    window.open(`maps://maps.apple.com/?daddr=${lat},${lng}&dirflg=w`)
  } else {
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=walking`)
  }
}

function relativeTime(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'הרגע'
  if (mins < 60) return `לפני ${mins} דק׳`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `לפני ${hours} שע׳`
  const days = Math.floor(hours / 24)
  if (days === 1) return 'אתמול'
  return `לפני ${days} ימים`
}

function formatDistance(m?: number) {
  if (!m) return null
  return m < 1000 ? `${Math.round(m)} מ׳` : `${(m / 1000).toFixed(1)} ק״מ`
}

function walkTime(m?: number) {
  if (!m) return null
  const mins = Math.ceil(m / 80)
  return mins < 1 ? 'פחות מדקה הליכה' : `${mins} דק׳ הליכה`
}

// ─── placeholder illustration ─────────────────────────────────────────────────

function ShelterPlaceholder({ color }: { color: string }) {
  return (
    <div
      className="w-full h-full flex flex-col items-center justify-center gap-3"
      style={{ background: `${color}12` }}
    >
      <svg width="96" height="96" viewBox="0 0 96 96" fill="none">
        {/* Ground */}
        <rect x="8" y="76" width="80" height="4" rx="2" fill={color} opacity="0.15" />
        {/* Main building */}
        <rect x="18" y="38" width="60" height="38" rx="4" fill={color} opacity="0.18" />
        {/* Roof */}
        <polygon points="12,40 48,16 84,40" fill={color} opacity="0.28" />
        {/* Door */}
        <rect x="40" y="56" width="16" height="20" rx="3" fill={color} opacity="0.35" />
        {/* Windows */}
        <rect x="24" y="46" width="12" height="10" rx="2" fill={color} opacity="0.4" />
        <rect x="60" y="46" width="12" height="10" rx="2" fill={color} opacity="0.4" />
        {/* Shield / protection symbol */}
        <path
          d="M48 22 L56 25 L56 32 Q56 36 48 39 Q40 36 40 32 L40 25 Z"
          fill={color}
          opacity="0.55"
        />
        <path
          d="M44.5 31 L47 33.5 L51.5 28"
          stroke="white"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.9"
        />
      </svg>
      <span style={{ color, opacity: 0.5, fontSize: 13, fontWeight: 500 }}>אין תמונות עדיין</span>
    </div>
  )
}

// ─── star rating ──────────────────────────────────────────────────────────────

function StarRating({ value, onChange, readonly }: { value: number; onChange?: (v: number) => void; readonly?: boolean }) {
  return (
    <div className="flex gap-1.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <button key={i} type="button" disabled={readonly} onClick={() => onChange?.(i)}
          className={readonly ? 'cursor-default' : 'cursor-pointer'}>
          <Star size={20} weight={i <= value ? 'fill' : 'regular'}
            className={i <= value ? 'text-amber-400' : 'text-gray-200'} />
        </button>
      ))}
    </div>
  )
}

// ─── nearby POIs ──────────────────────────────────────────────────────────────

type POI = { type: string; name: string; emoji: string }

async function fetchNearby(lat: number, lng: number): Promise<POI[]> {
  const query = `[out:json][timeout:8];
(node[amenity=cafe](around:350,${lat},${lng});
 node[amenity=pharmacy](around:350,${lat},${lng});
 node[amenity=supermarket](around:350,${lat},${lng});
 node[leisure=park](around:350,${lat},${lng});
 node[amenity=hospital](around:350,${lat},${lng});
 node[amenity=school](around:350,${lat},${lng});
);out 10;`
  try {
    const res = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST', body: query,
    })
    if (!res.ok) return []
    const data = await res.json()
    const emojiMap: Record<string, string> = {
      cafe: '☕', pharmacy: '💊', supermarket: '🛒',
      park: '🌳', hospital: '🏥', school: '🏫',
    }
    const seen = new Set<string>()
    return (data.elements ?? []).flatMap((el: { tags?: Record<string, string> }) => {
      const amenity = el.tags?.amenity ?? el.tags?.leisure ?? ''
      const name = el.tags?.name
      if (!name || seen.has(amenity)) return []
      seen.add(amenity)
      return [{ type: amenity, name, emoji: emojiMap[amenity] ?? '📍' }]
    }).slice(0, 5)
  } catch {
    return []
  }
}

// ─── main page ────────────────────────────────────────────────────────────────

export default function ShelterDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [shelter, setShelter] = useState<Shelter | null>(null)
  const [comments, setComments] = useState<Comment[]>([])
  const [loading, setLoading] = useState(true)
  const [nearby, setNearby] = useState<POI[]>([])
  const [photoIndex, setPhotoIndex] = useState(0)
  const [showNavPicker, setShowNavPicker] = useState(false)
  const isIOS = typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent)

  // comment form
  const [commentText, setCommentText] = useState('')
  const [guestName, setGuestName] = useState('')
  const [submittingComment, setSubmittingComment] = useState(false)

  // rating
  const [myRating, setMyRating] = useState(0)
  const [submittingRating, setSubmittingRating] = useState(false)

  // report
  const [showReport, setShowReport] = useState(false)
  const [reportType, setReportType] = useState('')
  const [reportDesc, setReportDesc] = useState('')
  const [submittingReport, setSubmittingReport] = useState(false)
  const [reportSent, setReportSent] = useState(false)

  // verify
  const [verified, setVerified] = useState<boolean | null>(null)

  // photo
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)

  const photoInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    async function load() {
      const [shelterRes, commentsRes] = await Promise.all([
        fetch(`/api/shelters/${id}`),
        fetch(`/api/shelters/${id}/comments`),
      ])
      if (shelterRes.ok) {
        const s: Shelter = await shelterRes.json()
        setShelter(s)
        fetchNearby(s.lat, s.lng).then(setNearby)
      }
      if (commentsRes.ok) setComments(await commentsRes.json())
      setLoading(false)
    }
    load()
  }, [id])

  const handleRating = async (score: number) => {
    setMyRating(score)
    setSubmittingRating(true)
    await fetch(`/api/shelters/${id}/ratings`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ score, guest_id: getGuestId() }),
    })
    setSubmittingRating(false)
    const res = await fetch(`/api/shelters/${id}`)
    if (res.ok) setShelter(await res.json())
  }

  const handleComment = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!commentText.trim()) return
    setSubmittingComment(true)
    const res = await fetch(`/api/shelters/${id}/comments`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: commentText, guest_name: guestName }),
    })
    if (res.ok) {
      const newComment = await res.json()
      setComments(prev => [newComment, ...prev])
      setCommentText('')
      setGuestName('')
    }
    setSubmittingComment(false)
  }

  const handleReport = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!reportType) return
    setSubmittingReport(true)
    await fetch(`/api/shelters/${id}/reports`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: reportType, description: reportDesc }),
    })
    setSubmittingReport(false)
    setReportSent(true)
    setShowReport(false)
  }

  const handleVerify = async (positive: boolean) => {
    await fetch(`/api/shelters/${id}/verify`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_positive: positive, guest_id: getGuestId() }),
    })
    setVerified(positive)
  }

  const handlePhotoUpload = async () => {
    if (!photoFile) return
    setUploadingPhoto(true)
    const form = new FormData()
    form.append('file', photoFile)
    form.append('guest_id', getGuestId())
    await fetch(`/api/shelters/${id}/photos`, { method: 'POST', body: form })
    setPhotoFile(null)
    setUploadingPhoto(false)
    const res = await fetch(`/api/shelters/${id}`)
    if (res.ok) setShelter(await res.json())
  }

  // ── loading ──────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-white">
        <div className="h-72 bg-gray-100 animate-pulse" />
        <div className="px-5 pt-5 flex flex-col gap-4">
          <div className="h-6 bg-gray-100 rounded-xl w-3/4 animate-pulse" />
          <div className="h-4 bg-gray-100 rounded-xl w-1/2 animate-pulse" />
          <div className="flex gap-2">
            {[1,2,3].map(i => <div key={i} className="h-8 w-20 bg-gray-100 rounded-full animate-pulse" />)}
          </div>
        </div>
      </div>
    )
  }

  if (!shelter) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center">
          <p className="text-gray-400 mb-4">המקלט לא נמצא</p>
          <Button variant="outline" onClick={() => router.push('/')}>חזור למפה</Button>
        </div>
      </div>
    )
  }

  const photos = shelter.photos ?? []
  const category = shelter.category ?? inferCategory(shelter)
  const cfg = CATEGORY_CONFIG[category]

  // ── render ───────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-white" dir="rtl">

      {/* ── 1. IMAGE SECTION ──────────────────────────────────────────────────── */}
      <div className="relative" style={{ height: 280 }}>
        {photos.length > 0 ? (
          <>
            {/* Swipeable photo strip */}
            <div
              className="flex overflow-x-auto h-full"
              style={{ scrollSnapType: 'x mandatory', scrollbarWidth: 'none' }}
              onScroll={e => {
                const el = e.currentTarget
                setPhotoIndex(Math.round(el.scrollLeft / el.offsetWidth))
              }}
            >
              {photos.map(p => (
                <img
                  key={p.id}
                  src={p.url}
                  alt=""
                  className="shrink-0 w-full h-full object-cover"
                  style={{ scrollSnapAlign: 'start' }}
                />
              ))}
            </div>
            {/* Photo counter dots */}
            {photos.length > 1 && (
              <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-1.5">
                {photos.map((_, i) => (
                  <div key={i} className="rounded-full transition-all"
                    style={{ width: i === photoIndex ? 16 : 6, height: 6, background: i === photoIndex ? 'white' : 'rgba(255,255,255,0.5)' }} />
                ))}
              </div>
            )}
          </>
        ) : (
          <ShelterPlaceholder color={cfg.color} />
        )}

        {/* Floating back button */}
        <button
          onClick={() => router.back()}
          className="absolute top-4 right-4 w-9 h-9 rounded-full bg-white/90 backdrop-blur shadow-md flex items-center justify-center"
          style={{ zIndex: 10 }}
        >
          <CaretRight size={18} weight="bold" className="text-gray-800" />
        </button>

        {/* Category badge floating over image bottom-left */}
        <div
          className="absolute bottom-4 right-4 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold"
          style={{ background: cfg.color, color: '#fff', zIndex: 10 }}
        >
          <span>{cfg.emoji}</span>
          <span>{cfg.label}</span>
        </div>
      </div>

      {/* ── scrollable content ────────────────────────────────────────────────── */}
      <div className="flex flex-col pb-32">

        {/* ── 2. TITLE + STATUS ─────────────────────────────────────────────────── */}
        <div className="px-5 pt-5 pb-4 border-b border-gray-50">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <h1 className="text-xl font-bold text-gray-900 leading-snug">{shelter.name}</h1>
              <p className="text-sm text-gray-500 mt-0.5">{shelter.address}{shelter.city ? `, ${shelter.city}` : ''}</p>
            </div>
            {shelter.avg_rating != null && (
              <div className="shrink-0 flex items-center gap-1 mt-0.5">
                <Star size={14} weight="fill" className="text-amber-400" />
                <span className="text-sm font-semibold text-gray-800">{Number(shelter.avg_rating).toFixed(1)}</span>
                {shelter.rating_count ? <span className="text-xs text-gray-400">({shelter.rating_count})</span> : null}
              </div>
            )}
          </div>

          {/* Status row */}
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            {shelter.source === 'official' && (
              <span className="inline-flex items-center gap-1 text-xs font-medium bg-gray-900 text-white px-2.5 py-1 rounded-full">
                ✓ רשמי
              </span>
            )}
            {shelter.status === 'verified' && shelter.source !== 'official' && (
              <span className="inline-flex items-center gap-1 text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-1 rounded-full">
                ✓ אומת קהילה
              </span>
            )}
            {shelter.status === 'flagged' && (
              <span className="inline-flex items-center gap-1 text-xs font-medium bg-orange-50 text-orange-700 border border-orange-200 px-2.5 py-1 rounded-full">
                ⚠ דווח על בעיה
              </span>
            )}
            {shelter.is_accessible && (
              <span className="inline-flex items-center gap-1 text-xs font-medium bg-blue-50 text-blue-700 border border-blue-100 px-2.5 py-1 rounded-full">
                ♿ נגיש
              </span>
            )}
            <span className="text-xs text-gray-400">עודכן {relativeTime(shelter.updated_at)}</span>
          </div>
        </div>

        {/* ── 3. QUICK INFO ─────────────────────────────────────────────────────── */}
        <div className="px-5 py-4 border-b border-gray-50 flex flex-col gap-3">
          {(shelter.distance != null) && (
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-amber-50 flex items-center justify-center shrink-0">
                <MapPin size={16} weight="fill" className="text-amber-500" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-800">{formatDistance(shelter.distance)}</p>
                <p className="text-xs text-gray-400">{walkTime(shelter.distance)}</p>
              </div>
            </div>
          )}
          {shelter.shelter_type && (
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 text-base"
                style={{ background: `${cfg.color}18` }}>
                {cfg.emoji}
              </div>
              <div>
                <p className="text-sm font-medium text-gray-800">{cfg.label}</p>
                {shelter.floor && <p className="text-xs text-gray-400">קומה {shelter.floor}</p>}
              </div>
            </div>
          )}
          {shelter.capacity && (
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-purple-50 flex items-center justify-center shrink-0">
                <Users size={16} className="text-purple-500" />
              </div>
              <p className="text-sm font-medium text-gray-800">קיבולת {shelter.capacity} אנשים</p>
            </div>
          )}
          {shelter.hours && (
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-teal-50 flex items-center justify-center shrink-0">
                <Clock size={16} className="text-teal-500" />
              </div>
              <p className="text-sm font-medium text-gray-800">{shelter.hours}</p>
            </div>
          )}
          {shelter.is_accessible && (
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-sky-50 flex items-center justify-center shrink-0">
                <Wheelchair size={16} className="text-sky-500" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-800">נגיש לנכים</p>
                {shelter.accessibility_notes && <p className="text-xs text-gray-400">{shelter.accessibility_notes}</p>}
              </div>
            </div>
          )}
        </div>

        {/* ── 4. DESCRIPTION / NOTES ────────────────────────────────────────────── */}
        {shelter.notes && (
          <div className="px-5 py-4 border-b border-gray-50">
            <h2 className="text-base font-semibold text-gray-900 mb-2">פרטים נוספים</h2>
            <p className="text-sm text-gray-600 leading-relaxed">{shelter.notes}</p>
          </div>
        )}

        {/* ── WARNING (flagged) ─────────────────────────────────────────────────── */}
        {shelter.status === 'flagged' && (
          <div className="mx-5 my-3 p-4 bg-orange-50 border border-orange-200 rounded-2xl flex gap-3">
            <WarningCircle size={20} className="shrink-0 text-orange-500 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-orange-800">דווח על בעיה</p>
              <p className="text-xs text-orange-600 mt-0.5">מקלט זה דווח על ידי משתמשים. מומלץ לאמת לפני הגעה.</p>
            </div>
          </div>
        )}

        {/* ── 5. NEARBY PLACES ──────────────────────────────────────────────────── */}
        {nearby.length > 0 && (
          <div className="px-5 py-4 border-b border-gray-50">
            <h2 className="text-base font-semibold text-gray-900 mb-3">מקומות בקרבת מקום</h2>
            <div className="flex flex-col gap-2.5">
              {nearby.map((poi, i) => (
                <div key={i} className="flex items-center gap-3">
                  <span className="text-lg w-7 text-center">{poi.emoji}</span>
                  <span className="text-sm text-gray-700">{poi.name}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── 6. VERIFY ─────────────────────────────────────────────────────────── */}
        {shelter.source === 'community' && (
          <div className="px-5 py-4 border-b border-gray-50">
            <h2 className="text-base font-semibold text-gray-900 mb-1">האם המקלט הזה קיים ונגיש?</h2>
            <p className="text-xs text-gray-400 mb-3">
              {shelter.verification_count > 0
                ? `${shelter.verification_count} משתמשים אימתו`
                : 'היה הראשון לאמת'}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => handleVerify(true)}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium border transition-colors ${
                  verified === true
                    ? 'bg-emerald-500 text-white border-emerald-500'
                    : 'border-gray-200 text-gray-700 hover:bg-gray-50'
                }`}
              >
                <ThumbsUp size={16} />
                כן, קיים
              </button>
              <button
                onClick={() => handleVerify(false)}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium border transition-colors ${
                  verified === false
                    ? 'bg-red-500 text-white border-red-500'
                    : 'border-gray-200 text-gray-700 hover:bg-gray-50'
                }`}
              >
                <ThumbsDown size={16} />
                לא בטוח
              </button>
            </div>
          </div>
        )}

        {/* ── 7. RATING ─────────────────────────────────────────────────────────── */}
        <div className="px-5 py-4 border-b border-gray-50">
          <h2 className="text-base font-semibold text-gray-900 mb-1">דרג את המקלט</h2>
          {shelter.avg_rating != null && (
            <p className="text-xs text-gray-400 mb-2">
              ממוצע {Number(shelter.avg_rating).toFixed(1)} מתוך 5
              {shelter.rating_count ? ` · ${shelter.rating_count} דירוגים` : ''}
            </p>
          )}
          <div className="flex items-center gap-3">
            <StarRating value={myRating} onChange={handleRating} />
            {submittingRating && <span className="text-xs text-gray-400">שומר...</span>}
          </div>
        </div>

        {/* ── 8. COMMENTS ───────────────────────────────────────────────────────── */}
        <div className="px-5 py-4 border-b border-gray-50">
          <h2 className="text-base font-semibold text-gray-900 mb-3">
            עדכוני קהילה
            {comments.length > 0 && <span className="text-gray-400 font-normal text-sm"> ({comments.length})</span>}
          </h2>

          {/* Comment form */}
          <form onSubmit={handleComment} className="mb-4">
            <div className="flex items-start gap-3 bg-gray-50 rounded-2xl p-3">
              <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center shrink-0 text-xs font-bold text-gray-500">
                {guestName ? guestName[0].toUpperCase() : '?'}
              </div>
              <div className="flex-1">
                <Textarea
                  placeholder="שתף עדכון או הערה..."
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  className="resize-none text-sm border-0 bg-transparent p-0 shadow-none focus-visible:ring-0 min-h-[36px]"
                  rows={2}
                  maxLength={500}
                />
                {commentText.trim() && (
                  <div className="flex items-center gap-2 mt-2">
                    <input
                      type="text"
                      placeholder="שמך (אופציונלי)"
                      value={guestName}
                      onChange={(e) => setGuestName(e.target.value)}
                      className="flex-1 text-xs border border-gray-200 rounded-xl px-3 h-8 bg-white outline-none"
                      maxLength={40}
                    />
                    <Button type="submit" size="sm" disabled={submittingComment}
                      className="h-8 px-4 rounded-xl text-xs font-semibold shrink-0">
                      {submittingComment ? 'שולח...' : 'פרסם'}
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </form>

          {/* Comment list */}
          <div className="flex flex-col gap-4">
            {comments.map((c) => (
              <div key={c.id} className="flex gap-3">
                <Avatar className="h-8 w-8 shrink-0">
                  <AvatarFallback className="text-xs bg-gray-100 text-gray-600 font-semibold">
                    {(c.users?.display_name ?? (c as Comment & { guest_name?: string }).guest_name ?? '?')[0]?.toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2 mb-1">
                    <span className="text-xs font-semibold text-gray-800">
                      {c.users?.display_name ?? (c as Comment & { guest_name?: string }).guest_name ?? 'אורח'}
                    </span>
                    <span className="text-xs text-gray-400">{relativeTime(c.created_at)}</span>
                  </div>
                  <p className="text-sm text-gray-700 leading-snug">{c.content}</p>
                </div>
              </div>
            ))}
            {comments.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-2">אין תגובות עדיין — היה הראשון</p>
            )}
          </div>
        </div>

        {/* ── 9. REPORT ─────────────────────────────────────────────────────────── */}
        <div className="px-5 py-4">
          {reportSent ? (
            <p className="text-sm text-gray-400 text-center">תודה! הקהילה תבדוק את הבעיה.</p>
          ) : showReport ? (
            <form onSubmit={handleReport} className="flex flex-col gap-3">
              <h2 className="text-base font-semibold text-gray-900">מה הבעיה?</h2>
              <div className="grid grid-cols-2 gap-2">
                {REPORT_TYPES.map((t) => (
                  <button key={t.value} type="button"
                    className={`py-2.5 px-3 rounded-xl text-sm border text-right transition-colors ${
                      reportType === t.value
                        ? 'bg-gray-900 text-white border-gray-900'
                        : 'border-gray-200 text-gray-700 hover:bg-gray-50'
                    }`}
                    onClick={() => setReportType(t.value)}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              <Textarea
                placeholder="פרטים נוספים (אופציונלי)"
                value={reportDesc}
                onChange={(e) => setReportDesc(e.target.value)}
                rows={2}
                className="resize-none text-sm rounded-xl"
                maxLength={300}
              />
              <div className="flex gap-2">
                <Button type="submit" size="sm" disabled={!reportType || submittingReport}
                  className="flex-1 h-10 rounded-xl">
                  {submittingReport ? 'שולח...' : 'שלח דיווח'}
                </Button>
                <Button type="button" variant="outline" size="sm"
                  className="h-10 rounded-xl"
                  onClick={() => setShowReport(false)}>
                  ביטול
                </Button>
              </div>
            </form>
          ) : (
            <button
              className="text-sm text-gray-400 hover:text-gray-600 transition-colors flex items-center gap-1.5"
              onClick={() => setShowReport(true)}
            >
              <WarningCircle size={14} />
              דווח על בעיה במקלט
            </button>
          )}
        </div>
      </div>

      {/* ── STICKY BOTTOM ACTION BAR ──────────────────────────────────────────── */}
      <div
        className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur border-t border-gray-100 px-5 py-4"
        style={{ zIndex: 100, paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
      >
        <div className="flex items-center gap-3 max-w-lg mx-auto">
          {/* Secondary actions */}
          <button
            onClick={() => photoInputRef.current?.click()}
            className="w-12 h-12 rounded-2xl border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-50 transition-colors shrink-0"
            title="העלה תמונה"
          >
            <Camera size={20} />
          </button>
          <input
            ref={photoInputRef}
            type="file" accept="image/*" className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) { setPhotoFile(f); handlePhotoUpload() }
            }}
          />

          <button
            onClick={() => setShowReport(r => !r)}
            className="w-12 h-12 rounded-2xl border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-50 transition-colors shrink-0"
            title="דווח על בעיה"
          >
            <WarningCircle size={20} />
          </button>

          {/* Primary: navigate */}
          <div className="flex-1 relative">
            <Button
              className="w-full h-12 rounded-2xl text-base font-semibold gap-2"
              onClick={() => setShowNavPicker(p => !p)}
            >
              <NavigationArrow size={18} weight="fill" />
              נווט למקלט
            </Button>
            {showNavPicker && (
              <div className="absolute bottom-14 left-0 right-0 bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden z-10">
                <button
                  className="w-full flex items-center gap-3 px-4 py-3 text-sm text-right hover:bg-gray-50 border-b border-gray-50"
                  onClick={() => { navigateTo(shelter, 'waze'); setShowNavPicker(false) }}
                >
                  <span className="text-xl">🗺</span>
                  <span className="font-medium">Waze</span>
                </button>
                <button
                  className="w-full flex items-center gap-3 px-4 py-3 text-sm text-right hover:bg-gray-50 border-b border-gray-50"
                  onClick={() => { navigateTo(shelter, 'google'); setShowNavPicker(false) }}
                >
                  <span className="text-xl">📍</span>
                  <span className="font-medium">Google Maps</span>
                </button>
                {isIOS && (
                  <button
                    className="w-full flex items-center gap-3 px-4 py-3 text-sm text-right hover:bg-gray-50"
                    onClick={() => { navigateTo(shelter, 'apple'); setShowNavPicker(false) }}
                  >
                    <span className="text-xl">🍎</span>
                    <span className="font-medium">Apple Maps</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {photoFile && (
          <div className="max-w-lg mx-auto mt-2 flex items-center justify-between text-xs text-gray-500 bg-gray-50 rounded-xl px-3 py-2">
            <span>📎 {photoFile.name}</span>
            <button onClick={handlePhotoUpload} disabled={uploadingPhoto}
              className="text-blue-600 font-medium">
              {uploadingPhoto ? 'מעלה...' : 'העלה'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
