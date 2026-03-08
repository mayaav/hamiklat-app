import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const { score, guest_id } = await request.json()
  if (!score || score < 1 || score > 5) {
    return NextResponse.json({ error: 'Score must be 1-5' }, { status: 400 })
  }

  // Auth is optional — guests are welcome
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const admin = createAdminClient()

  // Upsert by user_id (auth) or guest_id — one rating per shelter
  let data, error
  if (user) {
    ;({ data, error } = await admin
      .from('ratings')
      .upsert({ shelter_id: id, user_id: user.id, score }, { onConflict: 'shelter_id,user_id' })
      .select()
      .single())
  } else if (guest_id) {
    ;({ data, error } = await admin
      .from('ratings')
      .upsert({ shelter_id: id, guest_id, score }, { onConflict: 'shelter_id,guest_id' })
      .select()
      .single())
  } else {
    ;({ data, error } = await admin
      .from('ratings')
      .insert({ shelter_id: id, score })
      .select()
      .single())
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
