/**
 * Live CAC public name search.
 *
 * The CAC exposes a public company search (the same one behind
 * search.cac.gov.ng). There is no official public API contract, so the
 * endpoint is env-configurable and the whole module degrades gracefully:
 * if the endpoint is unset, slow, or returns an unexpected shape, callers
 * get `{ live: false }` and fall back to the local rules engine.
 *
 * Env:
 *   CAC_PUBLIC_SEARCH_URL  e.g. https://searchapp.cac.gov.ng/api/search
 *                          `{query}` placeholder is replaced with the term;
 *                          otherwise the term is appended as ?searchTerm=
 */

export interface CacLiveResult {
  /** Whether a live lookup actually happened. */
  live: boolean
  /** Registered names returned by the portal (normalised, lowercased). */
  matches: string[]
  /** True when an identical (case-insensitive) name exists. */
  exactMatch: boolean
  note: string
}

const TIMEOUT_MS = 6_000
const CACHE_TTL_MS = 10 * 60 * 1000
const CACHE_MAX = 200

// Tiny in-memory TTL cache — name checks repeat a lot inside one flow
// (user tries variations), and we never want to hammer the portal.
const cache = new Map<string, { at: number; result: CacLiveResult }>()

function cacheGet(key: string): CacLiveResult | null {
  const hit = cache.get(key)
  if (!hit) return null
  if (Date.now() - hit.at > CACHE_TTL_MS) {
    cache.delete(key)
    return null
  }
  return hit.result
}

function cacheSet(key: string, result: CacLiveResult) {
  if (cache.size >= CACHE_MAX) {
    // drop the oldest entry (Map preserves insertion order)
    const oldest = cache.keys().next().value
    if (oldest !== undefined) cache.delete(oldest)
  }
  cache.set(key, { at: Date.now(), result })
}

/** Pull candidate name strings out of whatever JSON shape the portal returns. */
function extractNames(payload: unknown): string[] {
  const names: string[] = []
  const push = (v: unknown) => {
    if (typeof v === 'string' && v.trim()) names.push(v.trim().toLowerCase())
  }
  const walk = (node: unknown, depth: number) => {
    if (!node || depth > 4 || names.length >= 50) return
    if (Array.isArray(node)) {
      for (const item of node) walk(item, depth + 1)
      return
    }
    if (typeof node === 'object') {
      const obj = node as Record<string, unknown>
      // common CAC payload keys
      push(obj.approvedName)
      push(obj.approved_name)
      push(obj.companyName)
      push(obj.company_name)
      push(obj.name)
      for (const key of ['data', 'results', 'items', 'content', 'records']) {
        if (key in obj) walk(obj[key], depth + 1)
      }
    }
  }
  walk(payload, 0)
  return [...new Set(names)]
}

/**
 * Query the CAC public search for a proposed name.
 * Never throws — always resolves with a CacLiveResult.
 */
export async function searchCacLive(name: string): Promise<CacLiveResult> {
  const base = process.env.CAC_PUBLIC_SEARCH_URL
  const term = name.trim().toLowerCase().replace(/\s+/g, ' ')

  if (!base) {
    return {
      live: false,
      matches: [],
      exactMatch: false,
      note: 'Live CAC search not configured (CAC_PUBLIC_SEARCH_URL unset) — using rules-based check only.',
    }
  }
  if (!term) {
    return { live: false, matches: [], exactMatch: false, note: 'Empty search term.' }
  }

  const cached = cacheGet(term)
  if (cached) return cached

  const url = base.includes('{query}')
    ? base.replace('{query}', encodeURIComponent(term))
    : `${base}${base.includes('?') ? '&' : '?'}searchTerm=${encodeURIComponent(term)}`

  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      headers: { accept: 'application/json' },
      signal: ac.signal,
    })
    if (!res.ok) {
      return {
        live: false,
        matches: [],
        exactMatch: false,
        note: `CAC portal returned HTTP ${res.status} — using rules-based check only.`,
      }
    }
    const payload = await res.json()
    const matches = extractNames(payload)
    const result: CacLiveResult = {
      live: true,
      matches: matches.slice(0, 20),
      exactMatch: matches.includes(term),
      note:
        matches.length === 0
          ? 'Live CAC search returned no similar registrations.'
          : `Live CAC search returned ${matches.length} similar registration(s).`,
    }
    cacheSet(term, result)
    return result
  } catch (err) {
    const aborted = err instanceof Error && err.name === 'AbortError'
    return {
      live: false,
      matches: [],
      exactMatch: false,
      note: aborted
        ? 'Live CAC search timed out — using rules-based check only.'
        : 'Live CAC search unreachable — using rules-based check only.',
    }
  } finally {
    clearTimeout(timer)
  }
}
