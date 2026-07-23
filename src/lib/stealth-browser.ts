/**
 * Shared browser-connection helper for driving Cloudflare-protected government
 * portals (CAC iCRP, FIRS, etc.).
 *
 * The one hard-won lesson baked in here (see cac-live-search.ts history): when
 * connecting to a stealth/unblocker service over CDP (Browserless
 * `/stealth?solveCaptchas=true`, etc.), its anti-bot + CAPTCHA-solving is tied
 * to the CDP session's DEFAULT context. Calling `browser.newContext()` spins up
 * a fresh, UNPROTECTED context and you land back behind Cloudflare. So for a
 * scraping browser we reuse `browser.contexts()[0]`; only local Chromium gets a
 * freshly-built context with a realistic fingerprint.
 *
 * Never throws for "not configured" — callers decide how to degrade.
 */

export type BrowserVia = 'scraping-browser' | 'local-chromium'

export interface StealthSession {
  browser: import('playwright').Browser
  context: import('playwright').BrowserContext
  via: BrowserVia
  /** Close everything; safe to call once in a finally block. */
  close: () => Promise<void>
}

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36'

/** True when a stealth/unblocker browser is configured. */
export function hasStealthBrowser(): boolean {
  return !!process.env.SCRAPING_BROWSER_WS
}

/**
 * Connect a browser suitable for a Cloudflare-protected target. Prefers the
 * configured stealth browser (SCRAPING_BROWSER_WS); falls back to local
 * Chromium when `allowLocal` is set (local usually gets Cloudflare-blocked on
 * CAC, so it's really only for un-protected targets / testing).
 *
 * Returns null when neither a stealth browser is configured nor local is
 * allowed, or when Playwright isn't installed.
 */
export async function connectStealthBrowser(
  allowLocal = false,
  navTimeout = 60_000,
): Promise<StealthSession | null> {
  const wsEndpoint = process.env.SCRAPING_BROWSER_WS
  if (!wsEndpoint && !allowLocal) return null

  let playwright: typeof import('playwright')
  try {
    playwright = await import(/* webpackIgnore: true */ 'playwright')
  } catch {
    return null
  }

  if (wsEndpoint) {
    const browser = await playwright.chromium.connectOverCDP(wsEndpoint, { timeout: navTimeout })
    // Reuse the session's default context — that's where the stealth /
    // CAPTCHA-solving lives. A new context would be unprotected.
    const context = browser.contexts()[0] ?? (await browser.newContext())
    return {
      browser,
      context,
      via: 'scraping-browser',
      close: async () => {
        await browser.close().catch(() => {})
      },
    }
  }

  // Local fallback.
  const browser = await playwright.chromium.launch({
    headless: true,
    args: ['--disable-blink-features=AutomationControlled', '--no-sandbox'],
  })
  const context = await browser.newContext({
    userAgent: UA,
    viewport: { width: 1366, height: 768 },
    locale: 'en-NG',
    timezoneId: 'Africa/Lagos',
  })
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined })
  })
  return {
    browser,
    context,
    via: 'local-chromium',
    close: async () => {
      await browser.close().catch(() => {})
    },
  }
}

/**
 * Wait for a Cloudflare "Just a moment…" interstitial to clear. Returns true if
 * the page is through (or was never challenged), false if it stayed blocked
 * past the timeout.
 */
export async function clearCloudflare(
  page: import('playwright').Page,
  timeoutMs = 45_000,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const title = await page.title().catch(() => '')
    if (!/just a moment|verifying|attention required|checking your browser/i.test(title)) {
      return true
    }
    await page.waitForTimeout(1000)
  }
  return false
}
