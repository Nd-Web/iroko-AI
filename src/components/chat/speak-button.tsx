'use client'

import * as React from 'react'
import { Volume2, Square, Loader2, VolumeX } from 'lucide-react'
import { useVoice } from '@/hooks/use-voice'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface SpeakButtonProps {
  text: string
  className?: string
}

/**
 * A button that speaks an AI message aloud via TTS.
 * Shows loading + playing + unavailable states.
 */
export function SpeakButton({ text, className }: SpeakButtonProps) {
  const voice = useVoice({ voice: 'en-NG-EzinneNeural', speed: 1.0 })
  const [loading, setLoading] = React.useState(false)
  const [failed, setFailed] = React.useState(false)

  const isPlaying = voice.status === 'speaking'

  const handleClick = async () => {
    if (isPlaying) {
      voice.stopSpeaking()
      return
    }
    setLoading(true)
    setFailed(false)
    try {
      await voice.speak(text)
    } catch {
      setFailed(true)
    } finally {
      setLoading(false)
    }
  }

  // auto-clear failed state after a few seconds
  React.useEffect(() => {
    if (failed) {
      const t = window.setTimeout(() => setFailed(false), 3500)
      return () => window.clearTimeout(t)
    }
  }, [failed])

  const label = failed
    ? 'Unavailable'
    : isPlaying
      ? 'Stop'
      : loading
        ? 'Loading'
        : 'Listen'

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleClick}
      disabled={loading}
      className={cn(
        'h-7 gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground',
        failed && 'text-amber-600 dark:text-amber-400',
        className,
      )}
      aria-label={isPlaying ? 'Stop speaking' : 'Read aloud'}
      title={failed ? voice.error || 'Voice temporarily unavailable' : 'Read aloud'}
    >
      {failed ? (
        <VolumeX className="h-3.5 w-3.5" />
      ) : loading ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : isPlaying ? (
        <Square className="h-3 w-3 fill-current" />
      ) : (
        <Volume2 className="h-3.5 w-3.5" />
      )}
      {label}
    </Button>
  )
}
