import { redirect } from 'next/navigation'
import Link from 'next/link'
import { db } from '@/lib/db'
import { getOperatorViewer } from '@/lib/operator-access'
import { OperatorDashboard, type TaskItem } from '@/components/operator/operator-dashboard'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Include open + finished statuses for comprehensive marketplace view
const STATUSES = ['NEEDS_HUMAN', 'AWAITING_PAYMENT', 'QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED']

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
          : 'You need to be granted operator access to see the human agent job queue.'
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
              Register as Human Agent
            </Link>
          ) : null}
          <Link href="/" className="mt-4 block text-sm text-primary hover:underline">
            ← Back to chat
          </Link>
        </div>
      </div>
    )
  }

  const dbTasks = await db.serviceTask.findMany({
    where: { status: { in: STATUSES } },
    orderBy: [{ createdAt: 'desc' }],
    take: 150,
    include: {
      documents: {
        orderBy: { createdAt: 'asc' },
        select: { id: true, kind: true, label: true, filename: true, mimeType: true },
      },
    },
  })

  // Fetch emails for associated users
  const userIds = [...new Set(dbTasks.map((t) => t.userId))]
  const users = await db.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, email: true },
  })
  const userEmailMap = new Map(users.map((u) => [u.id, u.email]))

  const initialTasks: TaskItem[] = dbTasks.map((t) => ({
    id: t.id,
    userId: t.userId,
    userEmail: userEmailMap.get(t.userId) || t.userId,
    title: t.title,
    serviceId: t.serviceId,
    status: t.status,
    amountKobo: t.amountKobo,
    paidAt: t.paidAt?.toISOString() ?? null,
    createdAt: t.createdAt.toISOString(),
    detailsJson: t.detailsJson,
    resultJson: t.resultJson,
    documents: t.documents,
  }))

  return (
    <OperatorDashboard
      viewer={{
        userId: viewer.userId,
        email: viewer.email,
        isPrimary: viewer.isPrimary,
        role: viewer.role,
      }}
      initialTasks={initialTasks}
    />
  )
}
