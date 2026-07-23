'use client'

import * as React from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Send, Search, Clock, Sparkles, CheckCircle2 } from 'lucide-react'
import {
  AGENT_SERVICES,
  CATEGORY_LABELS,
  ICON_MAP,
  buildServiceRequestPrompt,
  type ServiceCategory,
  type AgentService,
} from '@/lib/iroko-services'
import { formatNaira } from '@/lib/nigerian-tax'
import { cn } from '@/lib/utils'

interface ServicesCatalogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSendToChat: (prompt: string) => void
}

const CATEGORIES: (ServiceCategory | 'all')[] = [
  'all',
  'identity',
  'business',
  'tax',
  'legal',
  'mobility',
  'compliance',
]

export function ServicesCatalog({ open, onOpenChange, onSendToChat }: ServicesCatalogProps) {
  const [category, setCategory] = React.useState<ServiceCategory | 'all'>('all')
  const [query, setQuery] = React.useState('')

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase()
    return AGENT_SERVICES.filter((s) => {
      if (category !== 'all' && s.category !== category) return false
      if (!q) return true
      return (
        s.name.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        s.requirements.some((r) => r.toLowerCase().includes(q))
      )
    })
  }, [category, query])

  const handleRequest = (s: AgentService) => {
    onSendToChat(buildServiceRequestPrompt(s))
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] w-[min(1000px,94vw)] gap-0 overflow-hidden p-0 sm:max-w-[1000px]">
        <DialogHeader className="border-b border-border px-5 py-4">
          <DialogTitle className="flex items-center gap-2 text-lg">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Sparkles className="h-[1.1rem] w-[1.1rem]" />
            </span>
            Iroko Agent Network — Services
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            Verified agents stationed at government offices nationwide. Request a
            service and Iroko handles it end-to-end — like Uber for Nigerian
            bureaucracy.
          </DialogDescription>
        </DialogHeader>

        {/* Filters */}
        <div className="space-y-3 border-b border-border px-5 py-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search services, e.g. NIN, CAC, passport…"
              className="h-9 pl-9"
            />
          </div>
          <div className="iroko-scroll flex gap-1.5 overflow-x-auto pb-0.5">
            {CATEGORIES.map((c) => (
              <button
                key={c}
                onClick={() => setCategory(c)}
                className={cn(
                  'shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                  category === c
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                {c === 'all' ? 'All services' : CATEGORY_LABELS[c]}
              </button>
            ))}
          </div>
        </div>

        {/* Grid */}
        <div className="iroko-scroll max-h-[calc(92vh-15rem)] overflow-y-auto p-4">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Search className="mb-2 h-8 w-8 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">No services match your search.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {filtered.map((s) => {
                const Icon = ICON_MAP[s.icon] ?? Sparkles
                return (
                  <div
                    key={s.id}
                    className="group flex flex-col rounded-xl border border-border bg-card p-4 transition-all hover:border-primary/40 hover:shadow-sm"
                  >
                    <div className="flex items-start gap-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <Icon className="h-5 w-5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="text-sm font-semibold leading-tight">{s.name}</h3>
                          {s.popular && (
                            <Badge variant="secondary" className="shrink-0 bg-primary/10 text-[10px] text-primary">
                              Popular
                            </Badge>
                          )}
                        </div>
                        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                          {s.description}
                        </p>
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {s.duration}
                      </span>
                      {s.layer === 'ai' ? (
                        <span className="flex items-center gap-1 text-primary">
                          <CheckCircle2 className="h-3 w-3" />
                          Instant · Free
                        </span>
                      ) : (
                        <span className="font-medium text-foreground">
                          {s.feeMin === s.feeMax
                            ? formatNaira(s.feeMin)
                            : `${formatNaira(s.feeMin)} – ${formatNaira(s.feeMax)}`}
                          <span className="font-normal text-muted-foreground"> agent fee</span>
                        </span>
                      )}
                    </div>

                    {s.officialFee && (
                      <p className="mt-1 text-[11px] text-muted-foreground/80">
                        Official fee: {s.officialFee}
                      </p>
                    )}

                    <div className="mt-3 border-t border-border/60 pt-3">
                      <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground/70">
                        You'll need
                      </p>
                      <ul className="space-y-0.5">
                        {s.requirements.slice(0, 3).map((r) => (
                          <li key={r} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                            <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-muted-foreground/50" />
                            {r}
                          </li>
                        ))}
                        {s.requirements.length > 3 && (
                          <li className="text-xs text-muted-foreground/70">
                            +{s.requirements.length - 3} more
                          </li>
                        )}
                      </ul>
                    </div>

                    <Button
                      onClick={() => handleRequest(s)}
                      size="sm"
                      className="mt-3 w-full gap-1.5"
                      variant={s.layer === 'ai' ? 'default' : 'outline'}
                    >
                      <Send className="h-3.5 w-3.5" />
                      {s.layer === 'ai' ? 'Generate now' : 'Request this service'}
                    </Button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
