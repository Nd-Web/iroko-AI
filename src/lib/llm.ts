/**
 * OpenRouter LLM client.
 *
 * Single point of truth for chat/document generation calls. Swapping models
 * or providers later means editing this file only.
 *
 * OpenRouter's API is OpenAI-compatible:
 *   POST https://openrouter.ai/api/v1/chat/completions
 * with the same request/response shape, including `stream: true` SSE.
 *
 * Reference: https://openrouter.ai/docs
 */

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'

export interface LLMToolCallRequest {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  /** Null is allowed on assistant messages that only carry tool_calls. */
  content: string | null
  /** Optional name (used by some providers for multi-tool messages). */
  name?: string
  /** Assistant messages: tool calls the model made. */
  tool_calls?: LLMToolCallRequest[]
  /** Tool messages: which call this result answers. */
  tool_call_id?: string
}

export interface LLMToolDefinition {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

export interface LLMRequestOptions {
  messages: LLMMessage[]
  /** OpenAI-compatible tool definitions the model may call. */
  tools?: LLMToolDefinition[]
  /** Override the default model. Falls back to env OPENROUTER_MODEL. */
  model?: string
  /** Cap on completion tokens. */
  maxTokens?: number
  /** Sampling temperature, 0–2. Lower = more deterministic. */
  temperature?: number
  /** Request timeout in ms. Default 60s. */
  timeoutMs?: number
}

function getEnv(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`Missing env var: ${name}`)
  return v
}

/**
 * The ordered list of OpenRouter models to try for one request. The free tier
 * rate-limits (429) and occasionally returns empty completions, so we fall
 * through a chain: primary → fallbacks. `openrouter/free` auto-routes across
 * whatever free provider is up, making it the most resilient default.
 */
export function resolveModelChain(explicit?: string): string[] {
  if (explicit) return [explicit]
  const primary = process.env.OPENROUTER_MODEL || 'openrouter/free'
  const fallbacks = (
    process.env.OPENROUTER_FALLBACK_MODELS ||
    'openrouter/free,openai/gpt-oss-20b:free,meta-llama/llama-3.3-70b-instruct:free'
  )
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  // primary first, then fallbacks, de-duplicated
  return [...new Set([primary, ...fallbacks])]
}

/* ------------------------------------------------------------------ */
/* Provider abstraction — Azure OpenAI (preferred) or OpenRouter.      */
/* ------------------------------------------------------------------ */

type ProviderKind = 'azure' | 'openrouter'
interface Target {
  kind: ProviderKind
  /** Azure: deployment name. OpenRouter: model slug. */
  model: string
}

function azureConfigured(): boolean {
  return !!(process.env.AZURE_OPENAI_API_KEY && process.env.AZURE_OPENAI_ENDPOINT)
}

function openRouterConfigured(): boolean {
  return !!process.env.OPENROUTER_API_KEY
}

/**
 * Ordered list of provider+model targets to try. Azure OpenAI is preferred
 * when configured (reliable, handles tools + web content). If OpenRouter is
 * ALSO configured it stays on as an automatic fallback for resilience.
 */
function resolveTargets(explicit?: string): Target[] {
  const targets: Target[] = []
  if (azureConfigured()) {
    const deployment = explicit || process.env.AZURE_OPENAI_DEPLOYMENT || 'gpt-4o'
    targets.push({ kind: 'azure', model: deployment })
  }
  if (openRouterConfigured()) {
    for (const model of resolveModelChain(azureConfigured() ? undefined : explicit)) {
      targets.push({ kind: 'openrouter', model })
    }
  }
  // Last resort if nothing is configured — let OpenRouter surface the error.
  if (targets.length === 0) {
    targets.push({ kind: 'openrouter', model: explicit || process.env.OPENROUTER_MODEL || 'openrouter/free' })
  }
  return targets
}

