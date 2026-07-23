import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { IROKO_SYSTEM_PROMPT, VOICE_STYLE_PROMPT } from '@/lib/iroko-ai'
import { rateLimitResponse } from '@/lib/rate-limit'
import { streamChatEvents, type LLMMessage } from '@/lib/llm'
import { TOOL_DEFINITIONS, executeTool, type ToolContext } from '@/lib/tools'
import { ensureTaskRunner } from '@/lib/task-engine'
import type { ApiChatMessage } from '@/lib/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_MESSAGES = 50
const MAX_CONTENT_LENGTH = 16000
/** Max model⇄tool rounds per user turn — stops runaway loops.
 *  Room for a search → fetch → fetch → answer browsing chain. */
const MAX_TOOL_ROUNDS = 6

/** Validate and sanitise the incoming message list. */
function validateMessages(messages: unknown): ApiChatMessage[] | null {
  if (!Array.isArray(messages) || messages.length === 0) return null
  const clean: ApiChatMessage[] = []
  for (const m of messages) {
    if (!m || typeof m !== 'object') return null
    const role = (m as any).role
    const content = (m as any).content
    if (role !== 'user' && role !== 'assistant' && role !== 'system') return null
    if (typeof content !== 'string' || content.length === 0) return null
    if (content.length > MAX_CONTENT_LENGTH) return null
    // drop any system messages coming from the client — we inject our own
    if (role === 'system') continue
    clean.push({ role, content })
  }
  if (clean.length === 0) return null
  return clean.slice(-MAX_MESSAGES)
}

export async function POST(req: NextRequest) {
  // 20 requests/minute/IP — generous for a real conversation, tight enough
  // to stop a single caller (or bot) from burning through AI provider quota.
  const limited = rateLimitResponse(req, 'chat', 20, 60_000)
  if (limited) return limited

  // Identify the user so tools can act on their behalf (tasks, payments).
  const session = await auth()
  const toolCtx: ToolContext = {
    userId: session?.user?.id ?? null,
    email: session?.user?.email ?? null,
  }

  // Make sure the background task runner is alive in this process.
  ensureTaskRunner()

  let body: any
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    })
  }

  const messages = validateMessages(body?.messages)
  if (!messages) {
    return new Response(
      JSON.stringify({ error: 'A non-empty "messages" array is required' }),
      { status: 400, headers: { 'content-type': 'application/json' } },
    )
  }

  // Prepend the Iroko system prompt server-side so it can't be tampered with.
  // On a voice call, add the spoken-style instruction so replies sound human
  // when read aloud (short sentences, no markdown, no options blocks).
  const isVoice = body?.mode === 'voice'
  const working: LLMMessage[] = [
    { role: 'system', content: IROKO_SYSTEM_PROMPT },
    ...(isVoice ? [{ role: 'system' as const, content: VOICE_STYLE_PROMPT }] : []),
    ...messages,
  ]

  // Agentic loop: stream text to the client as it arrives; when the model
  // requests tools, execute them, append the results, and start another
  // round. All rounds concatenate into one assistant message client-side.
  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (content: string) => {
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`,
          ),
        )
      }
      try {
        let totalText = ''
        for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
          const lastRound = round === MAX_TOOL_ROUNDS
          let roundText = ''
          let toolCalls: Awaited<ReturnType<typeof collect>> = null

          async function collect() {
            let calls: import('@/lib/llm').LLMToolCallRequest[] | null = null
            for await (const ev of streamChatEvents({
              messages: working,
              // On the final permitted round, withhold tools to force a
              // text answer instead of an unfinishable tool call.
              tools: lastRound ? undefined : TOOL_DEFINITIONS,
              temperature: 0.4,
              timeoutMs: 90_000,
            })) {
              if (ev.type === 'content') {
                roundText += ev.content
                send(ev.content)
              } else {
                calls = ev.toolCalls
              }
            }
            return calls
          }
          toolCalls = await collect()
          totalText += roundText

          if (!toolCalls || toolCalls.length === 0) break

          // Record the assistant turn that made the calls, then answer each.
          working.push({
            role: 'assistant',
            content: roundText || null,
            tool_calls: toolCalls,
          })
          const results = await Promise.all(
            toolCalls.map((call) =>
              executeTool(call.function.name, call.function.arguments, toolCtx),
            ),
          )
          toolCalls.forEach((call, i) => {
            working.push({
              role: 'tool',
              tool_call_id: call.id,
              name: call.function.name,
              content: results[i],
            })
          })
          // Visual separation if the model wrote text before calling tools.
          if (roundText.trim()) send('\n\n')
        }

        // Some models go silent after tool results — the user must NEVER get
        // an empty reply. Force one final text-only round.
        if (!totalText.trim()) {
          working.push({
            role: 'system',
            content:
              'Your previous turn produced no visible reply. Answer the user NOW in plain text, summarising any tool results above and offering the next step.',
          })
          try {
            for await (const ev of streamChatEvents({
              messages: working,
              temperature: 0.4,
              timeoutMs: 60_000,
            })) {
              if (ev.type === 'content') {
                totalText += ev.content
                send(ev.content)
              }
            }
          } catch {
            /* fall through to the canned fallback */
          }
          if (!totalText.trim()) {
            send('Sorry — I hit a snag processing that. Please ask me again.')
          }
        }

        controller.enqueue(encoder.encode('data: [DONE]\n\n'))
        controller.close()
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.warn('[iroko/chat] stream error:', msg)
        // Surface a clean error event on the SSE channel so the client can
        // display a friendly message instead of a broken pipe.
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              error: 'The AI service is busy or rate-limited. Please try again in a moment.',
            })}\n\n`,
          ),
        )
        controller.enqueue(encoder.encode('data: [DONE]\n\n'))
        controller.close()
      }
    },
  })

  return new Response(stream, {
    status: 200,
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    },
  })
}

export async function GET() {
  const azure = !!(process.env.AZURE_OPENAI_API_KEY && process.env.AZURE_OPENAI_ENDPOINT)
  return Response.json({
    name: 'Iroko AI Chat API',
    status: 'ok',
    streaming: true,
    tools: TOOL_DEFINITIONS.map((t) => t.function.name),
    provider: azure ? 'azure-openai' : 'openrouter',
    model: azure
      ? process.env.AZURE_OPENAI_DEPLOYMENT || '(unset)'
      : process.env.OPENROUTER_MODEL || '(unset)',
    fallback: azure && process.env.OPENROUTER_API_KEY ? 'openrouter' : 'none',
  })
}
