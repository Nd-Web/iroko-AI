/**
 * Nigerian CAC business-name availability checker.
 *
 * Implements a realistic, instant client-side check that mirrors the rules
 * the Corporate Affairs Commission applies when you search a proposed name:
 *  - reserved / restricted words that need extra consent
 *  - suffix validation per entity type
 *  - identical-name conflict against a (simulated) registry of existing names
 *  - similarity scoring to flag "too close" names
 *  - suggestion generator for close-but-available alternatives
 *
 * NOTE: This is a demo registry, not the live CAC portal. The real check
 * must always be confirmed on the CAC portal / by an Iroko agent.
 */

export type EntityType = 'llc' | 'plc' | 'sole' | 'ngo' | 'partnership'

export interface EntityTypeMeta {
  id: EntityType
  label: string
  /** Acceptable suffixes for this entity type (case-insensitive). */
  suffixes: string[]
  hint: string
}

export const ENTITY_TYPES: EntityTypeMeta[] = [
  {
    id: 'llc',
    label: 'Limited Liability Company',
    suffixes: ['limited', 'ltd', 'ltd.', 'limited.'],
    hint: 'Private company limited by shares — most common for SMEs.',
  },
  {
    id: 'plc',
    label: 'Public Limited Company',
    suffixes: ['plc', 'public limited company'],
    hint: 'Public company — can offer shares to the public.',
  },
  {
    id: 'sole',
    label: 'Sole Proprietor / Enterprise',
    suffixes: ['enterprises', 'enterprise', 'ventures', 'nig.'],
    hint: 'One-person business — simplest to register.',
  },
  {
    id: 'ngo',
    label: 'NGO / Incorporated Trustees',
    suffixes: ['foundation', 'initiative', 'trust', 'association', 'centre', 'organization', 'organisation'],
    hint: 'Non-profit — registered under Incorporated Trustees.',
  },
  {
    id: 'partnership',
    label: 'Partnership',
    suffixes: ['& co', 'and co', 'partners', '& sons', 'brothers'],
    hint: 'Two or more owners sharing profits and liability.',
  },
]

/** Words CAC restricts / reserves — require special consent or sector approval. */
const RESTRICTED_WORDS = [
  'federal', 'national', 'state', 'government', 'republic', 'nigeria', 'nigerian',
  'bank', 'banking', 'insurance', 'assurance',
  'police', 'military', 'army', 'navy', 'air force', 'defence', 'defense',
  'cooperative', 'chamber',
  'central', 'reserve',
  'nafdac', 'firs', 'cac', 'nimc', 'cbn',
]

/** A simulated registry of names already taken on the CAC portal. */
const EXISTING_NAMES: string[] = [
  'iroko technologies limited',
  'iroko global ventures',
  'iroko farms nig. ltd',
  'zoba enterprises',
  'dangote sugar plc',
  'flutterwave technologies ltd',
  'paystack commerce limited',
  'konga online ventures',
  'jumia nigeria limited',
  'gtbank plc',
  'access bank plc',
  'zenith bank plc',
  'mtn nigeria communications ltd',
  'glo mobile limited',
  'airtel nigeria limited',
  'first bank of nigeria plc',
  'uba plc',
  'lagos state waste management authority',
  'chisco transport limited',
  'gbagada pharma enterprises',
  'naija eats ventures',
  'tech hub nigeria limited',
  'green leaf farms enterprises',
  'sahara energy resources ltd',
  'bua cement plc',
  'bua foods plc',
  'nnpc limited',
  'seplat energy plc',
  'brento oil and gas limited',
  'eurocapital investments ltd',
]

export type NameStatus = 'available' | 'taken' | 'restricted' | 'invalid'

export interface NameCheckResult {
  /** Normalised name as searched (lowercased, trimmed, single-spaced). */
  normalised: string
  /** Original input. */
  raw: string
  status: NameStatus
  /** Human-readable headline. */
  title: string
  /** Detailed explanation. */
  message: string
  /** Issues that blocked an "available" result. */
  issues: string[]
  /** Suggested close-but-available alternative names. */
  suggestions: string[]
  /** Detected entity type suffix, if any. */
  detectedSuffix?: string
  /** Simulated match confidence 0..1. */
  confidence: number
}

