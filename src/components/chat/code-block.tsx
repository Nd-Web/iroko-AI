'use client'

import * as React from 'react'
import { Check, Copy } from 'lucide-react'
import { cn } from '@/lib/utils'

interface CodeBlockProps {
  code: string
  lang: string
}

export function CodeBlock({ code, lang }: CodeBlockProps) {
  const [copied, setCopied] = React.useState(false)

  const copy = React.useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      /* clipboard not available */
    }
  }, [code])

  return (
    <div className="my-4 overflow-hidden rounded-lg border border-border bg-[oklch(0.2_0.012_150)] text-zinc-100">
      <div className="flex items-center justify-between border-b border-white/10 bg-white/5 px-3 py-1.5">
        <span className="font-mono text-[11px] uppercase tracking-wider text-zinc-400">
          {lang || 'text'}
        </span>
        <button
          type="button"
          onClick={copy}
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium text-zinc-300 transition-colors hover:bg-white/10 hover:text-white"
          aria-label="Copy code"
        >
          {copied ? (
            <>
              <Check className="h-3.5 w-3.5" /> Copied
            </>
          ) : (
            <>
              <Copy className="h-3.5 w-3.5" /> Copy
            </>
          )}
        </button>
      </div>
      <pre className="iroko-scroll overflow-x-auto p-4 text-[0.85rem] leading-relaxed">
        <code className="font-mono">{code}</code>
      </pre>
    </div>
  )
}
