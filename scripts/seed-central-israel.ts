/**
 * Seed script — imports shelter data for central Israel cities
 *
 * Sources (all open data, free):
 * 1. Beer Sheva  — data.gov.il  (262 shelters, WGS84)
 * 2. Netanya     — datacity.org.il (77 shelters, WGS84)
 *
 * Run:
 *   npx tsx scripts/seed-central-israel.ts
 *   npx tsx scripts/seed-central-israel.ts --dry-run
 *
 * Requires env vars: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const DRY_RUN = process.argv.includes('--dry-run')

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────

async function fetchAll(url: string): Promise<Record<string, unknown>[]> {
  const all: Record<string, unknown>[] = []
  let offset = 0
  const limit = 1000
  while (true) {
    const res = await fetch(`${url}&limit=${limit}&offset=${offset}`, {
      headers: { 'User-Agent': 'hamiklat-app/1.0 (shelter finder for Israel)' },
    })
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
    const json = await res.json() as { success: boolean; result: { records: Record<string, unknown>[]; total: number } }
    if (!json.success) throw new Error(`API error: ${JSON.stringify(json)}`)
    const records = json.result.records
    all.push(...records)
    if (all.length >= json.result.total || records.length < limit) break
    offset += limit
  }
  return all
}

async function upsert(rows: Record<string, unknown>[], label: string) {
  console.log(`  ${DRY_RUN ? '[DRY RUN] ' : ''}Inserting ${rows.length} rows for ${label}...`)
  if (DRY_RUN) {
    console.log('  Sample:', JSON.stringify(rows[0], null, 2))
    return
  }

  // Fetch existing official_source_ids to skip duplicates
  const ids = rows.map(r => r.official_source_id as string)
  const { data: existing } = await supabase
    .from('shelters')
    .select('official_source_id')
    .in('official_source_id', ids)
  const existingSet = new Set((existing ?? []).map(r => r.official_source_id))
  const newRows = rows.filter(r => !existingSet.has(r.official_source_id as string))
  console.log(`  ${existingSet.size} already exist, inserting ${newRows.length} new...`)

  if (newRows.length === 0) { console.log('  Nothing to insert.'); return }

  let total = 0
  for (let i = 0; i < newRows.length; i += 100) {
    const batch = newRows.slice(i, i + 100)
    const { error, count } = await supabase.from('shelters').insert(batch, { count: 'exact' })
    if (error) {
      console.error(`  Batch ${Math.floor(i / 100) + 1} error:`, error.message)
    } else {
      total += count ?? batch.length
    }
  }
  console.log(`  ✓ ${total} rows inserted for ${label}`)
}

// ─────────────────────────────────────────────────────────────────
// SOURCE 1: Beer Sheva — data.gov.il
// resource_id: e191d913-11e4-4d87-a4b2-91587aab6611
// fields: _id, name, lat, lon
// ─────────────────────────────────────────────────────────────────
async function importBeerSheva() {
  console.log('\n── BEER SHEVA ──')
  const url = 'https://data.gov.il/api/3/action/datastore_search?resource_id=e191d913-11e4-4d87-a4b2-91587aab6611'
  const records = await fetchAll(url)
  console.log(`  Found ${records.length} records`)

  const rows = records
    .filter(r => r.lat && r.lon)
    .map(r => ({
      name: (r.name as string)?.trim() || 'מקלט ציבורי',
      city: 'באר שבע',
      address: '',
      lat: parseFloat(String(r.lat)),
      lng: parseFloat(String(r.lon)),
      source: 'official',
      status: 'verified',
      shelter_type: 'public_shelter',
      official_source_id: `beersheva-${r._id}`,
      notes: 'מקלט ציבורי רשמי — עיריית באר שבע',
    }))

  await upsert(rows, 'Beer Sheva')
}

// ─────────────────────────────────────────────────────────────────
// SOURCE 2: Netanya — netanya.datacity.org.il
// resource_id: eaac60da-7341-439c-9a76-29b75b17943a
// filter: theme_desc=מקלטים
// fields: SITE_NAME, lat, lon, STREET_NAM, HOUSE_NUM, Neighborho
// ─────────────────────────────────────────────────────────────────
async function importNetanya() {
  console.log('\n── NETANYA ──')
  const base = 'https://netanya.datacity.org.il/api/3/action/datastore_search?resource_id=eaac60da-7341-439c-9a76-29b75b17943a&filters=%7B%22theme_desc%22%3A%22%D7%9E%D7%A7%D7%9C%D7%98%D7%99%D7%9D%22%7D'
  const records = await fetchAll(base)
  console.log(`  Found ${records.length} shelter records`)

  const rows = records
    .filter(r => r.lat && r.lon)
    .map(r => {
      const street = (r.STREET_NAM as string)?.trim() ?? ''
      const houseNum = (r.HOUSE_NUM as string)?.trim() ?? ''
      const address = [street, houseNum].filter(Boolean).join(' ')
      // Use ADDRESS_DE for a clean full address string if available
      const fullAddress = (r.ADDRESS_DE as string)?.trim() || address
      return {
        name: (r.SITE_NAME as string)?.trim() || 'מקלט ציבורי',
        city: 'נתניה',
        address: fullAddress,
        lat: parseFloat(String(r.lat)),
        lng: parseFloat(String(r.lon)),
        source: 'official',
        status: 'verified',
        shelter_type: 'public_shelter',
        official_source_id: `netanya-${r.FID ?? r._id}`,
        notes: 'מקלט ציבורי רשמי — עיריית נתניה',
      }
    })

  await upsert(rows, 'Netanya')
}

// ─────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────
async function main() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
    process.exit(1)
  }

  if (DRY_RUN) console.log('DRY RUN — no data will be written\n')

  await importBeerSheva()
  await importNetanya()

  console.log('\nDone.')
  process.exit(0)
}

main().catch(e => { console.error(e); process.exit(1) })
