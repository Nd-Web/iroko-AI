/**
 * Native Node implementation of Microsoft Edge's neural text-to-speech.
 *
 * Speaks the same WebSocket protocol the Edge browser's Read Aloud uses —
 * FREE, high-quality neural voices (including Nigerian English en-NG),
 * no API key, no Python, works on any OS. Replaces the old dependency on
 * the `edge-tts` Python CLI, which only existed on the original Linux box.
 *
 * Protocol notes:
 *  - Auth is a public TrustedClientToken plus a rolling Sec-MS-GEC value:
 *    SHA-256 of (Windows file time rounded down to 5 minutes + token).
 *  - We send a speech.config JSON, then an SSML message; audio arrives as
 *    binary frames (2-byte header length + ascii headers + mp3 payload)
 *    until a "Path:turn.end" text frame.
 */

import crypto from 'crypto'
import WebSocket from 'ws'

const TRUSTED_CLIENT_TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4'
const CHROMIUM_FULL_VERSION = '143.0.3403.90'
const WSS_URL =
  'wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1'
const SYNTH_TIMEOUT_MS = 25_000

/** Rolling anti-abuse token: SHA256(windowsFileTime_roundedTo5min + token). */
function secMsGec(): string {
  const WINDOWS_EPOCH_OFFSET_SECONDS = 11_644_473_600
  let unixSeconds = Math.floor(Date.now() / 1000) + WINDOWS_EPOCH_OFFSET_SECONDS
  unixSeconds -= unixSeconds % 300 // round down to the 5-minute window
  const fileTime = unixSeconds * 10_000_000 // 100-nanosecond intervals
  return crypto
    .createHash('sha256')
    .update(`${fileTime}${TRUSTED_CLIENT_TOKEN}`)
    .digest('hex')
    .toUpperCase()
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

export interface SynthesizeOptions {
  text: string
  /** Full Edge voice name, e.g. "en-NG-EzinneNeural". */
  voice: string
  /** e.g. "-8%" (negative = slower). */
  rate?: string
  /** e.g. "-2Hz". */
  pitch?: string
}

function buildSsml(o: SynthesizeOptions): string {
  const lang = o.voice.split('-').slice(0, 2).join('-') || 'en-NG'
  return (
    `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='${lang}'>` +
    `<voice name='${o.voice}'>` +
    `<prosody pitch='${o.pitch ?? '+0Hz'}' rate='${o.rate ?? '+0%'}' volume='+0%'>` +
    escapeXml(o.text) +
    `</prosody></voice></speak>`
  )
}

/** One synthesis attempt over a fresh WebSocket. Resolves with MP3 bytes. */
function synthesizeOnce(o: SynthesizeOptions): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const connectionId = crypto.randomUUID().replace(/-/g, '')
    const url =
      `${WSS_URL}?TrustedClientToken=${TRUSTED_CLIENT_TOKEN}` +
      `&Sec-MS-GEC=${secMsGec()}` +
      `&Sec-MS-GEC-Version=1-${CHROMIUM_FULL_VERSION}` +
      `&ConnectionId=${connectionId}`

    const ws = new WebSocket(url, {
      headers: {
        'User-Agent':
          `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) ` +
          `Chrome/${CHROMIUM_FULL_VERSION.split('.')[0]}.0.0.0 Safari/537.36 Edg/${CHROMIUM_FULL_VERSION.split('.')[0]}.0.0.0`,
        Origin: 'chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold',
        Pragma: 'no-cache',
        'Cache-Control': 'no-cache',
        'Accept-Encoding': 'gzip, deflate, br',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    })
    const audioParts: Buffer[] = []
    let settled = false

    const timer = setTimeout(() => {
      fail(new Error('Edge TTS timed out'))
    }, SYNTH_TIMEOUT_MS)

    const fail = (err: Error) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      try { ws.close() } catch { /* noop */ }
      reject(err)
    }
    const succeed = () => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      try { ws.close() } catch { /* noop */ }
      if (audioParts.length === 0) {
        reject(new Error('Edge TTS returned no audio'))
        return
      }
      resolve(Buffer.concat(audioParts))
    }

    ws.on('error', (err) => fail(new Error(`Edge TTS connection error: ${err.message}`)))
    ws.on('close', () => {
      if (!settled) {
        // Closed before turn.end — deliver what we have or fail.
        if (audioParts.length > 0) succeed()
        else fail(new Error('Edge TTS closed before sending audio'))
      }
    })

    ws.on('open', () => {
      const timestamp = new Date().toString()
      ws.send(
        `X-Timestamp:${timestamp}\r\n` +
          `Content-Type:application/json; charset=utf-8\r\n` +
          `Path:speech.config\r\n\r\n` +
          JSON.stringify({
            context: {
              synthesis: {
                audio: {
                  metadataoptions: { sentenceBoundaryEnabled: false, wordBoundaryEnabled: false },
                  outputFormat: 'audio-24khz-48kbitrate-mono-mp3',
                },
              },
            },
          }),
      )
      ws.send(
        `X-RequestId:${connectionId}\r\n` +
          `Content-Type:application/ssml+xml\r\n` +
          `X-Timestamp:${timestamp}\r\n` +
          `Path:ssml\r\n\r\n` +
          buildSsml(o),
      )
    })

    ws.on('message', (raw: Buffer | ArrayBuffer | Buffer[], isBinary: boolean) => {
      const buf = Buffer.isBuffer(raw)
        ? raw
        : Array.isArray(raw)
          ? Buffer.concat(raw)
          : Buffer.from(raw)
      if (!isBinary) {
        if (buf.toString('utf8').includes('Path:turn.end')) succeed()
        return
      }
      // Binary frame: [2-byte BE header length][ascii headers][payload]
      if (buf.length < 2) return
      const headerLen = buf.readUInt16BE(0)
      if (buf.length < 2 + headerLen) return
      const header = buf.subarray(2, 2 + headerLen).toString('utf8')
      if (header.includes('Path:audio')) {
        audioParts.push(buf.subarray(2 + headerLen))
      }
    })
  })
}

/**
 * Synthesize text to MP3. Retries once on failure (fresh socket + fresh
 * GEC token) — the service occasionally drops a first connection.
 */
export async function synthesize(o: SynthesizeOptions): Promise<Buffer> {
  try {
    return await synthesizeOnce(o)
  } catch {
    await new Promise((r) => setTimeout(r, 300))
    return synthesizeOnce(o)
  }
}
