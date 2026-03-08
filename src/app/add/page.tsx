'use client'

import { useState, useRef, useCallback, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import dynamic from 'next/dynamic'
import { CaretRight, MapPin, CheckCircle, Warning } from '@phosphor-icons/react'
import type { Shelter } from '@/types'

const PinDropMap = dynamic(() => import('@/components/map/PinDropMap'), { ssr: false })

// ─── Types ────────────────────────────────────────────────────────────────────

type Step = 'location' | 'type' | 'details' | 'extras' | 'review' | 'success'

interface FormData {
  lat: number | null
  lng: number | null
  address: string
  city: string
  shelterType: string
  name: string
  floor: string
  capacity: string
  isAccessible: boolean
  accessibilityNotes: string
  hours: string
  notes: string
  photo: File | null
}

// ─── Category options ─────────────────────────────────────────────────────────

const SHELTER_TYPES = [
  { value: 'public_shelter',      emoji: '🛡️', label: 'מקלט ציבורי',       sub: 'בניין ייעודי עם שלט' },
  { value: 'mamad',               emoji: '🏠', label: 'ממ"ד',               sub: 'חדר ביטחון בדירה' },
  { value: 'building_shelter',    emoji: '🏢', label: 'מקלט בניין',         sub: 'קומת קרקע / מרתף' },
  { value: 'underground_parking', emoji: '🅿️', label: 'חניון תת-קרקעי',    sub: 'קומות מתחת לאדמה' },
  { value: 'stairwell',           emoji: '🪜', label: 'חדר מדרגות',         sub: 'גרם מדרגות פנימי' },
  { value: 'other',               emoji: '📍', label: 'מקום מוגן אחר',      sub: 'כל מבנה חזק אחר' },
]

const STEPS: Step[] = ['location', 'type', 'details', 'extras', 'review']

const STEP_TITLES: Record<Step, string> = {
  location: 'איפה המקלט?',
  type:     'איזה סוג?',
  details:  'פרטים בסיסיים',
  extras:   'מידע נוסף',
  review:   'הכל נראה טוב?',
  success:  '',
}

// ─── Progress bar ─────────────────────────────────────────────────────────────

function ProgressBar({ step }: { step: Step }) {
  if (step === 'success') return null
  const current = STEPS.indexOf(step) + 1
  return (
    <div className="flex gap-1.5 px-4 pt-1 pb-2">
      {STEPS.map((_, i) => (
        <div
          key={i}
          className="h-1 flex-1 rounded-full transition-all duration-300"
          style={{ background: i < current ? '#1c1c1c' : '#e5e7eb' }}
        />
      ))}
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

function AddShelterPageInner() {
  const router = useRouter()
  const params = useSearchParams()
  const presetLat = params.get('lat') ? parseFloat(params.get('lat')!) : null
  const presetLng = params.get('lng') ? parseFloat(params.get('lng')!) : null

  const [step, setStep] = useState<Step>(presetLat && presetLng ? 'type' : 'location')
  const [form, setForm] = useState<FormData>({
    lat: presetLat, lng: presetLng, address: '', city: '',
    shelterType: '', name: '', floor: '', capacity: '',
    isAccessible: false, accessibilityNotes: '',
    hours: '', notes: '', photo: null,
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [duplicates, setDuplicates] = useState<Shelter[]>([])
  const [newShelterId, setNewShelterId] = useState<string | null>(null)

  const update = useCallback(<K extends keyof FormData>(key: K, value: FormData[K]) => {
    setForm(prev => ({ ...prev, [key]: value }))
  }, [])

  const goBack = () => {
    const i = STEPS.indexOf(step)
    if (i > 0) setStep(STEPS[i - 1])
    else router.back()
  }

  const goNext = () => {
    const i = STEPS.indexOf(step)
    if (i < STEPS.length - 1) setStep(STEPS[i + 1])
  }

  const checkDuplicates = async () => {
    if (!form.lat || !form.lng) return
    const d = 0.003
    try {
      const res = await fetch(
        `/api/shelters?bbox=${form.lat - d},${form.lng - d},${form.lat + d},${form.lng + d}`
      )
      if (res.ok) setDuplicates(await res.json())
    } catch { /* silent */ }
  }

  const handleSubmit = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/shelters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          address: form.address,
          city: form.city,
          lat: form.lat,
          lng: form.lng,
          shelter_type: form.shelterType || null,
          floor: form.floor || null,
          capacity: form.capacity ? Number(form.capacity) : null,
          is_accessible: form.isAccessible,
          accessibility_notes: form.accessibilityNotes || null,
          hours: form.hours || null,
          notes: form.notes || null,
        }),
      })
      if (!res.ok) {
        const d = await res.json()
        setError(d.error ?? 'שגיאה בשמירה')
        setLoading(false)
        return
      }
      const shelter = await res.json()
      if (form.photo) {
        const fd = new FormData()
        fd.append('file', form.photo)
        await fetch(`/api/shelters/${shelter.id}/photos`, { method: 'POST', body: fd })
      }
      setNewShelterId(shelter.id)
      setStep('success')
    } catch {
      setError('שגיאת רשת, נסה שוב')
    }
    setLoading(false)
  }

  if (step === 'success') return (
    <SuccessScreen
      onBack={() => router.push('/')}
      onView={() => newShelterId && router.push(`/shelter/${newShelterId}`)}
    />
  )

  return (
    <div className="min-h-screen bg-white flex flex-col max-w-lg mx-auto">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white border-b">
        <div className="flex items-center gap-3 px-4 py-3">
          <button onClick={goBack} className="p-1 -mr-1 text-gray-500">
            <CaretRight size={22} />
          </button>
          <span className="font-semibold text-gray-900">{STEP_TITLES[step]}</span>
          <span className="mr-auto text-xs text-gray-400">
            {STEPS.indexOf(step) + 1} / {STEPS.length}
          </span>
        </div>
        <ProgressBar step={step} />
      </div>

      {/* Steps */}
      <div className="flex-1">
        {step === 'location' && <LocationStep form={form} update={update} onNext={goNext} />}
        {step === 'type'     && <TypeStep     form={form} update={update} onNext={goNext} />}
        {step === 'details'  && <DetailsStep  form={form} update={update} onNext={goNext} />}
        {step === 'extras'   && <ExtrasStep   form={form} update={update} onNext={goNext} />}
        {step === 'review'   && (
          <ReviewStep
            form={form}
            duplicates={duplicates}
            loading={loading}
            error={error}
            onMount={checkDuplicates}
            onSubmit={handleSubmit}
            onEdit={setStep}
          />
        )}
      </div>
    </div>
  )
}

