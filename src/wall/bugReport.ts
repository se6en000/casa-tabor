import type { AIMessage } from '../hooks/useAISession'

// A bug report from the assistant band (Jake, 2026-09-26: "capture the whole conversation
// log, when it happened, and what I expected compared to what it did"). One debug entry
// through the existing ingest (ai_drawer_debug_events), traced by its session id to the
// server's own events for the same turns. Pure, so it's tested without a network.

export const REPORT_CATEGORIES = ['Wrong answer', 'Wrong time or day', "Didn't hear me", 'Did the wrong thing', 'Too slow', 'Something else'] as const

export interface BugReportInput {
  messages: AIMessage[]
  /** When each message first appeared (by id), as the band saw it. */
  seenAt: Record<string, string>
  sessionId: string | null
  /** What speech recognition heard last (it can differ from what was sent). */
  heard: string
  categories: string[]
  expected: string
  happened: string
  context: Record<string, string | number | boolean | null>
}

export interface ReportConversation {
  messages: AIMessage[]
  seenAt: Record<string, string>
  sessionId: string | null
}

/**
 * What a report sends: this conversation, or — when the band or sheet was closed and
 * reopened just to report — the one before it (Jake, 2026-09-26: "this was the previous
 * conversation", sent with none).
 */
export function conversationForReport(current: ReportConversation, last: ReportConversation | null): ReportConversation & { previous: boolean } {
  if (current.messages.length === 0 && last && last.messages.length > 0) return { ...last, previous: true }
  return { ...current, previous: false }
}

export function buildBugReport(input: BugReportInput) {
  const { messages, seenAt, sessionId, heard, categories, expected, happened, context } = input
  const conversation = messages.map((m) => {
    const images = (m.imageDataUrls?.length ?? 0) + (m.imageDataUrl ? 1 : 0)
    const action = m.toolAction
      ? { tool: m.toolAction.tool, args: m.toolAction.args, shown: m.toolAction.displayText, status: m.toolAction.status }
      : undefined
    return {
      id: m.id,
      role: m.role,
      at: seenAt[m.id] ?? null,
      text: m.content,
      ...(images ? { images } : {}),
      ...(action ? { action } : {}),
      ...(m.evidence?.length ? { evidence: m.evidence.map((e) => (e as { title?: string }).title ?? null) } : {}),
    }
  })
  const words = [expected.trim() && `expected: ${expected.trim()}`, happened.trim() && `happened: ${happened.trim()}`].filter(Boolean)
  const detail = [categories.join(', '), ...words].filter(Boolean).join(' — ') || 'Bug report'
  return {
    event: 'user_bug_report',
    detail,
    sessionId: sessionId ?? undefined,
    page: String(context.surface ?? 'wall'),
    payload: {
      feedback: { categories, expected: expected.trim(), happened: happened.trim() },
      heard,
      conversation,
      context,
    },
  }
}
