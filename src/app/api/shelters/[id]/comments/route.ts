import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('comments')
    .select('*, users(display_name)')
    .eq('shelter_id', id)
    .eq('is_flagged', false)
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const { content, guest_name } = await request.json()
  if (!content || content.trim().length === 0) {
    return NextResponse.json({ error: 'Content required' }, { status: 400 })
  }

  // Auth is optional — guests are welcome
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('comments')
    .insert({
      shelter_id: id,
      user_id: user?.id ?? null,
      guest_name: user ? null : (guest_name?.trim() || 'אורח'),
      content: content.trim(),
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
