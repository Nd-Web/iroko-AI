import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Rename a conversation. Only its owner may do this. */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session?.user?.id) {
    return Response.json({ error: 'Not signed in.' }, { status: 401 })
  }

  const { id } = await params
  let body: any
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const title = typeof body?.title === 'string' ? body.title.trim() : ''
  if (!title) {
    return Response.json({ error: 'A non-empty title is required.' }, { status: 400 })
  }

  const existing = await db.conversation.findUnique({ where: { id } })
  if (!existing || existing.userId !== session.user.id) {
    return Response.json({ error: 'Conversation not found.' }, { status: 404 })
  }

  const conversation = await db.conversation.update({
    where: { id },
    data: { title },
  })

  return Response.json({ conversation })
}

/** Delete a conversation (and, via cascade, its messages). Owner only. */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session?.user?.id) {
    return Response.json({ error: 'Not signed in.' }, { status: 401 })
  }

  const { id } = await params

  const existing = await db.conversation.findUnique({ where: { id } })
  if (!existing || existing.userId !== session.user.id) {
    return Response.json({ error: 'Conversation not found.' }, { status: 404 })
  }

  await db.conversation.delete({ where: { id } })

  return Response.json({ ok: true })
}
