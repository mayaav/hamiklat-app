/**
 * OSM Overpass API seeder
 *
 * Pulls shelter-related locations from OpenStreetMap for all of Israel:
 * - Declared public shelters (amenity=shelter)
 * - Underground/parking locations that function as shelters
 * - Train stations (often used as shelters during alerts)
 * - Shopping malls (large buildings people shelter in)
 * - Community centers, municipal buildings
 *
 * All OSM data is ODbL licensed (free, open).
 * Overpass API is free with no key required.
 *
 * Run:
 *   npx tsx scripts/seed-osm-shelters.ts
 *   npx tsx scripts/seed-osm-shelters.ts --type=shelters
 *   npx tsx scripts/seed-osm-shelters.ts --type=stations
 *   npx tsx scripts/seed-osm-shelters.ts --type=malls
 *   npx tsx scripts/seed-osm-shelters.ts --dry-run
 */

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Overpass mirrors — tried in order

// Israel bounding box
const ISRAEL_BBOX = '29.4,34.2,33.4,35.9'

// ─────────────────────────────────────────────
// QUERY DEFINITIONS
// Each query targets a different type of shelter
// ─────────────────────────────────────────────

const QUERIES = {
  // Explicitly tagged public shelters / mamadim
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

  // Train / metro stations — commonly used during alerts
  stations: `
    [out:json][timeout:60];
    (
      node["railway"="station"](${ISRAEL_BBOX});
      node["railway"="subway_entrance"](${ISRAEL_BBOX});
      way["railway"="station"](${ISRAEL_BBOX});
    );
    out center tags;
  `,

  // Shopping malls and large commercial buildings
  malls: `
    [out:json][timeout:60];
    (
      node["shop"="mall"](${ISRAEL_BBOX});
      way["shop"="mall"](${ISRAEL_BBOX});
      relation["shop"="mall"](${ISRAEL_BBOX});
    );
    out center tags;
  `,

  // Underground parking (often used as shelter)
  parking: `
    [out:json][timeout:60];
    (
      way["amenity"="parking"]["parking"="underground"](${ISRAEL_BBOX});
      node["amenity"="parking"]["parking"="underground"](${ISRAEL_BBOX});
    );
    out center tags;
  `,

  // Community centers and municipal buildings
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

// ─────────────────────────────────────────────
// TYPE → shelter config mapping
// ─────────────────────────────────────────────

function getShelterConfig(type: QueryType, tags: Record<string, string>) {
  const name =
    tags['name:he'] ??          // Hebrew name first
    tags.name ??
    tags['name:en'] ??
    null

  const city =
    tags['addr:city'] ??
    tags['addr:town'] ??
    tags['addr:village'] ??
    ''

  const address =
    [tags['addr:street'], tags['addr:housenumber']].filter(Boolean).join(' ') ||
    tags['addr:full'] ||
    ''

  switch (type) {
    case 'shelters':
      return {
        name: name ?? 'מקלט ציבורי',
        shelter_type: 'public_shelter' as const,
        notes: [
          tags.description,
          tags['shelter_type'] ? `סוג: ${tags['shelter_type']}` : null,
          tags.capacity ? `קיבולת: ${tags.capacity}` : null,
        ].filter(Boolean).join(' | ') || null,
        is_accessible: tags['wheelchair'] === 'yes',
        city,
        address,
      }

    case 'stations':
      return {
        name: name ?? 'תחנת רכבת',
        shelter_type: 'other' as const,
        notes: `תחנת רכבת — משמשת כמקלט בשעת אזעקה`,
        is_accessible: tags['wheelchair'] === 'yes',
        city,
        address,
      }

    case 'malls':
      return {
        name: name ?? 'קניון',
        shelter_type: 'other' as const,
        notes: `קניון — כניסה לקומות תת-קרקעיות בשעת אזעקה`,
        is_accessible: true, // malls are generally accessible
        city,
        address,
      }

    case 'parking':
      return {
        name: name ?? 'חניון תת-קרקעי',
        shelter_type: 'building_shelter' as const,
        notes: `חניון תת-קרקעי — ניתן להשתמש כמקלט`,
        is_accessible: tags['wheelchair'] === 'yes',
        city,
        address,
      }

    case 'community':
      return {
        name: name ?? 'מרכז קהילתי',
        shelter_type: 'public_shelter' as const,
        notes: `מרכז קהילתי — בדוק זמינות בשעת חירום`,
        is_accessible: tags['wheelchair'] === 'yes',
        city,
        address,
      }
  }
}

// ─────────────────────────────────────────────
// FETCH + IMPORT
// ─────────────────────────────────────────────

const OVERPASS_MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
]

