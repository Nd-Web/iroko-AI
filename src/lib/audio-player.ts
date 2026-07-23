'use client'

/**
 * A Web Audio API-based audio player.
 *
 * More reliable than HTMLAudioElement for programmatic playback because:
 *  - The AudioContext is created lazily on the first play() call, which is a
 *    user gesture → the context starts in 'running' state (not 'suspended').
 *  - AudioBufferSourceNode.start() is not subject to the same autoplay
 *    restrictions as HTMLAudioElement.play().
 *
 * This is the right approach for TTS playback in iframes / preview panels.
 */

let ctx: AudioContext | null = null

function getCtx(): AudioContext {
  if (!ctx) {
    const AC = window.AudioContext || (window as any).webkitAudioContext
    ctx = new AC()
  }
  if (ctx.state === 'suspended') {
    ctx.resume().catch(() => {})
  }
  return ctx
}

export interface PlayHandle {
  /** Resolves when playback completes (or is stopped). */
  done: Promise<void>
  /** Stop playback immediately. */
  stop: () => void
}

/**
 * Decode raw audio bytes (WAV/MP3 etc.) and play them via Web Audio API.
 * Returns a handle to await or stop the playback.
 */
export function playAudioBuffer(bytes: Uint8Array): PlayHandle {
  const ac = getCtx()
  let stopped = false
  let source: AudioBufferSourceNode | null = null
  let resolveDone: () => void

  const done = new Promise<void>((resolve) => {
    resolveDone = resolve
  })

  const stop = () => {
    if (stopped) return
    stopped = true
    try {
      source?.stop()
    } catch {}
    source = null
    resolveDone()
  }

  // Copy into a fresh ArrayBuffer — decodeAudioData rejects SharedArrayBuffer
  // and detached views, and TS types bytes.buffer as ArrayBufferLike.
  const arrayBuffer = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(arrayBuffer).set(bytes)
  ac.decodeAudioData(arrayBuffer)
    .then((buffer) => {
      if (stopped) return
      source = ac.createBufferSource()
      source.buffer = buffer
      source.connect(ac.destination)
      source.onended = () => {
        if (!stopped) {
          stopped = true
          resolveDone()
        }
      }
      source.start()
      // Safety: if onended never fires (e.g. headless browser, no audio device),
      // resolve after buffer duration + 1s so the caller never hangs forever.
      const durationMs = (buffer.duration + 1) * 1000
      window.setTimeout(() => {
        if (!stopped) {
          stopped = true
          try { source?.stop() } catch {}
          resolveDone()
        }
      }, durationMs)
    })
    .catch((err) => {
      console.warn('[audio-player] decode failed:', err)
      resolveDone()
    })

  return { done, stop }
}

/** Stop and release the shared AudioContext (call on unmount if needed). */
export function closeAudioContext() {
  if (ctx) {
    ctx.close().catch(() => {})
    ctx = null
  }
}

/** Resume the AudioContext on a user gesture (unlocks audio for the session). */
export function unlockAudio() {
  getCtx()
}
