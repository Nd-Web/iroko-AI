import { NextRequest } from 'next/server'
import { rateLimitResponse } from '@/lib/rate-limit'
import { synthesize } from '@/lib/edge-tts'
import { speechNormalize } from '@/lib/speech-text'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * Microsoft Edge neural voices — synthesized natively in Node
 * (src/lib/edge-tts.ts). FREE, no API key, no Python dependency.
 * The en-NG voices are Nigerian English — exactly what Iroko needs.
 */
const EDGE_VOICES: Record<string, { name: string; desc: string }> = {
  'en-NG-EzinneNeural': { name: 'Ezinne', desc: 'Nigerian English, female, warm (default)' },
  'en-NG-AbeoNeural': { name: 'Abeo', desc: 'Nigerian English, male' },
  'en-GB-SoniaNeural': { name: 'Sonia', desc: 'British English, female, warm' },
  'en-US-AriaNeural': { name: 'Aria', desc: 'American English, female, natural' },
  'en-US-GuyNeural': { name: 'Guy', desc: 'American English, male, deep' },
}

const DEFAULT_VOICE = 'en-NG-EzinneNeural'

/** Keep chunks small — shorter clips synthesize faster and start sooner. */
function chunkText(text: string, maxLen = 600): string[] {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (!clean) return []
  if (clean.length <= maxLen) return [clean]
  const chunks: string[] = []
  const sentences = clean.match(/[^.!?]+[.!?]+|\S[^.!?]*$/g) || [clean]
  let current = ''
  for (const sentence of sentences) {
    const s = sentence.trim()
    if ((current + ' ' + s).trim().length <= maxLen) {
      current = (current ? current + ' ' : '') + s
    } else {
      if (current) chunks.push(current)
      if (s.length <= maxLen) {
        current = s
      } else {
        // very long sentence — hard-wrap on words
        let line = ''
        for (const w of s.split(' ')) {
          if ((line + ' ' + w).trim().length <= maxLen) {
            line = (line ? line + ' ' : '') + w
          } else {
            if (line) chunks.push(line)
            line = w
          }
        }
        current = line
      }
    }
  }
  if (current) chunks.push(current)
  return chunks
}

interface TtsRequestBody {
  text: string
  voice?: string
  speed?: number
}

export async function POST(req: NextRequest) {
  // 60 requests/minute/IP — the voice-call sentence-streaming pipeline fires
  // one small TTS request per sentence, so this needs generous headroom.
  const limited = rateLimitResponse(req, 'tts', 60, 60_000)
  if (limited) return limited

  let body: TtsRequestBody
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const text = (body.text || '').trim()
  if (!text) {
    return Response.json({ error: 'Text is required.' }, { status: 400 })
  }

  const voice = EDGE_VOICES[body.voice || ''] ? body.voice! : DEFAULT_VOICE
  const speed = typeof body.speed === 'number' ? body.speed : 1.0
  // Tuned for a warmer, human, unhurried delivery: baseline -6% rate, -2Hz pitch.
  const ratePct = Math.round((speed - 1.0) * 100) - 6
  const rate = ratePct >= 0 ? `+${ratePct}%` : `${ratePct}%`

  const cleanText = speechNormalize(text)
  const chunks = chunkText(cleanText)
  if (chunks.length === 0) {
    return Response.json({ error: 'Nothing to synthesise.' }, { status: 400 })
  }

  try {
    // Synthesize all chunks CONCURRENTLY — total latency ≈ slowest chunk,
    // not the sum. The client plays them back in index order.
    const buffers = await Promise.all(
      chunks.map((chunk) => synthesize({ text: chunk, voice, rate, pitch: '-2Hz' })),
    )
    return Response.json({
      engine: 'edge-tts-native',
      voice,
      speed,
      chunks: buffers.length,
      clips: buffers.map((buf, index) => ({
        index,
        base64: buf.toString('base64'),
        mime: 'audio/mpeg',
      })),
    })
  } catch (err: unknown) {
    console.warn('[iroko/tts] synthesis error:', err instanceof Error ? err.message : err)
    return Response.json(
      { error: 'Voice generation failed. Please try again.' },
      { status: 502 },
    )
  }
}

export async function GET() {
  return Response.json({
    engine: 'edge-tts-native',
    voices: EDGE_VOICES,
  })
}
