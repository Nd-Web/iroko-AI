import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** List the signed-in user's conversations, each with its messages. */
export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return Response.json({ error: 'Not signed in.' }, { status: 401 })
  }

  const conversations = await db.conversation.findMany({
    where: { userId: session.user.id },
    orderBy: { updatedAt: 'desc' },
    include: { messages: { orderBy: { createdAt: 'asc' } } },
  })

  return Response.json({ conversations })
}

/** Create a new (initially empty) conversation for the signed-in user. */
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return Response.json({ error: 'Not signed in.' }, { status: 401 })
  }

  let body: any
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const id = typeof body?.id === 'string' && body.id ? body.id : undefined
  const title = typeof body?.title === 'string' && body.title.trim() ? body.title.trim() : 'New chat'

  const conversation = await db.conversation.create({
    data: { ...(id ? { id } : {}), userId: session.user.id, title },
  })

  return Response.json({ conversation })
}
