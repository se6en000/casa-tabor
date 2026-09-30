import type { AIMessage } from '../hooks/useAISession'
import { timeRange } from './assistantCard.ts'

// The Wall's assistant band (boards 03b/03c): what it shows, derived from the
// existing assistant's messages. Pure, so it's tested without the network.

const MAX_ANSWER_CHARS = 300

/** Plain spoken-style text: markdown removed, list items joined as sentences, cut at a sentence when long. */
export function bandAnswer(content: string, maxChars = MAX_ANSWER_CHARS): string {
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
  if (text.length <= maxChars) return text
  const clipped = text.slice(0, maxChars)
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

/**
 * The one day an answer is about, so the wall can open it (Jake, 2026-09-29: "Show me the events on
 * October 17th" … "Can you open this day for me" — it couldn't). Casa names it (`show_day`, opened when
 * he asked to open or see it); a quick answer whose events all fall on one day offers it too. Today is
 * already on the wall; a range across days (the long Oct 17 answer carried Sep 30 – Oct 18) names none.
 */
export function answerDay(message: AIMessage | null, now: Date): { date: Date; open: boolean } | null {
  if (!message) return null
  const local = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const named = message.showDay
  if (named) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(named.date)
    if (!m) return null
    const date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
    return date.toDateString() === now.toDateString() ? null : { date, open: Boolean(named.open) }
  }
  const state = message.conversationState
  if (state?.activeEntityType !== 'calendar_range') return null
  const start = new Date(state.range.start)
  const end = new Date(state.range.end)
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) return null
  if (start.toDateString() !== end.toDateString() || start.toDateString() === now.toDateString()) return null
  return { date: local(start), open: false }
}

/** The calendar item an answer is about, so the wall can outline it. */
export function answerEventId(message: AIMessage | null): string | null {
  if (!message) return null
  // An add points at what it added, once it's added — never at an event it only sounded like.
  if (message.toolAction?.tool === 'create_event') return message.toolAction.status === 'done' ? message.toolAction.resultEventId ?? null : null
  const state = message.conversationState
  if (state && state.activeEntityType === 'event') return state.activeEventId
  return message.toolAction?.resultEventId ?? null
}

export type BandState = 'READY' | 'LISTENING' | 'THINKING' | 'ANSWERED' | 'NEEDS A YES'

export function bandState(input: { listening: boolean; loading: boolean; answer: AIMessage | null; pending: AIMessage | null }): BandState {
  // A card waiting for a yes says so, even while the mic stays open for the answer (P3.13).
  if (input.pending && !input.loading) return 'NEEDS A YES'
  if (input.listening) return 'LISTENING'
  if (input.loading || input.answer?.streaming) return 'THINKING'
  return input.answer ? 'ANSWERED' : 'READY'
}

/** useSpeechInput's protocol: a final transcript, then "__SEND__" meaning "send what was captured". */
export const SEND_MARKER = '__SEND__'

export function voiceFinal(captured: string, text: string): { captured: string; toSend: string | null } {
  if (text === SEND_MARKER) return { captured: '', toSend: captured.trim() || null }
  return { captured: text.trim(), toSend: null }
}

