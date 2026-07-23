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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Search,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Lightbulb,
  Send,
  Info,
  Loader2,
} from 'lucide-react'
import {
  checkBusinessName,
  buildNameCheckPrompt,
  ENTITY_TYPES,
  type EntityType,
  type NameCheckResult,
} from '@/lib/business-name-checker'
import { cn } from '@/lib/utils'

interface BusinessNameCheckerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSendToChat: (prompt: string) => void
}

const STATUS_STYLES = {
  available: {
    icon: CheckCircle2,
    color: 'text-emerald-600 dark:text-emerald-400',
    bg: 'bg-emerald-50 dark:bg-emerald-950/30',
    border: 'border-emerald-200 dark:border-emerald-900',
  },
  taken: {
    icon: XCircle,
    color: 'text-rose-600 dark:text-rose-400',
    bg: 'bg-rose-50 dark:bg-rose-950/30',
    border: 'border-rose-200 dark:border-rose-900',
  },
  restricted: {
    icon: AlertTriangle,
    color: 'text-amber-600 dark:text-amber-400',
    bg: 'bg-amber-50 dark:bg-amber-950/30',
    border: 'border-amber-200 dark:border-amber-900',
  },
  invalid: {
    icon: AlertTriangle,
    color: 'text-amber-600 dark:text-amber-400',
    bg: 'bg-amber-50 dark:bg-amber-950/30',
    border: 'border-amber-200 dark:border-amber-900',
  },
} as const

export function BusinessNameChecker({ open, onOpenChange, onSendToChat }: BusinessNameCheckerProps) {
  const [name, setName] = React.useState('')
  const [entityType, setEntityType] = React.useState<EntityType>('llc')
  const [result, setResult] = React.useState<NameCheckResult | null>(null)
  const [checking, setChecking] = React.useState(false)

  const runCheck = React.useCallback(() => {
    if (!name.trim()) return
    setChecking(true)
    setResult(null)
    // simulate the brief portal round-trip
    window.setTimeout(() => {
      setResult(checkBusinessName(name, entityType))
      setChecking(false)
    }, 650)
  }, [name, entityType])

  const onNameKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      runCheck()
    }
  }

  const handleSuggestion = (s: string) => {
    setName(s)
    setResult(null)
  }

  const handleSend = () => {
    if (!result) return
    onSendToChat(buildNameCheckPrompt(result, entityType))
    onOpenChange(false)
  }

  // reset on close
  React.useEffect(() => {
    if (!open) {
      const t = window.setTimeout(() => {
        setResult(null)
        setChecking(false)
      }, 200)
      return () => window.clearTimeout(t)
    }
  }, [open])

  const style = result ? STATUS_STYLES[result.status] : null
  const StatusIcon = style?.icon

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] w-[min(640px,94vw)] overflow-hidden p-0 sm:max-w-[640px]">
        <DialogHeader className="border-b border-border px-5 py-4">
          <DialogTitle className="flex items-center gap-2 text-lg">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Search className="h-[1.1rem] w-[1.1rem]" />
            </span>
            CAC Business Name Check
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            Instantly check if your proposed business name is available for
            registration with the Corporate Affairs Commission.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 p-5">
          {/* Inputs */}
          <div className="space-y-2">
            <Label htmlFor="bn-name" className="text-sm font-medium">
              Proposed business name
            </Label>
            <div className="flex gap-2">
              <Input
                id="bn-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={onNameKeyDown}
                placeholder="e.g. Iroko Technologies Limited"
                className="h-11"
                autoFocus
              />
              <Button onClick={runCheck} disabled={!name.trim() || checking} className="h-11 gap-1.5 px-4">
                {checking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                Check
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium">Entity type</Label>
            <Select value={entityType} onValueChange={(v) => setEntityType(v as EntityType)}>
              <SelectTrigger className="h-10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ENTITY_TYPES.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {ENTITY_TYPES.find((t) => t.id === entityType)?.hint}
            </p>
          </div>

          {/* Result */}
          {checking && (
            <div className="flex items-center justify-center gap-2 rounded-xl border border-border bg-muted/40 py-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Searching the CAC registry…
            </div>
          )}

          {!checking && result && style && StatusIcon && (
            <div className={cn('iroko-fade-up rounded-xl border p-4', style.border, style.bg)}>
              <div className="flex items-start gap-3">
                <StatusIcon className={cn('mt-0.5 h-5 w-5 shrink-0', style.color)} />
                <div className="min-w-0 flex-1">
                  <p className={cn('font-semibold leading-tight', style.color)}>{result.title}</p>
                  <p className="mt-1 text-sm text-foreground/80">{result.message}</p>
                  {result.confidence > 0 && (
                    <p className="mt-1.5 text-[11px] text-muted-foreground">
                      Confidence: {Math.round(result.confidence * 100)}% · Demo registry — confirm on the CAC portal.
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Issues */}
          {!checking && result && result.issues.length > 0 && (
            <div className="rounded-lg border border-border bg-card p-3">
              <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <Info className="h-3.5 w-3.5" />
                Notes
              </p>
              <ul className="space-y-1">
                {result.issues.map((iss, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-muted-foreground/50" />
                    {iss}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Suggestions */}
          {!checking && result && result.suggestions.length > 0 && (
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
              <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-primary">
                <Lightbulb className="h-3.5 w-3.5" />
                Try these available alternatives
              </p>
              <div className="flex flex-wrap gap-1.5">
                {result.suggestions.map((s) => (
                  <button
                    key={s}
                    onClick={() => handleSuggestion(s)}
                    className="rounded-full border border-primary/30 bg-background px-3 py-1 text-xs font-medium text-foreground transition-colors hover:bg-primary/10"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Action */}
          {!checking && result && (
            <Button onClick={handleSend} className="w-full gap-2" size="lg">
              <Send className="h-4 w-4" />
              Ask Iroko about this name
            </Button>
          )}

          <p className="text-center text-[11px] text-muted-foreground">
            Demo check against a simulated registry. The live CAC portal search is
            the final authority.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}
