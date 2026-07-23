'use client'

import * as React from 'react'
import { Check, Copy, RefreshCw, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Markdown } from './markdown'
import { SpeakButton } from './speak-button'
import { IrokoLogo } from '@/components/iroko-logo'
import { extractQuickReplies } from '@/lib/quick-replies'
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

  // Strip the trailing ```options block from the body and surface its
  // choices as tappable chips (chat-first buttons).
  const { body, options } = React.useMemo(
    () => (isUser ? { body: message.content, options: [] } : extractQuickReplies(message.content)),
    [isUser, message.content],
  )

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

  return (
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
              {body ? (
                <Markdown content={body} />
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
          )}

          {/* Quick replies — tappable chat-first buttons */}
          {showQuickReplies && (
            <div className="iroko-fade-up mt-3 flex flex-wrap gap-2">
              {options.map((o) => (
                <button
                  key={o}
                  type="button"
                  onClick={() => onQuickReply?.(o)}
                  className={cn(
                    'min-h-9 rounded-full border border-primary/25 bg-primary/5 px-4 py-2 text-sm font-medium leading-none text-primary',
                    'transition-all hover:bg-primary/10 active:scale-[0.97]',
                    'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
                  )}
                >
                  {o}
                </button>
              ))}
            </div>
          )}

          {/* Actions — quiet until you need them (always visible on touch) */}
          {!streaming && !message.error && body && (
            <div
              className={cn(
                'mt-1.5 flex items-center gap-0.5 transition-opacity',
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
  )
}
