import { useState, useCallback, useRef, useEffect } from 'react'
import { supabase, supabaseUrl, supabaseAnonKey } from '../lib/supabase'
import type { EventWithDetails } from './useCalendarEvents'
import type { FamilyMember } from '../types'
import { useAISession, type AIMessage } from './useAISession'
import { findSingleEventForScheduleQuery, tryLocalScheduleAnswer } from '../lib/scheduleFastPath.mjs'
import {
  createAssistantTraceContext,
  emitAssistantTrace,
  getAssistantDeviceId,
  type AssistantTraceContext,
} from '../lib/assistantTelemetry'
import { assistantErrorMessage } from '../lib/assistantErrors.mjs'

export type { AIMessage }

export interface AssistantContext {
  page: string
  assistantMode?: 'general' | 'chef'
  events: EventWithDetails[]
  family: FamilyMember[]
  homeCity?: string
  focusedEvent?: EventWithDetails
  onSessionEnd?: () => void
}

export type AssistantSendTrace = Pick<AssistantTraceContext, 'traceId' | 'turnId' | 'lane' | 'source' | 'startedAt'>

const genId = (): string =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36)

const GOODBYE_PHRASES = /\b(thank you|thanks|goodbye|bye|that'?s all|all done|good night|ciao|close session|new session|start over|end session)\b/i
const CONTEXTLESS_USER_PHRASES = /\b(yes|yeah|yep|ok|okay|no|nope|cancel|stop|do it|sounds good|correct|right|thanks|thank you|never mind|nvm)\b/i
const VAGUE_REFERENCE_ONLY = /\b(it|that|this|one|him|her|them|there)\b/i

function deriveLastContextReference(messages: AIMessage[]): { summary: string } | undefined {
  const recentUserMessages = messages
    .filter((m) => m.role === 'user')
    .slice(-8)
    .reverse()

  for (const message of recentUserMessages) {
    const text = message.content.replace(/\s+/g, ' ').trim()
    if (!text) continue
    if (CONTEXTLESS_USER_PHRASES.test(text) && text.split(/\s+/).length <= 5) continue
    const words = text.toLowerCase().split(/\s+/).filter(Boolean)
    const vagueWordCount = words.filter((w) => VAGUE_REFERENCE_ONLY.test(w)).length
    if (vagueWordCount > 0 && vagueWordCount >= words.length - 1) continue
    return { summary: text.slice(0, 220) }
  }

  return undefined
}

function buildContext(ctx: AssistantContext, messages: AIMessage[]) {
  const now = new Date()
  const offsetMins = -now.getTimezoneOffset()
  const offsetSign = offsetMins >= 0 ? '+' : '-'
  const offsetAbs = Math.abs(offsetMins)
  const utcOffset = `${offsetSign}${String(Math.floor(offsetAbs / 60)).padStart(2, '0')}:${String(offsetAbs % 60).padStart(2, '0')}`

  const conversationState = [...messages]
    .reverse()
    .find((message) => message.role === 'assistant' && message.conversationState)
    ?.conversationState
  const pendingAction = [...messages]
    .reverse()
    .find((message) => message.role === 'assistant' && message.toolAction?.status === 'pending')
    ?.toolAction

  return {
    page: ctx.page,
    assistant_mode: ctx.assistantMode ?? 'general',
    currentDate: now.toISOString(),
    utcOffset,
    family: ctx.family.map(f => ({ id: f.id, name: f.name })),
    homeCity: ctx.homeCity,
    lastContextReference: deriveLastContextReference(messages),
    conversationState,
    pendingAction: pendingAction ? {
      tool: pendingAction.tool,
      args: pendingAction.args,
    } : undefined,
    focusedEvent: ctx.focusedEvent ? {
      id: ctx.focusedEvent.id,
      title: ctx.focusedEvent.title,
      start_time: ctx.focusedEvent.start_time,
      end_time: ctx.focusedEvent.end_time,
      updated_at: ctx.focusedEvent.updated_at,
      all_day: ctx.focusedEvent.all_day,
      location_name: ctx.focusedEvent.location_name ?? null,
      address: ctx.focusedEvent.address ?? null,
      description: ctx.focusedEvent.description ?? null,
      members: ctx.focusedEvent.members.map(m => m.family_member?.name ?? '').filter(Boolean),
      category: ctx.focusedEvent.enrichment?.category ?? null,
      notes: ctx.focusedEvent.enrichment?.prep_notes ?? null,
      what_to_bring: ctx.focusedEvent.enrichment?.what_to_bring ?? [],
      outfit_suggestion: ctx.focusedEvent.enrichment?.outfit_suggestion ?? null,
      parking_notes: ctx.focusedEvent.enrichment?.parking_notes ?? null,
      contact_name: ctx.focusedEvent.enrichment?.contact_name ?? null,
      contact_phone: ctx.focusedEvent.enrichment?.contact_phone ?? null,
      cost_estimate: ctx.focusedEvent.enrichment?.cost_estimate ?? null,
      dietary_notes: ctx.focusedEvent.enrichment?.dietary_notes ?? null,
      meal_impact: ctx.focusedEvent.enrichment?.meal_impact ?? null,
      checklist: ctx.focusedEvent.checklist.map(item => ({
        id: item.id,
        label: item.label,
        note: item.note,
        checked: item.checked,
        category: item.category,
      })),
      actions: ctx.focusedEvent.actions.map(item => ({
        id: item.id,
        title: item.title,
        description: item.description,
        due_date: item.due_date,
        is_urgent: item.is_urgent,
        completed: item.completed,
        assigned_to: item.assigned_to,
      })),
    } : undefined,
  }
}

export function useAIAssistant(ctx: AssistantContext) {
  const { session, loading: sessionLoading, startNewSession, endSession, saveMessages } = useAISession()
  const [messages, setMessages] = useState<AIMessage[]>([])
  const [loading, setLoading] = useState(false)
  const sessionRef = useRef(session)
  const messagesRef = useRef(messages)
  const ctxRef = useRef(ctx)
  const activeImageRef = useRef<{ dataUrl: string; mimeType: string } | null>(null)
  useEffect(() => { sessionRef.current = session }, [session])
  useEffect(() => { messagesRef.current = messages }, [messages])
  useEffect(() => { ctxRef.current = ctx })

  // Sync messages from session when session loads — but never overwrite messages
  // already accumulated (e.g. user spoke before sessionLoading resolved)
  useEffect(() => {
    if (!sessionLoading && session) {
      setMessages(prev => prev.length === 0 ? session.messages : prev)
    } else if (!sessionLoading && !session) {
      setMessages(prev => prev.length === 0 ? [] : prev)
    }
  }, [sessionLoading, session?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const startFresh = useCallback(() => {
    endSession()   // clear localStorage so next open is truly blank
    activeImageRef.current = null
    setMessages([])
    startNewSession()
  }, [endSession, startNewSession])

  const buildCorrelationId = useCallback((messageId: string, sessionId?: string) => {
    const sid = sessionId ?? 'no-session'
    return `${sid}:${messageId}:${Date.now().toString(36)}`
  }, [])

  const send = useCallback(async (
    text: string,
    image?: { dataUrl: string; mimeType: string },
    sendTrace?: AssistantSendTrace,
  ) => {
    if (image) activeImageRef.current = image
    const activeImage = image ?? activeImageRef.current ?? undefined
    const imageContext = image ? 'current_turn' : activeImage ? 'conversation' : 'none'
    const trace = createAssistantTraceContext({
      traceId: sendTrace?.traceId,
      turnId: sendTrace?.turnId ?? genId(),
      page: ctxRef.current.page,
      lane: sendTrace?.lane ?? 'text',
      source: sendTrace?.source ?? 'assistant_drawer',
      startedAt: sendTrace?.startedAt,
    })
    emitAssistantTrace('turn_started', trace, {
      payload: {
        has_image: Boolean(activeImage),
        image_context: imageContext,
        word_count: text.trim().split(/\s+/).filter(Boolean).length,
      },
    })
    // Check for goodbye phrase → end session
    if (GOODBYE_PHRASES.test(text)) {
      activeImageRef.current = null
      const farewell: AIMessage = { id: genId(), role: 'assistant', content: "You're welcome! Session saved. Say hi when you need me 👋" }
      setMessages(prev => {
        const updated = [...prev, { id: genId(), role: 'user' as const, content: text }, farewell]
        if (sessionRef.current) saveMessages(sessionRef.current.id, updated)
        return updated
      })
      endSession()
      // Close the drawer after a brief moment so user sees the farewell message
      setTimeout(() => ctxRef.current.onSessionEnd?.(), 1200)
      emitAssistantTrace('turn_completed', trace, {
        payload: { outcome: 'session_ended', result_type: 'text' },
      })
      return
    }

    // Deterministic fast-path: answer common read-only schedule questions instantly
    // from local state, skipping the LLM round-trip. Only fires on unambiguous matches.
    if (!image) {
      const fastAnswer = tryLocalScheduleAnswer(text, ctxRef.current.events, new Date())
      if (fastAnswer) {
        const selectedEvent = findSingleEventForScheduleQuery(text, ctxRef.current.events, new Date())
        const conversationState = selectedEvent ? {
          activeEntityType: 'event' as const,
          activeEventId: selectedEvent.id,
          activeEventUpdatedAt: selectedEvent.updated_at,
          expectedFollowUp: 'event_follow_up' as const,
          establishedAt: new Date().toISOString(),
        } : undefined
        const fastTrace = { ...trace, lane: 'fast_path' as const }
        emitAssistantTrace('assistant_fast_path_matched', fastTrace, {
          payload: { kind: 'schedule_read' },
        })
        let fpSession = sessionRef.current
        if (!fpSession) fpSession = startNewSession()
        setMessages(prev => {
          const updated = [
            ...prev,
            { id: genId(), role: 'user' as const, content: text },
            { id: genId(), role: 'assistant' as const, content: fastAnswer, conversationState },
          ]
          if (fpSession) saveMessages(fpSession.id, updated)
          return updated
        })
        emitAssistantTrace('turn_completed', fastTrace, {
          payload: { outcome: 'success', result_type: 'text' },
        })
        return
      }
    }

    const userMsg: AIMessage = { id: genId(), role: 'user', content: text, imageDataUrl: image?.dataUrl }
    setMessages(prev => [...prev, userMsg])
    setLoading(true)

    let activeSession = sessionRef.current
    if (!activeSession) {
      activeSession = startNewSession()
    }

    const imagePayload = activeImage
      ? { mimeType: activeImage.mimeType, data: activeImage.dataUrl.replace(/^data:[^;]+;base64,/, '') }
      : undefined

    const currentMessages = [...messagesRef.current, userMsg]
    const allMsgsForApi = currentMessages.map(m => ({ role: m.role, content: m.content }))
    const requestBody = {
      messages: allMsgsForApi,
      context: buildContext(ctxRef.current, currentMessages),
      image: imagePayload,
      image_context: imageContext,
      session_id: activeSession.id,
      correlation_id: trace.correlationId ?? buildCorrelationId(userMsg.id, activeSession.id),
      trace_id: trace.traceId,
      turn_id: trace.turnId,
      lane: trace.lane === 'voice' ? 'voice' : 'llm',
      device_id: getAssistantDeviceId(),
      client_trace_present: true,
      client_build: typeof __BUILD_ID__ === 'string' ? __BUILD_ID__ : 'unknown',
      client_trace_source: trace.source,
    }
    emitAssistantTrace('assistant_invoke_started', trace)

    // Maps a server payload (identical shape for streaming `final` and the
    // non-streaming JSON body) into an AIMessage. One code path → both flows stay
    // perfectly consistent.
    const buildAssistantMsg = (data: any, id: string): AIMessage => {
      if (data?.type === 'error') {
        return {
          id,
          role: 'assistant',
          content: assistantErrorMessage(data.code, data.message),
        }
      }
      if (data?.type === 'tool_action') {
        const displayText = (data.display_text as string) ?? `Action: ${data.tool}`
        return {
          id,
          role: 'assistant',
          content: displayText,
          toolAction: {
            tool: (data.tool as string) ?? '',
            args: (data.args as Record<string, unknown>) ?? {},
            displayText,
            status: 'pending',
          },
          conversationState: data.conversation_state,
        }
      }
      return {
        id,
        role: 'assistant',
        content: (data?.text ?? '') as string,
        conversationState: data?.conversation_state,
      }
    }

    const persist = (assistantMsg: AIMessage) => {
      setMessages(prev => {
        const revised = assistantMsg.toolAction?.status === 'pending'
          ? prev.map((message) => (
              message.toolAction?.status === 'pending' &&
              message.toolAction.tool === assistantMsg.toolAction?.tool &&
              (message.toolAction.args.id ?? message.toolAction.args.item_id) ===
                (assistantMsg.toolAction?.args.id ?? assistantMsg.toolAction?.args.item_id)
                ? { ...message, toolAction: { ...message.toolAction, status: 'cancelled' as const } }
                : message
            ))
          : prev
        const updated = [...revised, assistantMsg]
        if (activeSession) saveMessages(activeSession.id, updated)
        return updated
      })
    }

    // Non-streaming path (also the fallback when streaming fails). Unchanged behavior.
    const runNonStreaming = async () => {
      emitAssistantTrace('assistant_non_streaming_started', trace)
      const invokePromise = supabase.functions.invoke('ai-assistant', { body: requestBody })
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('AI request timed out')), 30000)
      )
      const { data, error } = await Promise.race([invokePromise, timeoutPromise]) as Awaited<typeof invokePromise>
      if (error) throw error
      persist(buildAssistantMsg(data, genId()))
      emitAssistantTrace('assistant_result_received', trace, {
        payload: { transport: 'json', result_type: data?.type ?? 'unknown' },
      })
    }

    // Streaming path: progressively render tokens, then reconcile with the `final`
    // payload. Returns true on success; false → caller falls back to non-streaming.
    const runStreaming = async (): Promise<boolean> => {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 35000)
      const streamMsgId = genId()
      let placeholderAdded = false
      let finalApplied = false
      let streamedText = ''
      let firstTokenSeen = false
      const removePlaceholder = () => {
        if (placeholderAdded) setMessages(prev => prev.filter(m => m.id !== streamMsgId))
      }
      try {
        const resp = await fetch(`${supabaseUrl}/functions/v1/ai-assistant`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            apikey: supabaseAnonKey,
            authorization: `Bearer ${supabaseAnonKey}`,
          },
          body: JSON.stringify({ ...requestBody, stream: true }),
          signal: controller.signal,
        })
        if (!resp.ok || !resp.body) return false
        const reader = resp.body.getReader()
        const decoder = new TextDecoder()
        let buf = ''
        const handleEvent = (evt: string, dataStr: string) => {
          let payload: any
          try { payload = JSON.parse(dataStr) } catch { return }
          if (evt === 'token') {
            if (!firstTokenSeen) {
              firstTokenSeen = true
              emitAssistantTrace('assistant_first_token', trace, {
                payload: { transport: 'sse' },
              })
            }
            if (!placeholderAdded) {
              placeholderAdded = true
              setMessages(prev => [...prev, { id: streamMsgId, role: 'assistant', content: '', streaming: true }])
            }
            streamedText += payload.delta ?? ''
            const next = streamedText
            setMessages(prev => prev.map(m => m.id === streamMsgId ? { ...m, content: next } : m))
          } else if (evt === 'final') {
            finalApplied = true
            emitAssistantTrace('assistant_result_received', trace, {
              payload: { transport: 'sse', result_type: payload?.type ?? 'unknown' },
            })
            const finalMsg = buildAssistantMsg(payload, streamMsgId)
            setMessages(prev => {
              const exists = prev.some(m => m.id === streamMsgId)
              const revised = finalMsg.toolAction?.status === 'pending'
                ? prev.map((message) => (
                    message.id !== streamMsgId &&
                    message.toolAction?.status === 'pending' &&
                    message.toolAction.tool === finalMsg.toolAction?.tool &&
                    message.toolAction.args.id === finalMsg.toolAction?.args.id
                      ? { ...message, toolAction: { ...message.toolAction, status: 'cancelled' as const } }
                      : message
                  ))
                : prev
              const updated = exists
                ? revised.map(m => m.id === streamMsgId ? { ...finalMsg, streaming: false } : m)
                : [...revised, { ...finalMsg, streaming: false }]
              if (activeSession) saveMessages(activeSession.id, updated)
              return updated
            })
          }
        }
        for (;;) {
          const { value, done } = await reader.read()
          if (done) break
          buf += decoder.decode(value, { stream: true })
          let sep: number
          while ((sep = buf.indexOf('\n\n')) !== -1) {
            const rawEvent = buf.slice(0, sep)
            buf = buf.slice(sep + 2)
            let evt = 'message'
            let dataStr = ''
            for (const line of rawEvent.split('\n')) {
              if (line.startsWith('event:')) evt = line.slice(6).trim()
              else if (line.startsWith('data:')) dataStr += line.slice(5).trim()
            }
            if (dataStr) handleEvent(evt, dataStr)
          }
        }
        if (finalApplied) return true
        removePlaceholder()
        return false
      } catch (err) {
        if (finalApplied) return true
        removePlaceholder()
        console.warn('[useAIAssistant] streaming failed, falling back', err)
        return false
      } finally {
        clearTimeout(timeout)
      }
    }

    try {
      const streamed = await runStreaming()
      if (!streamed) {
        emitAssistantTrace('assistant_stream_fallback', trace, {
          payload: { reason: 'stream_unavailable_before_content' },
        })
        await runNonStreaming()
      }
      emitAssistantTrace('turn_completed', trace, {
        payload: { outcome: 'success' },
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
      emitAssistantTrace('turn_failed', trace, {
        detail: isTimeout ? 'timeout' : 'request_error',
        payload: { failure_class: isTimeout ? 'timeout' : 'request_error' },
      })
    } finally {
      setLoading(false)
    }
  }, [startNewSession, endSession, saveMessages, buildCorrelationId])

  const updateMessageToolStatus = useCallback((
    messageId: string,
    status: NonNullable<AIMessage['toolAction']>['status'],
    extra?: {
      actionId?: string
      errorMsg?: string
      resultEventId?: string
      syncWarning?: string
      syncStatus?: NonNullable<AIMessage['toolAction']>['syncStatus']
      undoStatus?: NonNullable<AIMessage['toolAction']>['undoStatus']
      undoErrorMsg?: string
      conversationState?: AIMessage['conversationState']
    }
  ) => {
    const { conversationState, ...toolActionExtra } = extra ?? {}
    setMessages(prev => {
      const updated = prev.map(m =>
        m.id === messageId && m.toolAction
          ? {
              ...m,
              conversationState: conversationState ?? m.conversationState,
              toolAction: { ...m.toolAction, status, ...toolActionExtra },
            }
          : m
      )
      if (sessionRef.current) saveMessages(sessionRef.current.id, updated)
      return updated
    })
  }, [saveMessages])

  // Backward-compat reset alias
  const reset = useCallback(() => {
    activeImageRef.current = null
    setMessages([])
  }, [])

  // Inject synthetic messages directly (no API call) — used for deterministic greetings
  const primeMessages = useCallback((msgs: AIMessage[]) => {
    setMessages(msgs)
  }, [])

  const appendSyntheticMessage = useCallback((msg: AIMessage) => {
    setMessages(prev => {
      const updated = [...prev, msg]
      if (sessionRef.current) saveMessages(sessionRef.current.id, updated)
      return updated
    })
  }, [saveMessages])

  return {
    messages,
    loading,
    sessionLoading,
    session,
    send,
    reset,
    startFresh,
    primeMessages,
    appendSyntheticMessage,
    updateMessageToolStatus,
  }
}
