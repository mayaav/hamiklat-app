/**
 * Vercel Cron Job — weekly OSM shelter sync
 * Schedule: every Sunday at 03:00 UTC (defined in vercel.json)
 *
 * Protected by CRON_SECRET env var.
 * Vercel automatically sends Authorization: Bearer <CRON_SECRET> on cron invocations.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const ISRAEL_BBOX = '29.4,34.2,33.4,35.9'

const QUERIES = {
  shelters: `
    [out:json][timeout:60];
    (
      node["amenity"="shelter"](${ISRAEL_BBOX});
      way["amenity"="shelter"](${ISRAEL_BBOX});
      node["bunker_type"](${ISRAEL_BBOX});
      node["shelter_type"="public"](${ISRAEL_BBOX});
      node["military"="bunker"](${ISRAEL_BBOX});
    );
    out center tags;
  `,
  stations: `
    [out:json][timeout:60];
    (
      node["railway"="station"](${ISRAEL_BBOX});
      node["railway"="subway_entrance"](${ISRAEL_BBOX});
      way["railway"="station"](${ISRAEL_BBOX});
    );
    out center tags;
  `,
  malls: `
    [out:json][timeout:60];
    (
      node["shop"="mall"](${ISRAEL_BBOX});
      way["shop"="mall"](${ISRAEL_BBOX});
      relation["shop"="mall"](${ISRAEL_BBOX});
    );
    out center tags;
  `,
  parking: `
    [out:json][timeout:60];
    (
      way["amenity"="parking"]["parking"="underground"](${ISRAEL_BBOX});
      node["amenity"="parking"]["parking"="underground"](${ISRAEL_BBOX});
    );
    out center tags;
  `,
  community: `
    [out:json][timeout:60];
    (
      node["amenity"="community_centre"](${ISRAEL_BBOX});
      way["amenity"="community_centre"](${ISRAEL_BBOX});
      node["amenity"="townhall"](${ISRAEL_BBOX});
      way["amenity"="townhall"](${ISRAEL_BBOX});
    );
    out center tags;
  `,
}

type QueryType = keyof typeof QUERIES

const OVERPASS_MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
]

async function fetchOverpass(query: string): Promise<Record<string, unknown>[]> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const url = OVERPASS_MIRRORS[attempt % OVERPASS_MIRRORS.length]
    if (attempt > 0) await new Promise(r => setTimeout(r, attempt * 10000))
    try {
      const res = await fetch(url, {
        method: 'POST',
        body: `data=${encodeURIComponent(query)}`,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      })
      if (!res.ok) continue
      const text = await res.text()
      if (text.trim().startsWith('<')) continue
      const json = JSON.parse(text) as { elements: Record<string, unknown>[] }
      return json.elements
    } catch { continue }
  }
  throw new Error('All Overpass attempts failed')
}

function getCoords(el: Record<string, unknown>) {
  if (el.type === 'node') return { lat: el.lat as number, lng: el.lon as number }
  const center = el.center as { lat: number; lon: number } | undefined
  if (center) return { lat: center.lat, lng: center.lon }
  return null
}

function buildShelter(type: QueryType, el: Record<string, unknown>) {
  const tags = (el.tags ?? {}) as Record<string, string>
  const name = tags['name:he'] ?? tags.name ?? tags['name:en'] ?? null
  const city = tags['addr:city'] ?? tags['addr:town'] ?? tags['addr:village'] ?? ''
  const address = [tags['addr:street'], tags['addr:housenumber']].filter(Boolean).join(' ') || tags['addr:full'] || ''

  const configs: Record<QueryType, { name: string; shelter_type: string; notes: string | null; is_accessible: boolean }> = {
    shelters:  { name: name ?? 'מקלט ציבורי',     shelter_type: 'public_shelter',   notes: [tags.description, tags.capacity ? `קיבולת: ${tags.capacity}` : null].filter(Boolean).join(' | ') || null, is_accessible: tags.wheelchair === 'yes' },
    stations:  { name: name ?? 'תחנת רכבת',       shelter_type: 'other',            notes: 'תחנת רכבת — משמשת כמקלט בשעת אזעקה', is_accessible: tags.wheelchair === 'yes' },
    malls:     { name: name ?? 'קניון',            shelter_type: 'other',            notes: 'קניון — כניסה לקומות תת-קרקעיות בשעת אזעקה', is_accessible: true },
    parking:   { name: name ?? 'חניון תת-קרקעי',  shelter_type: 'building_shelter', notes: 'חניון תת-קרקעי — ניתן להשתמש כמקלט', is_accessible: tags.wheelchair === 'yes' },
    community: { name: name ?? 'מרכז קהילתי',     shelter_type: 'public_shelter',   notes: 'מרכז קהילתי — בדוק זמינות בשעת חירום', is_accessible: tags.wheelchair === 'yes' },
  }

  return { ...configs[type], city, address, source: 'official' as const, status: 'unverified' as const, official_source_id: `osm-${el.type}-${el.id}` }
}

async function syncType(type: QueryType): Promise<number> {
  const elements = await fetchOverpass(QUERIES[type])
  let upserted = 0

  const rows = []
  for (const el of elements) {
    const coords = getCoords(el)
    if (!coords) continue
    const s = buildShelter(type, el)
    if (!s.city && !s.address && s.name.startsWith('מקלט')) continue
    rows.push({ ...s, lat: coords.lat, lng: coords.lng })
  }

  // Upsert in batches of 100 — conflict on official_source_id updates existing rows
  for (let i = 0; i < rows.length; i += 100) {
    const { error, count } = await supabase
      .from('shelters')
      .upsert(rows.slice(i, i + 100), { onConflict: 'official_source_id', count: 'exact' })
    if (!error) upserted += count ?? 0
  }

  return upserted
}

export async function GET(req: NextRequest) {
  // Verify Vercel cron secret
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const results: Record<string, number | string> = {}

  for (const type of ['shelters', 'stations', 'malls', 'parking', 'community'] as QueryType[]) {
    try {
      results[type] = await syncType(type)
      // Respect Overpass rate limit
      await new Promise(r => setTimeout(r, 2000))
    } catch (e) {
      results[type] = `error: ${e instanceof Error ? e.message : String(e)}`
    }
  }

  console.log('[cron/sync-osm]', results)
  return NextResponse.json({ ok: true, synced: results, at: new Date().toISOString() })
}
