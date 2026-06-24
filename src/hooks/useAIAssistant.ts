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
  focusedEvent?: EventWithDetails
  onSessionEnd?: () => void
}

const genId = (): string =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36)

const GOODBYE_PHRASES = /\b(thank you|thanks|goodbye|bye|that'?s all|all done|good night|ciao|close session|new session|start over|end session)\b/i
const GROCERY_NON_ADD_INTENTS = /\b(what|show|list|what's|whats|how many|remove|delete|clear|check|uncheck|done|completed|archive)\b/i

function dispatchGroceryUpdated() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent('casa:grocery-updated'))
}

function emitAssistantDebug(event: string, detail?: string) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent('casa:ai-debug', {
    detail: { event, detail },
  }))
}

function shouldFastAddGrocery(page: string, text: string, hasImage: boolean): boolean {
  if (page !== 'grocery' || hasImage) return false
  const normalized = text.trim().toLowerCase()
  if (!normalized || normalized.endsWith('?')) return false
  return !GROCERY_NON_ADD_INTENTS.test(normalized)
}

function parseGroceryItemsFromText(text: string): { name: string }[] {
  const normalized = text
    .replace(/^add\s+/i, '')
    .replace(/\b(to|into)\s+(the\s+)?(shopping|grocery)\s+list\b/gi, '')
    .replace(/\bplease\b/gi, '')
    .trim()
  const expanded = normalized
    // Handle rapid-fire STT bundles like "beef add chicken add fish"
    .replace(/\s+(?:and\s+)?add\s+/gi, ', ')
  const parts = expanded
    .split(/,| and /i)
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
  return parts.map((name) => ({ name }))
}

