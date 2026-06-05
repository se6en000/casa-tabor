import { useState, useCallback, useRef, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import type { EventWithDetails } from './useCalendarEvents'
import type { FamilyMember } from '../types'
import { useAISession, type AIMessage } from './useAISession'

export type { AIMessage }

export interface AssistantContext {
  page: string
  events: EventWithDetails[]
  family: FamilyMember[]
  homeCity?: string
}

const genId = (): string =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36)

const GOODBYE_PHRASES = /\b(thank you|thanks|goodbye|bye|that'?s all|all done|good night|ciao|close session|new session|start over|end session)\b/i

function buildContext(ctx: AssistantContext) {
  const now = new Date()
  const offsetMins = -now.getTimezoneOffset()
  const offsetSign = offsetMins >= 0 ? '+' : '-'
  const offsetAbs = Math.abs(offsetMins)
  const utcOffset = `${offsetSign}${String(Math.floor(offsetAbs / 60)).padStart(2, '0')}:${String(offsetAbs % 60).padStart(2, '0')}`

  return {
    page: ctx.page,
    currentDate: now.toLocaleString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }),
    utcOffset,
    events: ctx.events.map(e => ({
      id: e.id,
      title: e.title,
      start_time: e.start_time,
      end_time: e.end_time,
      location_name: e.location_name ?? null,
      members: e.members.map(m => m.family_member?.name ?? '').filter(Boolean),
      category: e.enrichment?.category ?? null,
    })),
    family: ctx.family.map(f => ({ id: f.id, name: f.name })),
    homeCity: ctx.homeCity,
  }
}

export function useAIAssistant(ctx: AssistantContext) {
  const { session, loading: sessionLoading, startNewSession, endSession, saveMessages } = useAISession()
  const [messages, setMessages] = useState<AIMessage[]>([])
  const [loading, setLoading] = useState(false)
  const sessionRef = useRef(session)
  const ctxRef = useRef(ctx)
  useEffect(() => { sessionRef.current = session }, [session])
  useEffect(() => { ctxRef.current = ctx })

  // Sync messages from session when session loads
  useEffect(() => {
    if (!sessionLoading && session) {
      setMessages(session.messages)
    } else if (!sessionLoading && !session) {
      setMessages([])
    }
  }, [sessionLoading, session?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const startFresh = useCallback(() => {
    setMessages([])
    startNewSession()
  }, [startNewSession])

  const send = useCallback(async (text: string, image?: { dataUrl: string; mimeType: string }) => {
    // Check for goodbye phrase → end session
    if (GOODBYE_PHRASES.test(text)) {
      const farewell: AIMessage = { id: genId(), role: 'assistant', content: "You're welcome! Session saved. Say hi when you need me 👋" }
      setMessages(prev => {
        const updated = [...prev, { id: genId(), role: 'user' as const, content: text }, farewell]
        if (sessionRef.current) saveMessages(sessionRef.current.id, updated)
        return updated
      })
      endSession()
      return
    }

    const userMsg: AIMessage = { id: genId(), role: 'user', content: text, imageDataUrl: image?.dataUrl }
    setMessages(prev => [...prev, userMsg])
    setLoading(true)

    let activeSession = sessionRef.current
    if (!activeSession) {
      activeSession = startNewSession()
    }

    const imagePayload = image
      ? { mimeType: image.mimeType, data: image.dataUrl.replace(/^data:[^;]+;base64,/, '') }
      : undefined

    try {
      const currentMessages = [...(activeSession.messages ?? []), userMsg]
      const allMsgsForApi = currentMessages.map(m => ({ role: m.role, content: m.content }))

      const invokePromise = supabase.functions.invoke('ai-assistant', {
        body: {
          messages: allMsgsForApi,
          context: buildContext(ctxRef.current),
          image: imagePayload,
          session_id: activeSession.id,
        },
      })
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('AI request timed out')), 30000)
      )
      const { data, error } = await Promise.race([invokePromise, timeoutPromise]) as Awaited<typeof invokePromise>
      if (error) throw error

      let assistantMsg: AIMessage

      if (data.type === 'error') {
        const isQuota = data.code === 'quota_exceeded'
        assistantMsg = {
          id: genId(),
          role: 'assistant',
          content: isQuota
            ? '⚠️ AI quota reached for today. Go to Settings → AI to check your billing.'
            : `Sorry, something went wrong: ${data.message ?? 'unknown error'}`,
        }
      } else if (data.type === 'tool_action') {
        const displayText = (data.display_text as string) ?? `Action: ${data.tool}`
        assistantMsg = {
          id: genId(),
          role: 'assistant',
          content: displayText,
          toolAction: {
            tool: (data.tool as string) ?? '',
            args: (data.args as Record<string, unknown>) ?? {},
            displayText,
            status: 'pending',
          },
        }
      } else {
        assistantMsg = { id: genId(), role: 'assistant', content: (data.text ?? '') as string }
      }

      setMessages(prev => {
        const updated = [...prev, assistantMsg]
        if (activeSession) saveMessages(activeSession.id, updated)
        return updated
      })
    } catch (e) {
      const msg = (e as Error).message ?? 'Something went wrong'
      const isTimeout = msg.includes('timed out')
      const errMsg: AIMessage = {
        id: genId(),
        role: 'assistant',
        content: isTimeout
          ? '⏱ Taking too long to respond. Please try again.'
          : 'Sorry, something went wrong. Please try again.',
      }
      setMessages(prev => [...prev, errMsg])
      console.error('[useAIAssistant]', e)
    } finally {
      setLoading(false)
    }
  }, [startNewSession, endSession, saveMessages])

  const updateMessageToolStatus = useCallback((
    messageId: string,
    status: NonNullable<AIMessage['toolAction']>['status'],
    extra?: { errorMsg?: string; resultEventId?: string }
  ) => {
    setMessages(prev => {
      const updated = prev.map(m =>
        m.id === messageId && m.toolAction
          ? { ...m, toolAction: { ...m.toolAction, status, ...extra } }
          : m
      )
      if (sessionRef.current) saveMessages(sessionRef.current.id, updated)
      return updated
    })
  }, [saveMessages])

  // Backward-compat reset alias
  const reset = useCallback(() => setMessages([]), [])

  return {
    messages,
    loading,
    sessionLoading,
    session,
    send,
    reset,
    startFresh,
    updateMessageToolStatus,
  }
}
