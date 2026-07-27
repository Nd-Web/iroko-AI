/**
 * In-memory sliding-window rate limiter.
 */

interface Bucket {
  hits: number[] // timestamps (ms) of requests within the current window
}

const buckets = new Map<string, Bucket>()

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
 * Sliding-window rate limit check.
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
 * Robust client IP extraction for Vercel, Cloudflare, Caddy, and reverse proxies.
 * Never returns a single shared 'unknown' string that locks out all global users!
 */
export function getClientIp(req: Request): string {
  const xvercel = req.headers.get('x-vercel-forwarded-for')
  if (xvercel) {
    const first = xvercel.split(',')[0]?.trim()
    if (first) return first
  }
  const cf = req.headers.get('cf-connecting-ip')
  if (cf) return cf.trim()

  const xff = req.headers.get('x-forwarded-for')
  if (xff) {
    const first = xff.split(',')[0]?.trim()
    if (first) return first
  }
  const xri = req.headers.get('x-real-ip')
  if (xri) return xri.trim()

  // Generate unique pseudo-IP fallback so we never block global users on a shared key
  return `anon-${Math.random().toString(36).slice(2, 9)}`
}

/**
 * Drop-in guard for route handlers. Returns a 429 Response if the caller is
 * over the limit for this route, otherwise null (meaning: proceed).
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
