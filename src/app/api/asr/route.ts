import { NextRequest } from 'next/server'
import ZAI from 'z-ai-web-dev-sdk'
import { rateLimitResponse } from '@/lib/rate-limit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

const MAX_AUDIO_BYTES = 25 * 1024 * 1024 // 25 MB

export async function POST(req: NextRequest) {
  // 30 requests/minute/IP — voice calls can fire a request every few
  // seconds during active conversation, so this needs more headroom than chat.
  const limited = rateLimitResponse(req, 'asr', 30, 60_000)
  if (limited) return limited

  let body: any
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const audio = body?.audio
  if (typeof audio !== 'string' || audio.length === 0) {
    return Response.json(
      { error: 'A base64 "audio" field is required.' },
      { status: 400 },
    )
  }

  // Detect the original MIME type from the data URI (if present) so we can
  // pass a format hint to the ASR service. The upstream only supports WAV and
  // WebM, and fails with "unsupported audio format: unknown" when it can't
  // detect the format from raw base64.
  let mimeType = 'audio/webm'
  let base64 = audio
  if (audio.startsWith('data:')) {
    const commaIdx = audio.indexOf(',')
    const header = audio.slice(5, commaIdx) // e.g. "audio/webm;codecs=opus;base64"
    base64 = audio.slice(commaIdx + 1)
    const mimeMatch = header.match(/^([^;]+)/)
    if (mimeMatch) mimeType = mimeMatch[1]
  }

  // rough size guard (base64 is ~4/3 the binary size)
  if (base64.length > (MAX_AUDIO_BYTES * 4) / 3) {
    return Response.json(
      { error: 'Audio is too large. Please record a shorter clip.' },
      { status: 413 },
    )
  }

  try {
    const zai = await ZAI.create()
    // Send the full data URI so the ASR service can detect the format from the
    // MIME type header. This fixes "unsupported audio format: unknown".
    const dataUri = `data:${mimeType};base64,${base64}`

    // Retry on transient upstream errors (429/500) — limited retries to avoid
    // hammering the API when it's rate-limited.
    let response: any = null
    for (let attempt = 0; attempt <= 1; attempt++) {
      try {
        response = await zai.audio.asr.create({ file_base64: dataUri })
        break
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        const retryable =
          msg.includes('429') ||
          msg.includes('500') ||
          msg.includes('网络错误') ||
          msg.includes('Too many requests')
        if (!retryable || attempt === 1) throw err
        await new Promise((r) => setTimeout(r, 2000))
      }
    }
    const text = (response?.text || '').trim()
    if (!text) {
      return Response.json(
        { error: 'No speech detected. Please try again.' },
        { status: 422 },
      )
    }
    return Response.json({ text })
  } catch (err) {
    console.warn('[iroko/asr] error:', err instanceof Error ? err.message : err)
    return Response.json(
      { error: 'Transcription failed. Please try again.' },
      { status: 502 },
    )
  }
}
