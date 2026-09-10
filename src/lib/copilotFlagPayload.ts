import type { AIMessage } from '../hooks/useAISession'

const TITLE_MAX_LENGTH = 80

export interface CopilotFlagInput {
  messages: AIMessage[]
  note: string
  page: string
  sessionId?: string | null
  deviceId?: string | null
  memberName?: string | null
}

export interface CopilotFlagRecord {
  title: string
  details: string | null
  severity: 'medium'
  status: 'open'
  source: 'user'
  page: string
  session_id: string | null
  device_id: string | null
  member_name: string | null
  transcript: AIMessage[]
}

// Inserts into the existing ai_bug_reports table (shared with the assistant's own
// voice-driven bug_report tool, source='assistant') so the household has one bug
// backlog, not two. title/details stay short and human-readable; the full message
// objects (not just visible text) go in `transcript` so a later triage pass can see
// tool/evidence data behind a reply that looked too thin in the UI.
export function buildCopilotFlagRecord(input: CopilotFlagInput): CopilotFlagRecord {
  const note = input.note.trim()
  const title = note.length > 0
    ? note.slice(0, TITLE_MAX_LENGTH)
    : `Flagged from copilot chat — ${input.page}`

  return {
    title,
    details: note.length > 0 ? note : null,
    severity: 'medium',
    status: 'open',
    source: 'user',
    page: input.page,
    session_id: input.sessionId ?? null,
    device_id: input.deviceId ?? null,
    member_name: input.memberName ?? null,
    transcript: input.messages,
  }
}