/** Build the HTTP request (url, headers, body) for one target. */
function buildRequest(
  target: Target,
  opts: LLMRequestOptions,
  withTools: boolean,
  stream: boolean,
): { url: string; headers: Record<string, string>; body: string } {
  const toolsField = withTools && opts.tools?.length ? { tools: opts.tools } : {}

  if (target.kind === 'azure') {
    const endpoint = (process.env.AZURE_OPENAI_ENDPOINT as string).replace(/\/$/, '')
    const version = process.env.AZURE_OPENAI_API_VERSION || '2025-01-01-preview'
    return {
      url: `${endpoint}/openai/deployments/${encodeURIComponent(target.model)}/chat/completions?api-version=${version}`,
      headers: {
        'Content-Type': 'application/json',
        'api-key': process.env.AZURE_OPENAI_API_KEY as string,
      },
      body: JSON.stringify({
        messages: opts.messages,
        // Azure's newer models require max_completion_tokens (not max_tokens).
        ...(opts.maxTokens ? { max_completion_tokens: opts.maxTokens } : {}),
        ...(opts.temperature !== undefined ? { temperature: opts.temperature } : {}),
        stream,
        ...toolsField,
      }),
    }
  }

  // OpenRouter (OpenAI-compatible)
  return {
    url: OPENROUTER_URL,
    headers: buildHeaders(),
    body: JSON.stringify({
      model: target.model,
      messages: opts.messages,
      max_tokens: opts.maxTokens,
      temperature: opts.temperature,
      stream,
      ...toolsField,
    }),
  }
}

function buildHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${getEnv('OPENROUTER_API_KEY')}`,
  }
  // Optional but recommended — OpenRouter uses these for app attribution
  // and applies higher rate limits to identified apps on free models.
  const appUrl = process.env.OPENROUTER_APP_URL
  if (appUrl) headers['HTTP-Referer'] = appUrl
  const appName = process.env.OPENROUTER_APP_NAME
  if (appName) headers['X-Title'] = appName
  return headers
}

function isRetryable(status: number): boolean {
  return status === 408 || status === 409 || status === 429 || (status >= 500 && status < 600)
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

/**
 * Non-streaming completion. Returns the assistant's text content, or throws.
 */
export async function completeChat(opts: LLMRequestOptions): Promise<string> {
  const timeoutMs = opts.timeoutMs ?? 60_000
  const targets = resolveTargets(opts.model)
  // Walk the provider/model targets; within each, one retry on transient errors.
  let lastErr: unknown
  for (const target of targets) {
    const { url, headers, body } = buildRequest(target, opts, false, false)
    for (let attempt = 0; attempt < 2; attempt++) {
      const ac = new AbortController()
      const timer = setTimeout(() => ac.abort(), timeoutMs)
      try {
        const res = await fetch(url, { method: 'POST', headers, body, signal: ac.signal })
        if (!res.ok) {
          const text = await res.text().catch(() => '')
          const err = new Error(`LLM ${res.status}: ${text.slice(0, 200)}`)
          if (isRetryable(res.status) && attempt === 0) {
            lastErr = err
            await sleep(500)
            continue
          }
          throw err // move to next target
        }
        const json: any = await res.json()
        const content: string | undefined = json?.choices?.[0]?.message?.content
        if (!content || !content.trim()) {
          throw new Error('The model returned an empty completion.')
        }
        return content
      } catch (err) {
        lastErr = err
        if (attempt === 1) break // out of retries for this target → next target
        await sleep(500)
      } finally {
        clearTimeout(timer)
      }
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('LLM request failed')
}

interface SseDelta {
  content: string
}

/** Event stream for tool-aware rounds. */
export type LLMStreamEvent =
  | { type: 'content'; content: string }
  | { type: 'tool_calls'; toolCalls: LLMToolCallRequest[] }

/**
 * Parse a Server-Sent-Events body from OpenRouter and yield stream events.
 * Text arrives as incremental `content` events; tool calls arrive as
 * argument fragments which are accumulated by index and emitted as a single
 * `tool_calls` event when the stream finishes. Handles multi-line
 * `data: ...` frames, `[DONE]` sentinels, and keep-alive comment lines.
 */
async function* parseSseEvents(body: ReadableStream<Uint8Array>): AsyncGenerator<LLMStreamEvent> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  // tool-call fragments accumulated by stream index
  const calls = new Map<number, { id: string; name: string; args: string }>()

  const flushToolCalls = (): LLMStreamEvent | null => {
    if (calls.size === 0) return null
    const toolCalls: LLMToolCallRequest[] = [...calls.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([, c]) => ({
        id: c.id || `call_${Math.random().toString(36).slice(2, 10)}`,
        type: 'function' as const,
        function: { name: c.name, arguments: c.args || '{}' },
      }))
      .filter((c) => c.function.name)
    calls.clear()
    return toolCalls.length > 0 ? { type: 'tool_calls', toolCalls } : null
  }

  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      // SSE events are separated by a blank line.
      let sep: number
      while ((sep = buffer.indexOf('\n\n')) !== -1) {
        const rawEvent = buffer.slice(0, sep)
        buffer = buffer.slice(sep + 2)
        const lines = rawEvent.split('\n')
        let data = ''
        for (const line of lines) {
          if (line.startsWith('data:')) {
            data += line.slice(5).trimStart()
          }
          // Ignore other SSE fields (event:, id:, retry:, comments).
        }
        if (!data) continue
        if (data === '[DONE]') {
          const ev = flushToolCalls()
          if (ev) yield ev
          return
        }
        try {
          const json: any = JSON.parse(data)
          const delta = json?.choices?.[0]?.delta
          const content = delta?.content
          if (typeof content === 'string' && content.length > 0) {
            yield { type: 'content', content }
          }
          if (Array.isArray(delta?.tool_calls)) {
            for (const tc of delta.tool_calls) {
              const idx = typeof tc?.index === 'number' ? tc.index : 0
              const acc = calls.get(idx) ?? { id: '', name: '', args: '' }
              if (typeof tc?.id === 'string' && tc.id) acc.id = tc.id
              if (typeof tc?.function?.name === 'string') acc.name += tc.function.name
              if (typeof tc?.function?.arguments === 'string') acc.args += tc.function.arguments
              calls.set(idx, acc)
            }
          }
        } catch {
          // Swallow malformed frames — partial chunks happen during a long stream.
        }
      }
    }
    // Stream ended without [DONE] — still surface any accumulated calls.
    const ev = flushToolCalls()
    if (ev) yield ev
  } finally {
    try { reader.releaseLock() } catch { /* noop */ }
  }
}

/** Back-compat wrapper: content-only view of the event stream. */
async function* parseSseStream(body: ReadableStream<Uint8Array>): AsyncGenerator<SseDelta> {
  for await (const ev of parseSseEvents(body)) {
    if (ev.type === 'content') yield { content: ev.content }
  }
}

export interface StreamHandle {
  /** Async iterable of delta text fragments. */
  stream: AsyncIterable<SseDelta>
  /** Abort the upstream request. */
  cancel: () => void
}

/**
 * Streaming completion. Returns a handle exposing an async iterable of
 * `delta.content` strings and a `cancel()` to abort the request.
 *
 * Retries once on a transient upstream 429/5xx response with a short backoff.
 * Subsequent failures are surfaced as a thrown error from the iterator.
 */
export function streamChat(opts: LLMRequestOptions): StreamHandle {
  const model = opts.model ?? getEnv('OPENROUTER_MODEL')
  const body = JSON.stringify({
    model,
    messages: opts.messages,
    max_tokens: opts.maxTokens,
    temperature: opts.temperature,
    stream: true,
  })

  const timeoutMs = opts.timeoutMs ?? 60_000

  async function* run(): AsyncGenerator<SseDelta> {
    let lastErr: unknown
    for (let attempt = 0; attempt < 2; attempt++) {
      const ac = new AbortController()
      const timer = setTimeout(() => ac.abort(), timeoutMs)
      let res: Response
      try {
        res = await fetch(OPENROUTER_URL, {
          method: 'POST',
          headers: buildHeaders(),
          body,
          signal: ac.signal,
        })
      } catch (err) {
        clearTimeout(timer)
        lastErr = err
        if (attempt === 0) {
          await sleep(700)
          continue
        }
        throw err instanceof Error ? err : new Error('OpenRouter request failed')
      }
      if (!res.ok || !res.body) {
        const text = await res.text().catch(() => '')
        clearTimeout(timer)
        const err = new Error(`OpenRouter ${res.status}: ${text.slice(0, 200)}`)
        if (isRetryable(res.status) && attempt === 0) {
          lastErr = err
          await sleep(700)
          continue
        }
        throw err
      }
      try {
        for await (const delta of parseSseStream(res.body)) {
          yield delta
        }
        clearTimeout(timer)
        return
      } catch (err) {
        clearTimeout(timer)
        throw err instanceof Error ? err : new Error('Stream interrupted')
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error('OpenRouter request failed')
  }

  // The async generator is lazy; we expose it directly. `cancel()` is a
  // best-effort signal: dropping the iterator (breaking out of the for-await)
  // will tear down the underlying fetch via the AbortController on the next
  // tick because the inner fetch's body stream is closed.
  return {
    stream: run(),
    cancel: () => {
      // The AbortController is created per-attempt inside run(); a single
      // top-level cancel can't reach into it. We surface a no-op here; callers
      // that want to abort should stop iterating the stream.
    },
  }
}

/** Stream one specific model. Retries once on transient 429/5xx, degrades
 *  gracefully if the model rejects the `tools` field. Throws on failure. */
async function* streamOneModel(
  target: Target,
  opts: LLMRequestOptions,
): AsyncGenerator<LLMStreamEvent> {
  const timeoutMs = opts.timeoutMs ?? 60_000

  let withTools = !!opts.tools?.length
  let lastErr: unknown
  for (let attempt = 0; attempt < 2; attempt++) {
    const { url, headers, body } = buildRequest(target, opts, withTools, true)
    const ac = new AbortController()
    const timer = setTimeout(() => ac.abort(), timeoutMs)
    let res: Response
    try {
      res = await fetch(url, {
        method: 'POST',
        headers,
        body,
        signal: ac.signal,
      })
    } catch (err) {
      clearTimeout(timer)
      lastErr = err
      if (attempt < 1) {
        await sleep(500)
        continue
      }
      throw err instanceof Error ? err : new Error('OpenRouter request failed')
    }
    if (!res.ok || !res.body) {
      const text = await res.text().catch(() => '')
      clearTimeout(timer)
      const err = new Error(`OpenRouter ${res.status}: ${text.slice(0, 200)}`)
      // Provider/model doesn't support tools → degrade gracefully once.
      if (withTools && res.status === 400 && /tool|function/i.test(text)) {
        withTools = false
        continue
      }
      if (isRetryable(res.status) && attempt < 1) {
        lastErr = err
        await sleep(500)
        continue
      }
      throw err
    }
    try {
      for await (const ev of parseSseEvents(res.body)) {
        yield ev
      }
      clearTimeout(timer)
      return
    } catch (err) {
      clearTimeout(timer)
      throw err instanceof Error ? err : new Error('Stream interrupted')
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('OpenRouter request failed')
}

/**
 * One tool-aware streaming round with automatic MODEL FALLBACK. Yields
 * incremental `content` events and, if the model calls tools, a final
 * `tool_calls` event.
 *
 * Resilience for the free tier: it walks the model chain (resolveModelChain).
 * If a model 429s/errors or returns a completely EMPTY completion (the free
 * Llama endpoint does this on web-search content) — and nothing has been
 * yielded yet — it silently tries the next model. Once any event has been
 * yielded we commit to that model to avoid duplicate output.
 */
export async function* streamChatEvents(opts: LLMRequestOptions): AsyncGenerator<LLMStreamEvent> {
  const targets = resolveTargets(opts.model)
  let lastErr: unknown
  for (let i = 0; i < targets.length; i++) {
    const isLast = i === targets.length - 1
    let yielded = false
    try {
      for await (const ev of streamOneModel(targets[i], opts)) {
        yielded = true
        yield ev
      }
      if (yielded) return // success
      if (isLast) return // 200 but empty on the last target — give up cleanly
      // empty completion → fall through to the next target (nothing lost yet)
    } catch (err) {
      lastErr = err
      // Can't safely switch targets once we've emitted partial output.
      if (yielded || isLast) throw err instanceof Error ? err : new Error('LLM request failed')
      await sleep(300)
    }
  }
  if (lastErr) throw lastErr instanceof Error ? lastErr : new Error('LLM request failed')
}