function buildGroceryAddResponseText(addedItems: string[], skippedExactMatches: string[]): string {
  if (addedItems.length > 0 && skippedExactMatches.length > 0) {
    return `Yes — I added ${addedItems.join(', ')}. Already on your list: ${skippedExactMatches.join(', ')}.`
  }
  if (addedItems.length > 0) {
    return `Yes — I added ${addedItems.join(', ')}.`
  }
  if (skippedExactMatches.length > 0) {
    return `Already on your list: ${skippedExactMatches.join(', ')}.`
  }
  return 'No new grocery items were added.'
}

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
      updated_at: e.updated_at,
      location_name: e.location_name ?? null,
      members: e.members.map(m => m.family_member?.name ?? '').filter(Boolean),
      category: e.enrichment?.category ?? null,
    })),
    family: ctx.family.map(f => ({ id: f.id, name: f.name })),
    homeCity: ctx.homeCity,
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
  const lastRequestRef = useRef<{
    text: string
    image?: { dataUrl: string; mimeType: string }
    options?: { skipGoodbyeCheck?: boolean }
  } | null>(null)
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
    options?: { skipGoodbyeCheck?: boolean },
  ) => {
    const trimmedText = text.trim()
    emitAssistantDebug('send_start', `${ctxRef.current.page}:${trimmedText.slice(0, 140)}`)
    // Check for goodbye phrase → end session
    const looksLikeShortGoodbye = GOODBYE_PHRASES.test(trimmedText) && trimmedText.split(/\s+/).length <= 6
    if (!options?.skipGoodbyeCheck && looksLikeShortGoodbye) {
      const farewell: AIMessage = { id: genId(), role: 'assistant', content: "You're welcome! Session saved. Say hi when you need me 👋" }
      setMessages(prev => {
        const updated = [...prev, { id: genId(), role: 'user' as const, content: trimmedText }, farewell]
        if (sessionRef.current) saveMessages(sessionRef.current.id, updated)
        return updated
      })
      endSession()
      // Close the drawer after a brief moment so user sees the farewell message
      setTimeout(() => ctxRef.current.onSessionEnd?.(), 1200)
      return
    }

    const userMsg: AIMessage = { id: genId(), role: 'user', content: trimmedText, imageDataUrl: image?.dataUrl }
    lastRequestRef.current = { text: trimmedText, image, options }
    setMessages(prev => [...prev, userMsg])
    setLoading(true)

    let activeSession = sessionRef.current
    if (!activeSession) {
      activeSession = startNewSession()
    }

    if (shouldFastAddGrocery(ctxRef.current.page, trimmedText, Boolean(image))) {
      try {
        const items = parseGroceryItemsFromText(trimmedText)
        emitAssistantDebug('fast_add_parsed', `count=${items.length} items=${items.map((item) => item.name).join('|').slice(0, 220)}`)
        if (items.length > 0) {
          const actionId = genId()
          const correlationId = buildCorrelationId(actionId, activeSession.id)
          emitAssistantDebug('fast_add_execute_start', `action=${actionId.slice(0, 8)} corr=${correlationId.slice(0, 28)} count=${items.length}`)
          const exec = await supabase.functions.invoke('execute-ai-action', {
            body: {
              tool: 'add_grocery_items',
              args: { items },
              action_id: actionId,
              session_id: activeSession.id,
              correlation_id: correlationId,
            },
          })

          let assistantMsg: AIMessage
          if (exec.error || exec.data?.success === false) {
            emitAssistantDebug('fast_add_execute_error', exec.error?.message ?? exec.data?.error ?? 'unknown error')
            assistantMsg = {
              id: genId(),
              role: 'assistant',
              content: `I couldn't add that yet: ${exec.error?.message ?? exec.data?.error ?? 'unknown error'}`,
            }
          } else {
            const execItems = Array.isArray(exec.data?.items)
              ? exec.data.items as Array<{ name?: string }>
              : []
            const skippedExactMatches = Array.isArray(exec.data?.skipped_exact_matches)
              ? exec.data.skipped_exact_matches.filter((name: unknown): name is string => typeof name === 'string' && name.trim().length > 0)
              : []
            emitAssistantDebug('fast_add_execute_success', `inserted=${execItems.length} requested=${items.length}`)
            const addedItems = execItems.map((item) => item.name).filter((name): name is string => Boolean(name))
            assistantMsg = {
              id: genId(),
              role: 'assistant',
              content: buildGroceryAddResponseText(addedItems, skippedExactMatches),
            }
            if (addedItems.length > 0) {
              dispatchGroceryUpdated()
            }
          }

          setMessages(prev => {
            const updated = [...prev, assistantMsg]
            if (activeSession) saveMessages(activeSession.id, updated)
            return updated
          })
          return
        }
      } catch (e) {
        emitAssistantDebug('fast_add_exception', (e as Error).message ?? 'unknown error')
        const errMsg: AIMessage = {
          id: genId(),
          role: 'assistant',
          content: `I couldn't add that yet: ${(e as Error).message ?? 'unknown error'}`,
        }
        setMessages(prev => {
          const updated = [...prev, errMsg]
          if (activeSession) saveMessages(activeSession.id, updated)
          return updated
        })
        return
      } finally {
        setLoading(false)
      }
    }

    const imagePayload = image
      ? { mimeType: image.mimeType, data: image.dataUrl.replace(/^data:[^;]+;base64,/, '') }
      : undefined

    try {
      const currentMessages = [...messagesRef.current, userMsg]
      const allMsgsForApi = currentMessages.map(m => ({ role: m.role, content: m.content }))
      const aiCorrelationId = buildCorrelationId(userMsg.id, activeSession.id)
      emitAssistantDebug('assistant_invoke_start', `messages=${allMsgsForApi.length} corr=${aiCorrelationId.slice(0, 28)}`)

      const invokePromise = supabase.functions.invoke('ai-assistant', {
        body: {
          messages: allMsgsForApi,
          context: buildContext(ctxRef.current),
          image: imagePayload,
          session_id: activeSession.id,
          correlation_id: aiCorrelationId,
        },
      })
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('AI request timed out')), 30000)
      )
      const { data, error } = await Promise.race([invokePromise, timeoutPromise]) as Awaited<typeof invokePromise>
      if (error) throw error
      emitAssistantDebug('assistant_invoke_result', `type=${data.type ?? 'unknown'}`)

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
        const tool = (data.tool as string) ?? ''
        const args = (data.args as Record<string, unknown>) ?? {}
        if (tool === 'add_grocery_items') {
          const autoActionId = genId()
          const autoCorrelationId = buildCorrelationId(autoActionId, activeSession.id)
          emitAssistantDebug('tool_add_grocery_execute_start', `action=${autoActionId.slice(0, 8)} corr=${autoCorrelationId.slice(0, 28)}`)
          const exec = await supabase.functions.invoke('execute-ai-action', {
            body: {
              tool,
              args,
              action_id: autoActionId,
              session_id: activeSession.id,
              correlation_id: autoCorrelationId,
            },
          })
          if (exec.error || exec.data?.success === false) {
            emitAssistantDebug('tool_add_grocery_execute_error', exec.error?.message ?? exec.data?.error ?? 'unknown error')
            assistantMsg = {
              id: genId(),
              role: 'assistant',
              content: `I couldn't add that yet: ${exec.error?.message ?? exec.data?.error ?? 'unknown error'}`,
            }
          } else {
            const execItems = Array.isArray(exec.data?.items)
              ? exec.data.items as Array<{ name?: string }>
              : []
            const skippedExactMatches = Array.isArray(exec.data?.skipped_exact_matches)
              ? exec.data.skipped_exact_matches.filter((name: unknown): name is string => typeof name === 'string' && name.trim().length > 0)
              : []
            emitAssistantDebug('tool_add_grocery_execute_success', `inserted=${execItems.length}`)
            const addedItems = execItems.map((item) => item.name).filter((name): name is string => Boolean(name))
            if (addedItems.length > 0) {
              dispatchGroceryUpdated()
            }
            assistantMsg = {
              id: genId(),
              role: 'assistant',
              content: buildGroceryAddResponseText(addedItems, skippedExactMatches),
            }
          }
        } else {
          const displayText = (data.display_text as string) ?? `Action: ${tool}`
          assistantMsg = {
            id: genId(),
            role: 'assistant',
            content: displayText,
            toolAction: {
              tool,
              args,
              displayText,
              status: 'pending',
            },
          }
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
      emitAssistantDebug('assistant_invoke_exception', (e as Error).message ?? 'unknown error')
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
  }, [startNewSession, endSession, saveMessages, buildCorrelationId])

  const retryLast = useCallback(async () => {
    const last = lastRequestRef.current
    if (!last) return false
    await send(last.text, last.image, last.options)
    return true
  }, [send])

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
    }
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

  // Inject synthetic messages directly (no API call) — used for deterministic greetings
  const primeMessages = useCallback((msgs: AIMessage[]) => {
    setMessages(msgs)
  }, [])

  return {
    messages,
    loading,
    sessionLoading,
    session,
    send,
    reset,
    startFresh,
    primeMessages,
    updateMessageToolStatus,
    retryLast,
  }
}
