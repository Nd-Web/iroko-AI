'use client'

import * as React from 'react'
import Link from 'next/link'
import {
  Building2,
  IdCard,
  CheckCircle2,
  Clock,
  UserCheck,
  Send,
  FileCheck,
  ExternalLink,
  Search,
  Filter,
  RefreshCw,
  MessageSquareText,
  AlertCircle
} from 'lucide-react'
import { IrokoLogo } from '@/components/iroko-logo'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from '@/components/ui/dialog'
import { OPERATOR_ROLE_LABELS } from '@/lib/operator'

export interface TaskDocumentItem {
  id: string
  kind: string
  label: string
  filename: string
  mimeType: string
}

export interface TaskItem {
  id: string
  userId: string
  userEmail: string
  title: string
  serviceId: string
  status: string
  amountKobo: number
  paidAt: string | null
  createdAt: string
  detailsJson: string
  resultJson: string | null
  documents: TaskDocumentItem[]
}

interface OperatorDashboardProps {
  viewer: {
    userId: string | null
    email: string | null
    isPrimary: boolean
    role: string | null
  }
  initialTasks: TaskItem[]
}

function parseJson<T>(s: string | null | undefined, fallback: T): T {
  if (!s) return fallback
  try {
    return JSON.parse(s) as T
  } catch {
    return fallback
  }
}

