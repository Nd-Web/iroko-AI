import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { isActiveOperator } from '@/lib/operator-access'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Serve a task document's bytes. Only the task owner or an operator may fetch
 * it — documents are never exposed on a public path.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; docId: string }> },
) {
  const { id, docId } = await params
  const session = await auth()
  const email = session?.user?.email ?? null
  const userId = session?.user?.id ?? null
  if (!userId) return Response.json({ error: 'Not signed in.' }, { status: 401 })

  const task = await db.serviceTask.findUnique({ where: { id }, select: { userId: true } })
  if (!task) return Response.json({ error: 'Task not found.' }, { status: 404 })
  if (task.userId !== userId && !(await isActiveOperator(email, userId))) {
    return Response.json({ error: 'Not allowed.' }, { status: 403 })
  }

  const doc = await db.taskDocument.findFirst({
    where: { id: docId, taskId: id },
    select: { filename: true, mimeType: true, data: true },
  })
  if (!doc) return Response.json({ error: 'Document not found.' }, { status: 404 })

  const body = new Uint8Array(doc.data)
  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': doc.mimeType || 'application/octet-stream',
      'Content-Disposition': `inline; filename="${encodeURIComponent(doc.filename)}"`,
      'Cache-Control': 'private, no-store',
    },
  })
}
