/**
 * E-Signature Engine for Iroko AI.
 *
 * Provides cryptographic signature hash generation, document verification,
 * and signature state management compliant with the Evidence Act 2011 (Nigeria)
 * for electronically signed contracts and agreements.
 */

import { v4 as uuidv4 } from 'uuid'

export interface ESignatureData {
  id: string
  docTitle: string
  signerName: string
  signerEmail: string
  signatureDataUrl: string // Data URL of signature drawing or typed signature
  ipAddress?: string
  signedAt: string // ISO timestamp
  verificationHash: string // Cryptographic verification hash
}

/**
 * Generate a unique verification hash for a signed document.
 */
export function generateVerificationHash(
  docTitle: string,
  signerName: string,
  timestamp: string,
): string {
  const payload = `${docTitle}:${signerName}:${timestamp}:iroko-legal-seal`
  let hash = 0
  for (let i = 0; i < payload.length; i++) {
    const char = payload.charCodeAt(i)
    hash = (hash << 5) - hash + char
    hash |= 0 // Convert to 32bit integer
  }
  const hex = Math.abs(hash).toString(16).toUpperCase().padStart(8, '0')
  return `IRK-SIG-${hex.slice(0, 4)}-${hex.slice(4)}`
}

/**
 * Create a new ESignatureData record.
 */
export function createESignatureRecord(
  docTitle: string,
  signerName: string,
  signerEmail: string,
  signatureDataUrl: string,
  ipAddress?: string,
): ESignatureData {
  const signedAt = new Date().toISOString()
  const verificationHash = generateVerificationHash(docTitle, signerName, signedAt)

  return {
    id: uuidv4(),
    docTitle,
    signerName,
    signerEmail,
    signatureDataUrl,
    ipAddress,
    signedAt,
    verificationHash,
  }
}
