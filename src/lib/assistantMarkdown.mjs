const BLOCK_MARKDOWN_LINE = /^\s{0,3}(?:#{1,6}\s|[-*+]\s|\d+\.\s|>\s|```|\|.+\|)/m
const AGENDA_LINE = /^(?:all day|\d{1,2}:\d{2}\s+[ap]m)\s+—\s+/i
const LONG_PROSE_LENGTH = 260
const UUID_PATTERN = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
const EVIDENCE_CITATION_PATTERN = new RegExp(
  `\\s*\\[\\s*(?:evidence_id\\s*:\\s*)?${UUID_PATTERN}\\s*:\\s*${UUID_PATTERN}\\s*\\]`,
  'gi',
)
const EVIDENCE_CITATION_LIST_PATTERN = /\s*\[\s*evidence_id\s*:[^\]]+\]/gi
const LEGACY_EVENT_ID_PATTERN = new RegExp(`\\s*\\[ID:${UUID_PATTERN}\\]`, 'gi')
const RAW_CASA_EVENT_LINK_PATTERN = /(?<!\]\()casa:\/\/event\/[^\s)\]]+/gi

export function stripEvidenceCitationMarkers(input) {
  return String(input ?? '')
    .replace(EVIDENCE_CITATION_PATTERN, '')
    .replace(EVIDENCE_CITATION_LIST_PATTERN, '')
    .replace(LEGACY_EVENT_ID_PATTERN, '')
    .replace(RAW_CASA_EVENT_LINK_PATTERN, '')
    .replace(/[ \t]{2,}/g, ' ')
}

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
