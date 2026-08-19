import { useState, useCallback, useRef, useEffect } from 'react'
import { supabase, supabaseUrl, supabaseAnonKey } from '../lib/supabase'
import type { EventWithDetails } from './useCalendarEvents'
import type { FamilyMember } from '../types'
import {
  useAISession,
  type AIMessage,
  type AssistantExperienceMode,
  type FamilyEvidence,
} from './useAISession'
import { useAIConversationHistory } from './useAIConversationHistory'
import {
  createAssistantTraceContext,
  emitAssistantTrace,
  getAssistantDeviceId,
  type AssistantTraceContext,
} from '../lib/assistantTelemetry'
import { assistantErrorMessage } from '../lib/assistantErrors.mjs'
import { useProfileSession } from '../contexts/ProfileSessionContext'
import { resolveFocusedEventDeterministicAnswer, deriveEventTransportation } from '../lib/focusedEventDeterministicAnswer'

export type { AIMessage }

export interface GroceryAssistantContext {
  totalItems: number
  toBuyCount: number
  inCartCount: number
  items: Array<{
    id: string
    name: string
    category: string
    checked: boolean
    quantity?: string | null
    unit?: string | null
    notes?: string | null
  }>
  pantryInventory?: Array<{
    name: string
    category: string
    currentStock: number
    unit: string
    lowStockThreshold: number
  }>
  pantryCadencePredictions?: Array<{
    name: string
    cadenceDays: number
    daysUntil: number
    dueLabel?: string
    confidence?: string
  }>
  plannedDinners?: Array<{
    slot: string
    recipeName: string
    cookTime?: string | null
    servings?: string | null
    ingredientCount: number
    ingredients: string[]
  }>
  recentAisleCategories?: string[]
}

export interface ActionAiContext {
  actionId: string
  title: string
  subject?: string
  sender?: string
  amount?: string | null
  urgency?: string
  requiredAction?: string
  householdImpact?: string
  emailBody?: string
}

export interface AssistantContext {
  page: string
  assistantMode?: 'general' | 'chef'
  events: EventWithDetails[]
  family: FamilyMember[]
  homeCity?: string
  focusedEvent?: EventWithDetails
  focusedAction?: ActionAiContext
  groceryContext?: GroceryAssistantContext
  onSessionEnd?: () => void
}

export type AssistantSendTrace = Pick<AssistantTraceContext, 'traceId' | 'turnId' | 'lane' | 'source' | 'startedAt'>

const genId = (): string =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36)

function normalizeFamilyEvidence(value: unknown): FamilyEvidence[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return []
    const row = item as Record<string, unknown>
    if (
      typeof row.evidence_id !== 'string' ||
      typeof row.source_type !== 'string' ||
      typeof row.source_id !== 'string' ||
      typeof row.title !== 'string' ||
      typeof row.excerpt !== 'string'
    ) return []
    return [{
      evidenceId: row.evidence_id,
      sourceType: row.source_type,
      sourceId: row.source_id,
      title: row.title,
      excerpt: row.excerpt,
      occurredAt: typeof row.occurred_at === 'string' ? row.occurred_at : null,
      effectiveAt: typeof row.effective_at === 'string' ? row.effective_at : null,
      metadata: row.metadata && typeof row.metadata === 'object'
        ? row.metadata as Record<string, unknown>
        : {},
    }]
  })
}

