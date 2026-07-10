import type { ReactNode } from 'react'
import { cn } from '../../utils/cn'

const MARKDOWN_HINT = /(^|\n)\s{0,3}(#{1,6}\s|[-*+]\s|\d+\.\s|>\s|```|\|.+\|)|\*\*|`|\[[^\]]+\]\((https?:\/\/[^)\s]+)\)/

export function formatTextForMarkdown(input: string): string {
  const normalized = input.replace(/\r\n/g, '\n').trim()
  if (!normalized) return ''
  if (MARKDOWN_HINT.test(normalized)) return normalized

  const existingParagraphs = normalized.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean)
  if (existingParagraphs.length > 1) return existingParagraphs.join('\n\n')

  const sentences = normalized
    .match(/[^.!?]+[.!?]+(?:["'”)]|\])?\s*|[^.!?]+$/g)
    ?.map((part) => part.trim())
    .filter(Boolean) ?? [normalized]

  if (sentences.length < 3) return normalized

  const grouped: string[] = []
  for (let index = 0; index < sentences.length; index += 2) {
    grouped.push(sentences.slice(index, index + 2).join(' '))
  }
  return grouped.join('\n\n')
}

function renderInlineMarkdown(text: string, keyPrefix: string): ReactNode[] {
  const tokenRegex = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\((https?:\/\/[^)\s]+)\))/g
  const nodes: ReactNode[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null
  let tokenIndex = 0

  while ((match = tokenRegex.exec(text)) !== null) {
    if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index))
    const token = match[0]
    if (token.startsWith('**') && token.endsWith('**')) {
      nodes.push(<strong key={`${keyPrefix}-b-${tokenIndex}`}>{token.slice(2, -2)}</strong>)
    } else if (token.startsWith('`') && token.endsWith('`')) {
      nodes.push(
        <code key={`${keyPrefix}-c-${tokenIndex}`} className="px-1 py-0.5 rounded bg-casa-surface border border-casa-border text-caption">
          {token.slice(1, -1)}
        </code>,
      )
    } else {
      const linkMatch = token.match(/^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/)
      if (linkMatch) {
        nodes.push(
          <a
            key={`${keyPrefix}-a-${tokenIndex}`}
            href={linkMatch[2]}
            target="_blank"
            rel="noreferrer"
            className="text-casa-gold underline underline-offset-2"
          >
            {linkMatch[1]}
          </a>,
        )
      } else {
        nodes.push(token)
      }
    }
    lastIndex = tokenRegex.lastIndex
    tokenIndex += 1
  }

  if (lastIndex < text.length) nodes.push(text.slice(lastIndex))
  return nodes
}

function splitMarkdownTableRow(line: string): string[] {
  const cleaned = line.trim().replace(/^\|/, '').replace(/\|$/, '')
  return cleaned.split('|').map((cell) => cell.trim())
}

function isMarkdownTableSeparator(line: string, columns: number): boolean {
  const cells = splitMarkdownTableRow(line)
  if (cells.length !== columns || columns < 2) return false
  return cells.every((cell) => /^:?-{3,}:?$/.test(cell))
}

