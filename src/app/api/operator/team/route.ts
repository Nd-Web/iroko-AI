import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getOperatorViewer } from '@/lib/operator-access'
import { isValidOperatorRole } from '@/lib/operator'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Manage operators. Primary operators only.
 * Body: { userId, action: 'approve' | 'revoke' | 'set_role', role? }
 */
export async function POST(req: NextRequest) {
  const viewer = await getOperatorViewer()
  if (!viewer.authenticated) return Response.json({ error: 'Not signed in.' }, { status: 401 })
  if (!viewer.isPrimary) {
    return Response.json({ error: 'Only a primary operator can manage the team.' }, { status: 403 })
  }

  let body: { userId?: string; action?: string; role?: string }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }
  const userId = String(body.userId ?? '')
  const action = String(body.action ?? '')
  if (!userId) return Response.json({ error: 'userId is required.' }, { status: 400 })

  const target = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, operatorStatus: true, operatorRole: true },
  })
  if (!target) return Response.json({ error: 'User not found.' }, { status: 404 })

  if (action === 'approve') {
    await db.user.update({
      where: { id: userId },
      data: {
        operatorStatus: 'active',
        operatorGrantedAt: new Date(),
        // Default a role if they somehow have none.
        operatorRole: target.operatorRole ?? 'general',
      },
    })
    return Response.json({ ok: true, status: 'active' })
  }

  if (action === 'revoke') {
    await db.user.update({ where: { id: userId }, data: { operatorStatus: 'revoked' } })
    return Response.json({ ok: true, status: 'revoked' })
  }

  if (action === 'set_role') {
    if (!isValidOperatorRole(body.role)) {
      return Response.json({ error: 'Invalid role.' }, { status: 400 })
    }
    await db.user.update({ where: { id: userId }, data: { operatorRole: body.role } })
    return Response.json({ ok: true, role: body.role })
  }

  return Response.json({ error: 'Unknown action.' }, { status: 400 })
}
