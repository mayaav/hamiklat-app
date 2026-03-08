import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const bbox = searchParams.get('bbox')
  const city = searchParams.get('city')
  const q = searchParams.get('q')

  const supabase = await createClient()
  let query = supabase
    .from('shelters')
    .select('*')
    .neq('status', 'closed')
    .order('source', { ascending: false }) // official first
    .limit(200)

  if (bbox) {
    const [south, west, north, east] = bbox.split(',').map(Number)
    query = query
      .gte('lat', south).lte('lat', north)
      .gte('lng', west).lte('lng', east)
  }

  if (city) {
    query = query.ilike('city', `%${city}%`)
  }

  if (q) {
    query = query.or(`name.ilike.%${q}%,address.ilike.%${q}%,city.ilike.%${q}%`)
  }

  const { data, error } = await query

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(request: Request) {
  const body = await request.json()
  const { name, address, city, lat, lng, shelter_type, floor, capacity, is_accessible, accessibility_notes, hours, notes } = body

  if (!name || !address || !city || lat == null || lng == null) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  // Auth is optional — guests are welcome
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('shelters')
    .insert({
      name, address, city, lat, lng,
      shelter_type: shelter_type || null,
      floor: floor || null,
      capacity: capacity ? Number(capacity) : null,
      is_accessible: !!is_accessible,
      accessibility_notes: accessibility_notes || null,
      hours: hours || null,
      notes: notes || null,
      source: 'community',
      status: 'unverified',
      created_by: user?.id ?? null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
