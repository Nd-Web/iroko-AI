'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Loader2, CheckCircle2, ArrowLeft } from 'lucide-react'
import { IrokoLogo } from '@/components/iroko-logo'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { OPERATOR_ROLES } from '@/lib/operator'

export default function OperatorApplyPage() {
  const router = useRouter()
  const [role, setRole] = React.useState<string>('')
  const [loading, setLoading] = React.useState(false)
  const [done, setDone] = React.useState(false)
  const [error, setError] = React.useState('')

  const submit = async () => {
    if (!role) {
      setError('Choose the role you’re applying for.')
      return
    }
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/operator/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(json.error ?? 'Could not submit your request.')
      } else {
        setDone(true)
        setTimeout(() => router.push('/operator'), 1500)
      }
    } catch {
      setError('Something went wrong. Try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-8">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center justify-between">
          <IrokoLogo size={28} withWordmark />
          <Button asChild variant="ghost" size="sm">
            <Link href="/">
              <ArrowLeft className="h-4 w-4" /> Back
            </Link>
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Apply for operator access</CardTitle>
            <CardDescription>
              Operators complete government-portal work (CAC filings, NIN, tax) that Iroko
              collects. Pick your role — a primary operator will review and approve you.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {done ? (
              <div className="flex items-center gap-2 rounded-lg bg-green-50 p-3 text-sm text-green-800 dark:bg-green-950 dark:text-green-300">
                <CheckCircle2 className="h-4 w-4" /> Request submitted — awaiting approval.
              </div>
            ) : (
              <div className="space-y-3">
                {OPERATOR_ROLES.map((r) => (
                  <label
                    key={r.value}
                    className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 ${
                      role === r.value ? 'border-primary ring-1 ring-primary' : 'border-border'
                    }`}
                  >
                    <input
                      type="radio"
                      name="role"
                      value={r.value}
                      checked={role === r.value}
                      onChange={() => setRole(r.value)}
                      className="mt-1"
                    />
                    <span>
                      <span className="block text-sm font-medium">{r.label}</span>
                      <span className="block text-xs text-muted-foreground">{r.hint}</span>
                    </span>
                  </label>
                ))}
                {error ? <p className="text-sm text-destructive">{error}</p> : null}
                <Button className="w-full" onClick={submit} disabled={loading}>
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Submit request'}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