function normalise(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ').replace(/[.,]/g, (m) => m)
}

function levenshtein(a: string, b: string): number {
  const m = a.length
  const n = b.length
  if (m === 0) return n
  if (n === 0) return m
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)])
  for (let j = 0; j <= n; j++) dp[0][j] = j
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost)
    }
  }
  return dp[m][n]
}

function similarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length)
  if (maxLen === 0) return 1
  return 1 - levenshtein(a, b) / maxLen
}

function detectSuffix(normalised: string): string | undefined {
  for (const t of ENTITY_TYPES) {
    for (const s of t.suffixes) {
      if (normalised.endsWith(` ${s}`) || normalised === s) return s
    }
  }
  return undefined
}

function generateSuggestions(base: string, entityType: EntityType): string[] {
  const meta = ENTITY_TYPES.find((t) => t.id === entityType)!
  const suffix = meta.suffixes[0]
  // strip any existing suffix from base
  let core = base
  for (const t of ENTITY_TYPES) {
    for (const s of t.suffixes) {
      const re = new RegExp(`\\s*${s.replace(/\./g, '\\.')}\\s*$`, 'i')
      core = core.replace(re, '').trim()
    }
  }
  core = core || 'your business'

  const prefixes = ['Prime', 'Pinnacle', 'Apex', 'Sterling', 'Nova', 'Merit', 'Summit', 'Crest']
  const suffixes = ['Global', 'Plus', 'Pro', 'Hub', 'Connect', 'Solutions', 'Group', 'Network']
  const out: string[] = []
  const seen = new Set<string>(EXISTING_NAMES)
  for (const p of prefixes) {
    const cand = `${p} ${core} ${suffix}`.replace(/\s+/g, ' ').trim()
    if (!seen.has(cand.toLowerCase())) {
      out.push(cand)
      seen.add(cand.toLowerCase())
    }
    if (out.length >= 3) break
  }
  for (const s of suffixes) {
    const cand = `${core} ${s} ${suffix}`.replace(/\s+/g, ' ').trim()
    if (!seen.has(cand.toLowerCase())) {
      out.push(cand)
      seen.add(cand.toLowerCase())
    }
    if (out.length >= 5) break
  }
  return out.slice(0, 5)
}

/** Find the closest existing name and how similar it is. */
function findClosest(normalised: string): { name: string; sim: number } | null {
  let best: { name: string; sim: number } | null = null
  for (const existing of EXISTING_NAMES) {
    const sim = similarity(normalised, existing)
    if (!best || sim > best.sim) best = { name: existing, sim }
  }
  return best
}

/**
 * Run a full availability check on a proposed business name.
 */
