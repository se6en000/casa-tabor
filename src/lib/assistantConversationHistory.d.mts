export type HistoryConversationInput = {
  id: string
  ownerMemberId: string
  title: string
  experienceMode: 'do' | 'talk_plan'
  createdAt: Date
}

export function buildConversationRecord(input: HistoryConversationInput): {
  id: string
  owner_member_id: string
  visibility: 'private'
  title: string
  experience_mode: 'do' | 'talk_plan'
  created_at: string
  expires_at: string
}

export function sanitizeConversationMessage(message: unknown): {
  id: string
  role: 'user' | 'assistant'
  content: string
  evidence?: unknown[]
  sources_considered?: unknown[]
  partial_sources?: unknown[]
  conversation_state?: Record<string, unknown>
  tool_action?: {
    tool: string
    args: Record<string, unknown>
    display_text: string
    status: string
  }
}

export function buildConversationSummaryRecord(input: {
  conversationId: string
  throughMessageId: string
  content: string
}): {
  conversation_id: string
  through_message_id: string
  content: string
  retrieval_scope: 'conversation_only'
}

export function buildHistoryRequestOptions(sessionToken: string): {
  headers: { 'x-casa-history-session': string }
}
