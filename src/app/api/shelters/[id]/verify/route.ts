import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const { is_positive = true, guest_id } = await request.json()

  // Auth is optional — guests are welcome
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const admin = createAdminClient()

  let data, error
  if (user) {
    ;({ data, error } = await admin
      .from('verifications')
      .upsert({ shelter_id: id, user_id: user.id, is_positive }, { onConflict: 'shelter_id,user_id' })
      .select()
      .single())
  } else if (guest_id) {
    ;({ data, error } = await admin
      .from('verifications')
      .upsert({ shelter_id: id, guest_id, is_positive }, { onConflict: 'shelter_id,guest_id' })
      .select()
      .single())
  } else {
    ;({ data, error } = await admin
      .from('verifications')
      .insert({ shelter_id: id, is_positive })
      .select()
      .single())
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
