const MEMORY_SIGNALS = [
  { category: 'preference', regex: /\b(i (?:prefer|like|love|hate|dislike)\b.+)/i, title: 'Personal preference' },
  { category: 'routine', regex: /\b(i (?:usually|always|never)\b.+)/i, title: 'Personal routine' },
  { category: 'constraint', regex: /\b(i (?:can(?:'|’)t|cannot|need to|must)\b.+)/i, title: 'Personal constraint' },
  { category: 'goal', regex: /\b(i (?:want to|am trying to|plan to)\b.+)/i, title: 'Personal goal' },
]

export const PERSONAL_MEMORY_EXTRACTOR_VERSION = 'rules-v1'

export function inferPersonalMemoryCandidates(messages, options = {}) {
  const inferred = []
  for (const message of messages) {
    if (message.role !== 'user') continue
    const text = typeof message.content === 'string' ? message.content.trim() : ''
    if (!text) continue
    for (const signal of MEMORY_SIGNALS) {
      const match = text.match(signal.regex)
      if (!match) continue
      const content = match[1].trim().replace(/\s+/g, ' ')
      if (content.length < 12) continue
      const temporalEvidence = extractUserTemporalEvidence(message, options)
      inferred.push({
        sourceMessageId: message.id,
        title: signal.title,
        content: content.slice(0, 2000),
        category: signal.category,
        confidence: 0.9,
        ...(temporalEvidence ? { temporalEvidence } : {}),
      })
      break
    }
    if (inferred.length >= 5) break
  }
  return inferred
}
import { extractUserTemporalEvidence } from './assistant-temporal-evidence.mjs'
