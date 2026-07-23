/**
 * Live CAC public-registry name search via a REAL browser.
 *
 * Iroko launches a headless browser, opens the CAC public search
 * (search.cac.gov.ng), types the proposed name, clicks Search, waits for the
 * results, reads them, and returns structured matches — exactly "go to the
 * CAC site, search, click buttons, come back with a result".
 *
 * Reality: search.cac.gov.ng is behind Cloudflare's anti-bot challenge, which
 * blocks ordinary automated browsers. So the browser backend is PLUGGABLE:
 *
 *   • SCRAPING_BROWSER_WS set   → connect over CDP to a stealth/unblocker
 *     browser. VERIFIED WORKING: Browserless.io's `/stealth` route with
 *     `solveCaptchas=true` (their infra solves Cloudflare Turnstile
 *     transparently before the page resolves) reliably clears CAC and
 *     returns real results — e.g.
 *     wss://production-sfo.browserless.io/stealth?token=...&solveCaptchas=true
 *     Bright Data's Browser API was ALSO tried but blanket-blocks *.gov
 *     domains under its acceptable-use policy, so it can't reach CAC at all
 *     regardless of stealth settings — don't use Bright Data for this target.
 *   • FLARESOLVERR_URL set      → free/open-source FlareSolverr
 *     (github.com/FlareSolverr/FlareSolverr, self-host via Docker) as a
 *     zero-cost fallback. Unverified against CAC's specific challenge and
 *     known not to solve interactive Turnstile, so treat as best-effort.
 *   • otherwise (local)         → launch local Chromium. Works for un-protected
 *     targets; on CAC it hits the Cloudflare wall and reports `blocked`.
 *
 * Either way it NEVER throws and always returns a structured result the caller
 * can fall back on (to web search).
 */

export interface CacMatch {
  name: string
  rcNumber?: string
  status?: string
}

export interface CacBrowserResult {
  attempted: boolean
  /** True when Cloudflare / an anti-bot wall stopped us. */
  blocked: boolean
  matches: CacMatch[]
  exactMatch: boolean
  via: 'scraping-browser' | 'local-chromium' | 'unavailable'
  note: string
}

const NAV_TIMEOUT = 60_000
const CF_CLEAR_TIMEOUT = 45_000
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36'

const SEARCH_URL = 'https://search.cac.gov.ng/'

function unavailable(note: string): CacBrowserResult {
  return { attempted: false, blocked: false, matches: [], exactMatch: false, via: 'unavailable', note }
}

/** Is a real browser attempt allowed right now? */
export function cacBrowserMode(allowLocal: boolean): 'scraping-browser' | 'local' | 'off' {
  if (process.env.SCRAPING_BROWSER_WS) return 'scraping-browser'
  // FlareSolverr and forced-local both drive a local browser; the difference
  // is whether we first fetch a Cloudflare-clearance cookie from FlareSolverr.
  if (process.env.FLARESOLVERR_URL) return 'local'
  if (allowLocal || process.env.CAC_BROWSER_FORCE_LOCAL === '1') return 'local'
  return 'off'
}

interface CfClearance {
  cookies: { name: string; value: string; domain: string; path: string }[]
  userAgent: string
}

/**
 * Ask a self-hosted FlareSolverr (free, open source) to solve the Cloudflare
 * challenge for a URL and return the resulting clearance cookies + UA. We then
 * replay those in our own browser so the interactive search works. Returns
 * null if FlareSolverr isn't configured or fails.
 */
async function getFlareSolverrClearance(url: string): Promise<CfClearance | null> {
  const base = process.env.FLARESOLVERR_URL
  if (!base) return null
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), 60_000)
  try {
    const res = await fetch(`${base.replace(/\/$/, '')}/v1`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ cmd: 'request.get', url, maxTimeout: 55_000 }),
      signal: ac.signal,
    })
    if (!res.ok) return null
    const json: any = await res.json()
    if (json?.status !== 'ok' || !json?.solution) return null
    const sol = json.solution
    const cookies = (sol.cookies ?? [])
      .filter((c: any) => c?.name && c?.value)
      .map((c: any) => ({
        name: String(c.name),
        value: String(c.value),
        domain: String(c.domain || '.cac.gov.ng'),
        path: String(c.path || '/'),
      }))
    return { cookies, userAgent: String(sol.userAgent || UA) }
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Drive the CAC public search. `allowLocal` lets the standalone tool force a
 * local-browser attempt even without a scraping service configured.
 */
