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
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
} from 'recharts'
import {
  Calculator,
  Send,
  Info,
  TrendingDown,
  Wallet,
  Percent,
  ArrowRightLeft,
} from 'lucide-react'
import {
  calculatePayee,
  formatNaira,
  formatPercent,
  summarizePayeeResult,
  type PayeeResult,
} from '@/lib/nigerian-tax'
import { cn } from '@/lib/utils'

interface TaxCalculatorProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSendToChat: (prompt: string) => void
}

const BAND_COLORS = [
  '#0e7a4f', // 7%
  '#1aa874', // 11%
  '#3bbf8a', // 15%
  '#7fc9a3', // 19%
  '#e8b94a', // 21%
  '#d97757', // 24%
]

type Period = 'monthly' | 'annual'

export function TaxCalculator({ open, onOpenChange, onSendToChat }: TaxCalculatorProps) {
  const [period, setPeriod] = React.useState<Period>('monthly')
  const [amount, setAmount] = React.useState<string>('450000')
  const [pension, setPension] = React.useState(true)
  const [nhf, setNhf] = React.useState(true)
  const [nhis, setNhis] = React.useState(false)

  const numericAmount = React.useMemo(() => {
    const n = parseFloat(amount.replace(/[^0-9.]/g, ''))
    return Number.isFinite(n) ? n : 0
  }, [amount])

  const grossAnnual = period === 'monthly' ? numericAmount * 12 : numericAmount

  const result: PayeeResult = React.useMemo(
    () => calculatePayee({ grossAnnual, pension, nhf, nhis }),
    [grossAnnual, pension, nhf, nhis],
  )

  const chartData = React.useMemo(
    () =>
      result.bands
        .filter((b) => b.tax > 0)
        .map((b, i) => ({
          name: b.band.label,
          value: b.tax,
          rate: b.band.rate,
          color: BAND_COLORS[i % BAND_COLORS.length],
        })),
    [result],
  )

  const displayAmount = (val: number, p: Period) =>
    period === 'monthly' ? `${formatNaira(val / 12)}/mo` : formatNaira(val)

  const handleSend = () => {
    onSendToChat(summarizePayeeResult(result))
    onOpenChange(false)
  }

  const inputLabel =
    period === 'monthly' ? 'Monthly gross income' : 'Annual gross income'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] w-[min(960px,94vw)] overflow-hidden p-0 sm:max-w-[960px]">
        <DialogHeader className="border-b border-border px-5 py-4">
          <DialogTitle className="flex items-center gap-2 text-lg">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Calculator className="h-[1.1rem] w-[1.1rem]" />
            </span>
            Nigerian PAYE Tax Calculator
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            Compute personal income tax using the current statutory bands,
            Consolidated Relief Allowance and statutory deductions.
          </DialogDescription>
        </DialogHeader>

        <div className="iroko-scroll max-h-[calc(92vh-8rem)] overflow-y-auto">
          <div className="grid gap-0 lg:grid-cols-[380px_1fr]">
            {/* ---- Inputs ---- */}
            <div className="space-y-5 border-b border-border p-5 lg:border-b-0 lg:border-r">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">Income period</Label>
                  <Tabs value={period} onValueChange={(v) => setPeriod(v as Period)}>
                    <TabsList className="h-8">
                      <TabsTrigger value="monthly" className="text-xs">Monthly</TabsTrigger>
                      <TabsTrigger value="annual" className="text-xs">Annual</TabsTrigger>
                    </TabsList>
                  </Tabs>
                </div>
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium text-muted-foreground">
                    ₦
                  </span>
                  <Input
                    type="text"
                    inputMode="decimal"
                    value={amount ? Number(amount.replace(/[^0-9.]/g, '')).toLocaleString('en-NG') : ''}
                    onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
                    placeholder="450,000"
                    className="h-11 pl-7 text-base font-medium"
                    aria-label={inputLabel}
                  />
                </div>
                <p className="text-xs text-muted-foreground">{inputLabel} (gross, before deductions)</p>
              </div>

              <div className="space-y-3">
                <Label className="text-sm font-medium">Statutory deductions</Label>
                <DeductionRow
                  label="Pension (PRA)"
                  rate="8% of gross"
                  checked={pension}
                  onChecked={setPension}
                />
                <DeductionRow
                  label="National Housing Fund"
                  rate="2.5% of gross"
                  checked={nhf}
                  onChecked={setNhf}
                />
                <DeductionRow
                  label="Health Insurance (NHIS)"
                  rate="5% of gross"
                  checked={nhis}
                  onChecked={setNhis}
                />
              </div>

              <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
                <div className="flex gap-2">
                  <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    The Consolidated Relief Allowance (CRA) — the higher of ₦200,000
                    or 1% of gross, <strong className="text-foreground">plus 20% of gross</strong> —
                    is applied automatically before tax.
                  </p>
                </div>
              </div>
            </div>

            {/* ---- Results ---- */}
            <div className="space-y-5 p-5">
              {/* Headline numbers */}
              <div className="grid grid-cols-2 gap-3">
                <HeadlineCard
                  icon={<Wallet className="h-4 w-4" />}
                  label="Net take-home"
                  value={displayAmount(result.netAnnual, period)}
                  sub={`${formatNaira(result.netAnnual)}/yr`}
                  tone="primary"
                />
                <HeadlineCard
                  icon={<TrendingDown className="h-4 w-4" />}
                  label="PAYE tax"
                  value={displayAmount(result.totalTaxAnnual, period)}
                  sub={`${formatNaira(result.totalTaxAnnual)}/yr`}
                  tone="muted"
                />
              </div>

              {/* Effective rate + chart */}
              <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center">
                <div className="flex items-center gap-4">
                  <div className="relative h-20 w-20 shrink-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={chartData}
                          dataKey="value"
                          nameKey="name"
                          innerRadius={26}
                          outerRadius={38}
                          paddingAngle={2}
                          stroke="none"
                        >
                          {chartData.map((entry, i) => (
                            <Cell key={i} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip
                          formatter={(v: number) => formatNaira(v)}
                          contentStyle={{
                            borderRadius: 8,
                            border: '1px solid var(--border)',
                            fontSize: 12,
                          }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                      <Percent className="h-3 w-3 text-muted-foreground" />
                      <span className="text-xs font-semibold">
                        {formatPercent(result.effectiveRate)}
                      </span>
                    </div>
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Effective tax rate
                    </p>
                    <p className="text-sm text-muted-foreground">
                      You keep {formatPercent(1 - result.effectiveRate)} of gross
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1.5 sm:ml-auto sm:justify-end">
                  {chartData.map((d) => (
                    <div key={d.name} className="flex items-center gap-1.5">
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: d.color }}
                      />
                      <span className="text-xs text-muted-foreground">
                        {d.name} ({formatPercent(d.rate)})
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Breakdown */}
              <div className="space-y-2">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Breakdown (annual)
                </h4>
                <BreakdownRow label="Gross income" value={formatNaira(result.grossAnnual)} strong />
                {result.totalStatutoryDeductions > 0 && (
                  <BreakdownRow
                    label="Statutory deductions"
                    value={`- ${formatNaira(result.totalStatutoryDeductions)}`}
                    sub={[
                      result.pension && `Pension ${formatNaira(result.pension)}`,
                      result.nhf && `NHF ${formatNaira(result.nhf)}`,
                      result.nhis && `NHIS ${formatNaira(result.nhis)}`,
                    ].filter(Boolean).join(' · ')}
                  />
                )}
                <BreakdownRow label="Consolidated Relief Allowance" value={`- ${formatNaira(result.cra)}`} />
                <BreakdownRow
                  label="Taxable income"
                  value={formatNaira(result.taxableIncome)}
                  strong
                />

                <div className="my-1 border-t border-dashed border-border" />

                <div className="space-y-1.5 rounded-lg bg-muted/40 p-3">
                  {result.bands
                    .filter((b) => b.taxableInBand > 0)
                    .map((b, i) => (
                      <div key={i} className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-2 text-muted-foreground">
                          <span
                            className="h-2 w-2 rounded-full"
                            style={{ backgroundColor: BAND_COLORS[i % BAND_COLORS.length] }}
                          />
                          {b.band.label} · {formatPercent(b.band.rate)}
                        </span>
                        <span className="font-medium">{formatNaira(b.tax)}</span>
                      </div>
                    ))}
                </div>

                <div className="my-1 border-t border-dashed border-border" />

                <BreakdownRow label="Total PAYE (annual)" value={formatNaira(result.totalTaxAnnual)} strong />
                <BreakdownRow label="Net annual income" value={formatNaira(result.netAnnual)} strong />
              </div>

              <Button onClick={handleSend} className="w-full gap-2" size="lg">
                <Send className="h-4 w-4" />
                Send this calculation to Iroko
              </Button>
              <p className="text-center text-[11px] text-muted-foreground">
                Rates per PITA (as amended). Verify current figures with FIRS.
              </p>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function DeductionRow({
  label,
  rate,
  checked,
  onChecked,
}: {
  label: string
  rate: string
  checked: boolean
  onChecked: (v: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2">
      <div className="min-w-0">
        <p className="text-sm font-medium leading-tight">{label}</p>
        <p className="text-xs text-muted-foreground">{rate}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChecked} aria-label={label} />
    </div>
  )
}

function HeadlineCard({
  icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: React.ReactNode
  label: string
  value: string
  sub: string
  tone: 'primary' | 'muted'
}) {
  return (
    <div
      className={cn(
        'rounded-xl border p-3.5',
        tone === 'primary'
          ? 'border-primary/30 bg-primary/5'
          : 'border-border bg-card',
      )}
    >
      <div className="flex items-center gap-1.5 text-muted-foreground">
        {icon}
        <span className="text-xs font-medium">{label}</span>
      </div>
      <p
        className={cn(
          'mt-1.5 text-xl font-semibold tracking-tight',
          tone === 'primary' ? 'text-primary' : 'text-foreground',
        )}
      >
        {value}
      </p>
      <p className="text-xs text-muted-foreground">{sub}</p>
    </div>
  )
}

function BreakdownRow({
  label,
  value,
  sub,
  strong,
}: {
  label: string
  value: string
  sub?: string
  strong?: boolean
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <div className="min-w-0">
        <span className={cn('text-sm', strong ? 'font-medium' : 'text-muted-foreground')}>
          {label}
        </span>
        {sub && <p className="text-[11px] text-muted-foreground/80">{sub}</p>}
      </div>
      <span className={cn('shrink-0 text-sm tabular-nums', strong ? 'font-semibold' : 'text-muted-foreground')}>
        {value}
      </span>
    </div>
  )
}
