import { createClient } from '@supabase/supabase-js'

// Service role client — bypasses RLS entirely.
// Only use in server-side API routes, never in client code.
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}
