'use client'

import * as React from 'react'
import { useSession, signOut } from 'next-auth/react'
import {
  Plus,
  Search,
  MessageSquare,
  Pencil,
  Trash2,
  Check,
  X,
  Calculator,
  LayoutGrid,
  Search as SearchIcon,
  FileText,
  LogOut,
  ClipboardList,
} from 'lucide-react'
import { IrokoLogo } from '@/components/iroko-logo'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { useChatStore } from '@/lib/chat-store'
import { FLOW_PROMPTS } from '@/lib/iroko-ai'
import { ThemeToggle } from './theme-toggle'
import { cn } from '@/lib/utils'
import type { Conversation } from '@/lib/types'

interface ChatSidebarContentProps {
  onNavigate?: () => void
  /** Chat-first: tool buttons send a flow-starter prompt into the chat. */
  onStartFlow?: (prompt: string) => void
}

interface SidebarTask {
  id: string
  title: string
  status: string
  lastEvent: string | null
}

const TASK_STATUS_STYLE: Record<string, { label: string; dot: string }> = {
  AWAITING_PAYMENT: { label: 'Awaiting payment', dot: 'bg-amber-500' },
  QUEUED: { label: 'Queued', dot: 'bg-sky-500' },
  PROCESSING: { label: 'Processing', dot: 'bg-sky-500 animate-pulse' },
  NEEDS_HUMAN: { label: 'With Iroko team', dot: 'bg-violet-500' },
  COMPLETED: { label: 'Completed', dot: 'bg-emerald-500' },
  FAILED: { label: 'Failed', dot: 'bg-rose-500' },
  CANCELLED: { label: 'Cancelled', dot: 'bg-zinc-400' },
}

function groupByDate(convs: Conversation[]) {
  const now = Date.now()
  const day = 24 * 60 * 60 * 1000
  const groups: { label: string; items: Conversation[] }[] = [
    { label: 'Today', items: [] },
    { label: 'Previous 7 days', items: [] },
    { label: 'Older', items: [] },
  ]
  for (const c of convs) {
    const age = now - c.updatedAt
    if (age < day) groups[0].items.push(c)
    else if (age < 7 * day) groups[1].items.push(c)
    else groups[2].items.push(c)
  }
  return groups.filter((g) => g.items.length > 0)
}

