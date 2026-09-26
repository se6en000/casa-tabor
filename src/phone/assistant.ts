import type { AIMessage } from '../hooks/useAISession'

// The phone's assistant (board 05e, Say it): the conversation as plain lines. Pure, so
// it's tested without the network.

export interface PhoneLine {
  id: string
  role: 'user' | 'assistant'
  text: string
}

/** Markdown removed; each line (a list item) kept on its own line — the phone has room to read a list. */
function plain(content: string): string {
  return content
    .replace(/\*\*|__|`/g, '')
    .split('\n')
    .map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)]|#{1,6})\s+/, '').trim())
    .filter(Boolean)
    .join('\n')
}

/** Questions and answers in order, markdown removed; an action with no words shows what it would do. */
export function phoneTranscript(messages: Array<Pick<AIMessage, 'id' | 'role' | 'content'> & Partial<Pick<AIMessage, 'toolAction' | 'streaming'>>>): PhoneLine[] {
  return messages.flatMap((m) => {
    if (m.role !== 'user' && m.role !== 'assistant') return []
    const text = m.role === 'user' ? m.content.trim() : plain(m.content) || (m.toolAction?.displayText ?? '')
    return text ? [{ id: m.id, role: m.role, text }] : []
  })
}
