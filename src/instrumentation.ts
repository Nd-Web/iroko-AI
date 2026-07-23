/**
 * Next.js instrumentation hook — runs once when the server boots.
 * Starts the Iroko task runner so queued service tasks are processed even
 * if no chat request has arrived yet (e.g. after a restart with a backlog).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { ensureTaskRunner, kickTaskRunner } = await import('./lib/task-engine')
    ensureTaskRunner()
    // Drain anything that was queued before the restart.
    kickTaskRunner()
  }
}