export default function MarkdownContent({ content, className }: { content: string; className?: string }) {
  const lines = content.replace(/\r\n/g, '\n').trim().split('\n')
  const blocks: ReactNode[] = []
  let index = 0
  let paragraphBuffer: string[] = []

  const flushParagraph = () => {
    if (paragraphBuffer.length === 0) return
    const text = paragraphBuffer.join(' ').trim()
    if (text) {
      blocks.push(
        <p key={`p-${blocks.length}`} className="whitespace-pre-wrap">
          {renderInlineMarkdown(text, `p-${blocks.length}`)}
        </p>,
      )
    }
    paragraphBuffer = []
  }

  while (index < lines.length) {
    const line = lines[index]
    const trimmed = line.trim()
    if (trimmed.length === 0) {
      flushParagraph()
      index += 1
      continue
    }

    if (trimmed.startsWith('```')) {
      flushParagraph()
      index += 1
      const codeLines: string[] = []
      while (index < lines.length && !lines[index].trim().startsWith('```')) {
        codeLines.push(lines[index])
        index += 1
      }
      if (index < lines.length) index += 1
      blocks.push(
        <pre key={`code-${blocks.length}`} className="rounded-lg border border-casa-border bg-casa-surface px-3 py-2 overflow-x-auto text-body-sm leading-relaxed">
          <code>{codeLines.join('\n')}</code>
        </pre>,
      )
      continue
    }

    const headingMatch = trimmed.match(/^(#{1,4})\s+(.+)$/)
    if (headingMatch) {
      flushParagraph()
      blocks.push(
        <p key={`h-${blocks.length}`} className="font-semibold text-casa-navy">
          {renderInlineMarkdown(headingMatch[2], `h-${blocks.length}`)}
        </p>,
      )
      index += 1
      continue
    }

    if (trimmed.includes('|') && index + 1 < lines.length) {
      const headerCells = splitMarkdownTableRow(lines[index])
      if (isMarkdownTableSeparator(lines[index + 1] ?? '', headerCells.length)) {
        flushParagraph()
        const rows: string[][] = []
        index += 2
        while (index < lines.length) {
          const rowLine = lines[index].trim()
          if (!rowLine || !rowLine.includes('|')) break
          const rowCells = splitMarkdownTableRow(lines[index])
          if (rowCells.length !== headerCells.length) break
          rows.push(rowCells)
          index += 1
        }
        blocks.push(
          <div key={`table-${blocks.length}`} className="overflow-x-auto">
            <table className="min-w-full border border-casa-border rounded-lg bg-casa-surface text-caption">
              <thead className="bg-casa-bg">
                <tr>
                  {headerCells.map((cell, cellIndex) => (
                    <th key={`th-${cellIndex}`} className="px-2 py-1 text-left border-b border-casa-border font-semibold text-casa-navy">
                      {renderInlineMarkdown(cell, `th-${blocks.length}-${cellIndex}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, rowIndex) => (
                  <tr key={`tr-${rowIndex}`} className="border-b last:border-b-0 border-casa-border">
                    {row.map((cell, cellIndex) => (
                      <td key={`td-${rowIndex}-${cellIndex}`} className="px-2 py-1 align-top">
                        {renderInlineMarkdown(cell, `td-${blocks.length}-${rowIndex}-${cellIndex}`)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>,
        )
        continue
      }
    }

    if (/^[-*]\s+/.test(trimmed)) {
      flushParagraph()
      const items: string[] = []
      while (index < lines.length && /^[-*]\s+/.test(lines[index].trim())) {
        items.push(lines[index].trim().replace(/^[-*]\s+/, ''))
        index += 1
      }
      blocks.push(
        <ul key={`ul-${blocks.length}`} className="list-disc pl-5 space-y-1">
          {items.map((item, itemIndex) => (
            <li key={`ul-${blocks.length}-${itemIndex}`}>{renderInlineMarkdown(item, `ul-${blocks.length}-${itemIndex}`)}</li>
          ))}
        </ul>,
      )
      continue
    }

    if (/^\d+\.\s+/.test(trimmed)) {
      flushParagraph()
      const items: string[] = []
      while (index < lines.length && /^\d+\.\s+/.test(lines[index].trim())) {
        items.push(lines[index].trim().replace(/^\d+\.\s+/, ''))
        index += 1
      }
      blocks.push(
        <ol key={`ol-${blocks.length}`} className="list-decimal pl-5 space-y-1">
          {items.map((item, itemIndex) => (
            <li key={`ol-${blocks.length}-${itemIndex}`}>{renderInlineMarkdown(item, `ol-${blocks.length}-${itemIndex}`)}</li>
          ))}
        </ol>,
      )
      continue
    }

    paragraphBuffer.push(trimmed)
    index += 1
  }

  flushParagraph()
  return <div className={cn('space-y-2', className)}>{blocks}</div>
}
