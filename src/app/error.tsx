'use client'

import * as React from 'react'
import { AlertTriangle, RefreshCw, Home } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  React.useEffect(() => {
    console.error('[Iroko App Error]:', error)
  }, [error])

  return (
    <div className="flex h-dvh w-full flex-col items-center justify-center bg-background px-4 text-center">
      <div className="mx-auto max-w-md space-y-4 rounded-2xl border border-border bg-card p-6 shadow-xl">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <AlertTriangle className="h-6 w-6" />
        </div>
        <h2 className="text-lg font-semibold text-foreground">
          Something went wrong loading this view
        </h2>
        <p className="text-xs text-muted-foreground leading-relaxed">
          {error?.message || 'An unexpected error occurred. Iroko AI has safely caught this error.'}
        </p>
        <div className="flex items-center justify-center gap-2 pt-2">
          <Button
            variant="default"
            size="sm"
            onClick={() => reset()}
            className="gap-1.5"
          >
            <RefreshCw className="h-4 w-4" />
            Try again
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => { window.location.href = '/' }}
            className="gap-1.5"
          >
            <Home className="h-4 w-4" />
            Go to Home
          </Button>
        </div>
      </div>
    </div>
  )
}
