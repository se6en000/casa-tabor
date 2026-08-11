import { supabase } from './supabase'
import { buildHistoryRequestOptions } from './assistantConversationHistory.mjs'

export type HistoryConversation = {
  id: string
  title: string
  experience_mode: 'do' | 'talk_plan'
  created_at: string
  updated_at: string
  archived_at: string | null
  expires_at: string
}

async function errorMessage(error: unknown) {
  const response = error && typeof error === 'object' && 'context' in error
    ? (error as { context?: unknown }).context
    : null
  if (response instanceof Response) {
    try {
      const payload = await response.clone().json() as { error?: unknown }
      if (typeof payload.error === 'string' && payload.error) return payload.error
    } catch {
      // Use the transport error below when the response has no JSON error payload.
    }
  }
  return error instanceof Error ? error.message : 'Private history is unavailable.'
}

export async function invokeAssistantHistory<T>(
  sessionToken: string,
  body: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await supabase.functions.invoke('assistant-history', {
    body,
    ...buildHistoryRequestOptions(sessionToken),
  })
  if (error) throw new Error(await errorMessage(error))
  if (data?.error) throw new Error(String(data.error))
  return data as T
}

export async function invokeHistoryUnlock(memberId: string, pin: string) {
  const { data, error } = await supabase.functions.invoke('assistant-history', {
    body: { action: 'unlock', member_id: memberId, pin },
  })
  if (error) throw new Error(await errorMessage(error))
  const result = data as { history_session_token?: string; error?: string }
  if (!result.history_session_token) {
    throw new Error(result.error ?? 'Private history could not be unlocked.')
  }
  return { history_session_token: result.history_session_token }
}
