'use client'

import * as React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  PhoneOff,
  Settings2,
  X,
  Volume2,
  VolumeX,
  Mic,
  MicOff,
  Loader2,
  Radio,
} from 'lucide-react'
import { IrokoLogo } from '@/components/iroko-logo'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useChatStore } from '@/lib/chat-store'
import { playAudioBuffer, unlockAudio, type PlayHandle } from '@/lib/audio-player'
import { extractQuickReplies } from '@/lib/quick-replies'
import { extractNewSentences } from '@/lib/speech-text'
import { cn } from '@/lib/utils'
import type { SendMessageOptions } from '@/hooks/use-iroko-chat'

interface VoiceCallModeProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Shared chat hook from the parent — avoids dual-instance state desync. */
  chat: {
    isStreaming: boolean
    streamingContent: string
    streamingMessageId: string | null
    streamingConversationId: string | null
    sendMessage: (text: string, opts?: SendMessageOptions) => Promise<void>
    stop: () => void
  }
}

interface Turn {
  id: string
  role: 'user' | 'assistant'
  text: string
}

type CallState =
  | 'connecting'
  | 'listening'
  | 'user_speaking'
  | 'processing'
  | 'ai_thinking'
  | 'preparing_voice'
  | 'ai_speaking'
  | 'paused'

const STATUS_LABEL: Record<CallState, string> = {
  connecting: 'Connecting…',
  listening: 'Listening — just start talking',
  user_speaking: 'I hear you…',
  processing: 'Transcribing…',
  ai_thinking: 'Iroko is thinking…',
  preparing_voice: 'Preparing Iroko’s voice…',
  ai_speaking: 'Iroko is speaking…',
  paused: 'Paused',
}

// VAD tuning — tuned for smoother, less trigger-happy detection
const SPEECH_THRESHOLD = 0.045 // RMS above this = speech
const SILENCE_THRESHOLD = 0.018 // RMS below this = silence
const SPEECH_START_MS = 280 // need sustained speech this long to confirm (avoid coughs/noise)
const SILENCE_END_MS = 1500 // silence this long after speech = end of utterance (give user time to pause/think)
const BARGE_IN_THRESHOLD = 0.16 // loud input during AI speech = interrupt
const MIN_RECORDING_MS = 800 // ignore clips shorter than this (noise/false triggers)

function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return Math.random().toString(36).slice(2)
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => {
      if (typeof reader.result === 'string') resolve(reader.result)
      else reject(new Error('Could not read audio'))
    }
    reader.onerror = () => reject(reader.error || new Error('File read error'))
    reader.readAsDataURL(blob)
  })
}

