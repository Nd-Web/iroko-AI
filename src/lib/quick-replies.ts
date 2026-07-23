/**
 * Quick replies — the chat-first "buttons" mechanic.
 *
 * The system prompt instructs the model to end a message with a fenced code
 * block whose language is `options` (one option per line). This module strips
 * that block from the message body and returns the options so the UI can
 * render them as tappable chips; tapping one sends its text as the user's
 * next message.
 */

const COMPLETE_BLOCK_RE = /```options[^\S\n]*\n([\s\S]*?)```/g
const OPEN_FENCE = '```options'
const MAX_OPTIONS = 6

export interface QuickReplyParse {
  /** Message content with all options blocks removed. */
  body: string
  /** Options from the last complete options block (empty if none). */
  options: string[]
}

export function extractQuickReplies(content: string): QuickReplyParse {
  let options: string[] = []

  // Remove every complete ```options block; keep the last block's choices.
  let body = content.replace(COMPLETE_BLOCK_RE, (_match, inner: string) => {
    options = inner
      .split('\n')
      .map((line) => line.replace(/^[-*]\s+/, '').trim())
      .filter(Boolean)
      .slice(0, MAX_OPTIONS)
    return ''
  })

  // While streaming, an options block may be mid-arrival (opened but not yet
  // closed). Truncate at the open fence so raw markup never flashes on screen.
  const openIdx = body.lastIndexOf(OPEN_FENCE)
  if (openIdx !== -1) {
    body = body.slice(0, openIdx)
    options = []
  }

  return { body: body.trimEnd(), options }
}
