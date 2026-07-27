'use client'

import * as React from 'react'
import { X, FileText, FileDown, Download, Copy, Check, Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Markdown } from '@/components/chat/markdown'
import { downloadAsWord, downloadAsPdf, extractDocTitle, stripDisclaimerForExport } from '@/lib/document-exporter'

interface DocumentPreviewModalProps {
  isOpen: boolean
  onClose: () => void
  content: string
}

export function DocumentPreviewModal({
  isOpen,
  onClose,
  content,
}: DocumentPreviewModalProps) {
  const [copied, setCopied] = React.useState(false)

  if (!isOpen) return null

  const title = extractDocTitle(content)
  const cleanBody = stripDisclaimerForExport(content)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(cleanBody)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 sm:p-6 animate-in fade-in duration-200">
      <div className="flex h-full max-h-[90vh] w-full max-w-4xl flex-col rounded-2xl border border-border bg-card shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-border bg-muted/40 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <FileText className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-foreground truncate max-w-[320px] sm:max-w-[500px]">
                {title}
              </h2>
              <p className="text-xs text-muted-foreground">
                Document Artifact Preview • Nigerian Law Compliant
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopy}
              className="h-8 gap-1.5 text-xs"
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              <span>{copied ? 'Copied' : 'Copy Text'}</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => downloadAsWord(content, title)}
              className="h-8 gap-1.5 text-xs text-blue-600 dark:text-blue-400"
            >
              <FileDown className="h-3.5 w-3.5" />
              <span>Word (.docx)</span>
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={() => downloadAsPdf(content, title)}
              className="h-8 gap-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              <Download className="h-3.5 w-3.5" />
              <span>PDF</span>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="h-8 w-8 rounded-full text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Modal Body — Paper Render */}
        <div className="flex-1 overflow-y-auto bg-muted/20 p-6 sm:p-10">
          <div className="mx-auto max-w-3xl rounded-xl border border-border bg-background p-8 sm:p-12 shadow-sm min-h-[600px] text-foreground">
            <Markdown content={cleanBody} />
          </div>
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between border-t border-border bg-muted/40 px-6 py-3 text-xs text-muted-foreground">
          <span>Formatted for A4 Legal Print</span>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => downloadAsPdf(content, title)}
              className="h-7 gap-1 text-xs"
            >
              <Printer className="h-3.5 w-3.5" />
              <span>Print Document</span>
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
