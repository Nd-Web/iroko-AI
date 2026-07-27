'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Loader2, CheckCircle2, ArrowLeft, Zap, ShieldCheck } from 'lucide-react'
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
  const [role, setRole] = React.useState<string>('cac_agent')
  const [autoApprove, setAutoApprove] = React.useState(true)
  const [loading, setLoading] = React.useState(false)
  const [done, setDone] = React.useState(false)
  const [error, setError] = React.useState('')

  const submit = async () => {
    if (!role) {
      setError('Choose the agent role you are applying for.')
      return
    }
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/operator/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role, autoApprove }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(json.error ?? 'Could not submit your agent request.')
      } else {
        setDone(true)
        setTimeout(() => router.push('/operator'), 1000)
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
              <ArrowLeft className="h-4 w-4 mr-1" /> Back to Chat
            </Link>
          </Button>
        </div>

        <Card className="border-border shadow-md">
          <CardHeader>
            <div className="flex items-center gap-2 text-emerald-500 font-medium text-xs">
              <ShieldCheck className="h-4 w-4" /> Agent Network Registration
            </div>
            <CardTitle className="text-xl">Register as a Human Agent</CardTitle>
            <CardDescription className="text-xs">
              Human agents accept and complete physical & government portal work (CAC company filings, NIN enrollment concierge, tax filings, legal attestations) submitted by Iroko users.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {done ? (
              <div className="flex items-center gap-2 rounded-lg bg-emerald-500/15 p-4 text-sm text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                <CheckCircle2 className="h-5 w-5 shrink-0" />
                <div>
                  <p className="font-semibold">Agent Access Activated!</p>
                  <p className="text-xs opacity-90">Redirecting to your Agent Dashboard & Job Marketplace...</p>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase">
                    Select Your Specialty Role
                  </label>
                  <div className="mt-2 space-y-2">
                    {OPERATOR_ROLES.map((r) => (
                      <label
                        key={r.value}
                        className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-all ${
                          role === r.value
                            ? 'border-emerald-500 bg-emerald-500/5 ring-1 ring-emerald-500'
                            : 'border-border hover:bg-muted/40'
                        }`}
                      >
                        <input
                          type="radio"
                          name="role"
                          value={r.value}
                          checked={role === r.value}
                          onChange={() => setRole(r.value)}
                          className="mt-1 accent-emerald-500"
                        />
                        <div>
                          <span className="block text-sm font-semibold">{r.label}</span>
                          <span className="block text-xs text-muted-foreground">{r.hint}</span>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Instant demo approval toggle */}
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
                  <label className="flex cursor-pointer items-start gap-2.5">
                    <input
                      type="checkbox"
                      checked={autoApprove}
                      onChange={(e) => setAutoApprove(e.target.checked)}
                      className="mt-0.5 accent-amber-500"
                    />
                    <div>
                      <span className="flex items-center gap-1 text-xs font-semibold text-amber-700 dark:text-amber-300">
                        <Zap className="h-3.5 w-3.5 fill-current" /> Instant Agent Activation (Demo Mode)
                      </span>
                      <span className="block text-[11px] text-amber-600/90 dark:text-amber-400/90">
                        Activate your agent access immediately so you can test job claiming and completing CAC/NIN registrations.
                      </span>
                    </div>
                  </label>
                </div>

                {error ? <p className="text-xs font-medium text-destructive">{error}</p> : null}

                <Button
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-medium"
                  onClick={submit}
                  disabled={loading}
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Register & Open Job Marketplace'}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
