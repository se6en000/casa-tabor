import { useCallback, useEffect, useRef, useState } from 'react'

import { sanitizeConversationMessage } from '../lib/assistantConversationHistory.mjs'
import { invokeAssistantHistory } from '../lib/assistantConversationHistoryClient'
import { supabase } from '../lib/supabase'
import type { AIMessage, AISession } from './useAISession'

const ACCESS_STORAGE_KEY = 'casa_tabor_private_history_access'
const CONVERSATION_MAP_STORAGE_KEY = 'casa_tabor_private_history_conversations'

type PrivateHistoryAccess = {
  memberId: string
  token: string
  expiresAt: string
}

type UnlockResult = {
  history_session_token?: string
  expires_at?: string
  error?: string
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
    const value = sessionStorage.getItem(key)
    return value ? JSON.parse(value) as T : null
  } catch {
    return null
  }
}

function writeJson(key: string, value: unknown) {
  try {
    sessionStorage.setItem(key, JSON.stringify(value))
  } catch {
    throw new Error('Private history could not be stored in this browser session.')
  }
}

function initialAccess() {
  const access = readJson<PrivateHistoryAccess>(ACCESS_STORAGE_KEY)
  return access && new Date(access.expiresAt).getTime() > Date.now() ? access : null
}

function initialConversationMap() {
  return readJson<Record<string, string>>(CONVERSATION_MAP_STORAGE_KEY) ?? {}
}

function conversationTitle(session: AISession) {
  const firstUserMessage = session.messages.find((message) => message.role === 'user')?.content.trim()
  if (!firstUserMessage) return 'New conversation'
  return firstUserMessage.replace(/\s+/g, ' ').slice(0, 80)
}

export function useAIConversationHistory() {
  const [access, setAccess] = useState<PrivateHistoryAccess | null>(initialAccess)
  const [error, setError] = useState<string | null>(null)
  const conversationIdsRef = useRef(initialConversationMap())
  const saveQueueRef = useRef(new Map<string, Promise<void>>())

  useEffect(() => {
    if (access && new Date(access.expiresAt).getTime() <= Date.now()) {
      sessionStorage.removeItem(ACCESS_STORAGE_KEY)
      setAccess(null)
    }
  }, [access])

  const unlock = useCallback(async (memberId: string, pin: string) => {
    setError(null)
    const { data, error: unlockError } = await supabase.functions.invoke('assistant-history', {
      body: { action: 'unlock', member_id: memberId, pin },
    })
    if (unlockError) throw unlockError
    const result = data as UnlockResult
    if (!result.history_session_token || !result.expires_at) {
      throw new Error(result.error ?? 'Private history could not be unlocked.')
    }
    const nextAccess = {
      memberId,
      token: result.history_session_token,
      expiresAt: result.expires_at,
    }
    writeJson(ACCESS_STORAGE_KEY, nextAccess)
    setAccess(nextAccess)
  }, [])

  const lock = useCallback(() => {
    sessionStorage.removeItem(ACCESS_STORAGE_KEY)
    setAccess(null)
    setError(null)
  }, [])

  const saveSession = useCallback((session: AISession) => {
    if (!access) return
    if (session.messages.length === 0) return

    const prior = saveQueueRef.current.get(session.id) ?? Promise.resolve()
    const next = prior
      .catch(() => undefined)
      .then(async () => {
        let conversationId = conversationIdsRef.current[session.id]
        if (!conversationId) {
          const created = await invokeAssistantHistory<{ conversation: { id: string } }>(access.token, {
            action: 'create_conversation',
            title: conversationTitle(session),
            experience_mode: session.experienceMode,
          })
          conversationId = created.conversation.id
          conversationIdsRef.current = { ...conversationIdsRef.current, [session.id]: conversationId }
          writeJson(CONVERSATION_MAP_STORAGE_KEY, conversationIdsRef.current)
        }
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
  }, [access])

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
    writeJson(CONVERSATION_MAP_STORAGE_KEY, conversationIdsRef.current)
    return session
  }, [access])

  const exportConversation = useCallback(async (conversationId: string) => {
    if (!access) throw new Error('Private history is locked.')
    return invokeAssistantHistory(access.token, {
      action: 'export_conversation',
      conversation_id: conversationId,
    })
  }, [access])

  return { access, error, unlock, lock, saveSession, listConversations, archiveConversation, forgetConversation, resumeConversation, exportConversation }
}
