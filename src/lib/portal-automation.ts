/**
 * Government-portal automation (the "browser worker" layer).
 *
 * Runs Playwright against the target portal to complete an online-tier
 * service. Heavily env-gated so the rest of the pipeline works without it:
 *
 *   PORTAL_AUTOMATION=on            master switch
 *   PORTAL_CAC_EMAIL / _PASSWORD    back-office account per portal
 *   PORTAL_FIRS_EMAIL / _PASSWORD
 *   PORTAL_JTB_EMAIL / _PASSWORD
 *   PORTAL_PENCOM_EMAIL / _PASSWORD
 *
 * Playwright is imported dynamically and is NOT a package.json dependency —
 * install it on the worker machine only (`npm i playwright && npx playwright
 * install chromium`). When anything is missing the task escalates to
 * NEEDS_HUMAN with a filing-ready submission pack instead of failing.
 *
 * Each portal script receives a logged-in page and the collected details and
 * returns delivery artifacts. The CAC name-reservation script is sketched as
 * the reference implementation — selectors must be finalised against the
 * live portal with a real back-office account before enabling.
 */

import { connectStealthBrowser, clearCloudflare } from './stealth-browser'

const NAV_TIMEOUT = 60_000

export type PortalId = 'cac' | 'firs' | 'jtb' | 'pencom'

export const PORTAL_INFO: Record<PortalId, { name: string; url: string; loginUrl: string }> = {
  cac: {
    // CAC migrated to the iCRP (Integrated Corporate Registration Portal).
    // The old pre.cac.gov.ng now 301-redirects to icrp.cac.gov.ng; its old
    // /login and /register paths are dead (404/403). Verified live 2026-07-15.
    name: 'CAC iCRP (Integrated Corporate Registration Portal)',
    url: 'https://icrp.cac.gov.ng',
    loginUrl: 'https://icrp.cac.gov.ng/auth/login',
  },
  firs: {
    name: 'FIRS TaxPro-Max',
    url: 'https://taxpromax.firs.gov.ng',
    loginUrl: 'https://taxpromax.firs.gov.ng/login',
  },
  jtb: {
    name: 'JTB TIN Registration',
    url: 'https://tin.jtb.gov.ng',
    loginUrl: 'https://tin.jtb.gov.ng/login',
  },
  pencom: {
    name: 'PenCom / PFA onboarding',
    url: 'https://www.pencom.gov.ng',
    loginUrl: 'https://www.pencom.gov.ng',
  },
}

export interface AutomationResult {
  ok: boolean
  note: string
  artifacts?: Record<string, unknown>
}

function portalCredentials(portal: PortalId): { email: string; password: string } | null {
  const prefix = `PORTAL_${portal.toUpperCase()}`
  const email = process.env[`${prefix}_EMAIL`]
  const password = process.env[`${prefix}_PASSWORD`]
  return email && password ? { email, password } : null
}

type PortalScript = (
  page: import('playwright').Page,
  details: Record<string, string>,
  log: (msg: string) => Promise<void>,
) => Promise<Record<string, unknown>>

/**
 * Per-service portal scripts. Add real flows here as they are hardened
 * against the live portals. Keyed by serviceId from the catalog.
 */
const PORTAL_SCRIPTS: Record<string, { portal: PortalId; run: PortalScript }> = {
  'cac-sole': {
    portal: 'cac',
    run: async (page, details, log) => {
      // Business Name (sole proprietor / enterprise) filing on iCRP.
      //
      // The post-login filing forms (name reservation → BN application →
      // document upload → pay) live behind the authenticated dashboard and
      // have NOT yet been mapped against a live account, so the exact
      // selectors here are still provisional — do a supervised dry run with a
      // real iCRP account before trusting an unattended submission.
      //
      // HARD PREREQUISITES (from CAC rules, verified 2026-07-15):
      //  • a valid NIN for every proprietor (mandatory since 2023-03-01),
      //  • uploaded images: means of ID, passport photograph, signature.
      // These depend on Iroko's identity-verification + document-vault
      // features, which are deliberately NOT built yet. Until they are, this
      // script must NOT attempt an autonomous submission — it hands back a
      // clear reason so the task escalates to a human operator with the pack.
      const nin = details['Proprietor NIN'] ?? details['NIN'] ?? ''
      if (!/^\d{11}$/.test(nin.trim())) {
        await log('No verified proprietor NIN present — cannot self-file; escalating.')
        return {
          step: 'blocked-precondition',
          blocked: true,
          reason:
            'A verified 11-digit proprietor NIN (and uploaded ID/passport/signature images) is required by CAC before a Business Name can be filed. Collect + verify these, then retry.',
        }
      }

      // Reference flow (provisional selectors — verify live before enabling):
      await log('Starting Business Name filing on iCRP…')
      // 1) Name reservation: proposed name(s) + nature of business.
      // 2) BN application form: proprietor particulars (name, DOB, gender,
      //    nationality, address, phone/email, NIN), business address, nature.
      // 3) Upload ID / passport photo / signature images.
      // 4) Pay (Remita) → submit → collect certificate + status report.
      // Implemented incrementally as each step is verified against a real
      // account; for now, signal that live filing isn't wired yet.
      return {
        step: 'not-yet-live',
        blocked: true,
        reason:
          'Autonomous iCRP submission is not enabled yet: the authenticated filing forms still need a supervised dry run against a real accredited/individual account. All collected data is filing-ready in the submission pack.',
      }
    },
  },
}

