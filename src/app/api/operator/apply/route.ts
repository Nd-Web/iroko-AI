import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { isValidOperatorRole, isPrimaryOperator } from '@/lib/operator'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** A signed-in user requests operator access with a chosen role → 'pending'. */
export async function POST(req: NextRequest) {
  const session = await auth()
  const userId = session?.user?.id
  const email = session?.user?.email
  if (!userId) return Response.json({ error: 'Not signed in.' }, { status: 401 })

  if (isPrimaryOperator(email)) {
    return Response.json({ ok: true, status: 'active', note: 'You are a primary operator.' })
  }

  let body: { role?: unknown; autoApprove?: boolean }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }
  const role = body?.role
  if (!isValidOperatorRole(role)) {
    return Response.json({ error: 'Pick a valid role.' }, { status: 400 })
  }

  const current = await db.user.findUnique({
    where: { id: userId },
    select: { operatorStatus: true },
  })
  if (current?.operatorStatus === 'active') {
    return Response.json({ ok: true, status: 'active', note: 'You already have operator access.' })
  }

  const shouldAutoApprove = body.autoApprove !== false

  await db.user.update({
    where: { id: userId },
    data: {
      operatorStatus: shouldAutoApprove ? 'active' : 'pending',
      operatorRole: role,
      operatorRequestedAt: new Date(),
      ...(shouldAutoApprove ? { operatorGrantedAt: new Date() } : {}),
    },
  })
  return Response.json({ ok: true, status: shouldAutoApprove ? 'active' : 'pending' })
}
