import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { isValidWebhookSignature, paymentsMode } from '@/lib/paystack'
import { markTaskPaid } from '@/lib/task-engine'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Paystack webhook. Point the dashboard's webhook URL at
 *   https://<your-domain>/api/payments/webhook
 *
 * Signature is verified against the raw body (HMAC-SHA512 with the secret
 * key), so this route is safe to expose publicly.
 */
export async function POST(req: NextRequest) {
  if (paymentsMode() !== 'live') {
    return Response.json({ error: 'Payments are not configured.' }, { status: 503 })
  }

  const raw = await req.text()
  const signature = req.headers.get('x-paystack-signature')
  if (!isValidWebhookSignature(raw, signature)) {
    return Response.json({ error: 'Invalid signature' }, { status: 401 })
  }

  let event: any
  try {
    event = JSON.parse(raw)
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (event?.event === 'charge.success') {
    const reference: string | undefined = event?.data?.reference
    if (reference) {
      const task = await db.serviceTask.findUnique({ where: { paymentRef: reference } })
      if (task) {
        await markTaskPaid(task.id, 'webhook', reference)
      } else {
        console.warn('[iroko/payments] webhook for unknown reference:', reference)
      }
    }
  }

  // Always 200 for recognised, verified events — Paystack retries non-200s.
  return Response.json({ received: true })
}
