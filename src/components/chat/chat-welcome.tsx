'use client'

import * as React from 'react'
import {
  Building2,
  Calculator,
  IdCard,
  Scale,
  ReceiptText,
  Sparkles,
  LayoutGrid,
  Search,
  FileText,
  ChevronRight,
  type LucideIcon,
} from 'lucide-react'
import { IrokoLogo } from '@/components/iroko-logo'
import { SUGGESTIONS, FLOW_PROMPTS } from '@/lib/iroko-ai'
import { cn } from '@/lib/utils'

const ICONS: Record<string, LucideIcon> = {
  Building2,
  Calculator,
  IdCard,
  Scale,
  ReceiptText,
  Sparkles,
}

interface ChatWelcomeProps {
  onPick: (prompt: string) => void
}

export function ChatWelcome({ onPick }: ChatWelcomeProps) {
  // Chat-first: every tool button just starts an AI-guided flow in the chat.
  const tools: { label: string; icon: LucideIcon; prompt: string }[] = [
    { label: 'Calculate tax', icon: Calculator, prompt: FLOW_PROMPTS.tax },
    { label: 'Name check', icon: Search, prompt: FLOW_PROMPTS.nameCheck },
    { label: 'Documents', icon: FileText, prompt: FLOW_PROMPTS.documents },
    { label: 'Services', icon: LayoutGrid, prompt: FLOW_PROMPTS.services },
  ]

  // Keep the first screen calm: 4 ideas on mobile, all 6 on desktop.
  const mobileSuggestions = SUGGESTIONS.slice(0, 4)

  return (
    <div className="flex min-h-full flex-col items-center justify-center px-4 py-8 sm:px-6 sm:py-12">
      <div className="w-full max-w-2xl">
        {/* Hero */}
        <div className="flex flex-col items-center text-center">
          <IrokoLogo size={48} className="sm:hidden" />
          <div className="hidden sm:block">
            <IrokoLogo size={60} />
          </div>
          <h1 className="mt-5 text-[1.35rem] font-semibold tracking-tight sm:mt-6 sm:text-3xl">
            How can Iroko help you today?
          </h1>
          <p className="mt-2 max-w-sm text-[0.85rem] leading-relaxed text-muted-foreground sm:max-w-md sm:text-sm">
            Business, tax, identity and government — ask anything, or let Iroko
            handle it for you.
          </p>
        </div>

        {/* Quick actions — comfortable touch targets, one calm row that wraps */}
        <div className="mt-7 flex flex-wrap items-center justify-center gap-2 sm:mt-8">
          {tools.map((t) => {
            const Icon = t.icon
            return (
              <button
                key={t.label}
                type="button"
                onClick={() => onPick(t.prompt)}
                className={cn(
                  'inline-flex h-10 items-center gap-2 rounded-full border border-border/70 bg-card px-4 text-[0.85rem] font-medium text-foreground',
                  'transition-all hover:border-primary/40 hover:text-primary active:scale-[0.97]',
                  'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
                )}
              >
                <Icon className="h-4 w-4 text-primary" />
                {t.label}
              </button>
            )
          })}
        </div>

        {/* Suggestions — single calm list on mobile, soft cards on desktop */}
        <div className="mt-8 sm:hidden">
          <div className="space-y-2">
            {mobileSuggestions.map((s) => {
              const Icon = ICONS[s.icon] ?? Sparkles
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => onPick(s.prompt)}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-2xl bg-muted/60 px-4 py-3.5 text-left',
                    'transition-colors active:bg-muted',
                    'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
                  )}
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <Icon className="h-[1.05rem] w-[1.05rem]" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[0.9rem] font-medium leading-tight">
                      {s.title}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                      {s.subtitle}
                    </span>
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/50" />
                </button>
              )
            })}
          </div>
        </div>

        <div className="mt-10 hidden grid-cols-2 gap-3 sm:grid lg:grid-cols-3">
          {SUGGESTIONS.map((s) => {
            const Icon = ICONS[s.icon] ?? Sparkles
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => onPick(s.prompt)}
                className={cn(
                  'group flex h-full flex-col items-start gap-2.5 rounded-2xl bg-muted/50 p-4 text-left',
                  'transition-all hover:-translate-y-0.5 hover:bg-card hover:shadow-md hover:ring-1 hover:ring-border',
                  'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
                )}
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary transition-colors group-hover:bg-primary/15">
                  <Icon className="h-[1.05rem] w-[1.05rem]" />
                </span>
                <span>
                  <span className="block text-sm font-medium leading-tight">
                    {s.title}
                  </span>
                  <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                    {s.subtitle}
                  </span>
                </span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
