/**
 * Paystack payments.
 *
 * Modes (resolved by paymentsMode()):
 *  - 'live'     PAYSTACK_SECRET_KEY is set → real Paystack init/verify/webhook.
 *  - 'simulate' no key, and PAYMENTS_MODE != 'off' → tasks are queued
 *               immediately with a clearly-logged simulated payment. Lets the
 *               whole task pipeline run end-to-end in dev/demo.
 *  - 'off'      PAYMENTS_MODE=off and no key → tasks stay AWAITING_PAYMENT.
 */

import crypto from 'crypto'

const PAYSTACK_BASE = 'https://api.paystack.co'

export type PaymentsMode = 'live' | 'simulate' | 'off'

export function paymentsMode(): PaymentsMode {
  if (process.env.PAYSTACK_SECRET_KEY) return 'live'
  return process.env.PAYMENTS_MODE === 'off' ? 'off' : 'simulate'
}

function secretKey(): string {
  const key = process.env.PAYSTACK_SECRET_KEY
  if (!key) throw new Error('PAYSTACK_SECRET_KEY is not set')
  return key
}

function appUrl(): string {
  return (
    process.env.APP_URL ||
    process.env.OPENROUTER_APP_URL ||
    'http://localhost:3000'
  ).replace(/\/$/, '')
}

export interface InitializedPayment {
  reference: string
  /** Hosted checkout URL the user opens to pay (card/transfer/USSD). */
  authorizationUrl: string
}

/** Create a hosted checkout for a task. Amount is in kobo. */
export async function initializePayment(opts: {
  email: string
  amountKobo: number
  reference: string
  taskId: string
}): Promise<InitializedPayment> {
  const res = await fetch(`${PAYSTACK_BASE}/transaction/initialize`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${secretKey()}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      email: opts.email,
      amount: opts.amountKobo,
      reference: opts.reference,
      currency: 'NGN',
      callback_url: `${appUrl()}/api/payments/callback`,
      metadata: { taskId: opts.taskId, source: 'iroko-ai' },
    }),
  })
  const json: any = await res.json().catch(() => null)
  if (!res.ok || !json?.status || !json?.data?.authorization_url) {
    throw new Error(
      `Paystack initialize failed (${res.status}): ${JSON.stringify(json?.message ?? json).slice(0, 200)}`,
    )
  }
  return {
    reference: json.data.reference ?? opts.reference,
    authorizationUrl: json.data.authorization_url,
  }
}

/** Verify a transaction by reference. Returns true only for a successful charge. */
export async function verifyPayment(reference: string): Promise<boolean> {
  const res = await fetch(
    `${PAYSTACK_BASE}/transaction/verify/${encodeURIComponent(reference)}`,
    { headers: { authorization: `Bearer ${secretKey()}` } },
  )
  const json: any = await res.json().catch(() => null)
  return !!(res.ok && json?.status && json?.data?.status === 'success')
}

/** Constant-time check of the x-paystack-signature webhook header. */
export function isValidWebhookSignature(rawBody: string, signature: string | null): boolean {
  if (!signature) return false
  const expected = crypto
    .createHmac('sha512', secretKey())
    .update(rawBody)
    .digest('hex')
  const a = Buffer.from(expected)
  const b = Buffer.from(signature)
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}
