'use client'

import * as React from 'react'
import remarkGfm from 'remark-gfm'
import { CodeBlock } from './code-block'
import { cn } from '@/lib/utils'

interface MarkdownProps {
  content: string
  className?: string
}

/** Recursively extract raw text from a React node tree (code element children). */
function extractText(node: React.ReactNode): string {
  if (node == null || node === false) return ''
  if (typeof node === 'string') return node
  if (typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(extractText).join('')
  if (React.isValidElement(node)) {
    return extractText((node.props as { children?: React.ReactNode }).children)
  }
  return ''
}

/** Render the <pre> as a custom CodeBlock with copy button. */
function PreBlock({ children }: { children?: React.ReactNode }) {
  const child = Array.isArray(children) ? children[0] : children
  const codeProps = (
    React.isValidElement(child)
      ? (child.props as { className?: string; children?: React.ReactNode })
      : {}
  )
  const className = codeProps.className || ''
  const match = /language-([\w-]+)/.exec(className)
  const lang = match?.[1] || 'text'
  const raw = extractText(codeProps.children).replace(/\n$/, '')

  return <CodeBlock code={raw} lang={lang} />
}

export function Markdown({ content, className }: MarkdownProps) {
  const memoized = React.useMemo(() => content, [content])
  return (
    <div className={cn('iroko-prose', className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          pre: PreBlock,
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer">
              {children}
            </a>
          ),
          table: ({ children }) => (
            <div className="my-4 w-full overflow-x-auto rounded-xl border border-border bg-card shadow-xs">
              <table className="w-full text-left text-xs border-collapse">
                {children}
              </table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="border-b border-border bg-muted/60 font-semibold text-foreground">
              {children}
            </thead>
          ),
          tbody: ({ children }) => (
            <tbody className="divide-y divide-border/60 bg-background text-foreground/90">
              {children}
            </tbody>
          ),
          tr: ({ children }) => (
            <tr className="transition-colors hover:bg-muted/30">
              {children}
            </tr>
          ),
          th: ({ children }) => (
            <th className="px-3.5 py-2.5 font-semibold text-foreground">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="px-3.5 py-2.5 text-xs text-foreground/90 leading-normal">
              {children}
            </td>
          ),
        }}
      >
        {memoized}
      </ReactMarkdown>
    </div>
  )
}
