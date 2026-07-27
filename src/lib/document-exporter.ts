/**
 * Client-side Document Exporter for Iroko AI.
 * Enables 1-click download of generated legal contracts, formal letters, and agreements
 * as Microsoft Word (.doc/.docx) or formatted PDF.
 */

/** Check if text content is a formal legal document, contract, or formal letter. */
export function isLegalDocument(text: string): boolean {
  if (!text || text.length < 150) return false

  // 1. Check for explicit document heading at start or section (# Formal Letter, # Agreement, etc.)
  const hasDocHeading = /^#\s+.*(agreement|contract|letter|notice|memorandum|resolution|deed|invoice|affidavit|declaration|demand)/im.test(text)
  if (hasDocHeading) return true

  // 2. Check for formal letter structural elements
  const hasLetterStructure =
    (text.includes('Dear ') || text.includes('RE:') || text.includes('Subject:')) &&
    (text.includes('Yours faithfully') || text.includes('Yours sincerely') || text.includes('[Your Signature]')) &&
    (text.includes('[Date]') || text.includes('[Your Name]') || text.includes('[Landlord'))
  if (hasLetterStructure) return true

  // 3. Check for formal contract / legal agreement structural elements
  const lower = text.toLowerCase()
  const contractKeywords = [
    'in witness whereof',
    'signature block',
    'now it is hereby agreed',
    'terms and conditions',
    'legal disclaimer',
  ]
  const matchCount = contractKeywords.filter((k) => lower.includes(k)).length
  if (matchCount >= 2) return true

  return false
}

/** Extract document title from markdown heading or first line. */
export function extractDocTitle(text: string): string {
  const match = text.match(/^#\s+(.+)$/m)
  if (match && match[1]) {
    return match[1].replace(/[*_#]/g, '').trim()
  }

  const letterSubj = text.match(/(?:Subject|RE):\s*(.+)$/im)
  if (letterSubj && letterSubj[1]) {
    return letterSubj[1].replace(/[*_#]/g, '').trim().slice(0, 50)
  }

  const lines = text.split('\n').filter((l) => l.trim().length > 0)
  if (lines[0]) {
    return lines[0].replace(/[*_#]/g, '').trim().slice(0, 50)
  }
  return 'Iroko_Document'
}

/** Convert Markdown plain text into clean HTML body for document rendering. */
export function markdownToHtml(markdown: string): string {
  let html = markdown
    // Escape standard tags
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    // Headings
    .replace(/^### (.*$)/gim, '<h3 style="font-size:13pt;font-weight:bold;margin-top:16px;margin-bottom:8px;color:#111827;">$1</h3>')
    .replace(/^## (.*$)/gim, '<h2 style="font-size:15pt;font-weight:bold;margin-top:20px;margin-bottom:10px;color:#0f8a5f;border-bottom:1px solid #e5e7eb;padding-bottom:4px;">$1</h2>')
    .replace(/^# (.*$)/gim, '<h1 style="font-size:18pt;font-weight:bold;text-align:center;margin-bottom:24px;color:#111827;text-transform:uppercase;">$1</h1>')
    // Bold / Italic
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    // Horizontal Rule
    .replace(/^---$/gim, '<hr style="border:none;border-top:1px solid #d1d5db;margin:24px 0;"/>')
    // Paragraphs
    .replace(/\n\n/g, '</p><p style="margin-bottom:12px;line-height:1.6;text-align:justify;color:#1f2937;">')
    .replace(/\n/g, '<br/>')

  return `<p style="margin-bottom:12px;line-height:1.6;text-align:justify;color:#1f2937;">${html}</p>`
}

/** Download document as Microsoft Word (.doc/.docx compatible). */
export function downloadAsWord(text: string, title?: string) {
  const docTitle = title || extractDocTitle(text)
  const bodyHtml = markdownToHtml(text)

  const fullContent = `
    <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
    <head>
      <meta charset='utf-8'>
      <title>${docTitle}</title>
      <style>
        @page { size: A4; margin: 1in; }
        body { font-family: 'Georgia', 'Times New Roman', serif; font-size: 11pt; color: #111827; line-height: 1.6; padding: 20px; }
        h1 { font-size: 18pt; text-align: center; text-transform: uppercase; font-weight: bold; margin-bottom: 24px; color: #000; }
        h2 { font-size: 14pt; font-weight: bold; color: #0f8a5f; margin-top: 20px; margin-bottom: 8px; border-bottom: 1px solid #ddd; padding-bottom: 4px; }
        h3 { font-size: 12pt; font-weight: bold; margin-top: 14px; margin-bottom: 6px; }
        p { text-align: justify; text-justify: inter-word; margin-bottom: 12px; }
        strong { font-weight: bold; }
        em { font-style: italic; }
        .disclaimer { margin-top: 30px; padding-top: 12px; border-top: 1px solid #9ca3af; font-size: 9.5pt; color: #4b5563; font-style: italic; }
      </style>
    </head>
    <body>
      ${bodyHtml}
    </body>
    </html>
  `

  const blob = new Blob(['\ufeff' + fullContent], { type: 'application/msword' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${docTitle.toLowerCase().replace(/[^a-z0-9]+/g, '_')}.doc`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/** Print or Download document as PDF. */
export function downloadAsPdf(text: string, title?: string) {
  const docTitle = title || extractDocTitle(text)
  const bodyHtml = markdownToHtml(text)

  const printWindow = window.open('', '_blank', 'width=800,height=900')
  if (!printWindow) return

  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>${docTitle}</title>
      <style>
        @page { size: A4; margin: 20mm; }
        body { font-family: 'Georgia', 'Times New Roman', serif; font-size: 11pt; color: #111827; line-height: 1.6; padding: 20px; }
        h1 { font-size: 18pt; text-align: center; text-transform: uppercase; font-weight: bold; margin-bottom: 24px; color: #000; }
        h2 { font-size: 14pt; font-weight: bold; color: #0f8a5f; margin-top: 20px; margin-bottom: 8px; border-bottom: 1px solid #ddd; padding-bottom: 4px; }
        h3 { font-size: 12pt; font-weight: bold; margin-top: 14px; margin-bottom: 6px; }
        p { text-align: justify; text-justify: inter-word; margin-bottom: 12px; }
        strong { font-weight: bold; }
        em { font-style: italic; }
        @media print {
          body { padding: 0; }
        }
      </style>
    </head>
    <body>
      ${bodyHtml}
      <script>
        window.onload = function() {
          window.print();
        };
      </script>
    </body>
    </html>
  `)
  printWindow.document.close()
}
