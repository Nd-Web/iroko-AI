'use client'

import * as React from 'react'
import { playAudioBuffer, unlockAudio, closeAudioContext, type PlayHandle } from '@/lib/audio-player'

export type VoiceStatus = 'idle' | 'recording' | 'transcribing' | 'speaking'

/** Edge neural voice ids served by /api/tts. */
export type IrokoVoice =
  | 'en-NG-EzinneNeural'
  | 'en-NG-AbeoNeural'
  | 'en-GB-SoniaNeural'
  | 'en-US-AriaNeural'
  | 'en-US-GuyNeural'

export const VOICE_OPTIONS: { id: IrokoVoice; label: string; desc: string }[] = [
  { id: 'en-NG-EzinneNeural', label: 'Ezinne', desc: 'Nigerian English, female, warm (recommended)' },
  { id: 'en-NG-AbeoNeural', label: 'Abeo', desc: 'Nigerian English, male' },
  { id: 'en-GB-SoniaNeural', label: 'Sonia', desc: 'British English, female, warm' },
  { id: 'en-US-AriaNeural', label: 'Aria', desc: 'American English, female, natural' },
  { id: 'en-US-GuyNeural', label: 'Guy', desc: 'American English, male, deep' },
]

interface UseVoiceOptions {
  voice?: IrokoVoice
  speed?: number
}

interface UseVoiceReturn {
  status: VoiceStatus
  isRecording: boolean
  recordSeconds: number
  micLevel: number
  transcript: string
  startRecording: () => Promise<void>
  stopRecording: () => Promise<string | null>
  speak: (text: string) => Promise<void>
  stopSpeaking: () => void
  micSupported: boolean
  error: string
}

function cleanupStream(stream: MediaStream | null) {
  if (!stream) return
  stream.getTracks().forEach((t) => t.stop())
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => {
      const result = reader.result
      if (typeof result !== 'string') {
        reject(new Error('Could not read audio.'))
        return
      }
      resolve(result)
    }
    reader.onerror = () => reject(reader.error || new Error('File read error.'))
    reader.readAsDataURL(blob)
  })
}

