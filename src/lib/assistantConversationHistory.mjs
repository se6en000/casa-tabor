const RETENTION_DAYS = 90

function iso(value) {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new TypeError('A valid Date is required')
  }
  return value.toISOString()
}

function requiredText(value, field) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new TypeError(`${field} is required`)
  }
  return value.trim()
}

function optionalArray(value) {
  return Array.isArray(value) ? value : undefined
}

export function buildConversationRecord({
  id,
  ownerMemberId,
  title,
  experienceMode,
  createdAt,
}) {
  const created = new Date(iso(createdAt))
  const expiresAt = new Date(created.getTime())
  expiresAt.setUTCDate(expiresAt.getUTCDate() + RETENTION_DAYS)

  return {
    id: requiredText(id, 'id'),
    owner_member_id: requiredText(ownerMemberId, 'ownerMemberId'),
    visibility: 'private',
    title: requiredText(title, 'title'),
    experience_mode: experienceMode === 'talk_plan' ? 'talk_plan' : 'do',
    created_at: created.toISOString(),
    expires_at: expiresAt.toISOString(),
  }
}

export function sanitizeConversationMessage(message) {
  if (!message || typeof message !== 'object') {
    throw new TypeError('message is required')
  }

  const result = {
    id: requiredText(message.id, 'message.id'),
    role: message.role === 'assistant' ? 'assistant' : 'user',
    content: typeof message.content === 'string' ? message.content : '',
  }

  const evidence = optionalArray(message.evidence)
  if (evidence) result.evidence = evidence

  const sourcesConsidered = optionalArray(message.sourcesConsidered)
  if (sourcesConsidered) result.sources_considered = sourcesConsidered

  const partialSources = optionalArray(message.partialSources)
  if (partialSources) result.partial_sources = partialSources

  if (message.conversationState && typeof message.conversationState === 'object') {
    result.conversation_state = message.conversationState
  }

  if (message.toolAction && typeof message.toolAction === 'object') {
    result.tool_action = {
      tool: typeof message.toolAction.tool === 'string' ? message.toolAction.tool : '',
      args: message.toolAction.args && typeof message.toolAction.args === 'object' ? message.toolAction.args : {},
      display_text: typeof message.toolAction.displayText === 'string' ? message.toolAction.displayText : '',
      status: typeof message.toolAction.status === 'string' ? message.toolAction.status : 'error',
    }
  }

  return result
}

export function buildConversationSummaryRecord({
  conversationId,
  throughMessageId,
  content,
}) {
  return {
    conversation_id: requiredText(conversationId, 'conversationId'),
    through_message_id: requiredText(throughMessageId, 'throughMessageId'),
    content: requiredText(content, 'content'),
    retrieval_scope: 'conversation_only',
  }
}

export function buildHistoryRequestOptions(sessionToken) {
  const token = requiredText(sessionToken, 'history session')
  return { headers: { 'x-casa-history-session': token } }
}
