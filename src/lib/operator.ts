/**
 * Back-office operator access + roles.
 *
 * Two tiers:
 *  • PRIMARY operators — listed in the OPERATOR_EMAILS env allowlist. Always
 *    active, and the only ones who can grant/revoke others. This is the
 *    bootstrap: without it nobody could ever approve the first operator.
 *  • Granted operators — ordinary users who signed up, applied for operator
 *    access with a role (CAC agent, lawyer, NIN agent…), and were approved by
 *    a primary operator. Their status lives on the User row (operatorStatus).
 *
 * This module is import-safe from client components (pure — no DB/auth). The
 * DB-backed access resolution lives in operator-access.ts (server only).
 */

export function operatorEmails(): string[] {
  return (process.env.OPERATOR_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
}

/** Primary operators are always active and can manage the team. */
export function isPrimaryOperator(email: string | null | undefined): boolean {
  if (!email) return false
  return operatorEmails().includes(email.trim().toLowerCase())
}

export type OperatorStatus = 'none' | 'pending' | 'active' | 'revoked'

/** The kinds of operator/agent someone can apply to be. */
export const OPERATOR_ROLES = [
  { value: 'cac_agent', label: 'CAC Agent', hint: 'Files business-name & company registrations on CAC' },
  { value: 'lawyer', label: 'Lawyer', hint: 'Legal filings, attestations, contract review' },
  { value: 'nin_agent', label: 'NIN Agent', hint: 'NIMC / NIN registration & corrections' },
  { value: 'tax_agent', label: 'Tax / FIRS Agent', hint: 'TIN, VAT and tax filings' },
  { value: 'general', label: 'General Operator', hint: 'Handles mixed back-office tasks' },
] as const

export type OperatorRole = (typeof OPERATOR_ROLES)[number]['value']

export const OPERATOR_ROLE_LABELS: Record<string, string> = Object.fromEntries(
  OPERATOR_ROLES.map((r) => [r.value, r.label]),
)

export function isValidOperatorRole(v: unknown): v is OperatorRole {
  return typeof v === 'string' && OPERATOR_ROLES.some((r) => r.value === v)
}

/** The document kinds CAC requires for a Business Name / company filing. */
export const DOCUMENT_KINDS = [
  { kind: 'means_of_id', label: 'Means of ID (NIN slip, passport, driver’s licence or voter’s card)' },
  { kind: 'passport_photo', label: 'Passport photograph' },
  { kind: 'signature', label: 'Signature' },
] as const

export type DocumentKind = (typeof DOCUMENT_KINDS)[number]['kind']

export const DOCUMENT_LABELS: Record<string, string> = Object.fromEntries(
  DOCUMENT_KINDS.map((d) => [d.kind, d.label]),
)

export const MAX_DOC_BYTES = 6 * 1024 * 1024 // 6MB per file
export const ALLOWED_DOC_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
])
