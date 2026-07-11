const STOP_WORDS = new Set([
  'a', 'an', 'the', 'for', 'to', 'of', 'on', 'at', 'in', 'and', 'or',
  'lets', 'let', 'me', 'please', 'prepare', 'prep', 'talk', 'about', 'find',
  'look', 'up', 'details', 'detail', 'event', 'appointment', 'calendar',
  'today', 'tomorrow', 'this', 'that', 'my', 'our',
])

function tokens(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token) && !/^\d+(?:st|nd|rd|th)?$/.test(token))
}

export function resolveUniqueEventTitle(text, events) {
  const input = String(text ?? '').trim()
  if (!/\b(prepare|prep|talk about|look up|find|details?|party|birthday)\b/i.test(input)) return null
  const inputTokens = new Set(tokens(input))
  if (inputTokens.size < 2) return null

  const ranked = (events ?? [])
    .map((event) => {
      const titleTokens = [...new Set(tokens(event?.title))]
      const overlap = titleTokens.filter((token) => inputTokens.has(token)).length
      const coverage = titleTokens.length > 0 ? overlap / titleTokens.length : 0
      const precision = inputTokens.size > 0 ? overlap / inputTokens.size : 0
      return { event, overlap, score: coverage * 0.7 + precision * 0.3 }
    })
    .filter((candidate) => candidate.overlap >= 2)
    .sort((a, b) => b.score - a.score)

  const top = ranked[0]
  const second = ranked[1]
  if (!top || top.score < 0.55 || (second && top.score - second.score < 0.2)) return null
  return top.event
}