export async function cacBrowserSearch(
  rawName: string,
  allowLocal = false,
): Promise<CacBrowserResult> {
  const name = rawName.trim()
  if (!name) return unavailable('No name provided.')

  const mode = cacBrowserMode(allowLocal)
  if (mode === 'off') {
    return unavailable(
      'Browser automation not run: CAC search is Cloudflare-protected and no SCRAPING_BROWSER_WS is configured. Set one to enable real CAC-site automation.',
    )
  }

  // Playwright is optional; import dynamically so the app runs without it.
  let playwright: typeof import('playwright')
  try {
    playwright = await import(/* webpackIgnore: true */ 'playwright')
  } catch {
    return unavailable('Browser engine (playwright) is not installed on this server.')
  }

  const via = mode === 'scraping-browser' ? 'scraping-browser' : 'local-chromium'
  let browser: import('playwright').Browser | null = null
  try {
    // Free path: have FlareSolverr solve Cloudflare first, reuse its cookies.
    const clearance = mode === 'local' ? await getFlareSolverrClearance(SEARCH_URL) : null

    browser =
      mode === 'scraping-browser'
        ? await playwright.chromium.connectOverCDP(process.env.SCRAPING_BROWSER_WS as string, {
            timeout: NAV_TIMEOUT,
          })
        : await playwright.chromium.launch({
            headless: true,
            args: ['--disable-blink-features=AutomationControlled', '--no-sandbox'],
          })

    // For a scraping-browser (e.g. Browserless /stealth?solveCaptchas=true),
    // its anti-bot/CAPTCHA-solving is tied to the session's default context —
    // creating a fresh newContext() here spins up an unprotected context that
    // loses that handling. Reuse the provided context instead. Only local
    // Chromium (and FlareSolverr's cookie-injection path) needs a fresh one.
    const context =
      mode === 'scraping-browser'
        ? browser.contexts()[0] ?? (await browser.newContext())
        : await browser.newContext({
            userAgent: clearance?.userAgent || UA,
            viewport: { width: 1366, height: 768 },
            locale: 'en-NG',
            timezoneId: 'Africa/Lagos',
          })
    if (mode !== 'scraping-browser') {
      await context.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined })
      })
    }
    if (clearance?.cookies.length) {
      await context.addCookies(
        clearance.cookies.map((c) => ({ ...c, url: SEARCH_URL })),
      ).catch(() => {})
    }
    const page = await context.newPage()
    await page.goto(SEARCH_URL, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT })

    // Wait for a Cloudflare "Just a moment…" interstitial to clear.
    const deadline = Date.now() + CF_CLEAR_TIMEOUT
    let blocked = false
    while (true) {
      const title = await page.title().catch(() => '')
      if (!/just a moment|verifying|attention required|checking your browser/i.test(title)) break
      if (Date.now() > deadline) {
        blocked = true
        break
      }
      await page.waitForTimeout(1000)
    }
    if (blocked) {
      return {
        attempted: true,
        blocked: true,
        matches: [],
        exactMatch: false,
        via,
        note:
          mode === 'scraping-browser'
            ? 'The scraping browser could not clear CAC’s Cloudflare challenge this time.'
            : process.env.FLARESOLVERR_URL
              ? 'FlareSolverr could not clear CAC’s Cloudflare challenge (it likely uses interactive Turnstile, which FlareSolverr can’t solve).'
              : 'CAC’s Cloudflare anti-bot challenge blocked the browser (expected). Run the free FlareSolverr (set FLARESOLVERR_URL) or a paid stealth browser (SCRAPING_BROWSER_WS) to get through.',
      }
    }

    // Fill the search box (try a few reasonable selectors) and submit. The
    // Angular app can still be settling right after the Cloudflare challenge
    // resolves, so give this real headroom and one retry before giving up.
    const nameInput = page
      .locator(
        'input[placeholder*="name" i], input[name*="search" i], input[type="search"], input[type="text"]',
      )
      .first()
    try {
      await nameInput.waitFor({ state: 'visible', timeout: 20_000 })
    } catch {
      await page.waitForTimeout(3_000)
      await nameInput.waitFor({ state: 'visible', timeout: 15_000 })
    }
    await nameInput.fill(name)

    const searchBtn = page
      .getByRole('button', { name: /search|check|find/i })
      .or(page.locator('button[type="submit"]'))
      .first()
    if (await searchBtn.count()) {
      await searchBtn.click({ timeout: 8_000 }).catch(() => {})
    } else {
      await nameInput.press('Enter')
    }

    // Wait for the Angular results list to actually render (it's a client-
    // rendered SPA — networkidle can resolve before the rows paint, so poll
    // for the real selector instead of trusting a fixed delay).
    await page
      .waitForSelector('ul.results-list li', { timeout: 18_000 })
      .catch(() => {})
    await page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => {})
    await page.waitForTimeout(800)

    // Extract candidate company rows, retrying once if the first pass is
    // empty — the SPA occasionally needs one more tick to hydrate rows.
    let matches = await extractMatches(page)
    if (matches.length === 0) {
      await page.waitForTimeout(2_000)
      matches = await extractMatches(page)
    }
    const nameLc = name.toLowerCase().replace(/\s+/g, ' ')
    const exactMatch = matches.some((m) => m.name.toLowerCase().replace(/\s+/g, ' ') === nameLc)

    return {
      attempted: true,
      blocked: false,
      matches: matches.slice(0, 15),
      exactMatch,
      via,
      note:
        matches.length === 0
          ? 'Reached the CAC search but found no matching companies for that name.'
          : `CAC search returned ${matches.length} result(s).`,
    }
  } catch (err) {
    return {
      attempted: true,
      blocked: false,
      matches: [],
      exactMatch: false,
      via,
      note: `CAC browser search error: ${err instanceof Error ? err.message.slice(0, 160) : 'unknown'}.`,
    }
  } finally {
    if (browser) await browser.close().catch(() => {})
  }
}

