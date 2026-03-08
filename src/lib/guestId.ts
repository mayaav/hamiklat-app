// Returns a persistent guest ID stored in localStorage.
// Used for soft deduplication of ratings and verifications.
export function getGuestId(): string {
  if (typeof window === 'undefined') return ''
  let id = localStorage.getItem('guest_id')
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem('guest_id', id)
  }
  return id
}
