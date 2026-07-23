import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { DOCUMENT_LABELS, MAX_DOC_BYTES, ALLOWED_DOC_MIME } from '@/lib/operator'
import { isActiveOperator } from '@/lib/operator-access'
import { addTaskEvent } from '@/lib/task-engine'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** May this user see/modify this task's documents? Owner or an operator. */
async function authorize(taskId: string) {
  const session = await auth()
  const email = session?.user?.email ?? null
  const userId = session?.user?.id ?? null
  if (!userId) return { ok: false as const, status: 401, error: 'Not signed in.' }
  const task = await db.serviceTask.findUnique({ where: { id: taskId }, select: { userId: true } })
  if (!task) return { ok: false as const, status: 404, error: 'Task not found.' }
  if (task.userId !== userId && !(await isActiveOperator(email, userId))) {
    return { ok: false as const, status: 403, error: 'Not allowed.' }
  }
  return { ok: true as const, userId, email }
}

/** List document metadata for a task (no bytes). */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const authz = await authorize(id)
  if (!authz.ok) return Response.json({ error: authz.error }, { status: authz.status })

  const docs = await db.taskDocument.findMany({
    where: { taskId: id },
    orderBy: { createdAt: 'asc' },
    select: { id: true, kind: true, label: true, filename: true, mimeType: true, createdAt: true },
  })
  return Response.json({ documents: docs })
}

/** Upload a document (multipart form: `file`, `kind`). Owner only. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const authz = await authorize(id)
  if (!authz.ok) return Response.json({ error: authz.error }, { status: authz.status })

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return Response.json({ error: 'Expected multipart form data.' }, { status: 400 })
  }

  const file = form.get('file')
  const kind = String(form.get('kind') ?? 'other').trim()
  if (!(file instanceof File)) {
    return Response.json({ error: 'No file provided.' }, { status: 400 })
  }
  if (file.size === 0) {
    return Response.json({ error: 'The file is empty.' }, { status: 400 })
  }
  if (file.size > MAX_DOC_BYTES) {
    return Response.json({ error: 'File too large (max 6MB).' }, { status: 413 })
  }
  if (!ALLOWED_DOC_MIME.has(file.type)) {
    return Response.json(
      { error: 'Unsupported file type. Upload a JPG, PNG, WEBP or PDF.' },
      { status: 415 },
    )
  }

  const label = DOCUMENT_LABELS[kind] ?? 'Supporting document'
  const bytes = Buffer.from(await file.arrayBuffer())

  // One document per kind — replace an earlier upload of the same kind.
  await db.taskDocument.deleteMany({ where: { taskId: id, kind } })
  const doc = await db.taskDocument.create({
    data: {
      taskId: id,
      kind,
      label,
      filename: file.name.slice(0, 200) || 'upload',
      mimeType: file.type,
      data: bytes,
    },
    select: { id: true, kind: true, label: true, filename: true, mimeType: true, createdAt: true },
  })
  await addTaskEvent(id, 'NOTE', `Document uploaded: ${label} (${file.name}).`)

  return Response.json({ ok: true, document: doc })
}
