import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

export interface AIMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  imageDataUrl?: string
  toolAction?: {
    tool: string
    args: Record<string, unknown>
    displayText: string
    status: 'pending' | 'loading' | 'done' | 'error' | 'cancelled'
    errorMsg?: string
    resultEventId?: string
  }
}

export interface AISession {
  id: string
  created_at: string
  messages: AIMessage[]
}

const IDLE_TIMEOUT_MS = 12 * 60 * 60 * 1000 // 12 hours

export function useAISession() {
  const [session, setSession] = useState<AISession | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadSession()
  }, [])

  async function loadSession() {
    setLoading(true)
    try {
      const { data } = await supabase
        .from('ai_sessions')
        .select('id, created_at, messages')
        .is('ended_at', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      if (data) {
        const age = Date.now() - new Date(data.created_at).getTime()
        if (age > IDLE_TIMEOUT_MS) {
          await supabase.from('ai_sessions').update({ ended_at: new Date().toISOString() }).eq('id', data.id)
          setSession(null)
        } else {
          setSession({ id: data.id, created_at: data.created_at, messages: (data.messages as AIMessage[]) ?? [] })
        }
      } else {
        setSession(null)
      }
    } catch {
      setSession(null)
    }
    setLoading(false)
  }

  async function startNewSession(): Promise<AISession> {
    await supabase.from('ai_sessions').update({ ended_at: new Date().toISOString() }).is('ended_at', null)
    const { data } = await supabase.from('ai_sessions').insert({ messages: [] }).select('id, created_at, messages').single()
    const newSession: AISession = { id: data!.id, created_at: data!.created_at, messages: [] }
    setSession(newSession)
    return newSession
  }

  async function endSession() {
    if (!session) return
    await supabase.from('ai_sessions').update({ ended_at: new Date().toISOString() }).eq('id', session.id)
    setSession(null)
  }

  const saveMessages = useCallback(async (sessionId: string, messages: AIMessage[]) => {
    const toSave = messages.map(m => ({
      id: m.id,
      role: m.role,
      content: m.content,
    }))
    await supabase.from('ai_sessions').update({ messages: toSave }).eq('id', sessionId)
  }, [])

  return { session, loading, startNewSession, endSession, saveMessages, setSession }
}
