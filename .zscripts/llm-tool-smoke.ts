/** Live check: does the configured OpenRouter model stream tool calls? */
import { streamChatEvents } from '../src/lib/llm'
import { TOOL_DEFINITIONS, executeTool } from '../src/lib/tools'

async function main() {
  const events: string[] = []
  let toolCalls: any = null
  let text = ''
  for await (const ev of streamChatEvents({
    messages: [
      { role: 'system', content: 'You are Iroko AI. Use the calculate_paye tool for any tax question.' },
      { role: 'user', content: 'Calculate my PAYE: I earn 450,000 naira monthly, pension only.' },
    ],
    tools: TOOL_DEFINITIONS,
    temperature: 0.2,
    timeoutMs: 60_000,
  })) {
    if (ev.type === 'content') text += ev.content
    else { toolCalls = ev.toolCalls; events.push('TOOL_CALLS: ' + JSON.stringify(ev.toolCalls)) }
  }
  console.log('text (first 200):', JSON.stringify(text.slice(0, 200)))
  console.log(events.join('\n') || '(no tool calls)')
  if (toolCalls?.length) {
    const result = await executeTool(toolCalls[0].function.name, toolCalls[0].function.arguments, { userId: null, email: null })
    console.log('executed →', result.slice(0, 200))
    console.log('\nTOOL CALLING WORKS ✅')
  } else {
    console.log('\nMODEL DID NOT CALL TOOLS ⚠️ (fallback path — chat still works)')
  }
}
main().then(() => process.exit(0)).catch((e) => { console.error('FAILED:', e.message); process.exit(1) })
