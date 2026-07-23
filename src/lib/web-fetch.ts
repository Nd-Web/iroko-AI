/**
 * Fetch a web page and extract readable text so Iroko can actually READ a
 * source (e.g. open a CAC/FIRS page a search turned up and quote the fee).
 *
 * Safety:
 *  - Only http/https.
 *  - SSRF guard: blocks localhost, private/link-local ranges and the cloud
 *    metadata IP so the AI can't be steered into the internal network.
 *  - Hard caps on download size and returned text length; short timeout.
 *  - Only text/html and text/plain are read.
 *
 * Never throws — returns { ok:false, note } on any problem.
 */

const TIMEOUT_MS = 10_000
const MAX_BYTES = 2_000_000 // 2 MB download cap
const MAX_TEXT = 12_000 // chars returned to the model

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36'

export interface FetchReadableResult {
  ok: boolean
  url: string
  title?: string
  text?: string
  truncated?: boolean
  note?: string
}

/** True for hostnames/IPs we must never fetch server-side. */
function isBlockedHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, '') // strip IPv6 brackets
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal')) {
    return true
  }
  if (h === '::1' || h === '0.0.0.0') return true
  // IPv4 private / loopback / link-local / metadata
  const v4 = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (v4) {
    const [a, b] = [parseInt(v4[1], 10), parseInt(v4[2], 10)]
    if (a === 127 || a === 10 || a === 0) return true
    if (a === 169 && b === 254) return true // link-local + 169.254.169.254 metadata
    if (a === 192 && b === 168) return true
    if (a === 172 && b >= 16 && b <= 31) return true
    if (a === 100 && b >= 64 && b <= 127) return true // carrier-grade NAT
  }
  // IPv6 unique-local / link-local
  if (/^f[cd][0-9a-f]{2}:/.test(h) || /^fe80:/.test(h)) return true
  return false
}

function extractTitle(html: string): string | undefined {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  return m ? decodeEntities(m[1]).replace(/\s+/g, ' ').trim().slice(0, 200) : undefined
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => {
      const code = parseInt(n, 10)
      return code > 0 && code < 0x10ffff ? String.fromCodePoint(code) : ''
    })
}

/** Crude but effective HTML → readable text. */
function htmlToText(html: string): string {
  return decodeEntities(
    html
      // drop non-content blocks entirely
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
      .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<(nav|footer|header|aside)[\s\S]*?<\/\1>/gi, ' ')
      // block elements → newlines so structure survives
      .replace(/<\/(p|div|section|article|li|tr|h[1-6]|br)>/gi, '\n')
      .replace(/<li[^>]*>/gi, '• ')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/\n\s*\n\s*\n+/g, '\n\n')
    .replace(/^\s+|\s+$/gm, '')
    .trim()
}

export async function fetchReadable(rawUrl: string): Promise<FetchReadableResult> {
  let url: URL
  try {
    url = new URL(rawUrl.trim())
  } catch {
    return { ok: false, url: rawUrl, note: 'Not a valid URL.' }
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, url: rawUrl, note: 'Only http/https URLs can be fetched.' }
  }
  if (isBlockedHost(url.hostname)) {
    return { ok: false, url: rawUrl, note: 'That address is not allowed (local/private network).' }
  }

  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(url.toString(), {
      headers: { 'user-agent': UA, accept: 'text/html,text/plain,*/*' },
      redirect: 'follow',
      signal: ac.signal,
    })
    if (!res.ok) {
      return { ok: false, url: url.toString(), note: `The page returned HTTP ${res.status}.` }
    }
    // Guard against redirects into the private network.
    try {
      const finalHost = new URL(res.url).hostname
      if (isBlockedHost(finalHost)) {
        return { ok: false, url: res.url, note: 'Redirected to a disallowed address.' }
      }
    } catch {
      /* keep original url */
    }

    const contentType = res.headers.get('content-type') ?? ''
    if (!/text\/html|text\/plain|application\/xhtml/i.test(contentType) && contentType) {
      return {
        ok: false,
        url: res.url,
        note: `Unsupported content type "${contentType.split(';')[0]}". Only web pages can be read.`,
      }
    }

    // Read with a byte cap so a giant page can't blow up memory.
    const reader = res.body?.getReader()
    if (!reader) return { ok: false, url: res.url, note: 'Empty response body.' }
    const chunks: Uint8Array[] = []
    let total = 0
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (value) {
        chunks.push(value)
        total += value.length
        if (total > MAX_BYTES) {
          try { await reader.cancel() } catch { /* noop */ }
          break
        }
      }
    }
    const buf = Buffer.concat(chunks.map((c) => Buffer.from(c)))
    const html = buf.toString('utf8')

    const isHtml = /html|xhtml/i.test(contentType) || /<html|<body|<div/i.test(html.slice(0, 500))
    const title = isHtml ? extractTitle(html) : undefined
    let text = isHtml ? htmlToText(html) : html.replace(/\s+\n/g, '\n').trim()
    const truncated = text.length > MAX_TEXT
    if (truncated) text = text.slice(0, MAX_TEXT)

    if (!text.trim()) {
      return { ok: false, url: res.url, title, note: 'The page had no readable text.' }
    }
    return { ok: true, url: res.url, title, text, truncated }
  } catch (err) {
    const aborted = err instanceof Error && err.name === 'AbortError'
    return {
      ok: false,
      url: url.toString(),
      note: aborted ? 'The page took too long to load.' : 'Could not load that page.',
    }
  } finally {
    clearTimeout(timer)
  }
}
