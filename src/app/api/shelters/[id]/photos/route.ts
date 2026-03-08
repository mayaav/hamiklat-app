import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const formData = await request.formData()
  const file = formData.get('file') as File | null
  const caption = formData.get('caption') as string | null
  const guestId = formData.get('guest_id') as string | null

  if (!file) return NextResponse.json({ error: 'File required' }, { status: 400 })

  if (!file.type.startsWith('image/')) {
    return NextResponse.json({ error: 'Only images allowed' }, { status: 400 })
  }

  if (file.size > 5 * 1024 * 1024) {
    return NextResponse.json({ error: 'Max 5MB' }, { status: 400 })
  }

  // Auth is optional — guests are welcome
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const contributorId = user?.id ?? guestId ?? 'guest'
  const ext = file.name.split('.').pop() ?? 'jpg'
  const path = `${id}/${contributorId}-${Date.now()}.${ext}`

  const admin = createAdminClient()

  const { error: uploadError } = await admin.storage
    .from('shelter-photos')
    .upload(path, file, { contentType: file.type })

  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 })

  const { data: { publicUrl } } = admin.storage
    .from('shelter-photos')
    .getPublicUrl(path)

  const { data, error } = await admin
    .from('photos')
    .insert({
      shelter_id: id,
      user_id: user?.id ?? null,
      guest_id: user ? null : (guestId ?? null),
      url: publicUrl,
      storage_path: path,
      caption,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