async function fetchOverpass(query: string): Promise<unknown[]> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const url = OVERPASS_MIRRORS[attempt % OVERPASS_MIRRORS.length]
    if (attempt > 0) {
      const wait = attempt * 10000
      console.log(`  Retry ${attempt} in ${wait / 1000}s (using ${url})...`)
      await new Promise(r => setTimeout(r, wait))
    } else {
      console.log(`  Querying Overpass API (${url})...`)
    }
    try {
      const res = await fetch(url, {
        method: 'POST',
        body: `data=${encodeURIComponent(query)}`,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'hamiklat-app/1.0 (shelter finder for Israel)',
        },
      })
      if (!res.ok) {
        console.log(`  HTTP ${res.status} — will retry`)
        continue
      }
      const text = await res.text()
      if (text.trim().startsWith('<')) {
        console.log('  Got XML response (error) — will retry')
        continue
      }
      const json = JSON.parse(text) as { elements: unknown[] }
      return json.elements
    } catch (e) {
      console.log(`  Fetch error: ${e} — will retry`)
    }
  }
  throw new Error('All Overpass attempts failed')
}

function getCoords(el: Record<string, unknown>): { lat: number; lng: number } | null {
  if (el.type === 'node') {
    return { lat: el.lat as number, lng: el.lon as number }
  }
  // way/relation — use center
  const center = el.center as { lat: number; lon: number } | undefined
  if (center) return { lat: center.lat, lng: center.lon }
  return null
}

async function importType(type: QueryType, dryRun: boolean) {
  console.log(`\n── ${type.toUpperCase()} ──`)
  const elements = await fetchOverpass(QUERIES[type])
  console.log(`  Found ${elements.length} elements`)

  const shelters = []

  for (const el of elements as Record<string, unknown>[]) {
    const coords = getCoords(el)
    if (!coords) continue

    const tags = (el.tags ?? {}) as Record<string, string>
    const config = getShelterConfig(type, tags)

    // Skip if no name AND no address — not useful
    if (!config.city && !config.address && config.name.startsWith('מקלט')) continue

    shelters.push({
      ...config,
      lat: coords.lat,
      lng: coords.lng,
      source: 'community' as const,
      status: type === 'shelters' ? 'unverified' as const : 'unverified' as const,
      official_source_id: `osm-${el.type}-${el.id}`,
    })
  }

  console.log(`  Prepared ${shelters.length} shelters to insert`)

  if (dryRun) {
    console.log('  [DRY RUN] Sample:', JSON.stringify(shelters[0], null, 2))
    return
  }

  // Insert in batches of 100, skip duplicates via official_source_id check
  let inserted = 0
  for (let i = 0; i < shelters.length; i += 100) {
    const batch = shelters.slice(i, i + 100)
    const { error, count } = await supabase
      .from('shelters')
      .insert(batch, { count: 'exact' })
      .select()

    if (error) {
      if (error.code === '23505') {
        // Duplicate — insert one-by-one and skip dupes
        for (const s of batch) {
          const { error: e2 } = await supabase.from('shelters').insert(s)
          if (!e2) inserted++
        }
      } else {
        console.error(`  Batch ${Math.floor(i / 100) + 1} error:`, error.message)
      }
    } else {
      inserted += count ?? batch.length
    }
  }

  console.log(`  ✓ Inserted/updated ${inserted} shelters`)
}

// ─────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')
  const typeArg = args.find((a) => a.startsWith('--type='))?.split('=')[1] as QueryType | undefined

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
    process.exit(1)
  }

  if (dryRun) console.log('DRY RUN — no data will be written\n')

  const typesToRun: QueryType[] = typeArg
    ? [typeArg]
    : ['shelters', 'stations', 'malls', 'parking', 'community']

  for (const type of typesToRun) {
    await importType(type, dryRun)
    // Rate limit: Overpass asks for ~1 request per 2s
    if (typesToRun.indexOf(type) < typesToRun.length - 1) {
      await new Promise((r) => setTimeout(r, 2000))
    }
  }

  console.log('\nDone.')
  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
