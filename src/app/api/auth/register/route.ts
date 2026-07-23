import { NextRequest } from 'next/server'
import bcrypt from 'bcryptjs'
import { db } from '@/lib/db'
import { rateLimitResponse } from '@/lib/rate-limit'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function POST(req: NextRequest) {
  // 5 signups/minute/IP — signup is rare per real user, so a tight limit
  // here mainly stops automated account-creation abuse.
  const limited = rateLimitResponse(req, 'register', 5, 60_000)
  if (limited) return limited

  let body: any
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''
  const password = typeof body?.password === 'string' ? body.password : ''
  const name = typeof body?.name === 'string' ? body.name.trim().slice(0, 80) : undefined

  if (!EMAIL_RE.test(email)) {
    return Response.json({ error: 'Please enter a valid email address.' }, { status: 400 })
  }
  if (password.length < 8) {
    return Response.json(
      { error: 'Password must be at least 8 characters.' },
      { status: 400 },
    )
  }

  const existing = await db.user.findUnique({ where: { email } })
  if (existing) {
    return Response.json(
      { error: 'An account with this email already exists.' },
      { status: 409 },
    )
  }

  const passwordHash = await bcrypt.hash(password, 12)

  try {
    const user = await db.user.create({
      data: { email, passwordHash, name },
      select: { id: true, email: true },
    })
    return Response.json({ ok: true, userId: user.id })
  } catch (err) {
    console.error('[auth/register] error:', err)
    return Response.json(
      { error: 'Could not create the account. Please try again.' },
      { status: 500 },
    )
  }
}
