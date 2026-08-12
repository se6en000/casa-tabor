export const PROJECT_EXTRACTOR_VERSION = 'rules-v3'

const ITEM_SIGNALS = [
  {
    kind: 'goal',
    regexes: [
      /\b(?:my|our) goal is(?: to)?\s+([^.!?]+)/i,
      /\b(?:i|we) want to\s+([^.!?]+)/i,
      /\baiming to\s+([^.!?]+)/i,
      /\bobjective is(?: to)?\s+([^.!?]+)/i,
    ],
  },
  {
    kind: 'decision',
    regexes: [
      /\b(?:i|we) decided (?:to|on)\s+([^.!?]+)/i,
      /\b(?:i|we) chose\s+([^.!?]+)/i,
      /\b(?:i|we) settled on\s+([^.!?]+)/i,
      /\b(?:let's|we'll) go with\s+([^.!?]+)/i,
      /\bdecided:\s*([^.!?]+)/i,
    ],
  },
  {
    kind: 'commitment',
    regexes: [
      /\bi(?:'ll| will| need to| committed to)\s+([^.!?]+)/i,
      /\b(?:i|we) should\s+([^.!?]+)/i,
      /\b(?:i|we) promised to\s+([^.!?]+)/i,
    ],
  },
  {
    kind: 'open_question',
    regexes: [
      /\b(?:we|i) need to (?:figure out|decide|determine|resolve)\s+([^.!?]+)/i,
      /\bstill (?:need to|need|unsure|wondering) (?:about|whether|how|if|what)\s+([^.!?]+)/i,
      /\bquestion is\s+([^.!?]+)/i,
      /\bhow should we\s+([^.!?]+)/i,
    ],
  },
  {
    kind: 'next_action',
    regexes: [
      /\bnext (?:step|action|thing) is(?: to)?\s+([^.!?]+)/i,
      /\bfirst (?:step|thing) is(?: to)?\s+([^.!?]+)/i,
      /\btodo:\s*([^.!?]+)/i,
      /\baction item:\s*([^.!?]+)/i,
      /\bto-do:\s*([^.!?]+)/i,
    ],
  },
]

function clean(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().replace(/[,:;\s]+$/, '')
}

function projectTitle(text, fallbackTitle) {
  const patterns = [
    /\b(?:create|start|track)\s+(?:a\s+)?new goal to\s+([^.!?]+)/i,
    /\bhelp me plan(?: for)?(?: the| a)?\s+([^.!?]+)/i,
    /\b(?:let's|let us|can we|want to)\s+plan(?: for)?(?: the| a)?\s+([^.!?]+)/i,
    /\bi(?:'m| am) planning(?: for)?(?: the| a)?\s+([^.!?]+)/i,
    /\bi(?:'m| am) working on(?: the| a)?\s+([^.!?]+)/i,
    /\bproject (?:called|named|for|about)\s+([^.!?]+)/i,
    /\bideas for\s+(?:the\s+|a\s+)?([^.!?]+)/i,
    /\bhelp (?:me|us) (?:organize|prepare|build)\s+(?:the\s+|a\s+)?([^.!?]+)/i,
  ]
  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match) {
      const title = clean(match[1])
        .replace(/\b(?:by|before|this|next)\s+(?:week|weekend|month|year)\b.*$/i, '')
        .replace(/^my\s+/i, '')
        .replace(/^(book|build|finish|plan|prepare|organize)\s+my\s+/i, '$1 ')
        .trim()
      if (title) {
        return `${title[0].toUpperCase()}${title.slice(1)}`.slice(0, 160)
      }
    }
  }

  if (fallbackTitle) {
    const cleanedFallback = clean(fallbackTitle)
    if (cleanedFallback && !/^new conversation$/i.test(cleanedFallback)) {
      return `${cleanedFallback[0].toUpperCase()}${cleanedFallback.slice(1)}`.slice(0, 160)
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

export function inferProjectTurn(message, options = {}) {
  const text = clean(message?.content)
  if (!text || text.length < 8) return null

  const isUser = message?.role === 'user'
  const isAssistant = message?.role === 'assistant'
  if (!isUser && !isAssistant) return null

  const changedDecision = isUser && text.match(/\bi changed my mind\s*[:,-]?\s*([^.!?]+)/i)
  const items = []
  if (changedDecision) {
    items.push({
      kind: 'decision',
      content: clean(changedDecision[1]).slice(0, 1000),
      supersedesPrior: true,
    })
  } else {
    for (const signal of ITEM_SIGNALS) {
      for (const regex of signal.regexes) {
        const match = text.match(regex)
        if (!match) continue
        items.push({
          kind: signal.kind,
          content: clean(match[1]).slice(0, 1000),
          supersedesPrior: false,
        })
        break
      }
    }
  }

  const title = projectTitle(text, options.conversationTitle)
  if (title && /\b(?:create|start|track)\s+(?:a\s+)?new goal to\b/i.test(text)) {
    const goal = clean(text.match(/\b(?:create|start|track)\s+(?:a\s+)?new goal to\s+([^.!?]+)/i)?.[1])
      .replace(/^(book|build|finish|plan|prepare|organize)\s+my\s+/i, '$1 ')
    if (goal) {
      items.unshift({
        kind: 'goal',
        content: `${goal[0]?.toUpperCase() ?? ''}${goal.slice(1)}`.slice(0, 1000),
        supersedesPrior: false,
      })
    }
  }

  if (isAssistant && items.length === 0) return null
  if (!title && items.length === 0) return null

  return {
    sourceMessageId: message.id,
    title,
    summary: title ? `Planning ${title}` : null,
    items: items.slice(0, 6),
  }
}
