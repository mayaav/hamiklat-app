import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

const VALID_TYPES = ['locked', 'inaccessible', 'dirty', 'unsafe', 'closed', 'fake', 'other']

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()

  const { type, description } = await request.json()
  if (!type || !VALID_TYPES.includes(type)) {
    return NextResponse.json({ error: 'Invalid report type' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('reports')
    .insert({
      shelter_id: id,
      user_id: user?.id ?? null,
      type,
      description: description?.trim() || null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