/** Decode base64 to a Uint8Array (works in browser without Buffer). */
function base64ToBytes(base64: string): Uint8Array {
  const clean = base64.replace(/^data:audio\/[a-zA-Z0-9.]+;base64,/, '')
  const binary = atob(clean)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

export function useVoice(options: UseVoiceOptions = {}): UseVoiceReturn {
  const { voice = 'en-NG-EzinneNeural', speed = 1.0 } = options

  const [status, setStatus] = React.useState<VoiceStatus>('idle')
  const [isRecording, setIsRecording] = React.useState(false)
  const [recordSeconds, setRecordSeconds] = React.useState(0)
  const [micLevel, setMicLevel] = React.useState(0)
  const [transcript, setTranscript] = React.useState('')
  const [error, setError] = React.useState('')

  // Refs for mic capture
  const mediaRecorderRef = React.useRef<MediaRecorder | null>(null)
  const streamRef = React.useRef<MediaStream | null>(null)
  const chunksRef = React.useRef<Blob[]>([])
  const audioCtxRef = React.useRef<AudioContext | null>(null)
  const rafRef = React.useRef<number | null>(null)
  const timerRef = React.useRef<ReturnType<typeof setInterval> | null>(null)

  // Refs for TTS playback — token-based cancellation
  const speakTokenRef = React.useRef(0)
  const currentPlayHandleRef = React.useRef<PlayHandle | null>(null)

  // Compute mic support on the client only, to avoid SSR hydration mismatch.
  const [micSupported, setMicSupported] = React.useState(false)
  React.useEffect(() => {
    setMicSupported(
      typeof navigator !== 'undefined' &&
        !!navigator.mediaDevices?.getUserMedia &&
        typeof MediaRecorder !== 'undefined',
    )
  }, [])

  const stopLevelMeter = () => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
    rafRef.current = null
    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = null
    setMicLevel(0)
  }

  const startLevelMeter = (stream: MediaStream) => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext
      const ctx = new AudioCtx()
      audioCtxRef.current = ctx
      const source = ctx.createMediaStreamSource(stream)
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 512
      source.connect(analyser)

      const data = new Uint8Array(analyser.frequencyBinCount)
      const tick = () => {
        analyser.getByteTimeDomainData(data)
        let sum = 0
        for (let i = 0; i < data.length; i++) {
          const v = (data[i] - 128) / 128
          sum += v * v
        }
        const rms = Math.sqrt(sum / data.length)
        setMicLevel(Math.min(1, rms * 3))
        rafRef.current = requestAnimationFrame(tick)
      }
      tick()
    } catch {
      // level meter is best-effort
    }
    setRecordSeconds(0)
    timerRef.current = setInterval(() => setRecordSeconds((s) => s + 1), 1000)
  }

  const startRecording = React.useCallback(async () => {
    if (!micSupported) {
      setError('Your browser does not support microphone access.')
      return
    }
    setError('')
    setTranscript('')
    chunksRef.current = []
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      })
      streamRef.current = stream
      const mr = new MediaRecorder(stream)
      mr.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data)
      }
      mr.start()
      mediaRecorderRef.current = mr
      setIsRecording(true)
      setStatus('recording')
      startLevelMeter(stream)
    } catch (err: unknown) {
      console.error('[use-voice] mic error:', err)
      setError(
        err instanceof DOMException && err.name === 'NotAllowedError'
          ? 'Microphone permission denied. Allow access in your browser settings.'
          : 'Could not start the microphone. Please try again.',
      )
      cleanupStream(streamRef.current)
      streamRef.current = null
      setStatus('idle')
    }
  }, [micSupported])

  const stopRecording = React.useCallback(async (): Promise<string | null> => {
    const mr = mediaRecorderRef.current
    if (!mr || mr.state === 'inactive') {
      setIsRecording(false)
      setStatus('idle')
      return null
    }
    stopLevelMeter()
    return new Promise<string | null>((resolve) => {
      mr.onstop = async () => {
        cleanupStream(streamRef.current)
        streamRef.current = null
        mediaRecorderRef.current = null
        setIsRecording(false)
        setStatus('transcribing')
        const chunks = chunksRef.current
        if (chunks.length === 0) {
          setStatus('idle')
          resolve(null)
          return
        }
        const blob = new Blob(chunks, { type: chunks[0].type || 'audio/webm' })
        chunksRef.current = []
        try {
          const base64 = await blobToBase64(blob)
          const res = await fetch('/api/asr', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ audio: base64 }),
          })
          const data = await res.json()
          if (!res.ok) throw new Error(data?.error || 'Transcription failed')
          const text = (data.text || '').trim()
          setTranscript(text)
          setStatus('idle')
          resolve(text || null)
        } catch (err: unknown) {
          console.error('[use-voice] asr error:', err)
          setError(err instanceof Error ? err.message : 'Transcription failed.')
          setStatus('idle')
          resolve(null)
        }
      }
      mr.stop()
    })
  }, [])

  /** Stop any currently-playing TTS audio. */
  const stopSpeaking = React.useCallback(() => {
    speakTokenRef.current++ // invalidate any running speak() loop
    if (currentPlayHandleRef.current) {
      currentPlayHandleRef.current.stop()
      currentPlayHandleRef.current = null
    }
    setStatus('idle')
  }, [])

  const speak = React.useCallback(
    async (text: string) => {
      // Strip markdown noise for cleaner speech
      const clean = text
        .replace(/```[\s\S]*?```/g, ' code block omitted.')
        .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
        .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
        .replace(/[#*_`>]/g, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim()
      if (!clean) return

      // stop any current playback (without the old cancellation-token bug)
      stopSpeaking()
      unlockAudio() // ensure the AudioContext is running on this user gesture
      const myToken = ++speakTokenRef.current
      setStatus('speaking')

      try {
        // Client-side retry on 502 (the server already retries upstream
        // 429/500, but a second client attempt covers rare total failures).
        let res: Response | null = null
        let data: any = null
        for (let attempt = 0; attempt < 2; attempt++) {
          if (speakTokenRef.current !== myToken) return
          try {
            res = await fetch('/api/tts', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ text: clean, voice, speed }),
            })
            data = await res.json()
            if (res.ok) break
          } catch {
            /* network error — retry once */
          }
          if (attempt === 0) await new Promise((r) => setTimeout(r, 800))
        }
        if (!res || !res.ok) {
          throw new Error(
            data?.error ||
              'Voice service is busy right now. Please try again in a moment.',
          )
        }
        const clips: { base64: string; mime: string }[] = data.clips || []
        if (clips.length === 0) {
          setStatus('idle')
          return
        }
        for (const clip of clips) {
          if (speakTokenRef.current !== myToken) break // a newer speak()/stop() happened
          const bytes = base64ToBytes(clip.base64)
          const handle = playAudioBuffer(bytes)
          currentPlayHandleRef.current = handle
          await handle.done
          currentPlayHandleRef.current = null
        }
        if (speakTokenRef.current === myToken) setStatus('idle')
      } catch (err: unknown) {
        // Upstream TTS can be intermittently unavailable (429/500). Log as a
        // warning, not an error, so it doesn't surface in the Next.js dev overlay.
        console.warn('[use-voice] tts unavailable:', err instanceof Error ? err.message : err)
        setError('Voice is temporarily unavailable. Try again in a moment.')
        setStatus('idle')
        // auto-clear the error after a few seconds
        window.setTimeout(() => setError(''), 4000)
      }
    },
    [voice, speed],
  )

  // Cleanup on unmount
  React.useEffect(() => {
    return () => {
      stopLevelMeter()
      cleanupStream(streamRef.current)
      speakTokenRef.current++
      if (currentPlayHandleRef.current) {
        currentPlayHandleRef.current.stop()
        currentPlayHandleRef.current = null
      }
      if (audioCtxRef.current) audioCtxRef.current.close().catch(() => {})
      closeAudioContext()
    }
  }, [])

  return {
    status,
    isRecording,
    recordSeconds,
    micLevel,
    transcript,
    startRecording,
    stopRecording,
    speak,
    stopSpeaking,
    micSupported,
    error,
  }
}
