'use client'

import * as React from 'react'
import { Check, Copy, RefreshCw, AlertTriangle, FileText, FileDown, Download, HelpCircle, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Markdown } from './markdown'
import { SpeakButton } from './speak-button'
import { IrokoLogo } from '@/components/iroko-logo'
import { extractQuickReplies } from '@/lib/quick-replies'
import { isLegalDocument, downloadAsWord, downloadAsPdf, extractDocTitle } from '@/lib/document-exporter'
import { DocumentPreviewModal } from '@/components/documents/document-preview-modal'
import { cn } from '@/lib/utils'
import type { ChatMessage } from '@/lib/types'

interface ChatMessageItemProps {
  message: ChatMessage
  isLastAssistant: boolean
  streaming?: boolean
  onRegenerate?: () => void
  /** Called when the user taps a quick-reply chip; sends the text as a message. */
  onQuickReply?: (text: string) => void
}

export function ChatMessageItem({
  message,
  isLastAssistant,
  streaming,
  onRegenerate,
  onQuickReply,
}: ChatMessageItemProps) {
  const [copied, setCopied] = React.useState(false)
  const isUser = message.role === 'user'

  const rawContent = typeof message?.content === 'string' ? message.content : ''

  // Strip the trailing ```options block from the body and surface its
  // choices as tappable chips (chat-first buttons).
  const { body, options } = React.useMemo(
    () => (isUser ? { body: rawContent, options: [] } : extractQuickReplies(rawContent)),
    [isUser, rawContent],
  )

  const isDoc = React.useMemo(() => !isUser && isLegalDocument(body), [isUser, body])
  const docTitle = React.useMemo(() => extractDocTitle(body), [body])

  const copy = React.useCallback(async () => {
    try {
      await navigator.clipboard.writeText(body)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      /* ignore */
    }
  }, [body])

  const showQuickReplies =
    !isUser &&
    !streaming &&
    !message.error &&
    isLastAssistant &&
    options.length > 0 &&
    !!onQuickReply

  if (isUser) {
    return (
      <div className="iroko-fade-up flex justify-end px-4 py-2.5 sm:px-6 sm:py-3">
        <div className="max-w-[85%] rounded-3xl rounded-br-lg bg-primary px-4 py-2.5 text-primary-foreground sm:max-w-[70%]">
          <p className="whitespace-pre-wrap break-words text-[0.95rem] leading-7">
            {message.content}
          </p>
        </div>
      </div>
    )
  }

  const [isPreviewOpen, setIsPreviewOpen] = React.useState(false)

  return (
    <>
      <DocumentPreviewModal
        isOpen={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
        content={body}
      />
      <div className="iroko-fade-up group px-4 py-2.5 sm:px-6 sm:py-3">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 hidden h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 ring-1 ring-primary/15 sm:flex">
            <IrokoLogo size={20} />
          </div>
          <div className="min-w-0 flex-1 pt-0.5">
            {message.error ? (
              <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm text-destructive">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  <p className="font-medium">Something went wrong</p>
                  <p className="text-destructive/80">{message.error}</p>
                </div>
              </div>
            ) : (
              <div className={cn(streaming && message.content.length === 0 && 'iroko-caret')}>
                {/* Top Banner ONLY for explicit formal documents/letters */}
                {isDoc && !streaming && (
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-primary/25 bg-primary/5 p-3 shadow-xs">
                    <div className="flex items-center gap-2 text-xs font-semibold text-primary">
                      <FileText className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                      <span className="truncate max-w-[180px] sm:max-w-[280px]">{docTitle}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setIsPreviewOpen(true)}
                        className="h-8 gap-1.5 rounded-lg text-xs font-medium bg-background border-border hover:bg-accent"
                      >
                        <FileText className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                        <span>Preview Artifact</span>
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => { downloadAsWord(body, docTitle) }}
                        className="h-8 gap-1.5 rounded-lg text-xs font-medium bg-background border-border hover:bg-accent"
                      >
                        <FileDown className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                        <span>Word (.docx)</span>
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => downloadAsPdf(body, docTitle)}
                        className="h-8 gap-1.5 rounded-lg text-xs font-medium bg-background border-border hover:bg-accent"
                      >
                        <Download className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                        <span>PDF</span>
                      </Button>
                    </div>
                  </div>
                )}

              {/* Render document inside an artifact paper card if it is an explicit document */}
              {(() => {
                const cleanDocBody = isDoc ? stripDisclaimerForExport(body) : body
                return (
                  <div className={cn(isDoc && 'rounded-2xl border border-border bg-card p-4 sm:p-6 shadow-xs')}>
                    {cleanDocBody ? (
                      <Markdown content={cleanDocBody} />
                    ) : streaming ? (
                      <span className="inline-flex items-center gap-1 text-muted-foreground">
                        <span className="iroko-dot h-1.5 w-1.5 rounded-full bg-current" />
                        <span className="iroko-dot h-1.5 w-1.5 rounded-full bg-current" style={{ animationDelay: '0.15s' }} />
                        <span className="iroko-dot h-1.5 w-1.5 rounded-full bg-current" style={{ animationDelay: '0.3s' }} />
                      </span>
                    ) : null}
                    {streaming && message.content.length > 0 && (
                      <span className="iroko-caret" />
                    )}
                  </div>
                )
              })()}

              {/* Statutory Legal Disclaimer outside the paper card */}
              {isDoc && !streaming && (
                <p className="mt-3 px-1 text-[11px] leading-relaxed text-muted-foreground italic border-t border-border/40 pt-2">
                  *This document was generated by Iroko AI as a self-help template based on the information provided. It does not constitute legal advice. Please have this document reviewed by a qualified lawyer before signing or relying on it.*
                </p>
              )}
            </div>
          )}

          {/* Interactive Question Choice Card (Claude-style Options Wizard) */}
          {showQuickReplies && (
            <div className="iroko-fade-up mt-3.5 rounded-2xl border border-primary/20 bg-primary/5 p-3.5 shadow-xs">
              <div className="mb-2.5 flex items-center gap-1.5 text-xs font-semibold text-primary">
                <HelpCircle className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span>Select an option to answer:</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {options.map((o) => (
                  <button
                    key={o}
                    type="button"
                    onClick={() => onQuickReply?.(o)}
                    className={cn(
                      'inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-primary/30 bg-card px-3.5 py-2 text-xs font-medium text-foreground shadow-2xs',
                      'transition-all hover:border-primary hover:bg-primary/10 hover:text-primary active:scale-[0.98]',
                      'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
                    )}
                  >
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <span>{o}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* On-Demand Document Actions for EVERY Assistant Message */}
          {!streaming && !message.error && body && (
            <div
              className={cn(
                'mt-1.5 flex items-center gap-1 transition-opacity flex-wrap',
                !isLastAssistant && 'sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100',
              )}
            >
              <Button
                variant="ghost"
                size="sm"
                onClick={copy}
                className="h-7 gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground"
              >
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? 'Copied' : 'Copy'}
              </Button>

              {/* On-Demand Word & PDF Export for ANY reply */}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { downloadAsWord(body, docTitle) }}
                className="h-7 gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground"
                title="Export message as Word document"
              >
                <FileDown className="h-3.5 w-3.5 text-blue-500" />
                <span>Word</span>
              </Button>

              <Button
                variant="ghost"
                size="sm"
                onClick={() => downloadAsPdf(body, docTitle)}
                className="h-7 gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground"
                title="Export message as PDF document"
              >
                <Download className="h-3.5 w-3.5 text-emerald-500" />
                <span>PDF</span>
              </Button>

              <SpeakButton text={body} />

              {isLastAssistant && onRegenerate && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onRegenerate}
                  className="h-7 gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Regenerate
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
    </>
  )
}
