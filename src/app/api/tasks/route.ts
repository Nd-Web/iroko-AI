import { auth } from '@/lib/auth'
import { db } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** List the signed-in user's service tasks (newest first) for the sidebar tracker. */
export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return Response.json({ error: 'Not signed in.' }, { status: 401 })
  }

  const tasks = await db.serviceTask.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: 'desc' },
    take: 12,
    select: {
      id: true,
      title: true,
      status: true,
      amountKobo: true,
      paidAt: true,
      createdAt: true,
      updatedAt: true,
      events: {
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { message: true, createdAt: true },
      },
    },
  })

  return Response.json({
    tasks: tasks.map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status,
      amountKobo: t.amountKobo,
      paid: !!t.paidAt,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
      lastEvent: t.events[0]?.message ?? null,
    })),
  })
}