/** Pull company-name / RC-number pairs out of the results DOM defensively. */
async function extractMatches(page: import('playwright').Page): Promise<CacMatch[]> {
  return page.evaluate(() => {
    const out: { name: string; rcNumber?: string; status?: string }[] = []
    const seen = new Set<string>()
    const rcRe = /\b(RC[\s-]?\d{3,}|BN[\s-]?\d{3,})\b/i

    // Strategy 0: CAC's actual results list — <ul class="results-list"><li><span>
    // NAME <i>[code]</i></span></li>. Verified against the live site.
    document.querySelectorAll('ul.results-list li span').forEach((span) => {
      const codeEl = span.querySelector('i')
      const code = codeEl?.textContent?.replace(/[[\]]/g, '').trim()
      const name = (span.textContent || '').replace(/\[.*?\]/g, '').trim()
      if (name.length > 1 && !seen.has(name.toLowerCase())) {
        seen.add(name.toLowerCase())
        out.push({ name, rcNumber: code || undefined })
      }
    })
    if (out.length > 0) return out.slice(0, 20)

    // Strategy 1: table rows
    document.querySelectorAll('table tr').forEach((tr) => {
      const cells = Array.from(tr.querySelectorAll('td')).map((td) => (td.textContent || '').trim())
      if (cells.length === 0) return
      const joined = cells.join(' ')
      const rc = joined.match(rcRe)?.[0]
      const nameCell = cells.find((c) => c.length > 3 && /[a-z]/i.test(c) && !rcRe.test(c))
      if (nameCell && !seen.has(nameCell.toLowerCase())) {
        seen.add(nameCell.toLowerCase())
        out.push({ name: nameCell, rcNumber: rc })
      }
    })

    // Strategy 2: cards / list items mentioning an RC/BN number
    if (out.length === 0) {
      document.querySelectorAll('div,li,article').forEach((el) => {
        const txt = (el.textContent || '').trim().replace(/\s+/g, ' ')
        if (txt.length < 6 || txt.length > 200) return
        const rc = txt.match(rcRe)?.[0]
        if (rc) {
          const name = txt.replace(rcRe, '').replace(/[-–|:]+/g, ' ').trim()
          if (name.length > 3 && !seen.has(name.toLowerCase())) {
            seen.add(name.toLowerCase())
            out.push({ name, rcNumber: rc })
          }
        }
      })
    }
    return out.slice(0, 20)
  })
}