export default function AddShelterPage() {
  return (
    <Suspense>
      <AddShelterPageInner />
    </Suspense>
  )
}

// ─── Step: Location ───────────────────────────────────────────────────────────

function LocationStep({ form, update, onNext }: {
  form: FormData
  update: <K extends keyof FormData>(k: K, v: FormData[K]) => void
  onNext: () => void
}) {
  const [addrQuery, setAddrQuery] = useState(form.address || '')
  const [results, setResults] = useState<{ display_name: string; lat: string; lon: string; address?: Record<string, string> }[]>([])
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const search = (q: string) => {
    setAddrQuery(q)
    clearTimeout(timer.current)
    if (q.length < 2) { setResults([]); return }
    timer.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&countrycodes=il&limit=5&addressdetails=1`,
          { headers: { 'Accept-Language': 'he' } }
        )
        setResults(await res.json())
      } catch { /* silent */ }
    }, 400)
  }

  const pick = (r: typeof results[0]) => {
    const lat = parseFloat(r.lat), lng = parseFloat(r.lon)
    update('lat', lat); update('lng', lng)
    update('address', r.display_name.split(',')[0])
    update('city', r.address?.city ?? r.address?.town ?? r.address?.village ?? '')
    setAddrQuery(r.display_name.split(',').slice(0, 2).join(', '))
    setResults([])
  }

  const locateMe = () => {
    navigator.geolocation?.getCurrentPosition(async (pos) => {
      const { latitude: lat, longitude: lng } = pos.coords
      update('lat', lat); update('lng', lng)
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&addressdetails=1`,
          { headers: { 'Accept-Language': 'he' } }
        )
        const d = await res.json()
        update('address', d.address?.road ?? '')
        update('city', d.address?.city ?? d.address?.town ?? d.address?.village ?? '')
        setAddrQuery(d.display_name?.split(',').slice(0, 2).join(', ') ?? '')
      } catch { /* silent */ }
    })
  }

  return (
    <div className="flex flex-col">
      <div className="px-4 py-4 flex flex-col gap-3">
        <div className="relative">
          <input
            className="w-full h-12 rounded-2xl border border-gray-200 bg-gray-50 px-4 pr-10 text-base outline-none focus:border-gray-400 focus:bg-white transition-colors"
            placeholder="חפש כתובת, שכונה, עיר..."
            value={addrQuery}
            onChange={e => search(e.target.value)}
            dir="rtl"
          />
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">🔍</span>
          {results.length > 0 && (
            <div className="absolute top-full mt-1 w-full bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden z-20">
              {results.map(r => (
                <button
                  key={r.lat + r.lon}
                  type="button"
                  className="w-full text-right px-4 py-3 text-sm hover:bg-gray-50 border-b border-gray-50 last:border-0"
                  onClick={() => pick(r)}
                >
                  {r.display_name}
                </button>
              ))}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={locateMe}
          className="flex items-center gap-2 text-sm text-blue-600 font-medium self-start"
        >
          <MapPin size={16} weight="fill" />
          השתמש במיקום הנוכחי שלי
        </button>
      </div>

      {/* Map */}
      <div className="mx-4 rounded-3xl overflow-hidden border border-gray-100 shadow-sm" style={{ height: 300 }}>
        {form.lat && form.lng ? (
          <PinDropMap
            lat={form.lat} lng={form.lng}
            onChange={(lat, lng) => { update('lat', lat); update('lng', lng) }}
          />
        ) : (
          <div className="w-full h-full bg-gray-50 flex flex-col items-center justify-center gap-2">
            <span className="text-4xl">🗺️</span>
            <p className="text-sm text-gray-400">חפש כתובת או השתמש במיקום הנוכחי</p>
          </div>
        )}
      </div>

      {form.lat && form.lng && (
        <div className="px-4 pt-3 flex items-center gap-2 text-sm text-gray-500">
          <MapPin size={14} />
          <span className="truncate">{form.address || 'מיקום נבחר'}{form.city ? `, ${form.city}` : ''}</span>
        </div>
      )}

      <StickyBottom>
        <CTA label="המשך" disabled={form.lat == null} onClick={onNext} />
      </StickyBottom>
    </div>
  )
}

// ─── Step: Type ───────────────────────────────────────────────────────────────

function TypeStep({ form, update, onNext }: {
  form: FormData
  update: <K extends keyof FormData>(k: K, v: FormData[K]) => void
  onNext: () => void
}) {
  return (
    <div className="px-4 py-5 flex flex-col gap-4">
      <p className="text-sm text-gray-500">בחר את הסוג הקרוב ביותר</p>
      <div className="grid grid-cols-2 gap-3">
        {SHELTER_TYPES.map(t => {
          const selected = form.shelterType === t.value
          return (
            <button
              key={t.value}
              type="button"
              onClick={() => { update('shelterType', t.value); setTimeout(onNext, 180) }}
              className={`flex flex-col items-start gap-1.5 p-4 rounded-2xl border-2 text-right transition-all active:scale-[0.97] ${
                selected
                  ? 'border-gray-900 bg-gray-900 text-white shadow-md'
                  : 'border-gray-100 bg-gray-50 text-gray-800'
              }`}
            >
              <span className="text-2xl">{t.emoji}</span>
              <span className="font-semibold text-sm leading-tight">{t.label}</span>
              <span className={`text-xs leading-tight ${selected ? 'text-gray-300' : 'text-gray-400'}`}>{t.sub}</span>
            </button>
          )
        })}
      </div>
      <StickyBottom>
        <CTA label="המשך" disabled={!form.shelterType} onClick={onNext} />
      </StickyBottom>
    </div>
  )
}

// ─── Step: Details ────────────────────────────────────────────────────────────

function DetailsStep({ form, update, onNext }: {
  form: FormData
  update: <K extends keyof FormData>(k: K, v: FormData[K]) => void
  onNext: () => void
}) {
  const typeName = SHELTER_TYPES.find(t => t.value === form.shelterType)?.label ?? 'מקלט'

  return (
    <div className="px-4 py-5 flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium text-gray-700">שם המקלט *</label>
        <input
          className="h-12 rounded-2xl border border-gray-200 bg-gray-50 px-4 text-base outline-none focus:border-gray-400 focus:bg-white transition-colors"
          placeholder={`${typeName} – ${form.address || 'כתובת'}`}
          value={form.name}
          onChange={e => update('name', e.target.value)}
          dir="rtl"
        />
        <p className="text-xs text-gray-400">שם שיעזור לאנשים לזהות אותו</p>
      </div>

      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium text-gray-700">עיר *</label>
        <input
          className="h-12 rounded-2xl border border-gray-200 bg-gray-50 px-4 text-base outline-none focus:border-gray-400 focus:bg-white transition-colors"
          placeholder="תל אביב, ירושלים..."
          value={form.city}
          onChange={e => update('city', e.target.value)}
          dir="rtl"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-gray-700">קומה</label>
          <input
            className="h-12 rounded-2xl border border-gray-200 bg-gray-50 px-4 text-sm outline-none focus:border-gray-400 focus:bg-white transition-colors"
            placeholder="מרתף, -1..."
            value={form.floor}
            onChange={e => update('floor', e.target.value)}
            dir="rtl"
          />
        </div>
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-gray-700">קיבולת</label>
          <input
            type="number"
            className="h-12 rounded-2xl border border-gray-200 bg-gray-50 px-4 text-sm outline-none focus:border-gray-400 focus:bg-white transition-colors"
            placeholder="כמה אנשים?"
            value={form.capacity}
            onChange={e => update('capacity', e.target.value)}
          />
        </div>
      </div>

      <StickyBottom>
        <CTA label="המשך" disabled={!form.name.trim() || !form.city.trim()} onClick={onNext} />
      </StickyBottom>
    </div>
  )
}

// ─── Step: Extras ─────────────────────────────────────────────────────────────

function ExtrasStep({ form, update, onNext }: {
  form: FormData
  update: <K extends keyof FormData>(k: K, v: FormData[K]) => void
  onNext: () => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)

  return (
    <div className="px-4 py-5 flex flex-col gap-5">
      <p className="text-sm text-gray-400">כל השדות כאן אופציונליים — אפשר לדלג</p>

      <div
        className={`flex items-center gap-4 p-4 rounded-2xl border-2 cursor-pointer transition-all select-none ${
          form.isAccessible ? 'border-blue-500 bg-blue-50' : 'border-gray-100 bg-gray-50'
        }`}
        onClick={() => update('isAccessible', !form.isAccessible)}
      >
        <span className="text-2xl">♿</span>
        <div className="flex-1">
          <p className="font-medium text-sm">נגיש לנכים / כסאות גלגלים</p>
          <p className="text-xs text-gray-400 mt-0.5">כניסה מותאמת, ללא מדרגות</p>
        </div>
        <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${
          form.isAccessible ? 'border-blue-500 bg-blue-500' : 'border-gray-300'
        }`}>
          {form.isAccessible && <span className="text-white text-xs font-bold">✓</span>}
        </div>
      </div>

      {form.isAccessible && (
        <input
          className="h-12 rounded-2xl border border-gray-200 bg-gray-50 px-4 text-sm outline-none focus:border-gray-400 focus:bg-white transition-colors"
          placeholder="כניסה מהצד, מעלית זמינה..."
          value={form.accessibilityNotes}
          onChange={e => update('accessibilityNotes', e.target.value)}
          dir="rtl"
        />
      )}

      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium text-gray-700">שעות פתיחה</label>
        <input
          className="h-12 rounded-2xl border border-gray-200 bg-gray-50 px-4 text-sm outline-none focus:border-gray-400 focus:bg-white transition-colors"
          placeholder="24/7, ימי חול 6:00–22:00..."
          value={form.hours}
          onChange={e => update('hours', e.target.value)}
          dir="rtl"
        />
      </div>

      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium text-gray-700">הערות</label>
        <textarea
          className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none focus:border-gray-400 focus:bg-white transition-colors resize-none"
          placeholder="טיפים לאיתור המקלט, פרטים שיעזרו..."
          value={form.notes}
          onChange={e => update('notes', e.target.value)}
          rows={3}
          dir="rtl"
        />
      </div>

      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium text-gray-700">תמונה</label>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={e => update('photo', e.target.files?.[0] ?? null)}
        />
        {form.photo ? (
          <div className="flex items-center gap-3 p-3 rounded-2xl border border-gray-200 bg-gray-50">
            <img
              src={URL.createObjectURL(form.photo)}
              alt=""
              className="w-14 h-14 rounded-xl object-cover shrink-0"
            />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{form.photo.name}</p>
              <p className="text-xs text-gray-400">{(form.photo.size / 1024 / 1024).toFixed(1)} MB</p>
            </div>
            <button onClick={() => update('photo', null)} className="text-gray-400 text-xl leading-none shrink-0">×</button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="h-20 rounded-2xl border-2 border-dashed border-gray-200 flex flex-col items-center justify-center gap-1 text-gray-400 hover:border-gray-300 transition-colors"
          >
            <span className="text-xl">📷</span>
            <span className="text-xs">הוסף תמונה (אופציונלי)</span>
          </button>
        )}
      </div>

      <div style={{ height: 100 }} />
      <StickyBottom>
        <CTA label="המשך לסקירה" onClick={onNext} />
      </StickyBottom>
    </div>
  )
}

// ─── Step: Review ─────────────────────────────────────────────────────────────

function ReviewStep({ form, duplicates, loading, error, onMount, onSubmit, onEdit }: {
  form: FormData
  duplicates: Shelter[]
  loading: boolean
  error: string
  onMount: () => void
  onSubmit: () => void
  onEdit: (s: Step) => void
}) {
  const type = SHELTER_TYPES.find(t => t.value === form.shelterType)
  useEffect(() => { onMount() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="px-4 py-5 flex flex-col gap-4">
      <p className="text-sm text-gray-500">בדוק שהכל נכון לפני שמירה</p>

      {duplicates.length > 0 && (
        <div className="flex items-start gap-3 p-4 rounded-2xl bg-amber-50 border border-amber-200">
          <Warning size={20} weight="fill" className="text-amber-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-amber-800">אולי כבר קיים?</p>
            <p className="text-xs text-amber-700 mt-0.5">נמצאו {duplicates.length} מקלטים ב-300 מטר:</p>
            {duplicates.slice(0, 2).map(d => (
              <p key={d.id} className="text-xs text-amber-700 mt-1">• {d.name}</p>
            ))}
            <p className="text-xs text-amber-600 mt-1.5">אם זה מקלט שונה — המשך בכל מקרה.</p>
          </div>
        </div>
      )}

      <ReviewCard emoji="📍" label="מיקום" onEdit={() => onEdit('location')}>
        <p className="text-sm text-gray-800">{form.address}</p>
        {form.city && <p className="text-xs text-gray-400 mt-0.5">{form.city}</p>}
      </ReviewCard>

      <ReviewCard emoji={type?.emoji ?? '🏠'} label="סוג" onEdit={() => onEdit('type')}>
        <p className="text-sm text-gray-800">{type?.label ?? form.shelterType}</p>
      </ReviewCard>

      <ReviewCard emoji="📝" label="פרטים" onEdit={() => onEdit('details')}>
        <p className="text-sm font-medium text-gray-800">{form.name}</p>
        {form.floor && <p className="text-xs text-gray-400 mt-0.5">קומה: {form.floor}</p>}
        {form.capacity && <p className="text-xs text-gray-400">קיבולת: {form.capacity} אנשים</p>}
      </ReviewCard>

      {(form.isAccessible || form.hours || form.notes || form.photo) && (
        <ReviewCard emoji="ℹ️" label="מידע נוסף" onEdit={() => onEdit('extras')}>
          {form.isAccessible && <p className="text-xs text-gray-600">♿ נגיש לנכים</p>}
          {form.hours && <p className="text-xs text-gray-600 mt-0.5">⏰ {form.hours}</p>}
          {form.notes && <p className="text-xs text-gray-600 mt-0.5 line-clamp-2">{form.notes}</p>}
          {form.photo && <p className="text-xs text-gray-600 mt-0.5">📷 תמונה מצורפת</p>}
        </ReviewCard>
      )}

      {error && (
        <div className="p-3 rounded-2xl bg-red-50 border border-red-100 text-sm text-red-600">{error}</div>
      )}

      <div style={{ height: 100 }} />
      <StickyBottom>
        <CTA label={loading ? 'שומר...' : 'הוסף את המקלט 🏠'} disabled={loading} onClick={onSubmit} />
      </StickyBottom>
    </div>
  )
}

function ReviewCard({ emoji, label, onEdit, children }: {
  emoji: string; label: string; onEdit: () => void; children: React.ReactNode
}) {
  return (
    <div className="flex items-start gap-3 p-4 rounded-2xl bg-gray-50 border border-gray-100">
      <span className="text-xl shrink-0">{emoji}</span>
      <div className="flex-1 min-w-0">{children}</div>
      <button onClick={onEdit} className="text-xs text-blue-600 shrink-0 font-medium pt-0.5">עריכה</button>
    </div>
  )
}

// ─── Success screen ───────────────────────────────────────────────────────────

function SuccessScreen({ onBack, onView }: { onBack: () => void; onView: () => void }) {
  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center px-6 text-center gap-6">
      <div className="relative">
        <div className="text-7xl animate-bounce">🏠</div>
        <div className="absolute -top-1 -right-1 text-2xl">✨</div>
      </div>
      <div className="flex flex-col gap-2">
        <h2 className="text-2xl font-bold text-gray-900">המקלט נוסף!</h2>
        <p className="text-gray-500 text-sm leading-relaxed max-w-xs">
          תודה על התרומה לקהילה. כשחמישה אנשים יאמתו אותו הוא יסומן כ"מאומת".
        </p>
      </div>
      <div className="flex items-center gap-3 bg-amber-50 border border-amber-100 rounded-2xl px-5 py-3 max-w-xs w-full">
        <CheckCircle size={20} weight="fill" className="text-amber-500 shrink-0" />
        <p className="text-sm text-amber-800 font-medium text-right">אתה חלק מרשת ההגנה הקהילתית 🇮🇱</p>
      </div>
      <div className="flex flex-col gap-3 w-full max-w-xs">
        <button
          onClick={onView}
          className="w-full rounded-2xl bg-gray-900 text-white font-semibold text-base py-4"
        >
          צפה במקלט שהוספת
        </button>
        <button
          onClick={onBack}
          className="w-full rounded-2xl border border-gray-200 text-gray-600 font-medium text-base py-4"
        >
          חזור למפה
        </button>
      </div>
    </div>
  )
}

// ─── Shared UI ────────────────────────────────────────────────────────────────

function StickyBottom({ children }: { children: React.ReactNode }) {
  return (
    <div className="sticky bottom-0 bg-white/95 backdrop-blur border-t border-gray-100 px-4 py-4">
      {children}
    </div>
  )
}

function CTA({ label, disabled, onClick }: { label: string; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`w-full py-4 rounded-2xl font-semibold text-base transition-all ${
        disabled
          ? 'bg-gray-100 text-gray-300 cursor-not-allowed'
          : 'bg-gray-900 text-white active:scale-[0.98]'
      }`}
    >
      {label}
    </button>
  )
}
