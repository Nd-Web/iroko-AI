'use client'

import * as React from 'react'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  React.useEffect(() => {
    console.error('[Iroko Global Error]:', error)
  }, [error])

  return (
    <html lang="en">
      <body className="flex h-dvh w-full flex-col items-center justify-center bg-zinc-950 text-zinc-100 font-sans px-4">
        <div className="mx-auto max-w-md text-center space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl">
          <h2 className="text-base font-semibold text-white">
            Application Interrupted
          </h2>
          <p className="text-xs text-zinc-400">
            {error?.message || 'An unhandled exception occurred in the root layout.'}
          </p>
          <div className="flex items-center justify-center gap-3 pt-2">
            <button
              onClick={() => reset()}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-medium text-white hover:bg-emerald-500"
            >
              Reload View
            </button>
            <button
              onClick={() => { window.location.href = '/' }}
              className="rounded-lg border border-zinc-700 px-4 py-2 text-xs font-medium text-zinc-300 hover:bg-zinc-800"
            >
              Return Home
            </button>
          </div>
        </div>
      </body>
    </html>
  )
}
