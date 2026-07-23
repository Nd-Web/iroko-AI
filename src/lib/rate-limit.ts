/**
 * Simple in-memory sliding-window rate limiter.
 *
 * This app runs as a single long-lived Node process behind Caddy (see
 * Caddyfile / .zscripts/start.sh) rather than as scattered serverless
 * instances, so a shared in-memory Map is the right tool here — no Redis or
 * external store needed. If this ever moves to multiple server instances
 * behind a load balancer, swap this for a shared store (Redis, etc.).
 */

interface Bucket {
  hits: number[] // timestamps (ms) of requests within the current window
}

const buckets = new Map<string, Bucket>()

// Periodically drop stale buckets so this Map doesn't grow forever.
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000
let lastCleanup = Date.now()

function cleanup(now: number) {
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return
  lastCleanup = now
  for (const [key, bucket] of buckets) {
    const newest = bucket.hits[bucket.hits.length - 1]
    if (newest === undefined || now - newest > CLEANUP_INTERVAL_MS) {
      buckets.delete(key)
    }
  }
}

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  retryAfterSeconds: number
}

/**
 * Sliding-window rate limit check. `key` should already be scoped to both the
 * caller and the route, e.g. `chat:203.0.113.4`.
 */
export function checkRateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now()
  cleanup(now)

  let bucket = buckets.get(key)
  if (!bucket) {
    bucket = { hits: [] }
    buckets.set(key, bucket)
  }

  const windowStart = now - windowMs
  bucket.hits = bucket.hits.filter((t) => t > windowStart)

  if (bucket.hits.length >= limit) {
    const oldest = bucket.hits[0]
    const retryAfterSeconds = Math.max(1, Math.ceil((oldest + windowMs - now) / 1000))
    return { allowed: false, remaining: 0, retryAfterSeconds }
  }

  bucket.hits.push(now)
  return { allowed: true, remaining: limit - bucket.hits.length, retryAfterSeconds: 0 }
}

/**
 * Best-effort client IP extraction. Trusts x-forwarded-for / x-real-ip
 * because Caddy (our own reverse proxy — see Caddyfile) sets these from the
 * actual remote connection; it isn't client-suppliable from outside.
 */
export function getClientIp(req: Request): string {
  const xff = req.headers.get('x-forwarded-for')
  if (xff) {
    const first = xff.split(',')[0]?.trim()
    if (first) return first
  }
  const xri = req.headers.get('x-real-ip')
  if (xri) return xri.trim()
  return 'unknown'
}

/**
 * Drop-in guard for route handlers. Returns a 429 Response if the caller is
 * over the limit for this route, otherwise null (meaning: proceed).
 *
 * Usage:
 *   const limited = rateLimitResponse(req, 'chat', 20, 60_000)
 *   if (limited) return limited
 */
export function rateLimitResponse(
  req: Request,
  routeName: string,
  limit: number,
  windowMs: number,
): Response | null {
  const ip = getClientIp(req)
  const { allowed, retryAfterSeconds } = checkRateLimit(`${routeName}:${ip}`, limit, windowMs)
  if (allowed) return null
  return Response.json(
    { error: 'Too many requests. Please slow down and try again shortly.' },
    { status: 429, headers: { 'retry-after': String(retryAfterSeconds) } },
  )
}
