/**
 * Text utilities for speech — shared by the TTS route (server) and the
 * voice-call streaming pipeline (client). No Node-specific imports.
 */

/**
 * Normalise text so it SOUNDS human when spoken — especially Nigerian
 * money and the markdown the chat model produces.
 */
export function speechNormalize(text: string): string {
  return (
    text
      // markdown → speech
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/^#{1,6}\s+(.+)$/gm, '$1.')
      .replace(/[#*_`>~]/g, '')
      .replace(/\|/g, ', ')
      .replace(/^\s*[-•]\s+/gm, '')
      // Nigerian money: ₦1,500,000 → "1,500,000 naira" (Edge reads the number well)
      .replace(/₦\s?([\d,]+(?:\.\d+)?)/g, '$1 naira')
      .replace(/\bNGN\b/g, 'naira')
      // symbols that read badly
      .replace(/(\d)\s?%/g, '$1 percent')
      .replace(/&/g, ' and ')
      // "/month", "/yr" → "per month" (before the generic slash rule)
      .replace(/\/(month|year|week|day|annum|mo|yr)\b/gi, ' per $1')
      .replace(/\//g, ' or ')
      // e.g. / i.e. read literally
      .replace(/\be\.g\.\s*/gi, 'for example, ')
      .replace(/\bi\.e\.\s*/gi, 'that is, ')
      // emojis and stray unicode symbols
      .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, '')
      .replace(/\s+/g, ' ')
      .trim()
  )
}

/**
 * Incremental sentence extractor for streaming speech.
 *
 * Given the full text so far and how many characters have already been
 * consumed, returns complete sentences beyond that point (merging fragments
 * shorter than `minLen` into the next sentence so the voice doesn't chirp
 * two-word clips) and the new consumed offset.
 */
export function extractNewSentences(
  fullText: string,
  consumed: number,
  minLen = 24,
): { sentences: string[]; consumed: number } {
  const pending = fullText.slice(consumed)
  const sentences: string[] = []
  // a sentence ends at . ! ? … (optionally followed by quotes/brackets) + whitespace
  const re = /[^.!?…]*[.!?…]+["')\]]*\s+/g
  let lastEnd = 0
  let buffer = ''
  let match: RegExpExecArray | null
  while ((match = re.exec(pending)) !== null) {
    buffer += match[0]
    if (buffer.trim().length >= minLen) {
      sentences.push(buffer.trim())
      buffer = ''
    }
    lastEnd = re.lastIndex
  }
  // Anything in `buffer` was a too-short complete sentence — keep it consumed
  // only if we emitted it; otherwise leave it for the next pass.
  const emittedLen = lastEnd - buffer.length
  return { sentences, consumed: consumed + (buffer ? emittedLen : lastEnd) }
}
