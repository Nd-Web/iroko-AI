import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Delete a message and any later messages in the same conversation.
 * Mirrors the client store's `removeMessagesFrom` (used by "regenerate").
 * Owner only.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; messageId: string }> },
) {
  const session = await auth()
  if (!session?.user?.id) {
    return Response.json({ error: 'Not signed in.' }, { status: 401 })
  }

  const { id: conversationId, messageId } = await params

  const conversation = await db.conversation.findUnique({ where: { id: conversationId } })
  if (!conversation || conversation.userId !== session.user.id) {
    return Response.json({ error: 'Conversation not found.' }, { status: 404 })
  }

  const target = await db.message.findUnique({ where: { id: messageId } })
  if (!target || target.conversationId !== conversationId) {
    return Response.json({ error: 'Message not found.' }, { status: 404 })
  }

  await db.message.deleteMany({
    where: { conversationId, createdAt: { gte: target.createdAt } },
  })

  return Response.json({ ok: true })
}
