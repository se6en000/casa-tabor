import type { ReactNode } from 'react'

interface EmailMarkdownViewProps {
  markdown: string
  className?: string
}

const INLINE_PATTERN = /\*\*(.+?)\*\*|\*(.+?)\*|\[([^\]]+)\]\(([^)]+)\)/g

/**
 * Parses the limited Markdown subset produced by gmail-message-content.mjs
 * (headings, **bold**, *italic*, [text](url), "- " list items, blank-line
 * paragraphs) into React nodes -- never dangerouslySetInnerHTML, since this
 * text originates from arbitrary third-party email senders.
 */
function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null
  let i = 0
  INLINE_PATTERN.lastIndex = 0

  while ((match = INLINE_PATTERN.exec(text))) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index))
    }
    const [, bold, italic, linkText, linkHref] = match
    if (bold !== undefined) {
      nodes.push(<strong key={`${keyPrefix}-${i++}`}>{bold}</strong>)
    } else if (italic !== undefined) {
      nodes.push(<em key={`${keyPrefix}-${i++}`}>{italic}</em>)
    } else if (linkText !== undefined && linkHref !== undefined) {
      nodes.push(
        <a
          key={`${keyPrefix}-${i++}`}
          href={linkHref}
          target="_blank"
          rel="noopener noreferrer"
          className="text-casa-gold-hover underline underline-offset-2 hover:text-casa-navy"
        >
          {linkText}
        </a>
      )
    }
    lastIndex = INLINE_PATTERN.lastIndex
  }
  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex))
  }
  return nodes
}

export default function EmailMarkdownView({ markdown, className }: EmailMarkdownViewProps) {
  const blocks = markdown.split(/\n{2,}/).filter((b) => b.trim().length > 0)

  return (
    <div className={className}>
      {blocks.map((block, blockIdx) => {
        const headingMatch = block.match(/^(#{1,6})\s+(.*)$/)
        if (headingMatch) {
          const level = headingMatch[1].length
          const text = headingMatch[2]
          const headingClass =
            level <= 2
              ? 'text-body-lg font-display font-semibold text-casa-navy'
              : 'text-body font-display font-semibold text-casa-navy'
          return (
            <p key={blockIdx} className={`${headingClass} mb-2`}>
              {renderInline(text, `h${blockIdx}`)}
            </p>
          )
        }

        const lines = block.split('\n')
        const isList = lines.every((line) => line.trim().startsWith('- '))
        if (isList) {
          return (
            <ul key={blockIdx} className="list-disc pl-5 space-y-1 mb-3">
              {lines.map((line, lineIdx) => (
                <li key={lineIdx}>{renderInline(line.trim().slice(2), `li${blockIdx}-${lineIdx}`)}</li>
              ))}
            </ul>
          )
        }

        return (
          <p key={blockIdx} className="mb-3 last:mb-0">
            {lines.map((line, lineIdx) => (
              <span key={lineIdx}>
                {renderInline(line, `p${blockIdx}-${lineIdx}`)}
                {lineIdx < lines.length - 1 && <br />}
              </span>
            ))}
          </p>
        )
      })}
    </div>
  )
}
