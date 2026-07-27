'use client'

import { useState, useEffect } from 'react'
import { ShieldCheck, X } from 'lucide-react'
import { PRIVACY_POLICY_URL, DATA_PROTECTION_NOTICE } from '@/lib/privacy-consent'

const DISMISSED_KEY = 'iroko-dp-notice-dismissed'

/**
 * A dismissible data-protection banner shown on first visit.
 * References the NDPA 2023 and links to the privacy policy.
 * Displayed at the bottom of the viewport, above the chat composer.
 */
export default function DataProtectionNotice() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    try {
      const dismissed = localStorage.getItem(DISMISSED_KEY)
      if (!dismissed) setVisible(true)
    } catch {
      // localStorage unavailable — don't show
    }
  }, [])

  function dismiss() {
    setVisible(false)
    try {
      localStorage.setItem(DISMISSED_KEY, '1')
    } catch {
      // ignore
    }
  }

  if (!visible) return null

  return (
    <div
      id="data-protection-notice"
      role="status"
      className="mx-auto mb-2 flex max-w-2xl items-start gap-3 rounded-xl border border-emerald-500/20 bg-emerald-950/60 px-4 py-3 text-xs text-emerald-200/80 backdrop-blur-sm"
    >
      <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
      <p className="flex-1 leading-relaxed">
        {DATA_PROTECTION_NOTICE}{' '}
        <a
          href={PRIVACY_POLICY_URL}
          className="underline underline-offset-2 hover:text-emerald-100"
          target="_blank"
          rel="noopener noreferrer"
        >
          Privacy Policy
        </a>
      </p>
      <button
        onClick={dismiss}
        aria-label="Dismiss data protection notice"
        className="shrink-0 rounded p-0.5 hover:bg-emerald-800/50"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
