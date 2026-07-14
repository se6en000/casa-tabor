const BLOCK_MARKDOWN_LINE = /^\s{0,3}(?:#{1,6}\s|[-*+]\s|\d+\.\s|>\s|```|\|.+\|)/m
const AGENDA_LINE = /^(?:all day|\d{1,2}:\d{2}\s+[ap]m)\s+—\s+/i
const LONG_PROSE_LENGTH = 260

function formatProseBlock(block) {
  if (BLOCK_MARKDOWN_LINE.test(block)) return block

  const sentences = block
    .match(/[^.!?]+[.!?]+(?:["'”)\]]|\*\*)?\s*|[^.!?]+$/g)
    ?.map((part) => part.trim())
    .filter(Boolean) ?? [block]

  if (sentences.length < 2 || (sentences.length < 3 && block.length < LONG_PROSE_LENGTH)) {
    return block
  }

  const groupSize = block.length >= LONG_PROSE_LENGTH ? 1 : 2
  const grouped = []
  for (let index = 0; index < sentences.length; index += groupSize) {
    grouped.push(sentences.slice(index, index + groupSize).join(' '))
  }
  return grouped.join('\n\n')
}

export function formatTextForMarkdown(input) {
  let normalized = input.replace(/\r\n/g, '\n').trim()
  if (!normalized) return ''

  const lines = normalized.split('\n')
  if (lines.filter((line) => AGENDA_LINE.test(line.trim())).length >= 2) {
    normalized = lines
      .map((line) => AGENDA_LINE.test(line.trim()) ? `- ${line.trim()}` : line)
      .join('\n')
  }

  return normalized
    .split(/\n{2,}/)
    .map((part) => formatProseBlock(part.trim()))
    .filter(Boolean)
    .join('\n\n')
}
