import type { AIMessage } from '../hooks/useAISession'

// The Wall's assistant band (boards 03b/03c): what it shows, derived from the
// existing assistant's messages. Pure, so it's tested without the network.

const MAX_ANSWER_CHARS = 300

/** Plain spoken-style text: markdown removed, list items joined as sentences, cut at a sentence when long. */
export function bandAnswer(content: string): string {
  const lines = content
    .replace(/\*\*|__|`/g, '')
    .split('\n')
    .map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)]|#{1,6})\s+/, '').trim())
    .filter(Boolean)
  const text = lines
    .map((line, i) => (i < lines.length - 1 && !/[.!?:]$/.test(line) ? `${line}.` : line))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (text.length <= MAX_ANSWER_CHARS) return text
  const clipped = text.slice(0, MAX_ANSWER_CHARS)
  const end = Math.max(clipped.lastIndexOf('. '), clipped.lastIndexOf('! '), clipped.lastIndexOf('? '))
  return end > 0 ? clipped.slice(0, end + 1) : `${clipped.trimEnd()}…`
}

export function latestExchange(messages: AIMessage[]): { question: string | null; answer: AIMessage | null } {
  const lastUser = [...messages].map((m, i) => ({ m, i })).reverse().find(({ m }) => m.role === 'user')
  if (!lastUser) return { question: null, answer: null }
  const answer = messages.slice(lastUser.i + 1).reverse().find((m) => m.role === 'assistant') ?? null
  return { question: lastUser.m.content, answer }
}

/** The latest single action waiting for a yes (multi-item batches still use the full assistant). */
export function pendingAction(messages: AIMessage[]): AIMessage | null {
  return [...messages].reverse().find((m) => m.toolAction?.status === 'pending') ?? null
}

/** The calendar item an answer is about, so the wall can outline it. */
export function answerEventId(message: AIMessage | null): string | null {
  if (!message) return null
  const state = message.conversationState
  if (state && state.activeEntityType === 'event') return state.activeEventId
  return message.toolAction?.resultEventId ?? null
}

export type BandState = 'READY' | 'LISTENING' | 'THINKING' | 'ANSWERED' | 'NEEDS A YES'

export function bandState(input: { listening: boolean; loading: boolean; answer: AIMessage | null; pending: AIMessage | null }): BandState {
  if (input.listening) return 'LISTENING'
  if (input.loading || input.answer?.streaming) return 'THINKING'
  if (input.pending) return 'NEEDS A YES'
  return input.answer ? 'ANSWERED' : 'READY'
}

/** useSpeechInput's protocol: a final transcript, then "__SEND__" meaning "send what was captured". */
export const SEND_MARKER = '__SEND__'

export function voiceFinal(captured: string, text: string): { captured: string; toSend: string | null } {
  if (text === SEND_MARKER) return { captured: '', toSend: captured.trim() || null }
  return { captured: text.trim(), toSend: null }
}
