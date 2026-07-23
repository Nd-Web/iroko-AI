import { IROKO_SYSTEM_PROMPT } from '../src/lib/iroko-ai'
import { streamChatEvents, type LLMMessage } from '../src/lib/llm'
import { TOOL_DEFINITIONS, executeTool } from '../src/lib/tools'

// Faithfully mirrors src/app/api/chat/route.ts (loop + empty-reply guard).
async function run(userText: string) {
  const working: LLMMessage[] = [
    { role: 'system', content: IROKO_SYSTEM_PROMPT },
    { role: 'user', content: userText },
  ]
  const MAX = 6
  let totalText = ''
  const toolsUsed: string[] = []
  for (let round = 0; round <= MAX; round++) {
    const lastRound = round === MAX
    let roundText = ''
    let calls: any = null
    for await (const ev of streamChatEvents({ messages: working, tools: lastRound ? undefined : TOOL_DEFINITIONS, temperature: 0.4, timeoutMs: 90_000 })) {
      if (ev.type === 'content') roundText += ev.content
      else calls = ev.toolCalls
    }
    totalText += roundText
    if (!calls?.length) break
    working.push({ role: 'assistant', content: roundText || null, tool_calls: calls })
    const results = await Promise.all(calls.map((c: any) => { toolsUsed.push(c.function.name); return executeTool(c.function.name, c.function.arguments, { userId: null, email: null }) }))
    calls.forEach((c: any, i: number) => working.push({ role: 'tool', tool_call_id: c.id, name: c.function.name, content: results[i] }))
  }
  if (!totalText.trim()) {
    working.push({ role: 'system', content: 'Your previous turn produced no visible reply. Answer the user NOW in plain text, summarising any tool results above and offering the next step.' })
    for await (const ev of streamChatEvents({ messages: working, temperature: 0.4, timeoutMs: 60_000 })) {
      if (ev.type === 'content') totalText += ev.content
    }
  }
  return { totalText, toolsUsed }
}

async function main() {
  const { totalText, toolsUsed } = await run('what is the current CAC fee to register a business name (enterprise) in Nigeria right now? search the web and cite your source.')
  console.log('===== REPLY =====\n' + totalText.slice(0, 1100))
  console.log('\ntools used:', toolsUsed.join(', '))
  console.log('searched web:', toolsUsed.includes('web_search'), '| non-empty:', !!totalText.trim(), '| cited URL:', /https?:\/\//.test(totalText))
  if (!totalText.trim()) process.exit(1)
}
main().catch((e) => { console.error('FAILED:', e.message); process.exit(1) })
