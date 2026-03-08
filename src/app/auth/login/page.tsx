'use client'

import { Suspense } from 'react'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useRouter, useSearchParams } from 'next/navigation'

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const next = searchParams.get('next') ?? '/'

  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email) return
    setLoading(true)
    setError('')

    const supabase = createClient()
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    })

    if (error) {
      setError('שגיאה בשליחת הקישור. נסה שוב.')
    } else {
      setSent(true)
    }
    setLoading(false)
  }

  if (sent) {
    return (
      <Card className="w-full max-w-sm text-center">
        <CardContent className="pt-8 pb-8">
          <div className="text-4xl mb-4">📬</div>
          <h2 className="text-xl font-semibold mb-2">בדוק את האימייל שלך</h2>
          <p className="text-muted-foreground text-sm">
            שלחנו קישור כניסה לכתובת <strong>{email}</strong>
            <br />
            לחץ על הקישור בהודעה כדי להיכנס.
          </p>
          <button
            className="text-sm text-muted-foreground mt-6 underline"
            onClick={() => setSent(false)}
          >
            שלח שוב
          </button>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="w-full max-w-sm">
      <div className="text-center mb-8">
        <button onClick={() => router.push('/')} className="text-2xl font-bold">
          המקלט
        </button>
        <p className="text-muted-foreground text-sm mt-1">מפת מקלטים קהילתית</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>כניסה</CardTitle>
          <CardDescription>
            הזן את כתובת האימייל שלך ונשלח לך קישור כניסה. לא צריך סיסמה.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="email">אימייל</Label>
              <Input
                id="email"
                type="email"
                placeholder="your@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="h-11"
                dir="ltr"
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="h-11" disabled={loading}>
              {loading ? 'שולח...' : 'שלח קישור כניסה'}
            </Button>
          </form>
          <p className="text-xs text-muted-foreground text-center mt-4">
            גישה לקריאה ומציאת מקלטים לא דורשת כניסה
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <Suspense>
        <LoginForm />
      </Suspense>
    </div>
  )
}
