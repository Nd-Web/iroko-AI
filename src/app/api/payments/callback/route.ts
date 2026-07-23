import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { paymentsMode, verifyPayment } from '@/lib/paystack'
import { markTaskPaid } from '@/lib/task-engine'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Paystack redirects the customer here after checkout. We verify the
 * transaction server-side (never trust the redirect alone) and promote the
 * task, then send the user back into the chat. Also covers local dev where
 * webhooks can't reach localhost.
 */
export async function GET(req: NextRequest) {
  const reference =
    req.nextUrl.searchParams.get('reference') ??
    req.nextUrl.searchParams.get('trxref')

  const home = new URL('/', req.nextUrl.origin)

  if (!reference || paymentsMode() !== 'live') {
    home.searchParams.set('payment', 'unknown')
    return NextResponse.redirect(home)
  }

  const ok = await verifyPayment(reference).catch(() => false)
  if (ok) {
    const task = await db.serviceTask.findUnique({ where: { paymentRef: reference } })
    if (task) await markTaskPaid(task.id, 'callback', reference)
    home.searchParams.set('payment', 'success')
  } else {
    home.searchParams.set('payment', 'failed')
  }
  return NextResponse.redirect(home)
}