/**
 * Attempt to run a service on its portal. Never throws for "not set up"
 * situations — returns ok:false with an explanatory note so the task
 * handler can escalate cleanly. Real in-flight script errors DO throw,
 * so the task engine's retry/backoff applies.
 */
export async function runPortalAutomation(
  serviceId: string,
  portal: PortalId,
  details: Record<string, string>,
  log: (msg: string) => Promise<void>,
): Promise<AutomationResult> {
  if (process.env.PORTAL_AUTOMATION !== 'on') {
    return { ok: false, note: 'Portal automation is disabled (PORTAL_AUTOMATION != on).' }
  }
  const script = PORTAL_SCRIPTS[serviceId]
  if (!script || script.portal !== portal) {
    return { ok: false, note: `No hardened automation script for "${serviceId}" yet.` }
  }
  const creds = portalCredentials(portal)
  if (!creds) {
    return {
      ok: false,
      note: `No back-office credentials for the ${PORTAL_INFO[portal].name} (set PORTAL_${portal.toUpperCase()}_EMAIL/_PASSWORD).`,
    }
  }

  // iCRP is Cloudflare-protected, so prefer the stealth browser (the same
  // SCRAPING_BROWSER_WS path proven to clear CAC's wall in cac-live-search.ts).
  // Local Chromium is allowed only as a last resort / for un-protected portals.
  const session = await connectStealthBrowser(true, NAV_TIMEOUT)
  if (!session) {
    return {
      ok: false,
      note: 'No browser available: set SCRAPING_BROWSER_WS (stealth browser) or install Playwright locally (npm i playwright && npx playwright install chromium).',
    }
  }

  try {
    const page = await session.context.newPage()

    // Login. Selectors verified live against icrp.cac.gov.ng/auth/login
    // (Angular reactive form: formcontrolname username/password, "Login" btn).
    await log(`Logging into ${PORTAL_INFO[portal].name} (via ${session.via})…`)
    await page.goto(PORTAL_INFO[portal].loginUrl, {
      waitUntil: 'domcontentloaded',
      timeout: NAV_TIMEOUT,
    })
    if (!(await clearCloudflare(page))) {
      return { ok: false, note: 'Could not clear the portal’s Cloudflare challenge to reach the login page.' }
    }
    await page.locator('input[formcontrolname="username"]').first().fill(creds.email)
    await page.locator('input[formcontrolname="password"]').first().fill(creds.password)
    await page.getByRole('button', { name: /^login$/i }).first().click()

    // A successful login navigates away from /auth/login into the dashboard;
    // a failed one stays put and shows an error toast. Detect both.
    const loggedIn = await page
      .waitForURL((u) => !/\/auth\/login/i.test(u.toString()), { timeout: 30_000 })
      .then(() => true)
      .catch(() => false)
    if (!loggedIn) {
      return {
        ok: false,
        note: 'Portal login did not succeed (credentials rejected or the login form changed). Check PORTAL_CAC_EMAIL/_PASSWORD.',
      }
    }
    await log('Logged in. Proceeding with the filing…')

    const artifacts = await script.run(page, details, log)
    // A script can return a "blocked" sentinel (missing prerequisites, step
    // not yet live) — that's a clean escalation, not a completed filing.
    if (artifacts && (artifacts as { blocked?: boolean }).blocked) {
      return {
        ok: false,
        note:
          (artifacts as { reason?: string }).reason ??
          'Automation could not complete this filing; escalating to a human operator.',
        artifacts,
      }
    }
    return { ok: true, note: 'Portal automation completed.', artifacts }
  } finally {
    await session.close()
  }
}
