import { NextRequest } from 'next/server'
import { IROKO_SYSTEM_PROMPT } from '@/lib/iroko-ai'
import { getDocTemplate, buildDocGenerationPrompt } from '@/lib/iroko-documents'
import { rateLimitResponse } from '@/lib/rate-limit'
import { completeChat } from '@/lib/llm'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(req: NextRequest) {
  // 10 requests/minute/IP — document generation is heavier and less
  // frequent than chat/voice, so it gets the tightest limit.
  const limited = rateLimitResponse(req, 'generate-document', 10, 60_000)
  if (limited) return limited

  let body: any
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const templateId = body?.templateId
  const values = body?.values
  if (!templateId || typeof values !== 'object' || values === null) {
    return Response.json(
      { error: 'templateId and values are required' },
      { status: 400 },
    )
  }

  const template = getDocTemplate(templateId)
  if (!template) {
    return Response.json({ error: 'Unknown document template' }, { status: 400 })
  }

  // require all required fields
  for (const f of template.fields) {
    if (f.required && !(values[f.id] && String(values[f.id]).trim())) {
      return Response.json(
        { error: `Missing required field: ${f.label}` },
        { status: 400 },
      )
    }
  }

  const userPrompt = buildDocGenerationPrompt(template, values)

  try {
    const content = await completeChat({
      messages: [
        { role: 'system', content: IROKO_SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.2,
      timeoutMs: 60_000,
    })
    return Response.json({ content })
  } catch (err) {
    console.warn(
      '[iroko/generate-document] error:',
      err instanceof Error ? err.message : err,
    )
    return Response.json(
      { error: 'Document generation failed. Please try again.' },
      { status: 502 },
    )
  }
}
