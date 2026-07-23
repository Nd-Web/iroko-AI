'use client'

import * as React from 'react'
import { ArrowUp, Square } from 'lucide-react'
import { MicButton } from './mic-button'
import { cn } from '@/lib/utils'

interface ChatComposerProps {
  onSend: (text: string) => void
  onStop: () => void
  isStreaming: boolean
  disabled?: boolean
  placeholder?: string
}

const MAX_HEIGHT = 200

export function ChatComposer({
  onSend,
  onStop,
  isStreaming,
  disabled,
  placeholder = 'Ask Iroko anything…',
}: ChatComposerProps) {
  const [value, setValue] = React.useState('')
  const textareaRef = React.useRef<HTMLTextAreaElement>(null)

  const autosize = React.useCallback(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT)}px`
  }, [])

  React.useEffect(() => {
    autosize()
  }, [value, autosize])

  const submit = React.useCallback(() => {
    const text = value.trim()
    if (!text || isStreaming || disabled) return
    onSend(text)
    setValue('')
    // reset height after clearing
    requestAnimationFrame(() => {
      const el = textareaRef.current
      if (el) el.style.height = 'auto'
    })
  }, [value, isStreaming, disabled, onSend])

  const handleTranscript = React.useCallback((text: string) => {
    setValue((prev) => (prev ? prev + ' ' + text : text))
    requestAnimationFrame(() => {
      const el = textareaRef.current
      if (el) {
        el.focus()
        el.style.height = 'auto'
        el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT)}px`
      }
    })
  }, [])

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      submit()
    }
  }

  const canSend = value.trim().length > 0 && !isStreaming && !disabled

  return (
    <div className="mx-auto w-full max-w-3xl px-3 sm:px-4">
      <div
        className={cn(
          'relative flex items-end gap-1.5 rounded-[1.625rem] border border-border/70 bg-card p-1.5 shadow-lg shadow-black/[0.04] transition-all sm:gap-2 sm:p-2',
          'focus-within:border-primary/40 focus-within:shadow-xl focus-within:shadow-primary/[0.06]',
          'dark:shadow-black/20',
        )}
      >
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKeyDown}
          rows={1}
          placeholder={placeholder}
          disabled={disabled}
          aria-label="Message Iroko AI"
          className={cn(
            'iroko-scroll iroko-textarea max-h-[200px] min-h-[2.75rem] flex-1 resize-none',
            'border-0 bg-transparent px-3.5 py-2.5 text-[0.95rem] leading-6 text-foreground',
            'placeholder:text-muted-foreground/80 focus:outline-none focus:ring-0 disabled:opacity-50',
          )}
        />

        <MicButton onTranscript={handleTranscript} />

        {isStreaming ? (
          <button
            type="button"
            onClick={onStop}
            aria-label="Stop generating"
            className={cn(
              'mb-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full',
              'bg-foreground text-background transition-transform hover:scale-105 active:scale-95',
            )}
          >
            <Square className="h-3.5 w-3.5 fill-current" />
          </button>
        ) : (
          <button
            type="button"
            onClick={submit}
            disabled={!canSend}
            aria-label="Send message"
            className={cn(
              'mb-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-all',
              canSend
                ? 'bg-primary text-primary-foreground hover:scale-105 active:scale-95'
                : 'cursor-not-allowed bg-muted text-muted-foreground/60',
            )}
          >
            <ArrowUp className="h-[1.15rem] w-[1.15rem]" />
          </button>
        )}
      </div>
      <p className="mt-1.5 hidden text-center text-[11px] text-muted-foreground/70 sm:block">
        Iroko AI can make mistakes. Verify important information with the relevant authority.
      </p>
    </div>
  )
}