export function OperatorDashboard({ viewer, initialTasks }: OperatorDashboardProps) {
  const [tasks, setTasks] = React.useState<TaskItem[]>(initialTasks)
  const [statusTab, setStatusTab] = React.useState<'pending' | 'processing' | 'completed' | 'all'>('pending')
  const [categoryFilter, setCategoryFilter] = React.useState<string>('all')
  const [searchQuery, setSearchQuery] = React.useState('')
  const [loadingTaskId, setLoadingTaskId] = React.useState<string | null>(null)

  // Note Modal state
  const [noteTask, setNoteTask] = React.useState<TaskItem | null>(null)
  const [noteText, setNoteText] = React.useState('')
  const [noteSubmitting, setNoteSubmitting] = React.useState(false)

  // Complete Modal state
  const [completeTask, setCompleteTask] = React.useState<TaskItem | null>(null)
  const [referenceNum, setReferenceNum] = React.useState('')
  const [completionNotes, setCompletionNotes] = React.useState('')
  const [completeSubmitting, setCompleteSubmitting] = React.useState(false)

  const refreshData = React.useCallback(async () => {
    try {
      const res = await fetch('/api/operator/tasks')
      if (res.ok) {
        const data = await res.json()
        if (data.tasks) setTasks(data.tasks)
      }
    } catch {
      // Keep existing state on transient failure
    }
  }, [])

  // Claim job handler
  const handleClaim = async (task: TaskItem) => {
    setLoadingTaskId(task.id)
    try {
      const res = await fetch(`/api/operator/tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'claim' }),
      })
      if (res.ok) {
        setTasks((prev) =>
          prev.map((t) => (t.id === task.id ? { ...t, status: 'PROCESSING' } : t))
        )
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoadingTaskId(null)
    }
  }

  // Submit live note update handler
  const handleSendNote = async () => {
    if (!noteTask || !noteText.trim()) return
    setNoteSubmitting(true)
    try {
      const res = await fetch(`/api/operator/tasks/${noteTask.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'add_note', note: noteText }),
      })
      if (res.ok) {
        setNoteTask(null)
        setNoteText('')
      }
    } catch (e) {
      console.error(e)
    } finally {
      setNoteSubmitting(false)
    }
  }

  // Submit completion handler (Pending -> Done)
  const handleComplete = async () => {
    if (!completeTask) return
    setCompleteSubmitting(true)
    try {
      const res = await fetch(`/api/operator/tasks/${completeTask.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'complete',
          reference: referenceNum,
          completionNotes,
        }),
      })
      if (res.ok) {
        const data = await res.json()
        setTasks((prev) =>
          prev.map((t) =>
            t.id === completeTask.id
              ? {
                  ...t,
                  status: 'COMPLETED',
                  resultJson: JSON.stringify(data.task?.resultJson || {}),
                }
              : t
          )
        )
        setCompleteTask(null)
        setReferenceNum('')
        setCompletionNotes('')
      }
    } catch (e) {
      console.error(e)
    } finally {
      setCompleteSubmitting(false)
    }
  }

  // Filter tasks logic
  const filteredTasks = React.useMemo(() => {
    return tasks.filter((t) => {
      // Tab filter
      if (statusTab === 'pending' && t.status !== 'NEEDS_HUMAN' && t.status !== 'QUEUED') return false
      if (statusTab === 'processing' && t.status !== 'PROCESSING') return false
      if (statusTab === 'completed' && t.status !== 'COMPLETED') return false

      // Category filter
      if (categoryFilter === 'cac' && !/cac|business|llc|sole/i.test(t.serviceId + t.title)) return false
      if (categoryFilter === 'nin' && !/nin|identity|nimc/i.test(t.serviceId + t.title)) return false
      if (categoryFilter === 'tax' && !/tax|tin|vat|firs/i.test(t.serviceId + t.title)) return false
      if (categoryFilter === 'legal' && !/notar|legal|land|contract/i.test(t.serviceId + t.title)) return false

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        const matchTitle = t.title.toLowerCase().includes(q)
        const matchEmail = t.userEmail.toLowerCase().includes(q)
        const matchId = t.id.toLowerCase().includes(q)
        const matchDetails = t.detailsJson.toLowerCase().includes(q)
        if (!matchTitle && !matchEmail && !matchId && !matchDetails) return false
      }

      return true
    })
  }, [tasks, statusTab, categoryFilter, searchQuery])

  // Status counts
  const pendingCount = tasks.filter((t) => t.status === 'NEEDS_HUMAN' || t.status === 'QUEUED').length
  const processingCount = tasks.filter((t) => t.status === 'PROCESSING').length
  const completedCount = tasks.filter((t) => t.status === 'COMPLETED').length

  return (
    <div className="min-h-screen bg-background px-4 py-6">
      <div className="mx-auto w-full max-w-5xl">
        {/* Header */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4 border-b border-border pb-4">
          <div className="flex items-center gap-3">
            <IrokoLogo size={28} withWordmark />
            <span className="text-sm font-semibold text-emerald-500 dark:text-emerald-400">
              Agent Portal & Marketplace
            </span>
          </div>
          <div className="flex items-center gap-3">
            {viewer.isPrimary && (
              <Link
                href="/operator/team"
                className="text-xs font-medium text-primary hover:underline"
              >
                Manage Team
              </Link>
            )}
            <Link
              href="/"
              className="text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              ← Back to Chat
            </Link>
          </div>
        </div>

        {/* Agent Info Banner */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-500/20 bg-emerald-950/20 p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-500">
              <UserCheck className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold">{viewer.email}</span>
                <Badge variant="outline" className="border-emerald-500/30 text-emerald-400">
                  {viewer.isPrimary
                    ? 'Primary Operator'
                    : OPERATOR_ROLE_LABELS[viewer.role ?? ''] ?? 'Agent'}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                You are ready to process CAC, NIN, Tax & Legal registrations submitted by users.
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={refreshData}
            className="gap-1 text-xs"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Refresh Jobs
          </Button>
        </div>

        {/* Tab & Search Controls */}
        <div className="mb-6 space-y-4">
          {/* Status Tabs */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2">
            <div className="flex items-center gap-1">
              <button
                onClick={() => setStatusTab('pending')}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                  statusTab === 'pending'
                    ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                    : 'text-muted-foreground hover:bg-muted'
                }`}
              >
                <Clock className="h-3.5 w-3.5" />
                Pending Jobs ({pendingCount})
              </button>
              <button
                onClick={() => setStatusTab('processing')}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                  statusTab === 'processing'
                    ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400'
                    : 'text-muted-foreground hover:bg-muted'
                }`}
              >
                <RefreshCw className="h-3.5 w-3.5" />
                In Progress ({processingCount})
              </button>
              <button
                onClick={() => setStatusTab('completed')}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                  statusTab === 'completed'
                    ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                    : 'text-muted-foreground hover:bg-muted'
                }`}
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                Completed / Done ({completedCount})
              </button>
              <button
                onClick={() => setStatusTab('all')}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                  statusTab === 'all'
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-muted'
                }`}
              >
                All Jobs ({tasks.length})
              </button>
            </div>

            {/* Category Filter Chips */}
            <div className="flex items-center gap-1">
              <Filter className="mr-1 h-3.5 w-3.5 text-muted-foreground" />
              <button
                onClick={() => setCategoryFilter('all')}
                className={`rounded px-2 py-0.5 text-xs ${
                  categoryFilter === 'all' ? 'bg-secondary font-semibold' : 'text-muted-foreground'
                }`}
              >
                All
              </button>
              <button
                onClick={() => setCategoryFilter('cac')}
                className={`flex items-center gap-1 rounded px-2 py-0.5 text-xs ${
                  categoryFilter === 'cac' ? 'bg-secondary font-semibold' : 'text-muted-foreground'
                }`}
              >
                <Building2 className="h-3 w-3" /> CAC
              </button>
              <button
                onClick={() => setCategoryFilter('nin')}
                className={`flex items-center gap-1 rounded px-2 py-0.5 text-xs ${
                  categoryFilter === 'nin' ? 'bg-secondary font-semibold' : 'text-muted-foreground'
                }`}
              >
                <IdCard className="h-3 w-3" /> NIN
              </button>
              <button
                onClick={() => setCategoryFilter('tax')}
                className={`rounded px-2 py-0.5 text-xs ${
                  categoryFilter === 'tax' ? 'bg-secondary font-semibold' : 'text-muted-foreground'
                }`}
              >
                Tax
              </button>
              <button
                onClick={() => setCategoryFilter('legal')}
                className={`rounded px-2 py-0.5 text-xs ${
                  categoryFilter === 'legal' ? 'bg-secondary font-semibold' : 'text-muted-foreground'
                }`}
              >
                Legal
              </button>
            </div>
          </div>

          {/* Search bar */}
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search jobs by proposed name, email, task ID, or details..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 text-xs"
            />
          </div>
        </div>

        {/* Job List Cards */}
        {filteredTasks.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-12 text-center text-sm text-muted-foreground">
            <AlertCircle className="mx-auto mb-2 h-6 w-6 text-muted-foreground/60" />
            No jobs found matching your filters.
          </div>
        ) : (
          <div className="space-y-4">
            {filteredTasks.map((t) => {
              const details = parseJson<Record<string, string>>(t.detailsJson, {})
              const result = parseJson<{
                submissionPack?: string
                referenceNumber?: string
                completedBy?: string
                completionNotes?: string
              }>(t.resultJson, {})

              const isPending = t.status === 'NEEDS_HUMAN' || t.status === 'QUEUED'
              const isProcessing = t.status === 'PROCESSING'
              const isCompleted = t.status === 'COMPLETED'

              return (
                <div
                  key={t.id}
                  className={`rounded-xl border p-4 transition-all ${
                    isPending
                      ? 'border-amber-500/30 bg-card/60 shadow-sm'
                      : isProcessing
                        ? 'border-blue-500/30 bg-card'
                        : 'border-border bg-card/40 opacity-90'
                  }`}
                >
                  {/* Card Header */}
                  <div className="flex flex-wrap items-start justify-between gap-2 border-b border-border/50 pb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-foreground">{t.title}</h3>
                        <Badge
                          variant={
                            isPending
                              ? 'secondary'
                              : isProcessing
                                ? 'default'
                                : 'outline'
                          }
                          className={
                            isPending
                              ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30'
                              : isProcessing
                                ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30'
                                : 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                          }
                        >
                          {isPending
                            ? 'Pending Agent Filing'
                            : isProcessing
                              ? 'In Progress'
                              : 'Done (Completed)'}
                        </Badge>
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        Customer: <span className="font-medium text-foreground">{t.userEmail}</span> ·{' '}
                        {new Date(t.createdAt).toLocaleString()} · ID: <code className="text-xs">{t.id}</code>
                      </p>
                    </div>

                    {/* Quick status actions */}
                    <div className="flex items-center gap-2">
                      {isPending && (
                        <Button
                          size="sm"
                          onClick={() => handleClaim(t)}
                          disabled={loadingTaskId === t.id}
                          className="gap-1 bg-amber-600 hover:bg-amber-700 text-white text-xs"
                        >
                          <UserCheck className="h-3.5 w-3.5" /> Accept / Claim Job
                        </Button>
                      )}

                      {isProcessing && (
                        <Button
                          size="sm"
                          onClick={() => setCompleteTask(t)}
                          className="gap-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" /> Mark as Completed (Done)
                        </Button>
                      )}

                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setNoteTask(t)
                          setNoteText('')
                        }}
                        className="gap-1 text-xs"
                      >
                        <MessageSquareText className="h-3.5 w-3.5" /> Send Update Note
                      </Button>
                    </div>
                  </div>

                  {/* Customer Information Table */}
                  <div className="mt-3">
                    <h4 className="text-xs font-semibold uppercase text-muted-foreground">
                      Collected Customer Information ({Object.keys(details).length} fields)
                    </h4>
                    <div className="mt-1 max-h-56 overflow-y-auto rounded-lg border border-border/50 bg-muted/40 p-2">
                      <table className="w-full text-xs">
                        <tbody>
                          {Object.entries(details).map(([k, v]) => (
                            <tr key={k} className="border-b border-border/30 last:border-0">
                              <td className="py-1 pr-3 font-medium text-muted-foreground w-1/3 align-top">
                                {k}
                              </td>
                              <td className="py-1 font-mono text-foreground select-all align-top">
                                {v}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Documents Section */}
                  {t.documents.length > 0 && (
                    <div className="mt-3">
                      <h4 className="text-xs font-semibold uppercase text-muted-foreground">
                        Uploaded Identity & Signature Documents ({t.documents.length})
                      </h4>
                      <div className="mt-1 flex flex-wrap gap-2">
                        {t.documents.map((doc) => (
                          <a
                            key={doc.id}
                            href={`/api/tasks/${t.id}/documents/${doc.id}`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 rounded-md border border-input bg-background px-2.5 py-1 text-xs font-medium hover:bg-accent text-primary"
                          >
                            <ExternalLink className="h-3 w-3" />
                            {doc.label} ({doc.filename})
                          </a>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Completion Details if Done */}
                  {isCompleted && (result.referenceNumber || result.completionNotes) && (
                    <div className="mt-3 rounded-lg border border-emerald-500/20 bg-emerald-950/20 p-3">
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-400">
                        <FileCheck className="h-4 w-4" /> Registration Completed
                      </div>
                      {result.referenceNumber && (
                        <p className="mt-1 text-xs font-mono text-emerald-200">
                          Official Reference / RC Number: <span className="font-bold select-all">{result.referenceNumber}</span>
                        </p>
                      )}
                      {result.completionNotes && (
                        <p className="mt-1 text-xs text-emerald-200/80">{result.completionNotes}</p>
                      )}
                      {result.completedBy && (
                        <p className="mt-1 text-[10px] text-emerald-400/60">
                          Processed by Agent: {result.completedBy}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Submission Pack Preview toggle */}
                  {result.submissionPack && (
                    <details className="mt-3 text-xs text-muted-foreground">
                      <summary className="cursor-pointer font-medium hover:text-foreground">
                        View Operator Submission Pack Markdown ↗
                      </summary>
                      <pre className="mt-2 overflow-x-auto rounded-lg bg-muted p-3 text-xs text-foreground">
                        {result.submissionPack}
                      </pre>
                    </details>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Modal: Post Timeline Update Note */}
      <Dialog open={!!noteTask} onOpenChange={(open) => !open && setNoteTask(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Send Customer Status Update</DialogTitle>
            <DialogDescription>
              Post a note to the live task timeline for task <b>{noteTask?.title}</b>. The customer will see this note in their chat.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Textarea
              placeholder="e.g., Submitted company name availability to CAC portal; awaiting approval within 24 hours..."
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              rows={3}
              className="text-xs"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNoteTask(null)}>
              Cancel
            </Button>
            <Button
              onClick={handleSendNote}
              disabled={noteSubmitting || !noteText.trim()}
              className="gap-1"
            >
              <Send className="h-3.5 w-3.5" /> Post Note
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal: Mark Task as Completed / Done */}
      <Dialog open={!!completeTask} onOpenChange={(open) => !open && setCompleteTask(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Mark Task as Completed (Done)</DialogTitle>
            <DialogDescription>
              Complete registration for <b>{completeTask?.title}</b>. Provide official reference numbers or completion details for the user.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <label className="text-xs font-medium text-muted-foreground">
                Official Reference / RC Number / NIN Slip Ref
              </label>
              <Input
                placeholder="e.g. RC 7493201 or NIN-REF-90432"
                value={referenceNum}
                onChange={(e) => setReferenceNum(e.target.value)}
                className="mt-1 text-xs"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">
                Completion Notes for Customer
              </label>
              <Textarea
                placeholder="e.g., Registration certificate successfully issued by CAC. Copies delivered to your account documents."
                value={completionNotes}
                onChange={(e) => setCompletionNotes(e.target.value)}
                rows={3}
                className="mt-1 text-xs"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCompleteTask(null)}>
              Cancel
            </Button>
            <Button
              onClick={handleComplete}
              disabled={completeSubmitting}
              className="gap-1 bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              <CheckCircle2 className="h-3.5 w-3.5" /> Complete Job & Set to Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
