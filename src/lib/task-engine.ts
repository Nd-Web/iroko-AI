/**
 * Iroko task engine.
 *
 * Every service request becomes a ServiceTask row that moves through:
 *
 *   AWAITING_PAYMENT → QUEUED → PROCESSING → COMPLETED
 *                                          → NEEDS_HUMAN   (back-office/agent takes over)
 *                                          → QUEUED        (retry with exponential backoff)
 *                                          → FAILED        (retries exhausted)
 *   any non-terminal → CANCELLED
 *
 * Design notes:
 *  - DB-backed queue (no Redis needed): claiming is made atomic with a
 *    conditional updateMany, so multiple runners never double-process.
 *  - The runner is a lazily-started singleton interval stored on globalThis
 *    (survives Next.js HMR). kickTaskRunner() forces an immediate pass —
 *    called right after payment lands so tasks start within milliseconds,
 *    with the interval as a safety net.
 */

import { db } from './db'
import { getTaskHandler } from './task-handlers'

export type TaskStatus =
  | 'AWAITING_PAYMENT'
  | 'QUEUED'
  | 'PROCESSING'
  | 'NEEDS_HUMAN'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED'

export const TERMINAL_STATUSES: TaskStatus[] = ['COMPLETED', 'FAILED', 'CANCELLED']

export interface TaskHandlerOutcome {
  status: 'COMPLETED' | 'NEEDS_HUMAN'
  /** Human-readable note for the task timeline. */
  note: string
  /** Structured result/artifacts stored on the task. */
  result?: Record<string, unknown>
}

export interface TaskHandlerContext {
  taskId: string
  serviceId: string
  userId: string
  details: Record<string, string>
  log: (message: string) => Promise<void>
}

export type TaskHandler = (ctx: TaskHandlerContext) => Promise<TaskHandlerOutcome>

const POLL_INTERVAL_MS = 20_000
const BATCH_LIMIT = 5

export async function addTaskEvent(
  taskId: string,
  type: 'CREATED' | 'PAYMENT' | 'STATUS' | 'NOTE' | 'ERROR',
  message: string,
  data?: Record<string, unknown>,
) {
  await db.taskEvent.create({
    data: {
      taskId,
      type,
      message,
      dataJson: data ? JSON.stringify(data) : null,
    },
  })
}

/** Promote a paid task into the queue and start processing immediately. */
export async function markTaskPaid(
  taskId: string,
  via: 'webhook' | 'callback' | 'simulated',
  reference?: string,
) {
  const res = await db.serviceTask.updateMany({
    where: { id: taskId, status: 'AWAITING_PAYMENT' },
    data: { status: 'QUEUED', paidAt: new Date(), runAfter: new Date() },
  })
  if (res.count === 1) {
    await addTaskEvent(
      taskId,
      'PAYMENT',
      via === 'simulated'
        ? 'Payment SIMULATED (dev mode — no real charge).'
        : `Payment confirmed via ${via}${reference ? ` (ref ${reference})` : ''}.`,
    )
    kickTaskRunner()
  }
  return res.count === 1
}

/**
 * Atomically claim the next runnable task. The conditional updateMany is the
 * lock: only one caller can flip QUEUED → PROCESSING for a given row.
 */
async function claimNextTask() {
  const candidate = await db.serviceTask.findFirst({
    where: { status: 'QUEUED', runAfter: { lte: new Date() } },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  })
  if (!candidate) return null
  const res = await db.serviceTask.updateMany({
    where: { id: candidate.id, status: 'QUEUED' },
    data: { status: 'PROCESSING', lockedAt: new Date(), attempts: { increment: 1 } },
  })
  if (res.count !== 1) return null // lost the race — caller will loop again
  return db.serviceTask.findUnique({ where: { id: candidate.id } })
}

async function runOneTask(task: NonNullable<Awaited<ReturnType<typeof claimNextTask>>>) {
  const details: Record<string, string> = (() => {
    try {
      return JSON.parse(task.detailsJson)
    } catch {
      return {}
    }
  })()

  const ctx: TaskHandlerContext = {
    taskId: task.id,
    serviceId: task.serviceId,
    userId: task.userId,
    details,
    log: (message) => addTaskEvent(task.id, 'NOTE', message),
  }

  try {
    const handler = getTaskHandler(task.serviceId)
    const outcome = await handler(ctx)
    await db.serviceTask.update({
      where: { id: task.id },
      data: {
        status: outcome.status,
        lockedAt: null,
        resultJson: outcome.result ? JSON.stringify(outcome.result) : task.resultJson,
      },
    })
    await addTaskEvent(task.id, 'STATUS', outcome.note, { status: outcome.status })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const retryable = task.attempts < task.maxAttempts
    if (retryable) {
      // exponential backoff: 1m, 4m, 16m…
      const delayMs = 60_000 * 4 ** (task.attempts - 1)
      await db.serviceTask.update({
        where: { id: task.id },
        data: { status: 'QUEUED', lockedAt: null, runAfter: new Date(Date.now() + delayMs) },
      })
      await addTaskEvent(
        task.id,
        'ERROR',
        `Attempt ${task.attempts} failed: ${message.slice(0, 300)}. Retrying in ${Math.round(delayMs / 60_000)} min.`,
      )
    } else {
      await db.serviceTask.update({
        where: { id: task.id },
        data: { status: 'FAILED', lockedAt: null },
      })
      await addTaskEvent(
        task.id,
        'ERROR',
        `Failed after ${task.attempts} attempts: ${message.slice(0, 300)}. A team member will review this task.`,
      )
    }
  }
}

/** Process up to BATCH_LIMIT runnable tasks. Safe to call from anywhere. */
export async function processTaskQueue(): Promise<number> {
  let processed = 0
  while (processed < BATCH_LIMIT) {
    const task = await claimNextTask()
    if (!task) break
    await runOneTask(task)
    processed++
  }
  return processed
}

/* ---------------- runner singleton (HMR-safe) ---------------- */

interface RunnerState {
  timer: ReturnType<typeof setInterval> | null
  running: boolean
}

const g = globalThis as typeof globalThis & { __irokoTaskRunner?: RunnerState }

function state(): RunnerState {
  if (!g.__irokoTaskRunner) g.__irokoTaskRunner = { timer: null, running: false }
  return g.__irokoTaskRunner
}

async function pass() {
  const s = state()
  if (s.running) return // re-entrancy guard
  s.running = true
  try {
    await processTaskQueue()
  } catch (err) {
    console.error('[iroko/tasks] queue pass error:', err)
  } finally {
    s.running = false
  }
}

/** Start the background poller (idempotent). */
export function ensureTaskRunner() {
  const s = state()
  if (s.timer) return
  s.timer = setInterval(pass, POLL_INTERVAL_MS)
  // Don't keep the process alive just for polling.
  if (typeof s.timer.unref === 'function') s.timer.unref()
}

/** Trigger an immediate queue pass (fire-and-forget). */
export function kickTaskRunner() {
  ensureTaskRunner()
  void pass()
}
