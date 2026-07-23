/**
 * Web search — pluggable provider so Iroko can search the live internet.
 *
 * Provider is chosen by whichever API key is present, in this order:
 *   1. Tavily   (TAVILY_API_KEY)   — AI-optimised, clean snippets + direct answer
 *   2. Brave    (BRAVE_SEARCH_API_KEY)
 *   3. Serper   (SERPER_API_KEY)   — Google results
 *   4. DuckDuckGo HTML             — NO KEY NEEDED (default fallback)
 *
 * Everything degrades gracefully: a provider error falls through to the next
 * option, and the function never throws — callers get `{ results: [] }` with a
 * note explaining what happened.
 */

const TIMEOUT_MS = 8_000
const DEFAULT_MAX = 6
const CACHE_TTL_MS = 5 * 60 * 1000
const CACHE_MAX = 100

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36'

export interface WebSearchResult {
  title: string
  url: string
  snippet: string
}

export interface WebSearchResponse {
  provider: string
  query: string
  /** A direct answer, when the provider supplies one (Tavily). */
  answer?: string
  results: WebSearchResult[]
  note?: string
}

const cache = new Map<string, { at: number; value: WebSearchResponse }>()

function cacheGet(key: string): WebSearchResponse | null {
  const hit = cache.get(key)
  if (!hit) return null
  if (Date.now() - hit.at > CACHE_TTL_MS) {
    cache.delete(key)
    return null
  }
  return hit.value
}

function cacheSet(key: string, value: WebSearchResponse) {
  if (cache.size >= CACHE_MAX) {
    const oldest = cache.keys().next().value
    if (oldest !== undefined) cache.delete(oldest)
  }
  cache.set(key, { at: Date.now(), value })
}

function withTimeout(): { signal: AbortSignal; done: () => void } {
  const ac = new AbortController()
  const t = setTimeout(() => ac.abort(), TIMEOUT_MS)
  return { signal: ac.signal, done: () => clearTimeout(t) }
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, '/')
    .replace(/&nbsp;/g, ' ')
}

function stripTags(html: string): string {
  return decodeEntities(html.replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim()
}

/* ------------------------------ providers ------------------------------ */

async function searchTavily(query: string, max: number): Promise<WebSearchResponse> {
  const { signal, done } = withTimeout()
  try {
    const res = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        api_key: process.env.TAVILY_API_KEY,
        query,
        max_results: max,
        include_answer: true,
        search_depth: 'basic',
      }),
      signal,
    })
    if (!res.ok) throw new Error(`Tavily HTTP ${res.status}`)
    const json: any = await res.json()
    return {
      provider: 'tavily',
      query,
      answer: typeof json?.answer === 'string' ? json.answer : undefined,
      results: (json?.results ?? []).slice(0, max).map((r: any) => ({
        title: String(r?.title ?? '').trim(),
        url: String(r?.url ?? '').trim(),
        snippet: String(r?.content ?? '').trim().slice(0, 500),
      })),
    }
  } finally {
    done()
  }
}

