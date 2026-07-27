/**
 * NDPA 2023 Compliance — Consent & Data Protection Infrastructure
 *
 * The Nigeria Data Protection Act 2023 (NDPA) classifies BVN, NIN, TIN,
 * tax and identity data as protected personal data. The NDPC has already
 * fined fintechs up to ₦10 million or 2% of annual gross revenue for
 * data-handling gaps.
 *
 * This module provides:
 * - Consent categories for the types of personal data Iroko processes
 * - User-facing consent language for each category
 * - Data retention policy constants
 * - Privacy policy reference
 *
 * TODO before production launch:
 * - Complete a Data Protection Impact Assessment (DPIA)
 * - Execute Data Processing Agreements (DPAs) with every agent (sub-processors)
 * - Appoint a DPO or contract a DPCO (Data Protection Compliance Organisation)
 * - Implement 72-hour breach notification to NDPC
 * - Finalise and host the full privacy policy
 */

/** Placeholder — replace with the real hosted privacy policy URL before launch. */
export const PRIVACY_POLICY_URL = '/privacy' as const

/**
 * Categories of personal data Iroko processes, mapped to NDPA classification.
 * Each category may require separate consent and has different retention rules.
 */
export enum ConsentCategory {
  /** NIN, BVN, voter ID, passport number */
  IDENTITY_DATA = 'IDENTITY_DATA',
  /** TIN, income records, PAYE calculations, tax filings */
  TAX_DATA = 'TAX_DATA',
  /** Contracts, affidavits, legal documents generated or notarized */
  LEGAL_DATA = 'LEGAL_DATA',
  /** Fingerprints, facial data — captured by NIMC/NIS, NOT by Iroko directly */
  BIOMETRIC_DATA = 'BIOMETRIC_DATA',
}

/**
 * Data retention periods in days.
 * Per NDPA §34: data shall not be kept longer than necessary for the purpose
 * for which it was processed.
 */
export const DATA_RETENTION = {
  /** Chat messages — session-only by default, persisted locally on user's device */
  CHAT_MESSAGES_DAYS: 0,
  /** Agent task data (service requests, collected details) */
  AGENT_TASK_DAYS: 90,
  /** Generated documents */
  GENERATED_DOCUMENTS_DAYS: 90,
  /** Tax calculations — ephemeral, not stored server-side */
  TAX_CALCULATIONS_DAYS: 0,
} as const

/**
 * User-facing consent text for each data category.
 * Shown before collecting sensitive personal data through the service task flow.
 */
export function getConsentText(category: ConsentCategory): string {
  switch (category) {
    case ConsentCategory.IDENTITY_DATA:
      return (
        'Iroko will collect identity information (such as your name, NIN, and date of birth) ' +
        'solely to complete your requested service. Your data is processed under the Nigeria ' +
        'Data Protection Act 2023, stored only as long as needed to fulfil your request ' +
        `(up to ${DATA_RETENTION.AGENT_TASK_DAYS} days), and is never shared beyond the ` +
        'verified Iroko agent handling your task. You can request deletion at any time.'
      )
    case ConsentCategory.TAX_DATA:
      return (
        'Iroko will process your income and tax information to perform calculations or ' +
        'file returns on your behalf. Tax calculations performed in chat are not stored ' +
        'on our servers. Filing data is retained for up to ' +
        `${DATA_RETENTION.AGENT_TASK_DAYS} days and processed under the Nigeria Data ` +
        'Protection Act 2023.'
      )
    case ConsentCategory.LEGAL_DATA:
      return (
        'Documents you generate through Iroko are created based on information you provide. ' +
        `They are retained for up to ${DATA_RETENTION.GENERATED_DOCUMENTS_DAYS} days to allow ` +
        'you to retrieve them. Your data is processed under the Nigeria Data Protection Act 2023.'
      )
    case ConsentCategory.BIOMETRIC_DATA:
      return (
        'Iroko does NOT collect or store biometric data (fingerprints, facial images). ' +
        'Biometric capture for NIN, passport, or driver\'s licence is performed directly ' +
        'by the relevant government agency (NIMC, NIS, FRSC) at their facility. ' +
        'Iroko\'s concierge agent accompanies you but has no access to your biometric data.'
      )
  }
}

/**
 * Short-form data protection notice for the UI.
 */
export const DATA_PROTECTION_NOTICE =
  'Your data is protected under the Nigeria Data Protection Act 2023. ' +
  'We collect only what\'s needed to complete your request, store it for the minimum ' +
  'necessary period, and never share it beyond the verified agent handling your task.'

/**
 * The notice the AI should include when collecting sensitive data in chat.
 */
export const AI_DATA_COLLECTION_NOTICE =
  'Before we proceed, here\'s how Iroko handles your data: your information is processed ' +
  'under the Nigeria Data Protection Act 2023, stored only as long as needed to complete ' +
  'your request, and never shared beyond the verified Iroko professional handling your task. ' +
  'You can request deletion at any time.'