const GOODBYE_PHRASES = /\b(goodbye|bye|go away|that'?s all|all done|i(?:'| a)?m done|we(?:'| a)?re done|done for now|close session|new session|start over|end session)\b/i
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

function buildContext(ctx: AssistantContext, messages: AIMessage[], experienceMode: AssistantExperienceMode) {
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
    .find((message) =>
      message.role === 'assistant' &&
      message.toolAction?.status === 'pending' &&
      message.toolAction.tool !== 'confirm_talk_plan_action_intent'
    )
    ?.toolAction

  return {
    page: ctx.page,
    assistant_mode: ctx.assistantMode ?? 'general',
    experience_mode: experienceMode,
    currentDate: now.toISOString(),
    utcOffset,
    family: ctx.family.map(f => ({ id: f.id, name: f.name, full_name: f.full_name })),
    homeCity: ctx.homeCity,
    lastContextReference: deriveLastContextReference(messages),
    conversationState,
    pendingAction: pendingAction ? {
      tool: pendingAction.tool,
      args: pendingAction.args,
    } : undefined,
    focusedAction: ctx.focusedAction ? {
      id: ctx.focusedAction.actionId,
      title: ctx.focusedAction.title,
      subject: ctx.focusedAction.subject ?? null,
      sender: ctx.focusedAction.sender ?? null,
      amount: ctx.focusedAction.amount ?? null,
      urgency: ctx.focusedAction.urgency ?? null,
      required_action: ctx.focusedAction.requiredAction ?? null,
      household_impact: ctx.focusedAction.householdImpact ?? null,
      email_body: ctx.focusedAction.emailBody ?? null,
    } : undefined,
    focusedEvent: ctx.focusedEvent ? (() => {
      const transport = deriveEventTransportation(ctx.focusedEvent, ctx.family)
      return {
        id: ctx.focusedEvent.id,
        title: ctx.focusedEvent.title,
        event_type: ctx.focusedEvent.event_type ?? 'event',
        start_time: ctx.focusedEvent.start_time,
        end_time: ctx.focusedEvent.end_time,
        updated_at: ctx.focusedEvent.updated_at,
        all_day: ctx.focusedEvent.all_day,
        location_name: ctx.focusedEvent.location_name ?? null,
        address: ctx.focusedEvent.address ?? null,
        description: ctx.focusedEvent.description ?? null,
        source_feed: ctx.focusedEvent.google_calendar_id ? 'Google Calendar Feed' : 'Casa Household Calendar',
        driver: transport?.driverName ?? null,
        leave_by: transport?.leaveTime ?? null,
        drive_duration_min: transport?.driveMinutes ?? null,
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
        surrounding_neighborhood: ctx.events.filter(e => {
          if (e.id === ctx.focusedEvent?.id) return false
          const targetStart = new Date(ctx.focusedEvent!.start_time).getTime()
          const eStart = new Date(e.start_time).getTime()
          return Math.abs(eStart - targetStart) <= 2.5 * 60 * 60 * 1000 // 2.5 hours
        }).slice(0, 6).map(e => ({
          id: e.id,
          title: e.title,
          start_time: e.start_time,
          end_time: e.end_time,
          location_name: e.location_name ?? null,
          members: e.members.map(m => m.family_member?.name ?? '').filter(Boolean)
        })),
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
      }
    })() : undefined,
    grocery: ctx.groceryContext ? {
      total_items: ctx.groceryContext.totalItems,
      to_buy_count: ctx.groceryContext.toBuyCount,
      in_cart_count: ctx.groceryContext.inCartCount,
      items: ctx.groceryContext.items.slice(0, 100).map((i) => ({
        id: i.id,
        name: i.name,
        category: i.category,
        checked: i.checked,
        quantity: i.quantity ?? null,
        unit: i.unit ?? null,
        notes: i.notes ?? null,
      })),
      pantry_inventory: ctx.groceryContext.pantryInventory?.slice(0, 60),
      pantry_cadence_predictions: ctx.groceryContext.pantryCadencePredictions?.slice(0, 25),
      planned_dinners: ctx.groceryContext.plannedDinners?.slice(0, 10),
      recent_aisle_categories: ctx.groceryContext.recentAisleCategories,
    } : undefined,
  }
}

export function useAIAssistant(ctx: AssistantContext) {
  const { profile } = useProfileSession()
  const {
    session,
    loading: sessionLoading,
    startNewSession,
    endSession,
    saveMessages,
    setExperienceMode,
    setSession,
  } = useAISession()
  const privateHistory = useAIConversationHistory()
  const [messages, setMessages] = useState<AIMessage[]>([])
  const [loading, setLoading] = useState(false)
  const sessionRef = useRef(session)
  const messagesRef = useRef(messages)
  const ctxRef = useRef(ctx)
  const activeImageRef = useRef<{ dataUrl: string; mimeType: string } | null>(null)
  const activeImagesRef = useRef<Array<{ dataUrl: string; mimeType: string }>>([])
  useEffect(() => { sessionRef.current = session }, [session])
  useEffect(() => { messagesRef.current = messages }, [messages])
  useEffect(() => { ctxRef.current = ctx })

  const persistSessionMessages = useCallback((sessionId: string, updatedMessages: AIMessage[]) => {
    saveMessages(sessionId, updatedMessages)
    const currentSession = sessionRef.current
    if (currentSession?.id === sessionId) {
      privateHistory.saveSession({ ...currentSession, messages: updatedMessages })
    }
  }, [privateHistory.saveSession, saveMessages])

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
    activeImagesRef.current = []
    setMessages([])
    startNewSession()
  }, [endSession, startNewSession])

  const selectExperienceMode = useCallback((mode: AssistantExperienceMode) => {
    const updated = setExperienceMode(mode)
    sessionRef.current = updated
  }, [setExperienceMode])

  const resumePrivateConversation = useCallback(async (conversationId: string) => {
    const resumed = await privateHistory.resumeConversation(conversationId)
    activeImagesRef.current = []
    sessionRef.current = resumed
    setSession(resumed)
    setMessages(resumed.messages)
  }, [privateHistory.resumeConversation, setSession])

  const buildCorrelationId = useCallback((messageId: string, sessionId?: string) => {
    const sid = sessionId ?? 'no-session'
    return `${sid}:${messageId}:${Date.now().toString(36)}`
  }, [])

  const send = useCallback(async (
    text: string,
    image?: { dataUrl: string; mimeType: string } | Array<{ dataUrl: string; mimeType: string }>,
    sendTrace?: AssistantSendTrace,
    options?: {
      replayExistingUserMessage?: boolean
      talkPlanIntentResolution?: 'confirmed_action' | 'conversation_only'
    },
  ) => {
    const activeImage = image ?? activeImageRef.current
    const singleResolved = (Array.isArray(activeImage) ? activeImage[0] : activeImage) ?? null
    if (singleResolved) activeImageRef.current = singleResolved
    const imagesList = Array.isArray(image) ? image : image ? [image] : activeImageRef.current ? [activeImageRef.current] : []
    if (imagesList.length > 0) activeImagesRef.current = imagesList
    const activeImages = imagesList.length > 0 ? imagesList : activeImagesRef.current
    const hasActiveImages = activeImages.length > 0
    const imageContext = imagesList.length > 0 ? 'current_turn' : hasActiveImages ? 'conversation' : 'none'
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
        has_image: hasActiveImages,
        image_count: activeImages.length,
        image_context: imageContext,
        word_count: text.trim().split(/\s+/).filter(Boolean).length,
      },
    })
    // Check for goodbye phrase → end session
    if (GOODBYE_PHRASES.test(text)) {
      activeImagesRef.current = []
      const farewell: AIMessage = { id: genId(), role: 'assistant', content: "You're welcome! Session saved. Say hi when you need me 👋" }
      setMessages(prev => {
        const updated = [...prev, { id: genId(), role: 'user' as const, content: text }, farewell]
        if (sessionRef.current) persistSessionMessages(sessionRef.current.id, updated)
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

    const replayExistingUserMessage = options?.replayExistingUserMessage === true
    const userMsg: AIMessage = {
      id: genId(),
      role: 'user',
      content: text,
      imageDataUrl: imagesList[0]?.dataUrl,
      imageDataUrls: imagesList.length > 0 ? imagesList.map((img) => img.dataUrl) : undefined,
    }

    let activeSession = sessionRef.current
    if (!activeSession) {
      activeSession = startNewSession()
    }

    // Instant deterministic resolution for focused event inquiries (driver, buffer, notes, conflicts)
    if (!hasActiveImages) {
      const deterministicEventAnswer = resolveFocusedEventDeterministicAnswer(
        text,
        ctxRef.current.focusedEvent,
        ctxRef.current.events,
        ctxRef.current.family,
      )
      if (deterministicEventAnswer.matched && deterministicEventAnswer.content) {
        const assistantMsg: AIMessage = {
          id: genId(),
          role: 'assistant',
          content: deterministicEventAnswer.content,
        }
        setMessages(prev => {
          const updated = replayExistingUserMessage ? [...prev, assistantMsg] : [...prev, userMsg, assistantMsg]
          if (activeSession) persistSessionMessages(activeSession.id, updated)
          return updated
        })
        emitAssistantTrace('turn_completed', trace, {
          payload: { outcome: 'deterministic_event_resolved', result_type: 'text' },
        })
        return
      }
    }

    if (!replayExistingUserMessage) setMessages(prev => [...prev, userMsg])
    setLoading(true)

    const imagePayloads = activeImages.map((img) => ({
      mimeType: img.mimeType,
      data: img.dataUrl.replace(/^data:[^;]+;base64,/, ''),
    }))
    const singleImagePayload = imagePayloads[0] ?? undefined

    const currentMessages = replayExistingUserMessage
      ? messagesRef.current
      : [...messagesRef.current, userMsg]
    const allMsgsForApi = currentMessages.map(m => ({ id: m.id, role: m.role, content: m.content }))
    const assistantContext = buildContext(
      ctxRef.current,
      currentMessages,
      activeSession.experienceMode ?? 'do',
    )
    const privateConversationId = activeSession.experienceMode === 'talk_plan'
      ? await privateHistory.ensureConversation(activeSession)
      : null
    const requestBody = {
      messages: allMsgsForApi,
      context: {
        ...assistantContext,
        ...(options?.talkPlanIntentResolution
          ? { talk_plan_intent_resolution: options.talkPlanIntentResolution }
          : {}),
      },
      image: singleImagePayload,
      images: imagePayloads.length > 0 ? imagePayloads : undefined,
      image_context: imageContext,
      session_id: activeSession.id,
      private_conversation_id: privateConversationId,
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
      const evidence = normalizeFamilyEvidence(data?.evidence)
      const sourceMetadata = {
        evidence: evidence.length > 0 ? evidence : undefined,
        sourcesConsidered: Array.isArray(data?.sources_considered) ? data.sources_considered : undefined,
        partialSources: Array.isArray(data?.partial_sources) ? data.partial_sources : undefined,
      }
      if (data?.type === 'error') {
        return {
          id,
          role: 'assistant',
          content: assistantErrorMessage(data.code, data.message),
          ...sourceMetadata,
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
          ...sourceMetadata,
        }
      }
      return {
        id,
        role: 'assistant',
        content: (data?.text ?? '') as string,
        conversationState: data?.conversation_state,
        ...sourceMetadata,
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
        if (activeSession) persistSessionMessages(activeSession.id, updated)
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('casa-event-mutated'))
        }
        return updated
      })
    }

    // Non-streaming path (also the fallback when streaming fails). Unchanged behavior.
    type AssistantTurnOutcome = { resultType: string; safetyRejection?: string }

    const runNonStreaming = async (): Promise<AssistantTurnOutcome> => {
      emitAssistantTrace('assistant_non_streaming_started', trace)
      const invokePromise = supabase.functions.invoke('ai-assistant', {
        body: requestBody,
        headers: profile?.token ? { 'x-casa-history-session': profile.token } : undefined,
      })
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('AI request timed out')), 30000)
      )
      const { data, error } = await Promise.race([invokePromise, timeoutPromise]) as Awaited<typeof invokePromise>
      if (error) throw error
      persist(buildAssistantMsg(data, genId()))
      emitAssistantTrace('assistant_result_received', trace, {
        payload: { transport: 'json', result_type: data?.type ?? 'unknown' },
      })
      return {
        resultType: data?.type ?? 'unknown',
        safetyRejection: typeof data?.safety_rejection === 'string' ? data.safety_rejection : undefined,
      }
    }

    // Streaming path: progressively render tokens, then reconcile with the `final`
    // payload. A null outcome tells the caller to use the non-streaming fallback.
    const runStreaming = async (): Promise<AssistantTurnOutcome | null> => {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 35000)
      const streamMsgId = genId()
      let placeholderAdded = false
      let finalApplied = false
      let streamedText = ''
      let firstTokenSeen = false
      let finalOutcome: AssistantTurnOutcome | null = null
      const removePlaceholder = () => {
        if (placeholderAdded) setMessages(prev => prev.filter(m => m.id !== streamMsgId))
      }
      try {
        const resp = await fetch(`${supabaseUrl}/functions/v1/ai-assistant`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            ...(profile?.token ? { 'x-casa-history-session': profile.token } : {}),
            apikey: supabaseAnonKey,
            authorization: `Bearer ${supabaseAnonKey}`,
          },
          body: JSON.stringify({ ...requestBody, stream: true }),
          signal: controller.signal,
        })
        if (!resp.ok || !resp.body) return null
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
            finalOutcome = {
              resultType: payload?.type ?? 'unknown',
              safetyRejection: typeof payload?.safety_rejection === 'string' ? payload.safety_rejection : undefined,
            }
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
              if (activeSession) persistSessionMessages(activeSession.id, updated)
              if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('casa-event-mutated'))
              }
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
        if (finalApplied) return finalOutcome ?? { resultType: 'unknown' }
        removePlaceholder()
        return null
      } catch (err) {
        if (finalApplied) return finalOutcome ?? { resultType: 'unknown' }
        removePlaceholder()
        console.warn('[useAIAssistant] streaming failed, falling back', err)
        return null
      } finally {
        clearTimeout(timeout)
      }
    }

    try {
      let outcome = await runStreaming()
      if (!outcome) {
        emitAssistantTrace('assistant_stream_fallback', trace, {
          payload: { reason: 'stream_unavailable_before_content' },
        })
        outcome = await runNonStreaming()
      }
      if (outcome.resultType === 'error' || outcome.safetyRejection) {
        emitAssistantTrace('turn_failed', trace, {
          detail: outcome.safetyRejection ?? 'assistant_error',
          payload: {
            failure_class: outcome.safetyRejection ? 'safety_rejection' : 'assistant_error',
            result_type: outcome.resultType,
            safety_rejection: outcome.safetyRejection ?? null,
          },
        })
      } else {
        emitAssistantTrace('turn_completed', trace, {
          payload: { outcome: 'success', result_type: outcome.resultType },
        })
      }
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
  }, [startNewSession, endSession, persistSessionMessages, buildCorrelationId, profile?.token])

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
      args?: Record<string, unknown>
    }
  ) => {
    const { conversationState, args, ...toolActionExtra } = extra ?? {}
    setMessages(prev => {
      const updated = prev.map(m =>
        m.id === messageId && m.toolAction
          ? {
              ...m,
              conversationState: conversationState ?? m.conversationState,
              toolAction: {
                ...m.toolAction,
                status,
                ...(args ? { args: { ...m.toolAction.args, ...args } } : {}),
                ...toolActionExtra,
              },
            }
          : m
      )
      if (sessionRef.current) persistSessionMessages(sessionRef.current.id, updated)
      return updated
    })
  }, [persistSessionMessages])

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
      if (sessionRef.current) persistSessionMessages(sessionRef.current.id, updated)
      return updated
    })
  }, [persistSessionMessages])

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
    selectExperienceMode,
    privateHistory,
    resumePrivateConversation,
  }
}
