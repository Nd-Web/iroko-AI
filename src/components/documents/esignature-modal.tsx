'use client'

import * as React from 'react'
import { X, Check, ShieldCheck, PenTool, Type, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { createESignatureRecord, type ESignatureData } from '@/lib/esignature'

interface ESignatureModalProps {
  isOpen: boolean
  onClose: () => void
  docTitle: string
  onSigned: (signature: ESignatureData) => void
}

export function ESignatureModal({
  isOpen,
  onClose,
  docTitle,
  onSigned,
}: ESignatureModalProps) {
  const [tab, setTab] = React.useState<'draw' | 'type'>('draw')
  const [signerName, setSignerName] = React.useState('')
  const [signerEmail, setSignerEmail] = React.useState('')
  const [typedSig, setTypedSig] = React.useState('')

  const canvasRef = React.useRef<HTMLCanvasElement | null>(null)
  const [isDrawing, setIsDrawing] = React.useState(false)
  const [hasDrawn, setHasDrawn] = React.useState(false)

  React.useEffect(() => {
    if (isOpen && tab === 'draw' && canvasRef.current) {
      const canvas = canvasRef.current
      const ctx = canvas.getContext('2d')
      if (ctx) {
        ctx.strokeStyle = '#0f172a'
        ctx.lineWidth = 2.5
        ctx.lineCap = 'round'
        ctx.lineJoin = 'round'
      }
    }
  }, [isOpen, tab])

  if (!isOpen) return null

  const clearCanvas = () => {
    if (canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d')
      if (ctx) {
        ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height)
      }
      setHasDrawn(false)
    }
  }

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    setIsDrawing(true)
    setHasDrawn(true)
    draw(e)
  }

  const stopDrawing = () => {
    setIsDrawing(false)
    if (canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d')
      if (ctx) ctx.beginPath()
    }
  }

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !canvasRef.current) return
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const rect = canvas.getBoundingClientRect()
    let clientX = 0
    let clientY = 0

    if ('touches' in e) {
      clientX = e.touches[0].clientX
      clientY = e.touches[0].clientY
    } else {
      clientX = e.clientX
      clientY = e.clientY
    }

    const x = clientX - rect.left
    const y = clientY - rect.top

    ctx.lineTo(x, y)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(x, y)
  }

  const handleSign = () => {
    if (!signerName.trim()) return

    let dataUrl = ''
    if (tab === 'draw' && canvasRef.current) {
      dataUrl = canvasRef.current.toDataURL('image/png')
    } else {
      // Create data URL from typed text
      const tempCanvas = document.createElement('canvas')
      tempCanvas.width = 400
      tempCanvas.height = 100
      const ctx = tempCanvas.getContext('2d')
      if (ctx) {
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, 400, 100)
        ctx.font = 'italic 32px Georgia, serif'
        ctx.fillStyle = '#0f8a5f'
        ctx.fillText(typedSig || signerName, 20, 60)
        dataUrl = tempCanvas.toDataURL('image/png')
      }
    }

    const record = createESignatureRecord(docTitle, signerName, signerEmail, dataUrl)
    onSigned(record)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div className="flex w-full max-w-lg flex-col rounded-2xl border border-border bg-card shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border bg-muted/40 px-6 py-4">
          <div className="flex items-center gap-2 text-primary font-semibold text-sm">
            <ShieldCheck className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            <span>Digital E-Signature • Evidence Act 2011</span>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8 rounded-full">
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          <p className="text-xs text-muted-foreground">
            Sign <span className="font-semibold text-foreground">{docTitle}</span> electronically. A verification seal and audit hash will be embedded in the document.
          </p>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-foreground">Signer Full Name *</label>
              <input
                type="text"
                value={signerName}
                onChange={(e) => {
                  setSignerName(e.target.value)
                  if (!typedSig) setTypedSig(e.target.value)
                }}
                placeholder="e.g. Chief Ade Okafor"
                className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-foreground">Signer Email</label>
              <input
                type="email"
                value={signerEmail}
                onChange={(e) => setSignerEmail(e.target.value)}
                placeholder="ade.okafor@gmail.com"
                className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>
          </div>

          {/* Mode Selector */}
          <div className="flex items-center gap-2 border-b border-border pb-2">
            <button
              type="button"
              onClick={() => setTab('draw')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                tab === 'draw' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted'
              }`}
            >
              <PenTool className="h-3.5 w-3.5" />
              <span>Draw Signature</span>
            </button>
            <button
              type="button"
              onClick={() => setTab('type')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                tab === 'type' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted'
              }`}
            >
              <Type className="h-3.5 w-3.5" />
              <span>Type Signature</span>
            </button>
          </div>

          {/* Draw Canvas */}
          {tab === 'draw' ? (
            <div className="relative rounded-xl border border-dashed border-primary/30 bg-background p-2">
              <canvas
                ref={canvasRef}
                width={440}
                height={140}
                onMouseDown={startDrawing}
                onMouseUp={stopDrawing}
                onMouseLeave={stopDrawing}
                onMouseMove={draw}
                onTouchStart={startDrawing}
                onTouchEnd={stopDrawing}
                onTouchMove={draw}
                className="w-full cursor-crosshair rounded-lg touch-none"
              />
              <button
                type="button"
                onClick={clearCanvas}
                className="absolute top-3 right-3 flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground bg-muted/80 px-2 py-1 rounded-md"
              >
                <RefreshCw className="h-3 w-3" />
                Clear
              </button>
              {!hasDrawn && (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs text-muted-foreground/50">
                  Draw signature here with mouse or finger
                </div>
              )}
            </div>
          ) : (
            <div>
              <input
                type="text"
                value={typedSig}
                onChange={(e) => setTypedSig(e.target.value)}
                placeholder="Type your signature name"
                className="w-full rounded-xl border border-input bg-background p-4 text-center font-serif italic text-2xl text-emerald-700 dark:text-emerald-400 focus:outline-none"
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-border bg-muted/40 px-6 py-3">
          <Button variant="ghost" size="sm" onClick={onClose} className="h-8 text-xs">
            Cancel
          </Button>
          <Button
            variant="default"
            size="sm"
            disabled={!signerName.trim() || (tab === 'draw' && !hasDrawn && !typedSig)}
            onClick={handleSign}
            className="h-8 gap-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            <Check className="h-3.5 w-3.5" />
            <span>Apply Digital Signature</span>
          </Button>
        </div>
      </div>
    </div>
  )
}
