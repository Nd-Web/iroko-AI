import { redirect } from 'next/navigation'
import Link from 'next/link'
import { db } from '@/lib/db'
import { getOperatorViewer } from '@/lib/operator-access'
import { operatorEmails } from '@/lib/operator'
import { IrokoLogo } from '@/components/iroko-logo'
import { Badge } from '@/components/ui/badge'
import { OperatorTeamTable, type TeamMember } from './team-table'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export default async function OperatorTeamPage() {
  const viewer = await getOperatorViewer()
  if (!viewer.authenticated) redirect('/login?callbackUrl=/operator/team')
  if (!viewer.isPrimary) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4 text-center">
        <div>
          <h1 className="text-lg font-semibold">Primary operators only</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Only a primary operator can manage the team.
          </p>
          <Link href="/operator" className="mt-4 inline-block text-sm text-primary hover:underline">
            ← Back to queue
          </Link>
        </div>
      </div>
    )
  }

  const rows = await db.user.findMany({
    where: { operatorStatus: { in: ['pending', 'active', 'revoked'] } },
    orderBy: [{ operatorStatus: 'asc' }, { operatorRequestedAt: 'desc' }],
    select: {
      id: true,
      email: true,
      name: true,
      operatorStatus: true,
      operatorRole: true,
      operatorRequestedAt: true,
      operatorGrantedAt: true,
    },
  })
  const initial: TeamMember[] = rows.map((r) => ({
    id: r.id,
    email: r.email,
    name: r.name,
    status: r.operatorStatus,
    role: r.operatorRole,
    requestedAt: r.operatorRequestedAt?.toISOString() ?? null,
    grantedAt: r.operatorGrantedAt?.toISOString() ?? null,
  }))

  const primaries = operatorEmails()

  return (
    <div className="min-h-screen bg-background px-4 py-6">
      <div className="mx-auto w-full max-w-3xl">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <IrokoLogo size={26} withWordmark />
            <span className="text-sm text-muted-foreground">Operator team</span>
          </div>
          <Link href="/operator" className="text-sm text-primary hover:underline">
            ← Back to queue
          </Link>
        </div>

        {/* Primary operators (from OPERATOR_EMAILS — always active) */}
        <div className="mb-6 space-y-2">
          <h2 className="text-xs font-medium uppercase text-muted-foreground">
            Primary operators ({primaries.length})
          </h2>
          {primaries.map((e) => (
            <div
              key={e}
              className="flex items-center justify-between rounded-lg border border-border p-3"
            >
              <span className="text-sm font-medium">{e}</span>
              <Badge>Primary · always active</Badge>
            </div>
          ))}
          <p className="text-xs text-muted-foreground">
            Primary operators are set in the OPERATOR_EMAILS environment variable and can approve
            or revoke everyone below.
          </p>
        </div>

        <OperatorTeamTable initial={initial} />
      </div>
    </div>
  )
}
