'use client'

import * as React from 'react'
import ReactMarkdown from 'react-markdown'
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
        components={{
          pre: PreBlock,
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer">
              {children}
            </a>
          ),
        }}
      >
        {memoized}
      </ReactMarkdown>
    </div>
  )
}
