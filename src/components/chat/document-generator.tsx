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
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  ArrowLeft,
  ArrowRight,
  FileText,
  Loader2,
  Copy,
  Check,
  Download,
  Send,
  Home,
  Handshake,
  Briefcase,
  ReceiptText,
  Sparkles,
  AlertCircle,
} from 'lucide-react'
import {
  DOC_TEMPLATES,
  getDocTemplate,
  type DocTemplate,
  type DocField,
} from '@/lib/iroko-documents'
import { Markdown } from './markdown'
import { cn } from '@/lib/utils'

interface DocumentGeneratorProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSendToChat: (prompt: string) => void
}

type Step = 'select' | 'fill' | 'result'

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Home,
  Handshake,
  Briefcase,
  ReceiptText,
  FileText,
}

const CATEGORY_COLORS: Record<string, string> = {
  legal: 'bg-primary/10 text-primary',
  business: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  finance: 'bg-sky-500/15 text-sky-600 dark:text-sky-400',
}

export function DocumentGenerator({ open, onOpenChange, onSendToChat }: DocumentGeneratorProps) {
  const [step, setStep] = React.useState<Step>('select')
  const [template, setTemplate] = React.useState<DocTemplate | null>(null)
  const [values, setValues] = React.useState<Record<string, string>>({})
  const [content, setContent] = React.useState('')
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState('')
  const [copied, setCopied] = React.useState(false)

  const reset = () => {
    setStep('select')
    setTemplate(null)
    setValues({})
    setContent('')
    setLoading(false)
    setError('')
    setCopied(false)
  }

  React.useEffect(() => {
    if (!open) {
      const t = window.setTimeout(reset, 200)
      return () => window.clearTimeout(t)
    }
  }, [open])

  const chooseTemplate = (t: DocTemplate) => {
    const defaults: Record<string, string> = {}
    t.fields.forEach((f) => {
      if (f.default) defaults[f.id] = f.default
    })
    setTemplate(t)
    setValues(defaults)
    setStep('fill')
  }

  const setValue = (id: string, v: string) => {
    setValues((prev) => ({ ...prev, [id]: v }))
  }

  const requiredFilled = template
    ? template.fields.filter((f) => f.required).every((f) => (values[f.id] || '').trim())
    : false

  const generate = async () => {
    if (!template) return
    setLoading(true)
    setError('')
    setContent('')
    try {
      const res = await fetch('/api/generate-document', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ templateId: template.id, values }),
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data?.error || 'Generation failed')
      }
      setContent(data.content)
      setStep('result')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Generation failed')
    } finally {
      setLoading(false)
    }
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(content)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      /* ignore */
    }
  }

  const download = () => {
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${template?.id || 'iroko-document'}.md`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const sendToChat = () => {
    if (!template) return
    const prompt = [
      `I generated a ${template.name} using the Iroko document generator. Here it is:`,
      '',
      content,
      '',
      'Please review this document for completeness and Nigerian-law compliance, and suggest any improvements or missing clauses.',
    ].join('\n')
    onSendToChat(prompt)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] w-[min(860px,94vw)] overflow-hidden p-0 sm:max-w-[860px]">
        <DialogHeader className="border-b border-border px-5 py-4">
          <DialogTitle className="flex items-center gap-2 text-lg">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <FileText className="h-[1.1rem] w-[1.1rem]" />
            </span>
            Document Generator
            {template && step !== 'select' && (
              <span className="text-sm font-normal text-muted-foreground">
                · {template.name}
              </span>
            )}
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            Generate Nigerian-law-aware documents automatically. Fill in the
            details and Iroko drafts the full document for you.
          </DialogDescription>
        </DialogHeader>

        <div className="iroko-scroll max-h-[calc(92vh-8rem)] overflow-y-auto">
          {/* Step: select template */}
          {step === 'select' && (
            <div className="p-5">
              <p className="mb-3 text-sm font-medium">Choose a document type</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {DOC_TEMPLATES.map((t) => {
                  const Icon = ICON_MAP[t.icon] ?? FileText
                  return (
                    <button
                      key={t.id}
                      onClick={() => chooseTemplate(t)}
                      className="group flex items-start gap-3 rounded-xl border border-border bg-card p-4 text-left transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-sm"
                    >
                      <span
                        className={cn(
                          'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg',
                          CATEGORY_COLORS[t.category],
                        )}
                      >
                        <Icon className="h-5 w-5" />
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold leading-tight">{t.name}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{t.description}</p>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Step: fill fields */}
          {step === 'fill' && template && (
            <div className="p-5">
              <div className="mb-4 flex items-center gap-2">
                <Badge variant="secondary" className={CATEGORY_COLORS[template.category]}>
                  {template.category}
                </Badge>
                <span className="text-sm text-muted-foreground">
                  Fill in the details — required fields are marked.
                </span>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {template.fields.map((f) => (
                  <FieldInput
                    key={f.id}
                    field={f}
                    value={values[f.id] || ''}
                    onChange={(v) => setValue(f.id, v)}
                  />
                ))}
              </div>

              {error && (
                <div className="mt-4 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  {error}
                </div>
              )}

              <div className="mt-5 flex items-center justify-between gap-2">
                <Button variant="ghost" onClick={() => setStep('select')} disabled={loading}>
                  <ArrowLeft className="h-4 w-4" />
                  Back
                </Button>
                <Button onClick={generate} disabled={!requiredFilled || loading} className="gap-2">
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Generating…
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4" />
                      Generate document
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}

          {/* Step: result */}
          {step === 'result' && template && (
            <div className="flex flex-col">
              <div className="border-b border-border bg-muted/30 px-5 py-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => setStep('fill')} className="gap-1.5">
                    <ArrowLeft className="h-3.5 w-3.5" />
                    Edit inputs
                  </Button>
                  <Button variant="outline" size="sm" onClick={copy} className="gap-1.5">
                    {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    {copied ? 'Copied' : 'Copy'}
                  </Button>
                  <Button variant="outline" size="sm" onClick={download} className="gap-1.5">
                    <Download className="h-3.5 w-3.5" />
                    Download .md
                  </Button>
                  <Button size="sm" onClick={sendToChat} className="ml-auto gap-1.5">
                    <Send className="h-3.5 w-3.5" />
                    Send to Iroko
                  </Button>
                </div>
              </div>
              <div className="iroko-scroll max-h-[60vh] overflow-y-auto bg-background p-5 sm:p-8">
                <div className="mx-auto max-w-2xl rounded-lg border border-border bg-card p-6 shadow-sm sm:p-8">
                  <Markdown content={content} />
                </div>
                <p className="mt-4 text-center text-[11px] text-muted-foreground">
                  Generated by Iroko AI. Have a legal professional review before signing.
                </p>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function FieldInput({
  field,
  value,
  onChange,
}: {
  field: DocField
  value: string
  onChange: (v: string) => void
}) {
  const labelEl = (
    <Label htmlFor={`field-${field.id}`} className="text-sm font-medium">
      {field.label}
      {field.required && <span className="ml-0.5 text-destructive">*</span>}
    </Label>
  )

  const help = field.help && <p className="text-xs text-muted-foreground">{field.help}</p>

  if (field.kind === 'textarea') {
    return (
      <div className="space-y-1.5 sm:col-span-2">
        {labelEl}
        <Textarea
          id={`field-${field.id}`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          rows={3}
          className="resize-y"
        />
        {help}
      </div>
    )
  }

  if (field.kind === 'select' && field.options) {
    return (
      <div className="space-y-1.5">
        {labelEl}
        <Select value={value} onValueChange={onChange}>
          <SelectTrigger id={`field-${field.id}`}>
            <SelectValue placeholder="Select…" />
          </SelectTrigger>
          <SelectContent>
            {field.options.map((o) => (
              <SelectItem key={o} value={o}>
                {o}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {help}
      </div>
    )
  }

  const inputType =
    field.kind === 'date'
      ? 'date'
      : field.kind === 'number' || field.kind === 'money'
        ? 'text'
        : 'text'

  return (
    <div className="space-y-1.5">
      {labelEl}
      <div className="relative">
        {field.kind === 'money' && (
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
            ₦
          </span>
        )}
        <Input
          id={`field-${field.id}`}
          type={inputType}
          inputMode={field.kind === 'number' || field.kind === 'money' ? 'numeric' : undefined}
          value={value}
          onChange={(e) => {
            if (field.kind === 'money' || field.kind === 'number') {
              onChange(e.target.value.replace(/[^0-9.]/g, ''))
            } else {
              onChange(e.target.value)
            }
          }}
          placeholder={field.placeholder}
          className={field.kind === 'money' ? 'pl-7' : ''}
        />
      </div>
      {help}
    </div>
  )
}
