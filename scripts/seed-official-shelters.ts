/**
 * Seed script — imports official public shelter data into Supabase
 *
 * SOURCES:
 * 1. Jerusalem Municipality (jerusalem.datacity.org.il) — JSON API, free, ODBL license
 * 2. data.gov.il CKAN API — national dataset, requires searching by resource_id
 *
 * Run:
 *   npx tsx scripts/seed-official-shelters.ts
 *
 * Requires env vars: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! // needs service role to bypass RLS
)

// ─────────────────────────────────────────────
// SOURCE 1: Jerusalem Municipality Open Data
// Dataset: https://jerusalem.datacity.org.il/dataset/public-shelters
// License: ODbL (Open Database License)
// ─────────────────────────────────────────────
const JERUSALEM_API =
  'https://jerusalem.datacity.org.il/api/3/action/datastore_search?resource_id=db096951-dd8b-4e76-876a-07c34a00cec5&limit=1000'

async function importJerusalemShelters() {
  console.log('Fetching Jerusalem shelter data...')
  const res = await fetch(JERUSALEM_API)
  const json = await res.json()

  if (!json.success) {
    console.error('Jerusalem API error:', json)
    return
  }

  const records = json.result.records
  console.log(`Found ${records.length} shelters in Jerusalem`)

  // Map to our schema — inspect the actual API response for exact field names
  // Common fields in the Jerusalem dataset:
  // SHEM_MIKLAT, KTOVET, SHKHUNA, AREA_SIZE, X, Y (ITM coordinates)
  // Actual fields from API: { _id, OBJECTID, "מספר מקלט", x, y } (ITM coords, lowercase)
  const shelters = records
    .filter((r: Record<string, unknown>) => r.x && r.y)
    .map((r: Record<string, unknown>) => {
      const coords = itmToWgs84(Number(r.y), Number(r.x))
      const shelterNum = r['מספר מקלט'] ?? r.OBJECTID ?? r._id
      return {
        name: `מקלט ציבורי ${shelterNum}`,
        address: '',
        city: 'ירושלים',
        lat: coords.lat,
        lng: coords.lng,
        source: 'official',
        status: 'verified',
        shelter_type: 'public_shelter',
        official_source_id: `jerusalem-${shelterNum}`,
        notes: `מקלט ציבורי רשמי של עיריית ירושלים — מספר ${shelterNum}`,
      }
    })

  console.log(`Inserting ${shelters.length} Jerusalem shelters...`)

  let inserted = 0
  for (let i = 0; i < shelters.length; i += 100) {
    const batch = shelters.slice(i, i + 100)
    const { error } = await supabase.from('shelters').insert(batch)
    if (error) {
      if (error.code === '23505') {
        for (const s of batch) {
          const { error: e2 } = await supabase.from('shelters').insert(s)
          if (!e2) inserted++
        }
      } else {
        console.error(`Batch ${i / 100 + 1} error:`, error.message)
      }
    } else {
      inserted += batch.length
      console.log(`  Batch ${i / 100 + 1} done (${batch.length} records)`)
    }
  }
  console.log(`  Inserted ${inserted} new records`)

  console.log('Jerusalem import complete.')
}

// ─────────────────────────────────────────────
// SOURCE 2: data.gov.il national CKAN API
// Search: https://data.gov.il/dataset?q=מקלטים
// ─────────────────────────────────────────────
// Known resource IDs to check (verify these at data.gov.il):
const DATA_GOV_RESOURCES = [
  // Add resource IDs found at data.gov.il for shelter datasets
  // Example: { id: 'RESOURCE_ID_HERE', city: 'תל אביב' }
]

async function importFromDataGovIL(resourceId: string, city: string) {
  const url = `https://data.gov.il/api/3/action/datastore_search?resource_id=${resourceId}&limit=32000`
  console.log(`Fetching ${city} shelters from data.gov.il...`)

  const res = await fetch(url, { headers: { 'User-Agent': 'hamiklat-app/1.0' } })
  const json = await res.json()

  if (!json.success) {
    console.error(`data.gov.il error for ${city}:`, json.error)
    return
  }

  const records = json.result.records
  console.log(`Found ${records.length} shelters in ${city}`)
  // Map fields — inspect actual fields per resource
  return records
}

// ─────────────────────────────────────────────
// ITM (Israeli Transverse Mercator) → WGS84
// Israel uses ITM for coordinate system in official datasets
// ─────────────────────────────────────────────
function itmToWgs84(y: number, x: number): { lat: number; lng: number } {
  // ITM parameters
  const a = 6378137.0
  const f = 1 / 298.257223563
  const b = a * (1 - f)
  const e2 = (a * a - b * b) / (a * a)
  const e = Math.sqrt(e2)

  const k0 = 1.0000067
  const lat0 = 31.734394 * (Math.PI / 180)
  const lon0 = 35.204517 * (Math.PI / 180)
  const E0 = 219529.584
  const N0 = 626907.39

  const N = y - N0
  const E = x - E0

  const M0 = a * ((1 - e2 / 4 - (3 * e2 * e2) / 64) * lat0
    - ((3 * e2) / 8 + (3 * e2 * e2) / 32) * Math.sin(2 * lat0)
    + ((15 * e2 * e2) / 256) * Math.sin(4 * lat0))

  const M = M0 + N / k0
  const mu = M / (a * (1 - e2 / 4 - (3 * e2 * e2) / 64))

  const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2))
  const phi1 = mu + (3 * e1 / 2 - 27 * e1 * e1 * e1 / 32) * Math.sin(2 * mu)
    + (21 * e1 * e1 / 16 - 55 * e1 * e1 * e1 * e1 / 32) * Math.sin(4 * mu)
    + (151 * e1 * e1 * e1 / 96) * Math.sin(6 * mu)

  const N1 = a / Math.sqrt(1 - e2 * Math.sin(phi1) * Math.sin(phi1))
  const T1 = Math.tan(phi1) * Math.tan(phi1)
  const C1 = (e2 / (1 - e2)) * Math.cos(phi1) * Math.cos(phi1)
  const R1 = a * (1 - e2) / Math.pow(1 - e2 * Math.sin(phi1) * Math.sin(phi1), 1.5)
  const D = E / (N1 * k0)

  const lat =
    phi1 -
    ((N1 * Math.tan(phi1)) / R1) *
    (D * D / 2 -
      (5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * (e2 / (1 - e2))) * (D * D * D * D) / 24 +
      (61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * (e2 / (1 - e2)) - 3 * C1 * C1) *
      (D * D * D * D * D * D) / 720)

  const lon =
    lon0 +
    (D -
      (1 + 2 * T1 + C1) * (D * D * D) / 6 +
      (5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * (e2 / (1 - e2)) + 24 * T1 * T1) *
      (D * D * D * D * D) / 120) /
    Math.cos(phi1)

  return {
    lat: lat * (180 / Math.PI),
    lng: lon * (180 / Math.PI),
  }
}

async function main() {
  await importJerusalemShelters()

  // Add more cities as you find their resource IDs on data.gov.il:
  // for (const { id, city } of DATA_GOV_RESOURCES) {
  //   await importFromDataGovIL(id, city)
  // }

  console.log('Done.')
  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
