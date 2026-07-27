'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { signIn } from 'next-auth/react'
import Link from 'next/link'
import { Loader2, UserCheck, ShieldCheck, IdCard, Building2 } from 'lucide-react'
import { IrokoLogo } from '@/components/iroko-logo'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

export default function RegisterPage() {
  const router = useRouter()

  const [name, setName] = React.useState('')
  const [email, setEmail] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, email, password }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data?.error || 'Could not create your account.')
        setLoading(false)
        return
      }

      // Auto sign-in right after a successful signup.
      const signInRes = await signIn('credentials', { email, password, redirect: false })
      if (!signInRes || signInRes.error) {
        // Account created — send to login with success flag
        router.push('/login?registered=true')
        return
      }
      router.push('/')
      router.refresh()
    } catch {
      setError('Something went wrong. Please try again.')
      setLoading(false)
    }
  }

  const quickLogin = async (quickEmail: string, quickPass: string) => {
    setLoading(true)
    try {
      const res = await signIn('credentials', {
        email: quickEmail,
        password: quickPass,
        redirect: false,
      })
      if (res && !res.error) {
        router.push('/')
        router.refresh()
      } else {
        router.push('/login')
      }
    } catch {
      router.push('/login')
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-8">
      <Card className="w-full max-w-sm border-border shadow-md">
        <CardHeader className="items-center text-center">
          <IrokoLogo size={32} withWordmark />
          <CardTitle className="mt-2 text-xl">Create your account</CardTitle>
          <CardDescription className="text-xs">Get started with Iroko AI</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="name" className="text-xs font-medium">Name (optional)</Label>
              <Input
                id="name"
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ada Obi"
                className="text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-xs font-medium">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-xs font-medium">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
                className="text-xs"
              />
            </div>

            {error ? <p className="text-xs font-medium text-destructive">{error}</p> : null}

            <Button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-medium" disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Sign up'}
            </Button>
          </form>

          {/* Quick Demo Login Chips */}
          <div className="mt-6 border-t border-border pt-4">
            <p className="mb-2 text-center text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Or Use 1-Click Test Accounts
            </p>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => quickLogin('customer@iroko.ng', 'Password123!')}
                disabled={loading}
                className="flex items-center gap-1.5 rounded-lg border border-border bg-muted/40 p-2 text-left text-xs font-medium transition-colors hover:bg-accent"
              >
                <UserCheck className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                <span className="truncate">Customer</span>
              </button>

              <button
                type="button"
                onClick={() => quickLogin('cac.agent@iroko.ng', 'Password123!')}
                disabled={loading}
                className="flex items-center gap-1.5 rounded-lg border border-border bg-muted/40 p-2 text-left text-xs font-medium transition-colors hover:bg-accent"
              >
                <Building2 className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                <span className="truncate">CAC Agent</span>
              </button>

              <button
                type="button"
                onClick={() => quickLogin('nin.agent@iroko.ng', 'Password123!')}
                disabled={loading}
                className="flex items-center gap-1.5 rounded-lg border border-border bg-muted/40 p-2 text-left text-xs font-medium transition-colors hover:bg-accent"
              >
                <IdCard className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                <span className="truncate">NIN Agent</span>
              </button>

              <button
                type="button"
                onClick={() => quickLogin('admin@iroko.ng', 'Password123!')}
                disabled={loading}
                className="flex items-center gap-1.5 rounded-lg border border-border bg-muted/40 p-2 text-left text-xs font-medium transition-colors hover:bg-accent"
              >
                <ShieldCheck className="h-3.5 w-3.5 text-purple-500 shrink-0" />
                <span className="truncate">Admin</span>
              </button>
            </div>
          </div>

          <p className="mt-4 text-center text-xs text-muted-foreground">
            Already have an account?{' '}
            <Link href="/login" className="font-medium text-emerald-500 hover:underline">
              Log in
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
