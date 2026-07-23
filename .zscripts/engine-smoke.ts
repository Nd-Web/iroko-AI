/**
 * End-to-end smoke test of the Iroko tool + task pipeline (no LLM, no HTTP):
 * tools → task creation → simulated payment → queue processing → status.
 */
import { executeTool } from '../src/lib/tools'
import { processTaskQueue } from '../src/lib/task-engine'
import { db } from '../src/lib/db'

async function main() {
  // Test user
  const user = await db.user.upsert({
    where: { email: 'smoke-test@iroko.local' },
    create: { email: 'smoke-test@iroko.local', passwordHash: 'x', name: 'Smoke Test' },
    update: {},
  })
  const ctx = { userId: user.id, email: user.email }

  // 1. PAYE
  const paye = JSON.parse(
    await executeTool('calculate_paye', JSON.stringify({ gross_amount: 450000, period: 'monthly', pension: true, nhf: true }), ctx),
  )
  console.log('1. calculate_paye  →', paye.totals)
  if (!paye.totals?.taxMonthly) throw new Error('PAYE failed')

  // 2. Name check (live search unset → rules only, must not throw)
  const name = JSON.parse(
    await executeTool('check_business_name', JSON.stringify({ name: 'Zenva Foods Limited', entity_type: 'llc' }), ctx),
  )
  console.log('2. check_business_name →', name.verdict, '| live performed:', name.liveRegistry.performed)

  // 3. Catalog
  const services = JSON.parse(await executeTool('list_agent_services', '{}', ctx))
  console.log('3. list_agent_services →', services.services.length, 'services')

  // 4. Create a task (cac-sole = online tier; payments should SIMULATE)
  const created = JSON.parse(
    await executeTool(
      'create_service_task',
      JSON.stringify({
        service_id: 'cac-sole',
        details: {
          'Proposed name 1': 'Zenva Foods Ventures',
          'Proposed name 2': 'Zenva Foods Global Ventures',
          'Proprietor full name': 'Ngozi Eze',
          'Business address': '5 Adeniyi Jones, Ikeja, Lagos',
          'Nature of business': 'Food retail',
        },
      }),
      ctx,
    ),
  )
  console.log('4. create_service_task →', created.status, created.devNote ? '(simulated payment)' : '')
  if (!created.taskId) throw new Error('task creation failed: ' + JSON.stringify(created))

  // 5. Process the queue (kick already ran async; run explicitly to be sure)
  const processed = await processTaskQueue()
  console.log('5. processTaskQueue →', processed, 'task(s) processed')

  // 6. Status + timeline
  const status = JSON.parse(await executeTool('get_my_tasks', JSON.stringify({ task_id: created.taskId }), ctx))
  const t = status.tasks[0]
  console.log('6. get_my_tasks →', t.status, '| via:', t.result?.via)
  console.log('   timeline:')
  for (const line of t.timeline) console.log('    ', line)
  if (t.status !== 'NEEDS_HUMAN') throw new Error('expected NEEDS_HUMAN (automation off), got ' + t.status)
  if (!t.result?.submissionPack?.includes('Submission pack')) throw new Error('missing submission pack')

  // 7. Cancel guard: cancelling a NEEDS_HUMAN task should work; then re-cancel fails
  const c1 = JSON.parse(await executeTool('cancel_task', JSON.stringify({ task_id: created.taskId }), ctx))
  const c2 = JSON.parse(await executeTool('cancel_task', JSON.stringify({ task_id: created.taskId }), ctx))
  console.log('7. cancel_task →', c1.status, '| re-cancel error:', !!c2.error)

  // cleanup
  await db.serviceTask.deleteMany({ where: { userId: user.id } })
  await db.user.delete({ where: { id: user.id } })
  console.log('\nALL ENGINE CHECKS PASSED ✅')
}

main().then(() => process.exit(0)).catch((e) => { console.error('SMOKE FAILED:', e); process.exit(1) })
