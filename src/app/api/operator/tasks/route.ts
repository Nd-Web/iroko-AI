import { db } from '@/lib/db'
import { getOperatorViewer } from '@/lib/operator-access'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const STATUSES = ['NEEDS_HUMAN', 'AWAITING_PAYMENT', 'QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED']

/** Fetch tasks for the operator dashboard marketplace. */
export async function GET() {
  const viewer = await getOperatorViewer()
  if (!viewer.authenticated) return Response.json({ error: 'Not signed in.' }, { status: 401 })
  if (!viewer.isActive) return Response.json({ error: 'Operator access required.' }, { status: 403 })

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

  const userIds = [...new Set(dbTasks.map((t) => t.userId))]
  const users = await db.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, email: true },
  })
  const userEmailMap = new Map(users.map((u) => [u.id, u.email]))

  const tasks = dbTasks.map((t) => ({
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

  return Response.json({ tasks })
}
