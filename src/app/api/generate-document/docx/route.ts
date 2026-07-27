import { NextRequest, NextResponse } from 'next/server'
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  AlignmentType,
  HeadingLevel,
} from 'docx'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POST /api/generate-document/docx
 * Accepts { text: string, title?: string } and returns a native .docx file.
 */
export async function POST(req: NextRequest) {
  let body: { text?: string; title?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const text = body?.text
  if (!text || typeof text !== 'string') {
    return NextResponse.json(
      { error: '"text" field is required' },
      { status: 400 },
    )
  }

  const title = body?.title || extractTitle(text)

  const lines = text.split('\n')
  const children: Paragraph[] = []

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line) {
      children.push(new Paragraph({ text: '' }))
      continue
    }

    if (line.startsWith('# ')) {
      children.push(
        new Paragraph({
          text: line.replace('# ', '').replace(/[*_#]/g, '').toUpperCase(),
          heading: HeadingLevel.HEADING_1,
          alignment: AlignmentType.CENTER,
          spacing: { before: 360, after: 240 },
        }),
      )
    } else if (line.startsWith('## ')) {
      children.push(
        new Paragraph({
          text: line.replace('## ', '').replace(/[*_#]/g, ''),
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 240, after: 120 },
        }),
      )
    } else if (line.startsWith('### ')) {
      children.push(
        new Paragraph({
          text: line.replace('### ', '').replace(/[*_#]/g, ''),
          heading: HeadingLevel.HEADING_3,
          spacing: { before: 180, after: 90 },
        }),
      )
    } else {
      // Parse bold/italic inline text runs
      const runs: TextRun[] = []
      const parts = line.split(/(\*\*.*?\*\*|\*.*?\*)/g)
      for (const part of parts) {
        if (!part) continue
        if (part.startsWith('**') && part.endsWith('**')) {
          runs.push(new TextRun({ text: part.slice(2, -2), bold: true }))
        } else if (part.startsWith('*') && part.endsWith('*')) {
          runs.push(new TextRun({ text: part.slice(1, -1), italic: true }))
        } else {
          runs.push(new TextRun({ text: part }))
        }
      }

      children.push(
        new Paragraph({
          children: runs,
          alignment: AlignmentType.JUSTIFY,
          spacing: { after: 120, line: 276 },
        }),
      )
    }
  }

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: 1440,
              right: 1440,
              bottom: 1440,
              left: 1440,
            },
          },
        },
        children,
      },
    ],
  })

  try {
    const buffer = await Packer.toBuffer(doc)
    const filename = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '')

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${filename}.docx"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (err) {
    console.error('[generate-document/docx] Error:', err)
    return NextResponse.json(
      { error: 'Failed to generate document' },
      { status: 500 },
    )
  }
}

function extractTitle(text: string): string {
  const match = text.match(/^#\s+(.+)$/m)
  if (match?.[1]) return match[1].replace(/[*_#]/g, '').trim()
  const lines = text.split('\n').filter((l) => l.trim())
  return lines[0]?.replace(/[*_#]/g, '').trim().slice(0, 50) || 'Iroko_Document'
}