async function searchBrave(query: string, max: number): Promise<WebSearchResponse> {
  const { signal, done } = withTimeout()
  try {
    const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${max}`
    const res = await fetch(url, {
      headers: {
        accept: 'application/json',
        'X-Subscription-Token': process.env.BRAVE_SEARCH_API_KEY as string,
      },
      signal,
    })
    if (!res.ok) throw new Error(`Brave HTTP ${res.status}`)
    const json: any = await res.json()
    const web = json?.web?.results ?? []
    return {
      provider: 'brave',
      query,
      results: web.slice(0, max).map((r: any) => ({
        title: String(r?.title ?? '').trim(),
        url: String(r?.url ?? '').trim(),
        snippet: stripTags(String(r?.description ?? '')).slice(0, 500),
      })),
    }
  } finally {
    done()
  }
}

async function searchSerper(query: string, max: number): Promise<WebSearchResponse> {
  const { signal, done } = withTimeout()
  try {
    const res = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: {
        'X-API-KEY': process.env.SERPER_API_KEY as string,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ q: query, num: max }),
      signal,
    })
    if (!res.ok) throw new Error(`Serper HTTP ${res.status}`)
    const json: any = await res.json()
    const organic = json?.organic ?? []
    const answer = json?.answerBox?.answer || json?.answerBox?.snippet
    return {
      provider: 'serper',
      query,
      answer: typeof answer === 'string' ? answer : undefined,
      results: organic.slice(0, max).map((r: any) => ({
        title: String(r?.title ?? '').trim(),
        url: String(r?.link ?? '').trim(),
        snippet: String(r?.snippet ?? '').trim().slice(0, 500),
      })),
    }
  } finally {
    done()
  }
}

/** Parse the DuckDuckGo HTML endpoint (result__a links + snippets). */
async function ddgHtml(query: string, max: number): Promise<WebSearchResult[]> {
  const { signal, done } = withTimeout()
  try {
    const res = await fetch('https://html.duckduckgo.com/html/', {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        'user-agent': UA,
        accept: 'text/html',
      },
      body: `q=${encodeURIComponent(query)}`,
      signal,
    })
    if (!res.ok) throw new Error(`DuckDuckGo HTTP ${res.status}`)
    const html = await res.text()
    const results: WebSearchResult[] = []
    const linkRe = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g
    const snippetRe = /class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g
    const snippets: string[] = []
    let sm: RegExpExecArray | null
    while ((sm = snippetRe.exec(html)) !== null) snippets.push(stripTags(sm[1]))
    let m: RegExpExecArray | null
    let i = 0
    while ((m = linkRe.exec(html)) !== null && results.length < max) {
      let href = m[1]
      const uddg = href.match(/[?&]uddg=([^&]+)/)
      if (uddg) href = decodeURIComponent(uddg[1])
      else if (href.startsWith('//')) href = 'https:' + href
      const title = stripTags(m[2])
      if (title && /^https?:\/\//.test(href)) results.push({ title, url: href, snippet: snippets[i] ?? '' })
      i++
    }
    return results
  } finally {
    done()
  }
}

/** Parse the DuckDuckGo Lite endpoint (table of result links). */
async function ddgLite(query: string, max: number): Promise<WebSearchResult[]> {
  const { signal, done } = withTimeout()
  try {
    const res = await fetch('https://lite.duckduckgo.com/lite/', {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        'user-agent': UA,
        accept: 'text/html',
      },
      body: `q=${encodeURIComponent(query)}`,
      signal,
    })
    if (!res.ok) throw new Error(`DuckDuckGo Lite HTTP ${res.status}`)
    const html = await res.text()
    const results: WebSearchResult[] = []
    const linkRe = /<a[^>]+class="result-link"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g
    let m: RegExpExecArray | null
    while ((m = linkRe.exec(html)) !== null && results.length < max) {
      let href = m[1]
      const uddg = href.match(/[?&]uddg=([^&]+)/)
      if (uddg) href = decodeURIComponent(uddg[1])
      else if (href.startsWith('//')) href = 'https:' + href
      const title = stripTags(m[2])
      if (title && /^https?:\/\//.test(href)) results.push({ title, url: href, snippet: '' })
    }
    return results
  } finally {
    done()
  }
}

/** Keyless fallback: try the DuckDuckGo HTML endpoint, then Lite. */
async function searchDuckDuckGo(query: string, max: number): Promise<WebSearchResponse> {
  let results: WebSearchResult[] = []
  try {
    results = await ddgHtml(query, max)
  } catch {
    /* try lite next */
  }
  if (results.length === 0) {
    try {
      results = await ddgLite(query, max)
    } catch {
      /* give up */
    }
  }
  return {
    provider: 'duckduckgo',
    query,
    results,
    note:
      results.length === 0
        ? 'DuckDuckGo returned no results (it may be rate-limiting). For reliable search set TAVILY_API_KEY (free tier).'
        : undefined,
  }
}

/* ------------------------------ dispatcher ------------------------------ */

function providerChain(): ((q: string, max: number) => Promise<WebSearchResponse>)[] {
  const chain: ((q: string, max: number) => Promise<WebSearchResponse>)[] = []
  if (process.env.TAVILY_API_KEY) chain.push(searchTavily)
  if (process.env.BRAVE_SEARCH_API_KEY) chain.push(searchBrave)
  if (process.env.SERPER_API_KEY) chain.push(searchSerper)
  chain.push(searchDuckDuckGo) // always available, last resort
  return chain
}

/**
 * Search the web. Tries configured providers in order, falling through on
 * error. Never throws.
 */
export async function webSearch(query: string, maxResults = DEFAULT_MAX): Promise<WebSearchResponse> {
  const q = query.trim()
  const max = Math.min(Math.max(1, maxResults), 10)
  if (!q) return { provider: 'none', query: q, results: [], note: 'Empty query.' }

  const cacheKey = `${max}:${q.toLowerCase()}`
  const cached = cacheGet(cacheKey)
  if (cached) return cached

  const errors: string[] = []
  for (const provider of providerChain()) {
    try {
      const out = await provider(q, max)
      if (out.results.length > 0 || out.answer) {
        cacheSet(cacheKey, out)
        return out
      }
      if (out.note) errors.push(out.note)
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err))
    }
  }
  return {
    provider: 'none',
    query: q,
    results: [],
    note: `Web search returned nothing. ${errors.slice(-1)[0] ?? ''}`.trim(),
  }
}