/** A confirmation card's words: the server's display text without its markdown. */
export function cardText(displayText: string): string {
  return displayText.replace(/\*\*|__|`/g, '')
}

/** The turns before the latest question (board 06a's thread), so nobody wonders what it remembers. */
export function threadTurns(messages: AIMessage[], max = 4): Array<{ role: 'user' | 'assistant'; text: string }> {
  const lastUser = messages.map((m) => m.role).lastIndexOf('user')
  return messages
    .slice(0, Math.max(0, lastUser))
    .filter((m) => m.content.trim())
    .slice(-max)
    .map((m) => ({ role: m.role, text: m.role === 'assistant' ? bandAnswer(m.content, 160) : m.content.trim() }))
}

interface ChoiceEvent {
  id: string
  title: string
  start_time: string
  end_time: string
  all_day?: boolean | null
  members?: Array<{ family_member_id?: string | null; role?: string | null }> | null
}

export interface WhichOne {
  choices: Array<{ id: string; title: string; when: string; peopleIds: string[]; say: string }>
  /** The change that waits for the pick ("→ 5:00 PM"), or null when it can't be told. */
  kept: string | null
}

const wallTime = (d: Date) => d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })

/** "Which one?" (board 06c): the server's candidates as tiles; a tap says the name, as a voice answer would. */
export function whichOne(answer: AIMessage | null, events: ChoiceEvent[]): WhichOne | null {
  const state = answer?.conversationState
  if (!state || state.activeEntityType !== 'calendar_clarification') return null
  const choices = state.candidateEvents.flatMap((c) => {
    const e = events.find((x) => x.id === c.id)
    if (!e) return []
    const start = new Date(e.start_time)
    const end = new Date(e.end_time)
    const day = start.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase()
    const time = e.all_day ? 'ALL DAY' : end > start ? timeRange(start, end) : wallTime(start)
    const peopleIds = (e.members ?? []).filter((m) => m.role !== 'driver').map((m) => m.family_member_id).filter((id): id is string => Boolean(id))
    return [{ id: e.id, title: e.title, when: `${day} · ${time}`, peopleIds, say: e.title }]
  })
  if (choices.length === 0) return null
  const { tool, args } = state.pendingMutation
  const start = typeof args.start === 'string' ? new Date(args.start) : null
  const kept = tool === 'delete_event'
    ? '→ remove it'
    : start && Number.isFinite(start.getTime())
      ? `→ ${wallTime(start)}`
      : typeof args.driver_name === 'string' && args.driver_name.trim()
        ? `→ ${args.driver_name.trim()} drives`
        : null
  return { choices, kept }
}

/** An answer that offers to do something ("Want me to make him the driver?") gets a one-tap yes (board 06d). */
export function nextStep(answer: AIMessage | null): { label: string; say: string } | null {
  if (!answer || answer.toolAction) return null
  // The offer is a question, wherever it sits ("Want me to make her the driver? Jake would be off the hook.").
  const sentences = answer.content.trim().split(/(?<=[.!?])\s+/)
  if (!sentences.some((x) => x.endsWith('?') && /\b(want me to|should I|shall I|would you like me to|do you want me to)\b/i.test(x))) return null
  return { label: 'Yes, do that', say: 'Yes, do that' }
}

/**
 * The conversation without asides — words the wall's open mic heard that weren't said to Casa
 * (P3.13): each aside and the question it answered are dropped. `asidesInARow` counts the run
 * at the end, so the band can slip away when the room is just talking.
 */
export function withoutAsides<T extends Pick<AIMessage, 'role'> & { aside?: boolean }>(messages: T[]): { messages: T[]; asidesInARow: number } {
  const kept: T[] = []
  let asidesInARow = 0
  for (const m of messages) {
    if (m.role === 'assistant' && m.aside) {
      if (kept.at(-1)?.role === 'user') kept.pop()
      asidesInARow += 1
      continue
    }
    if (m.role === 'assistant') asidesInARow = 0
    kept.push(m)
  }
  return { messages: kept, asidesInARow }
}

/**
 * Dismissing Casa without the small button (Jake, 2026-09-30): a tap outside, a swipe down, Esc. With a card
 * waiting for a yes, a tap outside first asks ("Tap again to close — the card isn't saved"); a second tap
 * within 4 seconds closes. A swipe down or Esc is on purpose, and closes.
 */
export function dismissStep({ how, waiting, armedAt, now }: { how: 'tap_outside' | 'swipe_down' | 'escape'; waiting: boolean; armedAt: number; now: number }): 'close' | 'arm' {
  if (how !== 'tap_outside' || !waiting) return 'close'
  return armedAt > 0 && now - armedAt <= 4000 ? 'close' : 'arm'
}

/** A swipe down on the band: at least 140 px down, more down than sideways, within 0.9 s. */
export function isSwipeDown(start: { x: number; y: number; t: number }, end: { x: number; y: number; t: number }): boolean {
  const dy = end.y - start.y
  const dx = Math.abs(end.x - start.x)
  return dy >= 140 && dx < dy / 2 && end.t - start.t <= 900
}

/**
 * The small "Listening…" pill (2026-09-30): a wake-word open shows only the pill until words are heard, a
 * conversation is under way, or he taps it open; the mic button, on purpose, opens the full band at once.
 */
export function bandCompact({ viaWake, heard, messages, expanded }: { viaWake: boolean; heard: string; messages: number; expanded: boolean }): boolean {
  return viaWake && !expanded && messages === 0 && !heard.trim()
}

// Answers already acted on (an email review or a day opened), for as long as the page is open: the band keeps
// its conversation, so its last answer is still there each time it opens (2026-09-30: the finished email
// review reopened on every wake, and the band never started listening).
const actedOn = new Set<string>()
/** True the first time a key is seen on this page, false after. */
export function firstTime(key: string): boolean {
  if (actedOn.has(key)) return false
  actedOn.add(key)
  return true
}
