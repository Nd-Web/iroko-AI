'use client'

import * as React from 'react'
import { Mic, MicOff, Loader2 } from 'lucide-react'
import { useVoice } from '@/hooks/use-voice'
import { cn } from '@/lib/utils'

interface MicButtonProps {
  onTranscript: (text: string) => void
  className?: string
}

/**
 * A compact mic button for the composer that records, transcribes and
 * hands the recognised text back to the parent (to fill the input).
 */
export function MicButton({ onTranscript, className }: MicButtonProps) {
  const voice = useVoice({ voice: 'en-NG-EzinneNeural', speed: 1.0 })
  const [active, setActive] = React.useState(false)

  const handleClick = async () => {
    if (!voice.micSupported) {
      return
    }
    if (voice.isRecording) {
      setActive(true)
      const text = await voice.stopRecording()
      setActive(false)
      if (text) onTranscript(text)
    } else {
      await voice.startRecording()
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={!voice.micSupported || active}
      aria-label={voice.isRecording ? 'Stop and transcribe' : 'Start voice input'}
      title={
        !voice.micSupported
          ? 'Microphone not available in this browser'
          : voice.isRecording
            ? 'Stop and transcribe'
            : 'Voice input'
      }
      className={cn(
        'relative mb-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-all',
        voice.isRecording
          ? 'bg-red-500 text-white hover:bg-red-600'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
        'disabled:opacity-40',
        className,
      )}
    >
      {active ? (
        <Loader2 className="h-[1.1rem] w-[1.1rem] animate-spin" />
      ) : voice.isRecording ? (
        <>
          <span className="absolute h-3 w-3 animate-ping rounded-full bg-red-400 opacity-75" />
          <MicOff className="relative h-[1.1rem] w-[1.1rem]" />
        </>
      ) : (
        <Mic className="h-[1.1rem] w-[1.1rem]" />
      )}
    </button>
  )
}
