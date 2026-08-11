export const PROJECT_EXTRACTOR_VERSION = 'rules-v2'

const ITEM_SIGNALS = [
  { kind: 'goal', regex: /\b(?:my|our) goal is(?: to)?\s+([^.!?]+)/i },
  { kind: 'decision', regex: /\bi decided to\s+([^.!?]+)/i },
  { kind: 'commitment', regex: /\bi(?:'ll| will| need to| committed to)\s+([^.!?]+)/i },
  { kind: 'open_question', regex: /\b(?:we|i) need to (?:figure out|decide)\s+([^.!?]+)/i },
  { kind: 'next_action', regex: /\bnext (?:step|action) is(?: to)?\s+([^.!?]+)/i },
]

function clean(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().replace(/[,:;\s]+$/, '')
}

function projectTitle(text) {
  const patterns = [
    /\b(?:create|start|track)\s+(?:a\s+)?new goal to\s+([^.!?]+)/i,
    /\bhelp me plan(?: for)?(?: the| a)?\s+([^.!?]+)/i,
    /\bi(?:'m| am) planning(?: for)?(?: the| a)?\s+([^.!?]+)/i,
    /\bi(?:'m| am) working on(?: the| a)?\s+([^.!?]+)/i,
    /\bproject (?:called|named)\s+([^.!?]+)/i,
  ]
  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match) {
      const title = clean(match[1])
        .replace(/\b(?:by|before|this|next)\s+(?:week|weekend|month|year)\b.*$/i, '')
        .replace(/^my\s+/i, '')
        .replace(/^(book|build|finish|plan|prepare|organize)\s+my\s+/i, '$1 ')
        .trim()
      return title ? `${title[0].toUpperCase()}${title.slice(1)}`.slice(0, 160) : null
    }
  }
  return null
}

export function projectTopicKey(value) {
  return clean(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120)
}

export function inferProjectTurn(message) {
  if (message?.role !== 'user') return null
  const text = clean(message.content)
  if (!text || text.length < 12) return null

  const changedDecision = text.match(/\bi changed my mind\s*[:,-]?\s*([^.!?]+)/i)
  const items = []
  if (changedDecision) {
    items.push({
      kind: 'decision',
      content: clean(changedDecision[1]).slice(0, 1000),
      supersedesPrior: true,
    })
  } else {
    for (const signal of ITEM_SIGNALS) {
      const match = text.match(signal.regex)
      if (!match) continue
      items.push({
        kind: signal.kind,
        content: clean(match[1]).slice(0, 1000),
        supersedesPrior: false,
      })
    }
  }

  const title = projectTitle(text)
  if (title && /\b(?:create|start|track)\s+(?:a\s+)?new goal to\b/i.test(text)) {
    const goal = clean(text.match(/\b(?:create|start|track)\s+(?:a\s+)?new goal to\s+([^.!?]+)/i)?.[1])
      .replace(/^(book|build|finish|plan|prepare|organize)\s+my\s+/i, '$1 ')
    items.unshift({
      kind: 'goal',
      content: `${goal[0]?.toUpperCase() ?? ''}${goal.slice(1)}`.slice(0, 1000),
      supersedesPrior: false,
    })
  }
  if (!title && items.length === 0) return null
  return {
    sourceMessageId: message.id,
    title,
    summary: title ? `Planning ${title}` : null,
    items: items.slice(0, 6),
  }
}
