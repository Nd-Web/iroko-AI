'use client'

import * as React from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { Loader2, CheckCircle2, Upload, ArrowLeft } from 'lucide-react'
import { IrokoLogo } from '@/components/iroko-logo'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

const KINDS = [
  { kind: 'means_of_id', label: 'Means of ID', hint: 'NIN slip, passport, driver’s licence or voter’s card' },
  { kind: 'passport_photo', label: 'Passport photograph', hint: 'Recent, clear, plain background' },
  { kind: 'signature', label: 'Signature', hint: 'A photo or scan of your signature on white paper' },
] as const

interface DocMeta {
  id: string
  kind: string
  label: string
  filename: string
  mimeType: string
  createdAt: string
}

export default function DocumentsPage() {
  const params = useParams<{ id: string }>()
  const taskId = params.id
  const [docs, setDocs] = React.useState<DocMeta[]>([])
  const [loading, setLoading] = React.useState(true)
  const [busyKind, setBusyKind] = React.useState<string | null>(null)
  const [error, setError] = React.useState('')

  const load = React.useCallback(async () => {
    try {
      const res = await fetch(`/api/tasks/${taskId}/documents`)
      if (res.ok) {
        const json = await res.json()
        setDocs(json.documents ?? [])
      }
    } finally {
      setLoading(false)
    }
  }, [taskId])

  React.useEffect(() => {
    load()
  }, [load])

  const uploaded = (kind: string) => docs.find((d) => d.kind === kind)

  const handleFile = async (kind: string, file: File | undefined) => {
    if (!file) return
    setError('')
    setBusyKind(kind)
    try {
      const form = new FormData()
      form.append('file', file)
      form.append('kind', kind)
      const res = await fetch(`/api/tasks/${taskId}/documents`, { method: 'POST', body: form })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(json.error ?? 'Upload failed. Try again.')
      } else {
        await load()
      }
    } catch {
      setError('Upload failed. Check your connection and try again.')
    } finally {
      setBusyKind(null)
    }
  }

  const allDone = KINDS.every((k) => uploaded(k.kind))

  return (
    <div className="min-h-screen bg-background px-4 py-8">
      <div className="mx-auto w-full max-w-lg">
        <div className="mb-6 flex items-center justify-between">
          <IrokoLogo size={28} withWordmark />
          <Button asChild variant="ghost" size="sm">
            <Link href="/">
              <ArrowLeft className="h-4 w-4" /> Back to chat
            </Link>
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Upload your documents</CardTitle>
            <CardDescription>
              CAC needs these to register your business. They’re stored securely and only seen by
              the Iroko team completing your registration.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {loading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                {KINDS.map((k) => {
                  const done = uploaded(k.kind)
                  const busy = busyKind === k.kind
                  return (
                    <div
                      key={k.kind}
                      className="flex items-center gap-3 rounded-lg border border-border p-3"
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2 text-sm font-medium">
                          {done ? (
                            <CheckCircle2 className="h-4 w-4 text-green-600" />
                          ) : (
                            <Upload className="h-4 w-4 text-muted-foreground" />
                          )}
                          {k.label}
                        </div>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {done ? `Uploaded: ${done.filename}` : k.hint}
                        </p>
                      </div>
                      <label className="shrink-0">
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp,application/pdf"
                          className="hidden"
                          disabled={busy}
                          onChange={(e) => handleFile(k.kind, e.target.files?.[0])}
                        />
                        <span
                          className={`inline-flex h-9 cursor-pointer items-center rounded-md border border-input px-3 text-sm font-medium hover:bg-accent ${
                            busy ? 'pointer-events-none opacity-50' : ''
                          }`}
                        >
                          {busy ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : done ? (
                            'Replace'
                          ) : (
                            'Choose file'
                          )}
                        </span>
                      </label>
                    </div>
                  )
                })}

                {error ? <p className="text-sm text-destructive">{error}</p> : null}

                {allDone ? (
                  <div className="rounded-lg bg-green-50 p-3 text-sm text-green-800 dark:bg-green-950 dark:text-green-300">
                    All documents received. The Iroko team will use these to complete your CAC
                    registration — you’ll be updated in the chat.
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Accepted: JPG, PNG, WEBP or PDF, up to 6MB each.
                  </p>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