export function checkBusinessName(
  rawName: string,
  entityType: EntityType = 'llc',
): NameCheckResult {
  const normalised = normalise(rawName)
  const issues: string[] = []

  // 1. basic validity
  if (!normalised) {
    return {
      normalised,
      raw: rawName,
      status: 'invalid',
      title: 'Enter a business name',
      message: 'Type a proposed business name to check its availability with CAC.',
      issues: ['Name is empty.'],
      suggestions: [],
      confidence: 0,
    }
  }
  const wordCount = normalised.split(' ').filter(Boolean).length
  if (wordCount < 2) {
    issues.push('Names are usually at least 2 words (a distinctive part + a suffix).')
  }
  if (normalised.length > 60) {
    issues.push('Name is longer than 60 characters — CAC may reject it.')
  }
  if (!/^[a-z0-9 &'.-]+$/.test(normalised)) {
    issues.push('Name contains characters CAC does not allow (only letters, numbers, spaces, &, ., \', -).')
  }

  // 2. suffix detection
  const detectedSuffix = detectSuffix(normalised)
  const expectedMeta = ENTITY_TYPES.find((t) => t.id === entityType)!
  const suffixOk = detectedSuffix
    ? expectedMeta.suffixes.some((s) => detectedSuffix === s || detectedSuffix.replace(/\.$/, '') === s.replace(/\.$/, ''))
    : false
  if (!detectedSuffix) {
    issues.push(`No entity suffix detected. For a ${expectedMeta.label}, add a suffix like "${expectedMeta.suffixes[0]}".`)
  } else if (!suffixOk) {
    issues.push(`The suffix "${detectedSuffix}" doesn't match a ${expectedMeta.label}. Use one of: ${expectedMeta.suffixes.slice(0, 3).join(', ')}.`)
  }

  // 3. restricted words
  const foundRestricted = RESTRICTED_WORDS.filter((w) =>
    normalised.split(' ').some((tok) => tok.replace(/[^a-z]/g, '') === w),
  )
  if (foundRestricted.length > 0) {
    issues.push(
      `Restricted/reserved word(s) detected: ${foundRestricted.join(', ')}. These require special consent or sector regulator approval (e.g. CBN for "bank").`,
    )
  }

  // 4. identical / near-identical conflict
  const closest = findClosest(normalised)
  let taken = false
  if (closest) {
    if (closest.sim >= 0.92) {
      taken = true
      issues.push(`This name is identical or near-identical to an existing registration: "${closest.name}".`)
    } else if (closest.sim >= 0.78) {
      issues.push(`This name is very similar to an existing registration: "${closest.name}". CAC may refuse it as confusingly similar.`)
    }
  }

  // 5. decide status
  let status: NameStatus
  let title: string
  let message: string
  let confidence = 0.85

  if (foundRestricted.length > 0 && !taken) {
    status = 'restricted'
    title = 'Likely restricted — needs approval'
    message =
      'The name contains words that CAC restricts. You can still register it, but you will need consent from the relevant regulator (e.g. CBN for "Bank"). An Iroko agent can guide you.'
    confidence = 0.7
  } else if (taken) {
    status = 'taken'
    title = 'Likely unavailable'
    message =
      'This name is identical or too similar to an existing registration on the CAC registry. Try one of the suggested alternatives below.'
    confidence = 0.8
  } else if (issues.length > 0 && (!detectedSuffix || !suffixOk)) {
    status = 'invalid'
    title = 'Fix the name before searching'
    message = 'The name has format issues. Address the notes below, then search again.'
    confidence = 0.6
  } else {
    status = 'available'
    title = issues.length > 0 ? 'Looks promising — minor notes' : 'Likely available'
    message =
      'No identical or restricted match found. This name looks available to register with CAC. Confirm the final check on the CAC portal or let an Iroko agent file it for you.'
    confidence = issues.length > 0 ? 0.7 : 0.88
  }

  const suggestions =
    status === 'taken' || status === 'restricted'
      ? generateSuggestions(normalised, entityType)
      : status === 'available'
        ? []
        : generateSuggestions(normalised, entityType)

  return {
    normalised,
    raw: rawName,
    status,
    title,
    message,
    issues,
    suggestions,
    detectedSuffix,
    confidence,
  }
}

/** Build a user message that sends a name-check result into the chat for AI review. */
export function buildNameCheckPrompt(r: NameCheckResult, entityType: EntityType): string {
  const meta = ENTITY_TYPES.find((t) => t.id === entityType)!
  const lines = [
    `I checked a business name on the Iroko CAC name checker. Please review the result and advise on next steps.`,
    ``,
    `Proposed name: "${r.raw}"`,
    `Entity type: ${meta.label}`,
    `Check result: ${r.title} (confidence ${Math.round(r.confidence * 100)}%)`,
  ]
  if (r.issues.length > 0) {
    lines.push(``, `Notes:`)
    r.issues.forEach((i) => lines.push(`  - ${i}`))
  }
  if (r.suggestions.length > 0) {
    lines.push(``, `Suggested alternatives: ${r.suggestions.join(' · ')}`)
  }
  lines.push(
    ``,
    `Confirm whether this name is registerable, explain anything I should watch out for, and tell me the next step to reserve and register it with CAC via Iroko.`,
  )
  return lines.join('\n')
}
