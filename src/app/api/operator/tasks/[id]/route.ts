import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getOperatorViewer } from '@/lib/operator-access'
import { addTaskEvent } from '@/lib/task-engine'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Manage a service task by an active operator / human agent.
 * Actions:
 *  - claim: Assign task to operator and move status to PROCESSING
 *  - add_note: Append a live progress note/update for the customer
 *  - complete: Mark task as COMPLETED ("Done"), set result details/reference, append completion event
 *  - update_status: Change status to NEEDS_HUMAN, PROCESSING, etc.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const viewer = await getOperatorViewer()
  if (!viewer.authenticated) return Response.json({ error: 'Not signed in.' }, { status: 401 })
  if (!viewer.isActive) return Response.json({ error: 'Active operator access required.' }, { status: 403 })

  const { id: taskId } = await params
  if (!taskId) return Response.json({ error: 'Task ID required.' }, { status: 400 })

  const task = await db.serviceTask.findUnique({ where: { id: taskId } })
  if (!task) return Response.json({ error: 'Task not found.' }, { status: 404 })

  let body: {
    action?: string
    status?: string
    note?: string
    reference?: string
    completionNotes?: string
  }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  const action = String(body.action || '')
  const operatorName = viewer.email ? viewer.email.split('@')[0] : 'Operator'

  if (action === 'claim') {
    const updated = await db.serviceTask.update({
      where: { id: taskId },
      data: {
        status: 'PROCESSING',
        lockedAt: null,
      },
    })
    await addTaskEvent(
      taskId,
      'STATUS',
      `Assigned to agent ${operatorName}. Filing/processing is now in progress.`,
      { agentId: viewer.userId, agentEmail: viewer.email, role: viewer.role }
    )
    return Response.json({ ok: true, task: updated })
  }

  if (action === 'add_note') {
    const noteText = String(body.note || '').trim()
    if (!noteText) return Response.json({ error: 'Note text required.' }, { status: 400 })

    await addTaskEvent(
      taskId,
      'NOTE',
      `[Agent Update] ${noteText}`,
      { agentEmail: viewer.email }
    )
    return Response.json({ ok: true, note: noteText })
  }

  if (action === 'complete') {
    const reference = String(body.reference || '').trim()
    const completionNotes = String(body.completionNotes || '').trim()

    let existingResult: Record<string, unknown> = {}
    try {
      if (task.resultJson) existingResult = JSON.parse(task.resultJson)
    } catch {
      existingResult = {}
    }

    const updatedResult = {
      ...existingResult,
      via: 'human-agent',
      completedBy: viewer.email,
      completedAt: new Date().toISOString(),
      ...(reference ? { referenceNumber: reference } : {}),
      ...(completionNotes ? { completionNotes } : {}),
    }

    const updated = await db.serviceTask.update({
      where: { id: taskId },
      data: {
        status: 'COMPLETED',
        resultJson: JSON.stringify(updatedResult),
        lockedAt: null,
      },
    })

    const msg = reference
      ? `Registration completed by Agent ${operatorName}! Official Reference: ${reference}`
      : `Registration completed by Agent ${operatorName}! ${completionNotes || 'All documents and filings are done.'}`

    await addTaskEvent(taskId, 'STATUS', msg, { result: updatedResult })

    return Response.json({ ok: true, task: updated })
  }

  if (action === 'update_status') {
    const newStatus = String(body.status || '').toUpperCase()
    const validStatuses = ['NEEDS_HUMAN', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED']
    if (!validStatuses.includes(newStatus)) {
      return Response.json({ error: 'Invalid status provided.' }, { status: 400 })
    }

    const updated = await db.serviceTask.update({
      where: { id: taskId },
      data: { status: newStatus, lockedAt: null },
    })

    await addTaskEvent(
      taskId,
      'STATUS',
      `Status changed to ${newStatus} by agent ${operatorName}.`
    )
    return Response.json({ ok: true, task: updated })
  }

  return Response.json({ error: 'Unknown action provided.' }, { status: 400 })
}
