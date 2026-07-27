'use client'

import * as React from 'react'
import { X, FileText, FileDown, Download, Copy, Check, Printer, PenTool, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Markdown } from '@/components/chat/markdown'
import { downloadAsWord, downloadAsPdf, extractDocTitle, stripDisclaimerForExport } from '@/lib/document-exporter'
import { ESignatureModal } from './esignature-modal'
import type { ESignatureData } from '@/lib/esignature'

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
  const [isSignModalOpen, setIsSignModalOpen] = React.useState(false)
  const [signatureRecord, setSignatureRecord] = React.useState<ESignatureData | null>(null)

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
    <>
      <ESignatureModal
        isOpen={isSignModalOpen}
        onClose={() => setIsSignModalOpen(false)}
        docTitle={title}
        onSigned={(sig) => setSignatureRecord(sig)}
      />

      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 sm:p-6 animate-in fade-in duration-200">
        <div className="flex h-full max-h-[90vh] w-full max-w-4xl flex-col rounded-2xl border border-border bg-card shadow-2xl overflow-hidden">
          {/* Modal Header */}
          <div className="flex items-center justify-between border-b border-border bg-muted/40 px-6 py-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <FileText className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-foreground truncate max-w-[280px] sm:max-w-[450px]">
                  {title}
                </h2>
                <p className="text-xs text-muted-foreground">
                  Document Artifact Preview • Nigerian Law Compliant
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsSignModalOpen(true)}
                className="h-8 gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/10"
              >
                <PenTool className="h-3.5 w-3.5" />
                <span>Sign Document</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleCopy}
                className="h-8 gap-1.5 text-xs"
              >
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                <span>{copied ? 'Copied' : 'Copy'}</span>
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
            <div className="mx-auto max-w-3xl rounded-xl border border-border bg-background p-8 sm:p-12 shadow-sm min-h-[600px] text-foreground relative">
              <Markdown content={cleanBody} />

              {/* Digital E-Signature Seal Verification Block */}
              {signatureRecord && (
                <div className="mt-8 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 flex items-start gap-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                    <ShieldCheck className="h-6 w-6" />
                  </div>
                  <div className="flex-1 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-emerald-700 dark:text-emerald-400 text-sm">
                        DIGITAL E-SIGNATURE VERIFIED
                      </span>
                      <span className="font-mono text-[10px] text-muted-foreground bg-background px-2 py-0.5 rounded border border-border">
                        {signatureRecord.verificationHash}
                      </span>
                    </div>
                    <p className="mt-1 text-foreground">
                      Electronically signed by <strong className="font-medium">{signatureRecord.signerName}</strong>
                      {signatureRecord.signerEmail ? ` (${signatureRecord.signerEmail})` : ''} on {new Date(signatureRecord.signedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}.
                    </p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      Compliant with Section 93 of the Evidence Act 2011 (Nigeria). Cryptographic hash verified.
                    </p>
                    {signatureRecord.signatureDataUrl && (
                      <div className="mt-2 bg-background p-2 rounded-lg inline-block border border-border">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={signatureRecord.signatureDataUrl} alt="Signature" className="h-10 object-contain" />
                      </div>
                    )}
                  </div>
                </div>
              )}
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
    </>
  )
}
