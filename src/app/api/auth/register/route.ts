import { NextRequest } from 'next/server'
import bcrypt from 'bcryptjs'
import { db } from '@/lib/db'
import { rateLimitResponse } from '@/lib/rate-limit'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function POST(req: NextRequest) {
  // Generous rate limit (30 signups / min / IP) to allow real user signups without blocking
  const limited = rateLimitResponse(req, 'register', 30, 60_000)
  if (limited) return limited

  let body: any
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON request body.' }, { status: 400 })
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

  try {
    const existing = await db.user.findUnique({ where: { email } })
    if (existing) {
      return Response.json(
        { error: 'An account with this email already exists. Please log in instead.' },
        { status: 409 },
      )
    }

    const passwordHash = await bcrypt.hash(password, 12)

    const user = await db.user.create({
      data: { email, passwordHash, name },
      select: { id: true, email: true },
    })

    return Response.json({ ok: true, userId: user.id })
  } catch (err: any) {
    console.error('[auth/register] CRITICAL DATABASE ERROR:', err?.message || err, err?.stack)
    return Response.json(
      { error: err?.message || 'Database error creating account. Please try again.' },
      { status: 500 },
    )
  }
}
