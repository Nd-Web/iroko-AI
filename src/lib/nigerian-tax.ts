/**
 * Nigerian Personal Income Tax (PAYE) calculation engine.
 *
 * Based on the Personal Income Tax Act (PITA) as amended, with the
 * Consolidated Relief Allowance (CRA) and the 6-band graduated tax schedule.
 *
 * Sources: FIRS / PITA (Amendment) Act 2011. Rates verified as the current
 * statutory PAYE schedule. Always confirm with FIRS/JTB for the latest.
 */

export interface PayeeBand {
  label: string
  /** Lower bound of the band (annual, inclusive) */
  from: number
  /** Upper bound of the band (annual, exclusive). Infinity for the top band. */
  to: number
  rate: number // 0..1
}

/** The 6 statutory PAYE bands (annual taxable income). */
export const PAYEE_BANDS: PayeeBand[] = [
  { label: 'First ₦300,000', from: 0, to: 300_000, rate: 0.07 },
  { label: 'Next ₦300,000', from: 300_000, to: 600_000, rate: 0.11 },
  { label: 'Next ₦500,000', from: 600_000, to: 1_100_000, rate: 0.15 },
  { label: 'Next ₦500,000', from: 1_100_000, to: 1_600_000, rate: 0.19 },
  { label: 'Next ₦1,600,000', from: 1_600_000, to: 3_200_000, rate: 0.21 },
  { label: 'Above ₦3,200,000', from: 3_200_000, to: Number.POSITIVE_INFINITY, rate: 0.24 },
]

export interface PayeeOptions {
  /** Gross income (annual). */
  grossAnnual: number
  /** Employee pension contribution (PRA 2014) — 8% of gross. */
  pension?: boolean
  /** National Housing Fund — 2.5% of gross. */
  nhf?: boolean
  /** National Health Insurance Scheme — 5% of gross. */
  nhis?: boolean
}

export interface BandBreakdown {
  band: PayeeBand
  /** Portion of taxable income that falls in this band. */
  taxableInBand: number
  tax: number
}

export interface PayeeResult {
  grossAnnual: number
  grossMonthly: number
  // statutory deductions
  pension: number
  nhf: number
  nhis: number
  totalStatutoryDeductions: number
  // relief
  cra: number
  craBase: number
  craTwentyPercent: number
  // taxable
  taxableIncome: number
  // tax
  bands: BandBreakdown[]
  totalTaxAnnual: number
  totalTaxMonthly: number
  // net
  netAnnual: number
  netMonthly: number
  effectiveRate: number // 0..1
}

const PENSION_RATE = 0.08
const NHF_RATE = 0.025
const NHIS_RATE = 0.05

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

/**
 * Compute PAYE for a given gross annual income.
 * Returns a full breakdown suitable for display.
 */
export function calculatePayee(opts: PayeeOptions): PayeeResult {
  const grossAnnual = Math.max(0, opts.grossAnnual || 0)

  const pension = opts.pension ? round2(grossAnnual * PENSION_RATE) : 0
  const nhf = opts.nhf ? round2(grossAnnual * NHF_RATE) : 0
  const nhis = opts.nhis ? round2(grossAnnual * NHIS_RATE) : 0
  const totalStatutoryDeductions = round2(pension + nhf + nhis)

  // CRA = max(₦200,000, 1% of gross) + 20% of gross
  const craBase = Math.max(200_000, grossAnnual * 0.01)
  const craTwentyPercent = grossAnnual * 0.2
  const cra = round2(craBase + craTwentyPercent)

  // Taxable income = gross - statutory deductions - CRA (floored at 0)
  const taxableIncome = Math.max(
    0,
    round2(grossAnnual - totalStatutoryDeductions - cra),
  )

  // Apply bands
  const bands: BandBreakdown[] = []
  let remaining = taxableIncome
  let totalTaxAnnual = 0
  for (const band of PAYEE_BANDS) {
    const bandWidth = band.to - band.from
    const inBand = Math.min(remaining, bandWidth)
    const taxableInBand = Math.max(0, inBand)
    const tax = round2(taxableInBand * band.rate)
    bands.push({ band, taxableInBand, tax })
    totalTaxAnnual += tax
    remaining -= bandWidth
    if (remaining <= 0) break
  }
  totalTaxAnnual = round2(totalTaxAnnual)

  const totalTaxMonthly = round2(totalTaxAnnual / 12)
  const netAnnual = round2(grossAnnual - totalStatutoryDeductions - totalTaxAnnual)
  const netMonthly = round2(netAnnual / 12)
  const effectiveRate = grossAnnual > 0 ? totalTaxAnnual / grossAnnual : 0

  return {
    grossAnnual,
    grossMonthly: round2(grossAnnual / 12),
    pension,
    nhf,
    nhis,
    totalStatutoryDeductions,
    cra,
    craBase: round2(craBase),
    craTwentyPercent: round2(craTwentyPercent),
    taxableIncome,
    bands,
    totalTaxAnnual,
    totalTaxMonthly,
    netAnnual,
    netMonthly,
    effectiveRate,
  }
}

/** Format a number as Nigerian naira, e.g. ₦450,000. */
export function formatNaira(n: number): string {
  if (!isFinite(n)) return '₦0'
  const rounded = Math.round(n)
  return `₦${rounded.toLocaleString('en-NG')}`
}

/** Format a rate as a percentage, e.g. 7%. */
export function formatPercent(rate: number): string {
  return `${Math.round(rate * 100)}%`
}

/**
 * Build a short, human-readable summary of a PAYE result,
 * suitable for sending into the chat as a user message.
 */
export function summarizePayeeResult(r: PayeeResult): string {
  const lines = [
    `Here is my Nigerian PAYE calculation. Please review it and tell me if it's correct, and note anything I might be missing.`,
    ``,
    `Gross annual income: ${formatNaira(r.grossAnnual)} (${formatNaira(r.grossMonthly)}/month)`,
  ]
  if (r.totalStatutoryDeductions > 0) {
    lines.push(`Statutory deductions: ${formatNaira(r.totalStatutoryDeductions)}`)
    if (r.pension) lines.push(`  - Pension (8%): ${formatNaira(r.pension)}`)
    if (r.nhf) lines.push(`  - NHF (2.5%): ${formatNaira(r.nhf)}`)
    if (r.nhis) lines.push(`  - NHIS (5%): ${formatNaira(r.nhis)}`)
  }
  lines.push(`Consolidated Relief Allowance (CRA): ${formatNaira(r.cra)}`)
  lines.push(`Taxable income: ${formatNaira(r.taxableIncome)}`)
  lines.push(``)
  lines.push(`Tax per band:`)
  for (const b of r.bands) {
    if (b.taxableInBand > 0) {
      lines.push(
        `  - ${b.band.label} @ ${formatPercent(b.band.rate)} → ${formatNaira(b.tax)}`,
      )
    }
  }
  lines.push(``)
  lines.push(`Total annual PAYE: ${formatNaira(r.totalTaxAnnual)} (${formatNaira(r.totalTaxMonthly)}/month)`)
  lines.push(`Net annual income: ${formatNaira(r.netAnnual)} (${formatNaira(r.netMonthly)}/month)`)
  lines.push(`Effective tax rate: ${formatPercent(r.effectiveRate)}`)
  return lines.join('\n')
}
