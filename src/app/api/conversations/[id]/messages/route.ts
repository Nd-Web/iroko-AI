import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Append a message to a conversation. Owner only. */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session?.user?.id) {
    return Response.json({ error: 'Not signed in.' }, { status: 401 })
  }

  const { id: conversationId } = await params

  const conversation = await db.conversation.findUnique({ where: { id: conversationId } })
  if (!conversation || conversation.userId !== session.user.id) {
    return Response.json({ error: 'Conversation not found.' }, { status: 404 })
  }

  let body: any
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const role = body?.role
  const content = typeof body?.content === 'string' ? body.content : ''
  const messageId = typeof body?.id === 'string' && body.id ? body.id : undefined
  // Optional: set alongside the conversation's first message so the title
  // (derived client-side from the first user message) is persisted too.
  const title = typeof body?.title === 'string' && body.title.trim() ? body.title.trim() : undefined

  if (role !== 'user' && role !== 'assistant') {
    return Response.json({ error: 'role must be "user" or "assistant".' }, { status: 400 })
  }
  if (!content) {
    return Response.json({ error: 'content is required.' }, { status: 400 })
  }

  const [message] = await db.$transaction([
    db.message.create({
      data: { ...(messageId ? { id: messageId } : {}), conversationId, role, content },
    }),
    db.conversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date(), ...(title ? { title } : {}) },
    }),
  ])

  return Response.json({ message })
}
