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

function errorMessage(error: unknown) {
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
  if (error) throw new Error(errorMessage(error))
  if (data?.error) throw new Error(String(data.error))
  return data as T
}
