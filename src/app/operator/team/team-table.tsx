'use client'

import * as React from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { OPERATOR_ROLES, OPERATOR_ROLE_LABELS } from '@/lib/operator'

export interface TeamMember {
  id: string
  email: string
  name: string | null
  status: string
  role: string | null
  requestedAt: string | null
  grantedAt: string | null
}

export function OperatorTeamTable({ initial }: { initial: TeamMember[] }) {
  const [members, setMembers] = React.useState<TeamMember[]>(initial)
  const [busy, setBusy] = React.useState<string | null>(null)
  const [error, setError] = React.useState('')

  const act = async (userId: string, action: string, role?: string) => {
    setError('')
    setBusy(userId + action + (role ?? ''))
    try {
      const res = await fetch('/api/operator/team', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, action, role }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(json.error ?? 'Action failed.')
      } else {
        setMembers((prev) =>
          prev.map((m) =>
            m.id === userId
              ? {
                  ...m,
                  status: json.status ?? m.status,
                  role: json.role ?? m.role,
                }
              : m,
          ),
        )
      }
    } catch {
      setError('Action failed. Try again.')
    } finally {
      setBusy(null)
    }
  }

  const pending = members.filter((m) => m.status === 'pending')
  const active = members.filter((m) => m.status === 'active')
  const revoked = members.filter((m) => m.status === 'revoked')

  const Row = ({ m }: { m: TeamMember }) => (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-3">
      <div>
        <div className="text-sm font-medium">{m.name || m.email}</div>
        <div className="text-xs text-muted-foreground">{m.email}</div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary">{OPERATOR_ROLE_LABELS[m.role ?? ''] ?? 'No role'}</Badge>
        {m.status === 'active' ? (
          <select
            className="h-8 rounded-md border border-input bg-background px-2 text-xs"
            value={m.role ?? ''}
            onChange={(e) => act(m.id, 'set_role', e.target.value)}
            disabled={!!busy}
          >
            {OPERATOR_ROLES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        ) : null}
        {m.status !== 'active' ? (
          <Button size="sm" onClick={() => act(m.id, 'approve')} disabled={!!busy}>
            {busy === m.id + 'approve' ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Approve'}
          </Button>
        ) : null}
        {m.status === 'active' ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() => act(m.id, 'revoke')}
            disabled={!!busy}
          >
            {busy === m.id + 'revoke' ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Revoke'}
          </Button>
        ) : null}
      </div>
    </div>
  )

  const Section = ({ title, list }: { title: string; list: TeamMember[] }) => (
    <div className="space-y-2">
      <h2 className="text-xs font-medium uppercase text-muted-foreground">
        {title} ({list.length})
      </h2>
      {list.length === 0 ? (
        <p className="text-sm text-muted-foreground">None</p>
      ) : (
        list.map((m) => <Row key={m.id} m={m} />)
      )}
    </div>
  )

  return (
    <div className="space-y-6">
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <Section title="Pending approval" list={pending} />
      <Section title="Active operators" list={active} />
      <Section title="Revoked" list={revoked} />
    </div>
  )
}