function base64ToBytes(base64: string): Uint8Array {
  const clean = base64.replace(/^data:audio\/[a-zA-Z0-9.]+;base64,/, '')
  const binary = atob(clean)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

export function VoiceCallMode({ open, onOpenChange, chat }: VoiceCallModeProps) {
  const [callState, setCallState] = React.useState<CallState>('connecting')
  const [micLevel, setMicLevel] = React.useState(0)
  const [turns, setTurns] = React.useState<Turn[]>([])
  const [partialReply, setPartialReply] = React.useState('')
  const [error, setError] = React.useState('')
  const [muted, setMuted] = React.useState(false)
  const [paused, setPaused] = React.useState(false)
  const [voice, setVoice] = React.useState<string>('en-NG-EzinneNeural')
  const [showSettings, setShowSettings] = React.useState(false)

  // refs that the rAF loop reads/writes
  const callStateRef = React.useRef<CallState>('connecting')
  const mutedRef = React.useRef(false)
  const pausedRef = React.useRef(false)
  const streamRef = React.useRef<MediaStream | null>(null)
  const audioCtxRef = React.useRef<AudioContext | null>(null)
  const analyserRef = React.useRef<AnalyserNode | null>(null)
  const recorderRef = React.useRef<MediaRecorder | null>(null)
  const chunksRef = React.useRef<Blob[]>([])
  const vadRafRef = React.useRef<number | null>(null)
  const speechStartRef = React.useRef<number | null>(null)
  const lastSpeechRef = React.useRef<number | null>(null)
  const currentPlayHandleRef = React.useRef<PlayHandle | null>(null)
  const speakTokenRef = React.useRef(0)
  const aliveRef = React.useRef(false)
  /** True from a barge-in until the user's next utterance is sent. */
  const interruptedRef = React.useRef(false)

  // Use the shared chat hook from the parent (single instance) instead of
  // creating our own — avoids dual-instance state desync where the voice
  // call's streaming state never updates.
  const {
    isStreaming,
    streamingContent,
    streamingMessageId,
    streamingConversationId,
    sendMessage,
    stop: stopChat,
  } = chat

  const setCS = React.useCallback((s: CallState) => {
    callStateRef.current = s
    setCallState(s)
  }, [])

  const stopSpeaking = React.useCallback(() => {
    speakTokenRef.current++
    if (currentPlayHandleRef.current) {
      currentPlayHandleRef.current.stop()
      currentPlayHandleRef.current = null
    }
  }, [])

  const playClip = React.useCallback((base64: string, mime: string, token: number) => {
    return new Promise<void>((resolve) => {
      try {
        const bytes = base64ToBytes(base64)
        const handle = playAudioBuffer(bytes)
        currentPlayHandleRef.current = handle
        handle.done.then(() => {
          if (currentPlayHandleRef.current === handle) {
            currentPlayHandleRef.current = null
          }
          resolve()
        })
      } catch (e) {
        console.warn('[voice-call] playClip error:', e)
        resolve()
      }
    })
  }, [])

  const fetchTtsClips = React.useCallback(
    async (text: string): Promise<{ base64: string; mime: string }[]> => {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text, voice, speed: 1.0 }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'Voice generation failed')
      return data.clips || []
    },
    [voice],
  )

  /**
   * Sentence-streaming speech queue — the "seamless" core.
   *
   * Each sentence starts its TTS fetch the moment it is enqueued (so
   * synthesis overlaps playback of earlier sentences), while playback runs
   * strictly in order on a promise chain. Iroko starts talking after the
   * FIRST sentence of a reply, not after the whole reply.
   */
  const speechChainRef = React.useRef<Promise<void>>(Promise.resolve())
  const speechConsumedRef = React.useRef(0)

  const enqueueSpeech = React.useCallback(
    (sentence: string) => {
      const text = sentence.trim()
      if (!text || mutedRef.current || !aliveRef.current) return
      const token = speakTokenRef.current
      // Prefetch immediately — this is what overlaps synthesis with playback.
      const clipsPromise = fetchTtsClips(text).catch((err) => {
        console.warn('[voice-call] tts unavailable:', err instanceof Error ? err.message : err)
        return [] as { base64: string; mime: string }[]
      })
      speechChainRef.current = speechChainRef.current.then(async () => {
        if (speakTokenRef.current !== token || !aliveRef.current || mutedRef.current) return
        const clips = await clipsPromise
        if (speakTokenRef.current !== token || clips.length === 0) return
        if (callStateRef.current !== 'ai_speaking') setCS('ai_speaking')
        for (const clip of clips) {
          if (speakTokenRef.current !== token || !aliveRef.current) break
          await playClip(clip.base64, clip.mime, token)
        }
      })
    },
    [fetchTtsClips, playClip, setCS],
  )

  /** One-shot speech (voice test button). */
  const speakText = React.useCallback(
    async (text: string) => {
      stopSpeaking()
      setCS('preparing_voice')
      enqueueSpeech(text)
      const token = speakTokenRef.current
      await speechChainRef.current
      if (speakTokenRef.current === token && aliveRef.current) {
        setCS(pausedRef.current ? 'paused' : 'listening')
      }
    },
    [enqueueSpeech, stopSpeaking, setCS],
  )

  const startRecorder = React.useCallback(() => {
    const stream = streamRef.current
    if (!stream) return
    chunksRef.current = []
    try {
      const rec = new MediaRecorder(stream)
      rec.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data)
      }
      rec.start(250) // collect chunks every 250ms
      recorderRef.current = rec
    } catch (e) {
      console.warn('[voice-call] recorder error:', e)
    }
  }, [])

  const transcribeAndSend = React.useCallback(
    async (chunks: Blob[]) => {
      if (chunks.length === 0) {
        setCS(pausedRef.current ? 'paused' : 'listening')
        return
      }
      const blob = new Blob(chunks, { type: chunks[0].type || 'audio/webm' })
      // Ignore very short clips — likely noise/false triggers, not real speech
      if (blob.size < 2000) {
        setCS(pausedRef.current ? 'paused' : 'listening')
        return
      }
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
        if (!text) {
          // No speech detected — don't show an error, just resume listening
          setCS(pausedRef.current ? 'paused' : 'listening')
          return
        }
        setTurns((prev) => [...prev, { id: uid(), role: 'user', text }])
        setCS('ai_thinking')
        interruptedRef.current = false // the interrupting utterance is now sent
        // 'voice' mode makes the AI answer in short, speakable sentences.
        sendMessage(text, { mode: 'voice' })
      } catch (err: unknown) {
        console.warn('[voice-call] asr error:', err instanceof Error ? err.message : err)
        // Don't show a big error for transient failures — just resume listening
        setCS(pausedRef.current ? 'paused' : 'listening')
      }
    },
    [sendMessage, setCS],
  )

  // The heart of hands-free: a rAF VAD loop.
  const vadLoop = React.useCallback(() => {
    if (!aliveRef.current) return
    const analyser = analyserRef.current
    if (!analyser) {
      vadRafRef.current = requestAnimationFrame(vadLoop)
      return
    }
    const data = new Uint8Array(analyser.frequencyBinCount)
    analyser.getByteTimeDomainData(data)
    let sum = 0
    for (let i = 0; i < data.length; i++) {
      const v = (data[i] - 128) / 128
      sum += v * v
    }
    const rms = Math.sqrt(sum / data.length)
    setMicLevel(Math.min(1, rms * 4))

    const now = Date.now()
    const cs = callStateRef.current

    // Barge-in: user talks over Iroko — stop speaking AND abort the reply
    // stream so their next utterance can send immediately.
    if (cs === 'ai_speaking' && rms > BARGE_IN_THRESHOLD && !mutedRef.current) {
      interruptedRef.current = true
      stopSpeaking()
      stopChat()
      setCS('listening')
      speechStartRef.current = null
      lastSpeechRef.current = null
    }

    // Only run speech detection when actively listening
    if (!pausedRef.current && (cs === 'listening' || cs === 'user_speaking')) {
      if (rms > SPEECH_THRESHOLD) {
        lastSpeechRef.current = now
        if (speechStartRef.current === null) speechStartRef.current = now
        if (cs === 'listening' && now - speechStartRef.current > SPEECH_START_MS) {
          setCS('user_speaking')
        }
      } else if (rms < SILENCE_THRESHOLD && cs === 'user_speaking' && lastSpeechRef.current) {
        if (now - lastSpeechRef.current > SILENCE_END_MS) {
          // utterance ended — capture, restart recorder, transcribe
          const rec = recorderRef.current
          speechStartRef.current = null
          lastSpeechRef.current = null
          setCS('processing')
          if (rec && rec.state !== 'inactive') {
            const captureChunks = chunksRef.current
            chunksRef.current = []
            rec.onstop = () => {
              startRecorder()
              transcribeAndSend(captureChunks)
            }
            rec.stop()
          } else {
            setCS('listening')
          }
        }
      }
    }

    vadRafRef.current = requestAnimationFrame(vadLoop)
  }, [stopSpeaking, stopChat, setCS, startRecorder, transcribeAndSend])

  const startCall = React.useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError('Your browser does not support voice calls.')
      return
    }
    setCS('connecting')
    aliveRef.current = true
    setError('')
    setTurns([])
    setPartialReply('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      })
      streamRef.current = stream

      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext
      const ctx = new AudioCtx()
      audioCtxRef.current = ctx
      // Resume the context immediately — this runs on the user's click gesture
      // and unlocks audio autoplay for the whole call session.
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {})
      }
      const source = ctx.createMediaStreamSource(stream)
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 512
      source.connect(analyser)
      analyserRef.current = analyser

      // Unlock the shared Web Audio API context on this user gesture so
      // TTS playback works reliably (esp. in iframes / preview panels).
      unlockAudio()

      startRecorder()
      setCS('listening')
      vadRafRef.current = requestAnimationFrame(vadLoop)
    } catch (err: unknown) {
      console.warn('[voice-call] mic error:', err)
      setError(
        err instanceof DOMException && err.name === 'NotAllowedError'
          ? 'Microphone permission denied. Allow access to use voice call.'
          : 'Could not access the microphone. Please try again.',
      )
      setCS('paused')
    }
  }, [setCS, startRecorder, vadLoop])

  const endCall = React.useCallback(() => {
    aliveRef.current = false
    if (vadRafRef.current) cancelAnimationFrame(vadRafRef.current)
    vadRafRef.current = null
    stopSpeaking()
    stopChat()
    const rec = recorderRef.current
    if (rec && rec.state !== 'inactive') {
      try { rec.stop() } catch {}
    }
    recorderRef.current = null
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {})
      audioCtxRef.current = null
    }
    analyserRef.current = null
    chunksRef.current = []
    setMicLevel(0)
    setCallState('connecting')
    onOpenChange(false)
  }, [stopSpeaking, stopChat, onOpenChange])

  // Start / stop the call when the overlay opens/closes
  React.useEffect(() => {
    if (open) {
      startCall()
    } else {
      // tear down if it was running
      aliveRef.current = false
      if (vadRafRef.current) cancelAnimationFrame(vadRafRef.current)
      vadRafRef.current = null
      stopSpeaking()
      const rec = recorderRef.current
      if (rec && rec.state !== 'inactive') { try { rec.stop() } catch {} }
      recorderRef.current = null
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop())
        streamRef.current = null
      }
      if (audioCtxRef.current) {
        audioCtxRef.current.close().catch(() => {})
        audioCtxRef.current = null
      }
      analyserRef.current = null
    }
  }, [open])

  // Cleanup on unmount
  React.useEffect(() => {
    return () => {
      aliveRef.current = false
      if (vadRafRef.current) cancelAnimationFrame(vadRafRef.current)
      stopSpeaking()
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop())
      if (audioCtxRef.current) audioCtxRef.current.close().catch(() => {})
    }
  }, [])

  // When the AI stream completes, speak the reply then resume listening.
  // IMPORTANT: useIrokoChat clears streamingContent/streamingMessageId the
  // instant streaming ends. So we capture them in refs that update on EVERY
  // render (not just when the effect runs) — otherwise the effect's closure
  // has stale empty values when isStreaming flips to false.
  const wasStreamingRef = React.useRef(false)
  const lastReplyRef = React.useRef('')
  const lastMsgIdRef = React.useRef<string | null>(null)
  const lastConvIdRef = React.useRef<string | null>(null)

  // Update refs on every render so they always have the latest values
  lastReplyRef.current = isStreaming && streamingContent ? streamingContent : lastReplyRef.current
  if (streamingMessageId) lastMsgIdRef.current = streamingMessageId
  if (streamingConversationId) lastConvIdRef.current = streamingConversationId

  React.useEffect(() => {
    if (isStreaming) {
      if (!wasStreamingRef.current) {
        // A new reply is starting — reset the sentence cursor and invalidate
        // any leftover speech from the previous turn.
        wasStreamingRef.current = true
        speechConsumedRef.current = 0
        interruptedRef.current = false
        stopSpeaking()
      }
      const body = extractQuickReplies(streamingContent).body
      setPartialReply(body)
      // Stream-speak: enqueue every newly-completed sentence immediately.
      if (!mutedRef.current && !pausedRef.current && !interruptedRef.current) {
        const { sentences, consumed } = extractNewSentences(body, speechConsumedRef.current)
        speechConsumedRef.current = consumed
        if (sentences.length > 0 && callStateRef.current === 'ai_thinking') {
          setCS('preparing_voice')
        }
        for (const s of sentences) enqueueSpeech(s)
      }
    } else if (wasStreamingRef.current) {
      wasStreamingRef.current = false
      // Read the final reply from the committed store message using the IDs
      // we captured during streaming (before they were cleared).
      const store = useChatStore.getState()
      const msgId = lastMsgIdRef.current
      const convId = lastConvIdRef.current
      const conv = store.conversations.find((c) => c.id === convId)
      const committedMsg = conv?.messages.find((m) => m.id === msgId)
      const finalText = extractQuickReplies(
        lastReplyRef.current ||
          committedMsg?.content ||
          conv?.messages.filter((m) => m.role === 'assistant').slice(-1)[0]?.content ||
          '',
      ).body
      lastReplyRef.current = ''
      setPartialReply('')
      if (finalText) {
        setTurns((prev) => [...prev, { id: uid(), role: 'assistant', text: finalText }])
        // Speak whatever tail wasn't a complete sentence during streaming.
        const remainder = finalText.slice(speechConsumedRef.current).trim()
        if (remainder && !mutedRef.current && !pausedRef.current && !interruptedRef.current) {
          enqueueSpeech(remainder)
        }
      }
      speechConsumedRef.current = 0
      // Resume listening once the speech queue drains (or immediately if
      // nothing is queued/muted). If the user barged in, leave the VAD alone —
      // they are mid-utterance and clearing chunks would eat their speech.
      speechChainRef.current = speechChainRef.current.then(() => {
        if (!aliveRef.current || interruptedRef.current) return
        chunksRef.current = [] // discard anything the mic captured during TTS
        setCS(pausedRef.current ? 'paused' : 'listening')
      })
    }
  }, [isStreaming, streamingContent, enqueueSpeech, stopSpeaking, setCS])

  const toggleMute = () => {
    const next = !muted
    setMuted(next)
    mutedRef.current = next
    if (next) stopSpeaking()
  }

  const togglePause = () => {
    const next = !paused
    setPaused(next)
    pausedRef.current = next
    if (next) {
      setCS('paused')
    } else {
      setCS('listening')
      chunksRef.current = []
    }
  }

  const transcriptEndRef = React.useRef<HTMLDivElement>(null)
  React.useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [turns, partialReply])

  const orbScale =
    callState === 'ai_speaking'
      ? 1 + 0.08 * (1 + Math.sin(Date.now() / 200)) / 2
      : callState === 'user_speaking'
        ? 1 + micLevel * 0.35
        : callState === 'listening'
          ? 1 + micLevel * 0.08
          : 1

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          className="fixed inset-0 z-50 flex flex-col bg-gradient-to-b from-[oklch(0.14_0.02_156)] via-[oklch(0.12_0.02_160)] to-black text-white"
        >
          {/* Ambient glow */}
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <div
              className={cn(
                'absolute left-1/2 top-[42%] h-[55vh] w-[55vh] -translate-x-1/2 -translate-y-1/2 rounded-full blur-[120px] transition-all duration-700',
                callState === 'ai_speaking'
                  ? 'bg-emerald-500/30'
                  : callState === 'user_speaking'
                    ? 'bg-amber-400/25'
                    : callState === 'paused'
                      ? 'bg-zinc-500/15'
                      : 'bg-emerald-500/15',
              )}
            />
          </div>

          {/* Top bar */}
          <header className="relative z-10 flex items-center justify-between px-5 pt-5">
            <div className="flex items-center gap-2.5">
              {callState !== 'paused' && callState !== 'connecting' ? (
                <span className="relative flex h-2.5 w-2.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
                </span>
              ) : (
                <span className="h-2.5 w-2.5 rounded-full bg-zinc-500" />
              )}
              <span className="text-sm font-medium text-white/80">
                Voice call with Iroko
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowSettings((s) => !s)}
                className="h-9 w-9 text-white/70 hover:bg-white/10 hover:text-white"
                aria-label="Voice settings"
              >
                <Settings2 className="h-[1.1rem] w-[1.1rem]" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={endCall}
                className="h-9 w-9 text-white/70 hover:bg-white/10 hover:text-white"
                aria-label="Close voice call"
              >
                <X className="h-5 w-5" />
              </Button>
            </div>
          </header>

          {/* Settings panel */}
          <AnimatePresence>
            {showSettings && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="relative z-10 overflow-hidden"
              >
                <div className="mx-auto flex max-w-md flex-col gap-3 px-5 py-3">
                  <div className="flex items-center justify-between gap-3 rounded-xl bg-white/5 p-3">
                    <div>
                      <p className="text-sm font-medium">Iroko&apos;s voice</p>
                      <p className="text-xs text-white/60">
                        Choose how Iroko sounds
                      </p>
                    </div>
                    <Select value={voice} onValueChange={(v) => setVoice(v as any)}>
                      <SelectTrigger className="h-9 w-44 border-white/15 bg-white/10 text-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="en-NG-EzinneNeural">Ezinne — Nigerian English, female, warm (default)</SelectItem>
                        <SelectItem value="en-NG-AbeoNeural">Abeo — Nigerian English, male</SelectItem>
                        <SelectItem value="en-GB-SoniaNeural">Sonia — British English, female</SelectItem>
                        <SelectItem value="en-US-AriaNeural">Aria — American English, female</SelectItem>
                        <SelectItem value="en-US-GuyNeural">Guy — American English, male</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="rounded-xl bg-white/5 p-3 text-xs leading-relaxed text-white/60">
                    <p className="mb-1 font-medium text-white/80">How it works</p>
                    Hands-free mode. Iroko listens continuously — just start talking
                    and pause when you&apos;re done. It transcribes, thinks, and
                    speaks the reply. Speak over it to interrupt.
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      speakText(
                        'Hello, this is Iroko. I am testing my voice. If you can hear me, we are ready to begin.',
                      )
                    }}
                    className="flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/10 px-3 py-2.5 text-sm font-medium text-white transition-colors hover:bg-white/20"
                  >
                    <Volume2 className="h-4 w-4" />
                    Test Iroko&apos;s voice
                  </button>
                  <p className="px-1 text-[11px] text-white/40">
                    If you don&apos;t hear anything, check your device volume and
                    that this tab isn&apos;t muted.
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Center: Orb + status */}
          <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-6">
            <motion.div
              animate={{ scale: orbScale }}
              transition={{ duration: 0.1, ease: 'easeOut' }}
              className="relative"
            >
              {/* pulsing rings */}
              {(callState === 'listening' ||
                callState === 'user_speaking' ||
                callState === 'ai_speaking') && (
                <>
                  <motion.div
                    className="absolute inset-0 rounded-full border border-white/20"
                    animate={{ scale: [1, 1.7], opacity: [0.5, 0] }}
                    transition={{ duration: 1.8, repeat: Infinity, ease: 'easeOut' }}
                  />
                  <motion.div
                    className="absolute inset-0 rounded-full border border-white/15"
                    animate={{ scale: [1, 2], opacity: [0.35, 0] }}
                    transition={{ duration: 1.8, repeat: Infinity, ease: 'easeOut', delay: 0.5 }}
                  />
                </>
              )}
              <div
                className={cn(
                  'flex h-44 w-44 items-center justify-center rounded-full shadow-2xl transition-colors duration-500 sm:h-52 sm:w-52',
                  callState === 'user_speaking'
                    ? 'bg-gradient-to-br from-amber-400 to-orange-500'
                    : callState === 'ai_speaking'
                      ? 'bg-gradient-to-br from-emerald-400 to-teal-600'
                      : callState === 'paused'
                        ? 'bg-gradient-to-br from-zinc-500 to-zinc-700'
                        : 'bg-gradient-to-br from-emerald-600 to-emerald-800',
                )}
              >
                <div className="flex h-36 w-36 items-center justify-center rounded-full bg-black/20 backdrop-blur-sm sm:h-44 sm:w-44">
                  {callState === 'connecting' ? (
                    <Loader2 className="h-8 w-8 animate-spin text-white/80" />
                  ) : (
                    <IrokoLogo size={64} />
                  )}
                </div>
              </div>
            </motion.div>

            <div className="mt-8 flex items-center gap-2">
              {(callState === 'processing' ||
                callState === 'ai_thinking' ||
                callState === 'connecting' ||
                callState === 'preparing_voice') && (
                <Loader2 className="h-4 w-4 animate-spin text-white/70" />
              )}
              {callState === 'listening' && (
                <Radio className="h-4 w-4 animate-pulse text-emerald-400" />
              )}
              <p className="text-base font-medium text-white/90">
                {STATUS_LABEL[callState]}
              </p>
            </div>
            <p className="mt-1.5 text-xs text-white/40">
              {callState === 'listening'
                ? 'No need to tap anything — just speak'
                : callState === 'user_speaking'
                  ? 'Pause when you’re done, Iroko will reply'
                  : callState === 'preparing_voice'
                    ? 'Starting to speak…'
                    : callState === 'paused'
                      ? 'Tap resume to continue'
                      : '\u00A0'}
            </p>

            {error && (
              <p className="mt-3 max-w-sm rounded-lg bg-red-500/15 px-3 py-1.5 text-center text-xs text-red-200">
                {error}
              </p>
            )}
          </div>

          {/* Live transcript */}
          <div className="relative z-10 mx-auto h-32 w-full max-w-lg px-6">
            <div className="iroko-scroll h-full overflow-y-auto rounded-2xl bg-white/5 p-4">
              {turns.length === 0 && !partialReply ? (
                <p className="text-center text-sm text-white/40">
                  {callState === 'connecting'
                    ? 'Requesting microphone access…'
                    : 'Your conversation will appear here. Just start talking.'}
                </p>
              ) : (
                <div className="space-y-2.5">
                  {turns.map((t) => (
                    <div key={t.id} className="iroko-fade-up">
                      <span
                        className={cn(
                          'mr-2 text-[10px] font-semibold uppercase tracking-wide',
                          t.role === 'user' ? 'text-amber-300/80' : 'text-emerald-300/80',
                        )}
                      >
                        {t.role === 'user' ? 'You' : 'Iroko'}
                      </span>
                      <span className="text-sm leading-relaxed text-white/85">
                        {t.text.length > 280 ? t.text.slice(0, 280) + '…' : t.text}
                      </span>
                    </div>
                  ))}
                  {partialReply && (
                    <div className="iroko-fade-up">
                      <span className="mr-2 text-[10px] font-semibold uppercase tracking-wide text-emerald-300/80">
                        Iroko
                      </span>
                      <span className="text-sm leading-relaxed text-white/85">
                        {partialReply.slice(-280)}
                        <span className="iroko-caret" />
                      </span>
                    </div>
                  )}
                  <div ref={transcriptEndRef} />
                </div>
              )}
            </div>
          </div>

          {/* Controls */}
          <div className="relative z-10 flex items-center justify-center gap-6 px-6 pb-10 pt-6">
            <button
              onClick={toggleMute}
              className={cn(
                'flex h-12 w-12 items-center justify-center rounded-full transition-colors',
                muted
                  ? 'bg-white/10 text-white/50'
                  : 'bg-white/10 text-white hover:bg-white/20',
              )}
              aria-label={muted ? 'Unmute Iroko' : 'Mute Iroko'}
              title={muted ? 'Unmute Iroko' : 'Mute Iroko'}
            >
              {muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
            </button>

            <button
              onClick={togglePause}
              className={cn(
                'relative flex h-20 w-20 items-center justify-center rounded-full shadow-xl transition-all active:scale-95',
                paused
                  ? 'bg-emerald-500 text-white hover:scale-105'
                  : callState === 'user_speaking'
                    ? 'bg-amber-400 text-white'
                    : 'bg-white text-emerald-700 hover:scale-105',
              )}
              aria-label={paused ? 'Resume listening' : 'Pause listening'}
              title={paused ? 'Resume listening' : 'Pause listening'}
            >
              {callState === 'user_speaking' && !paused ? (
                <>
                  <motion.span
                    className="absolute inset-0 rounded-full bg-amber-300"
                    animate={{ scale: [1, 1.2, 1], opacity: [0.6, 0, 0.6] }}
                    transition={{ duration: 0.8, repeat: Infinity }}
                  />
                  <Mic className="relative h-8 w-8" />
                </>
              ) : paused ? (
                <Mic className="h-8 w-8" />
              ) : callState === 'processing' || callState === 'ai_thinking' || callState === 'connecting' ? (
                <Loader2 className="h-8 w-8 animate-spin" />
              ) : (
                <Mic className="h-8 w-8" />
              )}
            </button>

            <button
              onClick={endCall}
              className="flex h-12 w-12 items-center justify-center rounded-full bg-red-500/90 text-white transition-colors hover:bg-red-600"
              aria-label="End call"
              title="End call"
            >
              <PhoneOff className="h-5 w-5" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
