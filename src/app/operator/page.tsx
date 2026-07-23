import { redirect } from 'next/navigation'
import Link from 'next/link'
import { db } from '@/lib/db'
import { getOperatorViewer } from '@/lib/operator-access'
import { OPERATOR_ROLE_LABELS } from '@/lib/operator'
import { IrokoLogo } from '@/components/iroko-logo'
import { Badge } from '@/components/ui/badge'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Statuses the operator should act on (exclude finished/cancelled).
const ACTIONABLE = ['NEEDS_HUMAN', 'AWAITING_PAYMENT', 'QUEUED', 'PROCESSING', 'FAILED']

function parseJson<T>(s: string | null | undefined, fallback: T): T {
  if (!s) return fallback
  try {
    return JSON.parse(s) as T
  } catch {
    return fallback
  }
}

export default async function OperatorPage() {
  const viewer = await getOperatorViewer()
  if (!viewer.authenticated) redirect('/login?callbackUrl=/operator')
  if (!viewer.isActive) {
    // Signed in but not (yet) an active operator: show the right next step.
    const heading =
      viewer.status === 'pending'
        ? 'Your operator request is awaiting approval'
        : viewer.status === 'revoked'
          ? 'Your operator access was revoked'
          : 'Operator access required'
    const body =
      viewer.status === 'pending'
        ? 'A primary operator needs to approve your account. You’ll get access as soon as they do.'
        : viewer.status === 'revoked'
          ? 'Contact a primary operator if you think this is a mistake.'
          : 'You need to be granted operator access to see the back-office queue.'
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4 text-center">
        <div className="max-w-sm">
          <h1 className="text-lg font-semibold">{heading}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{body}</p>
          {viewer.status === 'none' ? (
            <Link
              href="/operator/apply"
              className="mt-4 inline-block rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              Apply for operator access
            </Link>
          ) : null}
          <Link href="/" className="mt-4 block text-sm text-primary hover:underline">
            ← Back to chat
          </Link>
        </div>
      </div>
    )
  }

  const tasks = await db.serviceTask.findMany({
    where: { status: { in: ACTIONABLE } },
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    take: 100,
    include: {
      documents: {
        orderBy: { createdAt: 'asc' },
        select: { id: true, kind: true, label: true, filename: true, mimeType: true },
      },
    },
  })

  // Resolve user emails (ServiceTask has no relation to User).
  const userIds = [...new Set(tasks.map((t) => t.userId))]
  const users = await db.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, email: true, name: true },
  })
  const userById = new Map(users.map((u) => [u.id, u]))

  const needsHuman = tasks.filter((t) => t.status === 'NEEDS_HUMAN').length

  return (
    <div className="min-h-screen bg-background px-4 py-6">
      <div className="mx-auto w-full max-w-4xl">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <IrokoLogo size={26} withWordmark />
            <span className="text-sm text-muted-foreground">Operator queue</span>
          </div>
          <div className="flex items-center gap-4">
            {viewer.isPrimary ? (
              <Link href="/operator/team" className="text-sm text-primary hover:underline">
                Manage team
              </Link>
            ) : null}
            <Link href="/" className="text-sm text-primary hover:underline">
              ← Back to chat
            </Link>
          </div>
        </div>

        <div className="mb-4 flex items-center gap-2 text-sm text-muted-foreground">
          <span>
            {tasks.length} open task{tasks.length === 1 ? '' : 's'} · {needsHuman} awaiting filing
          </span>
          <Badge variant="outline">
            {viewer.isPrimary ? 'Primary operator' : OPERATOR_ROLE_LABELS[viewer.role ?? ''] ?? 'Operator'}
          </Badge>
        </div>

        {tasks.length === 0 ? (
          <div className="rounded-lg border border-border p-8 text-center text-sm text-muted-foreground">
            Nothing in the queue right now.
          </div>
        ) : (
          <div className="space-y-4">
            {tasks.map((t) => {
              const details = parseJson<Record<string, string>>(t.detailsJson, {})
              const result = parseJson<{ submissionPack?: string; via?: string }>(t.resultJson, {})
              const user = userById.get(t.userId)
              return (
                <div key={t.id} className="rounded-lg border border-border bg-card p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h2 className="font-semibold">{t.title}</h2>
                      <p className="text-xs text-muted-foreground">
                        {user?.email ?? t.userId} · {new Date(t.createdAt).toLocaleString()} · task{' '}
                        {t.id}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={t.status === 'NEEDS_HUMAN' ? 'default' : 'secondary'}>
                        {t.status}
                      </Badge>
                      <Badge variant="outline">{t.paidAt ? 'PAID' : 'unpaid'}</Badge>
                    </div>
                  </div>

                  {/* Collected details */}
                  <div className="mt-3">
                    <div className="text-xs font-medium uppercase text-muted-foreground">
                      Collected details
                    </div>
                    {Object.keys(details).length === 0 ? (
                      <p className="text-sm text-muted-foreground">None</p>
                    ) : (
                      <table className="mt-1 w-full text-sm">
                        <tbody>
                          {Object.entries(details).map(([k, v]) => (
                            <tr key={k} className="border-b border-border/50 last:border-0">
                              <td className="py-1 pr-3 align-top text-muted-foreground">{k}</td>
                              <td className="py-1 font-medium">{v}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>

                  {/* Documents */}
                  <div className="mt-3">
                    <div className="text-xs font-medium uppercase text-muted-foreground">
                      Documents ({t.documents.length})
                    </div>
                    {t.documents.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        None uploaded yet — user link: <code>/task/{t.id}/documents</code>
                      </p>
                    ) : (
                      <div className="mt-1 flex flex-wrap gap-2">
                        {t.documents.map((d) => (
                          <a
                            key={d.id}
                            href={`/api/tasks/${t.id}/documents/${d.id}`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center rounded-md border border-input px-2.5 py-1 text-xs hover:bg-accent"
                          >
                            {d.label} ↗
                          </a>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Filing pack */}
                  {result.submissionPack ? (
                    <details className="mt-3">
                      <summary className="cursor-pointer text-xs font-medium uppercase text-muted-foreground">
                        Filing-ready pack
                      </summary>
                      <pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded-md bg-muted p-3 text-xs">
                        {result.submissionPack}
                      </pre>
                    </details>
                  ) : null}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
