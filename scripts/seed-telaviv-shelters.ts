/**
 * Tel Aviv official shelter seeder
 *
 * Source: Tel Aviv Municipality GIS ArcGIS server — public, no API key required
 * Layer 592: מקלטים (Shelters)
 * URL: https://gisn.tel-aviv.gov.il/arcgis/rest/services/IView2/MapServer/592
 *
 * Fields available: address, shelter type, area, accessibility, opening times,
 *                   lat/lon (already WGS84), notes, active status
 *
 * Run:
 *   npx tsx scripts/seed-telaviv-shelters.ts
 *   npx tsx scripts/seed-telaviv-shelters.ts --dry-run
 */

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const TLV_LAYER_URL =
  'https://gisn.tel-aviv.gov.il/arcgis/rest/services/IView2/MapServer/592/query'

async function fetchPage(offset: number, pageSize = 100) {
  const params = new URLSearchParams({
    where: '1=1',
    outFields: '*',
    f: 'json',
    resultRecordCount: String(pageSize),
    resultOffset: String(offset),
  })
  const res = await fetch(`${TLV_LAYER_URL}?${params}`, {
    headers: { 'User-Agent': 'hamiklat-app/1.0' },
  })
  if (!res.ok) throw new Error(`ArcGIS error: ${res.status}`)
  return res.json()
}

function mapRecord(attrs: Record<string, unknown>) {
  const lat = Number(attrs.lat)
  const lng = Number(attrs.lon)
  if (!lat || !lng) return null

  // Determine accessibility
  const accessible =
    attrs.miklat_mungash === 1 ||
    attrs.miklat_mungash === '1' ||
    attrs.miklat_mungash === true

  // Build hours string
  const hours = attrs.opening_times
    ? String(attrs.opening_times).trim()
    : attrs.is_open === 1
    ? '24/7'
    : null

  // Shelter type
  const typeMap: Record<string, string> = {
    'מקלט ציבורי': 'public_shelter',
    'ממ"ד': 'mamad',
    'מקלט בניין': 'building_shelter',
  }
  const rawType = attrs.t_sug ? String(attrs.t_sug).trim() : ''
  const shelterType = typeMap[rawType] ?? 'public_shelter'

  // Notes — include original notes and area size
  const noteParts = [
    attrs.hearot ? String(attrs.hearot).trim() : null,
    attrs.shetach_mr ? `שטח: ${attrs.shetach_mr} מ"ר` : null,
    attrs.t_sinon ? `מערכת סינון: ${attrs.t_sinon}` : null,
    attrs.knisa && String(attrs.knisa).trim() ? `כניסה: ${attrs.knisa}` : null,
  ].filter(Boolean)

  return {
    name: `מקלט ציבורי ${attrs.ms_miklat ?? attrs.oid_mitkan}`,
    address: attrs.Full_Address ? String(attrs.Full_Address).trim() : '',
    city: 'תל אביב-יפו',
    lat,
    lng,
    source: 'official' as const,
    status: 'verified' as const,
    shelter_type: shelterType,
    is_accessible: accessible,
    hours,
    notes: noteParts.length > 0 ? noteParts.join(' | ') : null,
    capacity: attrs.shetach_mr ? Math.floor(Number(attrs.shetach_mr) / 0.5) : null,
    official_source_id: `tlv-${attrs.UniqueId ?? attrs.oid_mitkan}`,
  }
}

async function main() {
  const dryRun = process.argv.includes('--dry-run')
  if (dryRun) console.log('DRY RUN — nothing will be written\n')

  console.log('Fetching Tel Aviv shelter data from municipal GIS...')

  const allShelters = []
  let offset = 0
  const pageSize = 100

  while (true) {
    const page = await fetchPage(offset, pageSize)
    const features = page.features ?? []
    if (features.length === 0) break

    for (const f of features) {
      const mapped = mapRecord(f.attributes)
      if (mapped) allShelters.push(mapped)
    }

    console.log(`  Fetched ${offset + features.length} / ~501`)
    if (!page.exceededTransferLimit) break
    offset += pageSize
    await new Promise(r => setTimeout(r, 300)) // be polite
  }

  console.log(`\nPrepared ${allShelters.length} shelters to insert`)

  if (dryRun) {
    console.log('\nSample record:')
    console.log(JSON.stringify(allShelters[0], null, 2))
    return
  }

  let inserted = 0
  let skipped = 0

  for (let i = 0; i < allShelters.length; i += 100) {
    const batch = allShelters.slice(i, i + 100)
    const { error } = await supabase.from('shelters').insert(batch)

    if (error) {
      if (error.code === '23505') {
        // Duplicates in batch — insert one by one
        for (const s of batch) {
          const { error: e2 } = await supabase.from('shelters').insert(s)
          if (!e2) inserted++
          else skipped++
        }
      } else {
        console.error(`Batch error:`, error.message)
      }
    } else {
      inserted += batch.length
    }
  }

  console.log(`\n✓ Inserted: ${inserted}  Skipped (already exist): ${skipped}`)
  console.log('Tel Aviv import complete.')
  process.exit(0)
}

main().catch(e => { console.error(e); process.exit(1) })
