const PRIOR_CONTEXT_PATTERN =
  /\b(?:latest|last|previous|prior|earlier|past)\s+(?:chat|conversation|discussion|talk)\b|\b(?:where we left off|what (?:did )?we (?:decide|discuss|plan)(?:d)? before|pick up where we left off|use (?:our|the) earlier discussion|review my latest)\b/i

export function requestsPriorConversationContext(value) {
  return PRIOR_CONTEXT_PATTERN.test(String(value ?? '').trim())
}

function compact(value, limit) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, limit)
}

export function buildPriorConversationEvidence({
  activeConversationId = null,
  conversations = [],
  summaries = [],
  messages = [],
  maxConversations = 3,
  maxMessagesPerConversation = 6,
  maxExcerptCharacters = 2400,
} = {}) {
  const selected = conversations
    .filter((conversation) =>
      conversation?.id &&
      conversation.id !== activeConversationId &&
      !conversation.deleted_at
    )
    .sort((a, b) => Date.parse(b.updated_at ?? 0) - Date.parse(a.updated_at ?? 0))
    .slice(0, maxConversations)

  return selected.map((conversation) => {
    const summary = summaries.find((item) => item?.conversation_id === conversation.id)
    const transcript = messages
      .filter((message) => message?.conversation_id === conversation.id)
      .sort((a, b) => Number(a.sequence_number ?? 0) - Number(b.sequence_number ?? 0))
      .slice(-maxMessagesPerConversation)
      .map((message) => `${message.role === 'assistant' ? 'Casa' : 'User'}: ${compact(message.content, 600)}`)
      .join('\n')
    const excerpt = compact(summary?.content || transcript || 'No saved summary is available.', maxExcerptCharacters)
    return {
      evidence_id: `conversation:${conversation.id}`,
      source_type: 'private_conversation',
      source_id: conversation.id,
      title: compact(conversation.title || 'Private conversation', 160),
      excerpt,
      occurred_at: conversation.updated_at ?? null,
      effective_at: conversation.updated_at ?? null,
      metadata: {
        retrieval_scope: 'conversation_only',
      },
    }
  })
}
