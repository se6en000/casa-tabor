import { useCallback, useEffect, useRef, useState } from 'react'

import { useProfileSession } from '../contexts/ProfileSessionContext'
import { sanitizeConversationMessage } from '../lib/assistantConversationHistory.mjs'
import { invokeAssistantHistory } from '../lib/assistantConversationHistoryClient'
import type { AIMessage, AISession } from './useAISession'

const CONVERSATION_MAP_STORAGE_KEY = 'casa_tabor_private_history_conversations'

type PrivateHistoryAccess = {
  memberId: string
  token: string
}

export type PrivateConversation = {
  id: string
  title: string
  experience_mode: 'do' | 'talk_plan'
  created_at: string
  updated_at: string
  archived_at: string | null
  expires_at: string
}

function readJson<T>(key: string): T | null {
  try {
    const value = localStorage.getItem(key)
    return value ? JSON.parse(value) as T : null
  } catch {
    return null
  }
}

function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    throw new Error('Private history could not be stored in this browser session.')
  }
}

function conversationMapStorageKey(memberId: string) {
  return `${CONVERSATION_MAP_STORAGE_KEY}:${memberId}`
}

function conversationTitle(session: AISession) {
  const firstUserMessage = session.messages.find((message) => message.role === 'user')?.content.trim()
  if (!firstUserMessage) return 'New conversation'
  return firstUserMessage.replace(/\s+/g, ' ').slice(0, 80)
}

export function useAIConversationHistory() {
  const { profile } = useProfileSession()
  const access: PrivateHistoryAccess | null = profile && {
    memberId: profile.memberId,
    token: profile.token,
  }
  const [error, setError] = useState<string | null>(null)
  const conversationIdsRef = useRef<Record<string, string>>({})
  const conversationCreationRef = useRef(new Map<string, Promise<string | null>>())
  const saveQueueRef = useRef(new Map<string, Promise<void>>())

  useEffect(() => {
    conversationIdsRef.current = access
      ? readJson<Record<string, string>>(conversationMapStorageKey(access.memberId)) ?? {}
      : {}
  }, [access?.memberId])

  const ensureConversation = useCallback(async (session: AISession) => {
    if (!access) return null
    const existingId = conversationIdsRef.current[session.id]
    if (existingId) return existingId
    const pending = conversationCreationRef.current.get(session.id)
    if (pending) return pending
    const creation = invokeAssistantHistory<{ conversation: { id: string } }>(access.token, {
      action: 'create_conversation',
      title: conversationTitle(session),
      experience_mode: session.experienceMode,
    }).then((created) => {
      const conversationId = created.conversation.id
      conversationIdsRef.current = { ...conversationIdsRef.current, [session.id]: conversationId }
      writeJson(conversationMapStorageKey(access.memberId), conversationIdsRef.current)
      return conversationId
    }).catch((creationError: unknown) => {
      setError(creationError instanceof Error ? creationError.message : 'Private history could not be started.')
      return null
    }).finally(() => {
      conversationCreationRef.current.delete(session.id)
    })
    conversationCreationRef.current.set(session.id, creation)
    return creation
  }, [access])

  const saveSession = useCallback((session: AISession) => {
    if (!access || session.messages.length === 0) return
    const prior = saveQueueRef.current.get(session.id) ?? Promise.resolve()
    const next = prior
      .catch(() => undefined)
      .then(async () => {
        const conversationId = await ensureConversation(session)
        if (!conversationId) return
        await invokeAssistantHistory(access.token, {
          action: 'append_messages',
          conversation_id: conversationId,
          messages: session.messages.map(sanitizeConversationMessage),
        })
      })
      .catch((saveError: unknown) => {
        setError(saveError instanceof Error ? saveError.message : 'Private history could not be saved.')
      })
    saveQueueRef.current.set(session.id, next)
  }, [access, ensureConversation])

  const listConversations = useCallback(async () => {
    if (!access) return []
    const result = await invokeAssistantHistory<{ conversations: PrivateConversation[] }>(access.token, {
      action: 'list_conversations',
    })
    return result.conversations
  }, [access])

  const archiveConversation = useCallback(async (conversationId: string) => {
    if (!access) throw new Error('Private history is locked.')
    await invokeAssistantHistory(access.token, {
      action: 'archive_conversation',
      conversation_id: conversationId,
    })
  }, [access])

  const forgetConversation = useCallback(async (conversationId: string) => {
    if (!access) throw new Error('Private history is locked.')
    await invokeAssistantHistory(access.token, {
      action: 'forget_conversation',
      conversation_id: conversationId,
    })
  }, [access])

  const resumeConversation = useCallback(async (conversationId: string): Promise<AISession> => {
    if (!access) throw new Error('Private history is locked.')
    const result = await invokeAssistantHistory<{
      conversation: PrivateConversation
      messages: Array<{
        client_message_id: string
        role: 'user' | 'assistant'
        content: string
        evidence: AIMessage['evidence']
        sources_considered: string[]
        partial_sources: string[]
        conversation_state: AIMessage['conversationState']
        tool_action: {
          tool: string
          args: Record<string, unknown>
          display_text: string
          status: NonNullable<AIMessage['toolAction']>['status']
        } | null
      }>
    }>(access.token, { action: 'get_conversation', conversation_id: conversationId })
    const session: AISession = {
      id: result.conversation.id,
      created_at: result.conversation.created_at,
      experienceMode: result.conversation.experience_mode,
      messages: result.messages.map((message) => ({
        id: message.client_message_id,
        role: message.role,
        content: message.content,
        evidence: message.evidence ?? undefined,
        sourcesConsidered: message.sources_considered ?? undefined,
        partialSources: message.partial_sources ?? undefined,
        conversationState: message.conversation_state ?? undefined,
        toolAction: message.tool_action ? {
          tool: message.tool_action.tool,
          args: message.tool_action.args,
          displayText: message.tool_action.display_text,
          status: message.tool_action.status,
        } : undefined,
      })),
    }
    conversationIdsRef.current = { ...conversationIdsRef.current, [session.id]: conversationId }
    writeJson(conversationMapStorageKey(access.memberId), conversationIdsRef.current)
    return session
  }, [access])

  const exportConversation = useCallback(async (conversationId: string) => {
    if (!access) throw new Error('Private history is locked.')
    return invokeAssistantHistory(access.token, {
      action: 'export_conversation',
      conversation_id: conversationId,
    })
  }, [access])

  return {
    access,
    error,
    ensureConversation,
    saveSession,
    listConversations,
    archiveConversation,
    forgetConversation,
    resumeConversation,
    exportConversation,
  }
}