export function ChatSidebarContent({ onNavigate, onStartFlow }: ChatSidebarContentProps) {
  const { data: session } = useSession()
  const conversations = useChatStore((s) => s.conversations)
  const activeId = useChatStore((s) => s.activeId)
  const setActive = useChatStore((s) => s.setActive)
  const deleteConversation = useChatStore((s) => s.deleteConversation)
  const renameConversation = useChatStore((s) => s.renameConversation)
  const startNewChat = useChatStore((s) => s.startNewChat)

  const [query, setQuery] = React.useState('')
  const [editingId, setEditingId] = React.useState<string | null>(null)
  const [draft, setDraft] = React.useState('')
  const [pendingDelete, setPendingDelete] = React.useState<Conversation | null>(null)

  // My requests — live task tracker (refreshes every 30s while mounted)
  const [tasks, setTasks] = React.useState<SidebarTask[]>([])
  React.useEffect(() => {
    let alive = true
    const load = async () => {
      try {
        const res = await fetch('/api/tasks')
        if (!res.ok) return
        const data = await res.json()
        if (alive && Array.isArray(data.tasks)) setTasks(data.tasks)
      } catch {
        /* sidebar tracker is best-effort */
      }
    }
    load()
    const timer = setInterval(load, 30_000)
    return () => {
      alive = false
      clearInterval(timer)
    }
  }, [])
  const activeTasks = tasks.filter((t) => t.status !== 'CANCELLED').slice(0, 4)

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = q
      ? conversations.filter(
          (c) =>
            c.title.toLowerCase().includes(q) ||
            c.messages.some((m) => m.content.toLowerCase().includes(q)),
        )
      : conversations
    return [...list].sort((a, b) => b.updatedAt - a.updatedAt)
  }, [conversations, query])

  const groups = React.useMemo(() => groupByDate(filtered), [filtered])

  const handleNew = () => {
    startNewChat()
    onNavigate?.()
  }

  const handleSelect = (id: string) => {
    setActive(id)
    onNavigate?.()
  }

  const startRename = (c: Conversation) => {
    setEditingId(c.id)
    setDraft(c.title)
  }

  const commitRename = () => {
    if (editingId) {
      renameConversation(editingId, draft)
    }
    setEditingId(null)
    setDraft('')
  }

  const cancelRename = () => {
    setEditingId(null)
    setDraft('')
  }

  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      {/* Brand + New chat */}
      <div className="flex items-center justify-between gap-2 px-3 pt-3">
        <div className="flex items-center gap-2 px-1">
          <IrokoLogo size={26} withWordmark />
        </div>
      </div>

      <div className="px-3 pt-3">
        <Button
          onClick={handleNew}
          variant="default"
          className="h-10 w-full justify-start gap-2 rounded-xl font-medium"
        >
          <Plus className="h-4 w-4" />
          New chat
        </Button>
      </div>

      {/* Quick starts — each button kicks off an AI-guided flow in the chat */}
      <div className="px-3 pt-4">
        <p className="mb-1 px-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/60">
          Quick starts
        </p>
        <div className="grid grid-cols-2 gap-0.5">
          <ToolButton icon={<Calculator className="h-4 w-4 shrink-0 text-primary" />} label="Calculate tax" onClick={() => { onStartFlow?.(FLOW_PROMPTS.tax); onNavigate?.() }} />
          <ToolButton icon={<LayoutGrid className="h-4 w-4 shrink-0 text-primary" />} label="Services" onClick={() => { onStartFlow?.(FLOW_PROMPTS.services); onNavigate?.() }} />
          <ToolButton icon={<SearchIcon className="h-4 w-4 shrink-0 text-primary" />} label="Name check" onClick={() => { onStartFlow?.(FLOW_PROMPTS.nameCheck); onNavigate?.() }} />
          <ToolButton icon={<FileText className="h-4 w-4 shrink-0 text-primary" />} label="Documents" onClick={() => { onStartFlow?.(FLOW_PROMPTS.documents); onNavigate?.() }} />
        </div>
      </div>

      {/* My requests — live task tracker */}
      {activeTasks.length > 0 && (
        <div className="px-3 pt-4">
          <p className="mb-1 flex items-center gap-1.5 px-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/60">
            <ClipboardList className="h-3 w-3" />
            My requests
          </p>
          <div className="space-y-0.5">
            {activeTasks.map((t) => {
              const style = TASK_STATUS_STYLE[t.status] ?? { label: t.status, dot: 'bg-zinc-400' }
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    onStartFlow?.(`Give me a full status update on my request "${t.title}".`)
                    onNavigate?.()
                  }}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-sidebar-accent/70 active:bg-sidebar-accent"
                  title={t.lastEvent ?? t.title}
                >
                  <span className={cn('h-2 w-2 shrink-0 rounded-full', style.dot)} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[0.8rem] font-medium leading-tight">{t.title}</span>
                    <span className="block truncate text-[11px] text-muted-foreground">{style.label}</span>
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Search */}
      <div className="px-3 pt-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search chats"
            className="h-9 w-full rounded-lg border border-sidebar-border bg-background/60 pl-9 pr-3 text-sm placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/15"
          />
        </div>
      </div>

      {/* Conversation list */}
      <div className="iroko-scroll mt-2 min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {groups.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-4 py-10 text-center">
            <MessageSquare className="mb-2 h-8 w-8 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">
              {query ? 'No chats match your search.' : 'No conversations yet.'}
            </p>
            <p className="text-xs text-muted-foreground/70">
              {query ? 'Try a different keyword.' : 'Start a new chat to begin.'}
            </p>
          </div>
        ) : (
          groups.map((group) => (
            <div key={group.label} className="mb-2">
              <p className="px-2 py-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
                {group.label}
              </p>
              <div className="space-y-0.5">
                {group.items.map((c) => {
                  const active = c.id === activeId
                  const editing = editingId === c.id
                  return (
                    <div
                      key={c.id}
                      className={cn(
                        'group relative flex items-center gap-1 rounded-lg px-2 transition-colors',
                        active
                          ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                          : 'hover:bg-sidebar-accent/60',
                      )}
                    >
                      {editing ? (
                        <input
                          autoFocus
                          value={draft}
                          onChange={(e) => setDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') commitRename()
                            if (e.key === 'Escape') cancelRename()
                          }}
                          onBlur={commitRename}
                          className="h-8 flex-1 rounded-md border border-primary/40 bg-background px-2 text-sm focus:outline-none"
                        />
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleSelect(c.id)}
                          className="flex h-10 min-w-0 flex-1 items-center text-left text-sm"
                        >
                          <span className="truncate">{c.title}</span>
                        </button>
                      )}

                      {editing ? (
                        <div className="flex items-center">
                          <button
                            onClick={commitRename}
                            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-background hover:text-foreground"
                            aria-label="Save name"
                          >
                            <Check className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={cancelRename}
                            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-background hover:text-foreground"
                            aria-label="Cancel rename"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ) : (
                        <div
                          className={cn(
                            'flex items-center opacity-0 transition-opacity',
                            'group-hover:opacity-100 focus-within:opacity-100',
                            active && 'opacity-100',
                          )}
                        >
                          <button
                            onClick={() => startRename(c)}
                            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-background hover:text-foreground"
                            aria-label="Rename chat"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => setPendingDelete(c)}
                            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-background hover:text-destructive"
                            aria-label="Delete chat"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-sidebar-border px-3 py-3">
        <div className="flex items-center justify-between gap-2 rounded-lg bg-sidebar-accent/50 px-3 py-2">
          <div className="min-w-0">
            <p className="truncate text-xs font-medium">
              {session?.user?.name || session?.user?.email || 'Signed in'}
            </p>
            <p className="truncate text-[11px] text-muted-foreground">
              {session?.user?.email && session?.user?.name ? session.user.email : 'Iroko AI'}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <ThemeToggle />
            <button
              type="button"
              onClick={() => signOut({ callbackUrl: '/login' })}
              className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-background hover:text-foreground"
              aria-label="Log out"
              title="Log out"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      <AlertDialog
        open={!!pendingDelete}
        onOpenChange={(o) => !o && setPendingDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this conversation?</AlertDialogTitle>
            <AlertDialogDescription>
              &ldquo;{pendingDelete?.title}&rdquo; will be permanently removed. This
              action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (pendingDelete) deleteConversation(pendingDelete.id)
                setPendingDelete(null)
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function ToolButton({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-10 items-center gap-2 rounded-lg px-2.5 text-left transition-colors hover:bg-sidebar-accent/70 active:bg-sidebar-accent"
    >
      {icon}
      <span className="truncate text-[0.8rem] font-medium leading-tight">{label}</span>
    </button>
  )
}
