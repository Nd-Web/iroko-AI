/**
 * Server-only operator access resolution (reads the session + the User row).
 * Kept separate from operator.ts so that pure module (roles, constants) stays
 * safe to import from client components.
 *
 * NOTE: only ever import this from server components / route handlers — it
 * pulls in the DB + auth. (The `server-only` guard package isn't installed
 * here, so this is enforced by convention.)
 */
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { isPrimaryOperator, type OperatorStatus } from '@/lib/operator'

export interface OperatorViewer {
  userId: string | null
  email: string | null
  /** Signed in at all? */
  authenticated: boolean
  /** A primary (env) operator — always active, can manage the team. */
  isPrimary: boolean
  /** Allowed to open the operator queue (primary OR granted+active). */
  isActive: boolean
  /** DB operator status for a non-primary user. */
  status: OperatorStatus
  role: string | null
}

/**
 * Is this (already-resolved) user an active operator? For callers that have
 * the session email + userId in hand and don't want to re-run auth().
 */
export async function isActiveOperator(
  email: string | null | undefined,
  userId: string | null | undefined,
): Promise<boolean> {
  if (isPrimaryOperator(email)) return true
  if (!userId) return false
  const u = await db.user.findUnique({ where: { id: userId }, select: { operatorStatus: true } })
  return u?.operatorStatus === 'active'
}

/** Resolve the current viewer's operator standing. Never throws. */
export async function getOperatorViewer(): Promise<OperatorViewer> {
  const session = await auth()
  const email = session?.user?.email ?? null
  const userId = session?.user?.id ?? null
  if (!userId) {
    return { userId: null, email, authenticated: false, isPrimary: false, isActive: false, status: 'none', role: null }
  }

  const primary = isPrimaryOperator(email)
  if (primary) {
    return { userId, email, authenticated: true, isPrimary: true, isActive: true, status: 'active', role: 'primary' }
  }

  const u = await db.user.findUnique({
    where: { id: userId },
    select: { operatorStatus: true, operatorRole: true },
  })
  const status = (u?.operatorStatus as OperatorStatus) ?? 'none'
  return {
    userId,
    email,
    authenticated: true,
    isPrimary: false,
    isActive: status === 'active',
    status,
    role: u?.operatorRole ?? null,
  }
}
