import { useState, useCallback, useRef, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import type { EventWithDetails } from './useCalendarEvents'
import type { FamilyMember } from '../types'
import { useAISession, type AIMessage } from './useAISession'
import { readVoiceRuntimeConfig, shouldEmitVoiceDebug } from '../lib/voiceRuntimeConfig'

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

type AIAssistantResponse = {
  type?: string
  code?: string
  message?: string
  text?: string
  tool?: unknown
  args?: unknown
  display_text?: string
}

const GOODBYE_PHRASES = /\b(thank you|thanks|goodbye|bye|that'?s all|all done|good night|ciao|close session|new session|start over|end session)\b/i
const GROCERY_NON_ADD_INTENTS = /\b(what|show|list|what's|whats|how many|remove|delete|clear|check|uncheck|done|completed|archive)\b/i
const ASSISTANT_STAGE_TIMEOUTS_MS = [12_000, 7_000] as const
const ASSISTANT_TOTAL_BUDGET_MS = 9_000
const COMMAND_SYNC_TIMEOUT_MS = 1_800
const SIMPLE_COMMAND_SLO_MS = 2_000
const TURN_SLO_MS = 6_000
const AI_LATENCY_METRICS_KEY = 'casa-ai-latency-rollup'
const AI_LATENCY_WINDOW_SIZE = 120
const VOICE_DEBUG_DEVICE_ID_KEY = 'casa-voice-debug-device-id'

type AssistantErrorKind = 'timeout' | 'network' | 'provider' | 'unknown'
type SimpleCommandExecution = {
  executed: boolean
  assistantMessage?: string
}

type SendOptions = {
  skipGoodbyeCheck?: boolean
  disableFastGroceryLane?: boolean
  traceId?: string
}

function isRetriableAssistantError(error: unknown): boolean {
  const kind = classifyAssistantError(error)
  return kind === 'network' || kind === 'provider'
}

function classifyAssistantError(error: unknown): AssistantErrorKind {
  const raw = (error as { message?: string })?.message ?? String(error ?? '')
  const msg = raw.toLowerCase()
  if (msg.includes('timed out') || msg.includes('timeout')) return 'timeout'
  if (
    msg.includes('network') ||
    msg.includes('failed to fetch') ||
    msg.includes('fetch failed') ||
    msg.includes('gateway')
  ) return 'network'
  if (
    msg.includes('resource_exhausted') ||
    msg.includes('quota') ||
    msg.includes('service unavailable') ||
    msg.includes('temporarily unavailable')
  ) return 'provider'
  return 'unknown'
}

function dispatchGroceryUpdated() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent('casa:grocery-updated'))
}

function getVoiceDebugDeviceId(): string | undefined {
  if (typeof window === 'undefined') return undefined
  try {
    return localStorage.getItem(VOICE_DEBUG_DEVICE_ID_KEY) ?? undefined
  } catch {
    return undefined
  }
}

function detectClientBuildFingerprint(): string | undefined {
  if (typeof document === 'undefined') return undefined
  const moduleScripts = Array.from(document.querySelectorAll('script[type="module"][src]'))
  const appScript = moduleScripts
    .map((script) => script.getAttribute('src') ?? '')
    .find((src) => src.includes('/assets/index-') || src.includes('index-'))
  if (!appScript) return undefined
  const fileName = appScript.split('/').pop() ?? appScript
  return fileName || undefined
}

type AssistantDebugMeta = {
  correlationId?: string
  actionId?: string
  lane?: string
  payload?: unknown
}

function emitAssistantDebug(event: string, detail?: string, meta?: AssistantDebugMeta) {
  if (typeof window === 'undefined') return
  const config = readVoiceRuntimeConfig()
  if (!shouldEmitVoiceDebug(config.debugLevel, 'minimal')) return
  window.dispatchEvent(new CustomEvent('casa:ai-debug', {
    detail: { event, detail, meta },
  }))
}

function emitSloBreach(stage: string, elapsedMs: number, budgetMs: number) {
  emitAssistantDebug('assistant_slo_breach', `${stage} elapsed=${elapsedMs} budget=${budgetMs}`)
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))
  return sorted[idx]
}

function recordLatencyMetric(lane: string, elapsedMs: number): void {
  if (typeof window === 'undefined') return
  try {
    const raw = localStorage.getItem(AI_LATENCY_METRICS_KEY)
    const parsed = raw ? JSON.parse(raw) as { byLane?: Record<string, number[]>; updatedAt?: string } : {}
    const byLane = parsed.byLane ?? {}
    const samples = [...(byLane[lane] ?? []), elapsedMs].slice(-AI_LATENCY_WINDOW_SIZE)
    byLane[lane] = samples
    localStorage.setItem(AI_LATENCY_METRICS_KEY, JSON.stringify({
      byLane,
      updatedAt: new Date().toISOString(),
    }))
    emitAssistantDebug(
      'assistant_latency_rollup',
      `lane=${lane} p50=${Math.round(percentile(samples, 50))} p95=${Math.round(percentile(samples, 95))} p99=${Math.round(percentile(samples, 99))} n=${samples.length}`,
    )
  } catch {
    // ignore localStorage metric failures
  }
}

function shouldFastAddGrocery(page: string, text: string, hasImage: boolean, disableFastLane?: boolean): boolean {
  if (disableFastLane) return false
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
    // Handle "plus" and "then" cadence in one-breath dictation.
    .replace(/\s+(?:plus|then)\s+/gi, ', ')
    // Normalize spoken punctuation words.
    .replace(/\bcomma\b/gi, ', ')
  const rawParts = expanded
    .split(/,| and /i)
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
  const dedup = new Map<string, string>()
  for (const part of rawParts) {
    const canonical = part
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    if (!canonical) continue
    if (!dedup.has(canonical)) dedup.set(canonical, part)
  }
  return Array.from(dedup.values()).map((name) => ({ name }))
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

function toIsoWithOffset(date: Date): string {
  const offsetMinutes = -date.getTimezoneOffset()
  const sign = offsetMinutes >= 0 ? '+' : '-'
  const abs = Math.abs(offsetMinutes)
  const hh = String(Math.floor(abs / 60)).padStart(2, '0')
  const mm = String(abs % 60).padStart(2, '0')
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  const h = String(date.getHours()).padStart(2, '0')
  const min = String(date.getMinutes()).padStart(2, '0')
  const sec = String(date.getSeconds()).padStart(2, '0')
  return `${y}-${m}-${d}T${h}:${min}:${sec}${sign}${hh}:${mm}`
}

const MONTH_INDEX: Record<string, number> = {
  jan: 0, january: 0,
  feb: 1, february: 1,
  mar: 2, march: 2,
  apr: 3, april: 3,
  may: 4,
  jun: 5, june: 5,
  jul: 6, july: 6,
  aug: 7, august: 7,
  sep: 8, sept: 8, september: 8,
  oct: 9, october: 9,
  nov: 10, november: 10,
  dec: 11, december: 11,
}

const WEEKDAY_INDEX: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
}

function resolveDateFromPhrase(phrase: string, now: Date): Date {
  const lower = phrase.toLowerCase()
  if (/\btomorrow\b/.test(lower)) {
    const d = new Date(now)
    d.setDate(d.getDate() + 1)
    return d
  }
  if (/\btoday\b/.test(lower)) return new Date(now)

  const monthMatch = lower.match(/\b(?:on\s+)?(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?\b/)
  if (monthMatch) {
    const month = MONTH_INDEX[monthMatch[1]]
    const day = Number.parseInt(monthMatch[2], 10)
    if (!Number.isNaN(month) && !Number.isNaN(day)) {
      const candidate = new Date(now.getFullYear(), month, day)
      if (candidate < new Date(now.getFullYear(), now.getMonth(), now.getDate())) {
        candidate.setFullYear(candidate.getFullYear() + 1)
      }
      return candidate
    }
  }

  const weekdayMatch = lower.match(/\b(?:on\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/)
  if (weekdayMatch) {
    const targetDay = WEEKDAY_INDEX[weekdayMatch[1]]
    const candidate = new Date(now)
    const delta = (targetDay - candidate.getDay() + 7) % 7
    candidate.setDate(candidate.getDate() + delta)
    return candidate
  }

  return new Date(now)
}

function parseClockTime(phrase: string): null | { hour24: number; minute: number; matched: string; index: number } {
  const match = /(\d{1,2})(?::(\d{2}))?\s*(a\.?\s*m\.?|p\.?\s*m\.?)\b/i.exec(phrase)
  if (!match || typeof match.index !== 'number') return null
  const rawHour = Number.parseInt(match[1], 10)
  const minute = Number.parseInt(match[2] ?? '0', 10)
  const meridiem = match[3].toLowerCase().replace(/[^ap]/g, '')
  if (rawHour < 1 || rawHour > 12 || minute < 0 || minute > 59) return null
  return {
    hour24: (rawHour % 12) + (meridiem === 'p' ? 12 : 0),
    minute,
    matched: match[0],
    index: match.index,
  }
}

function parseDurationMinutes(phrase: string): { minutes: number; cleaned: string } {
  const match = phrase.match(/\bfor\s+(\d{1,3})\s*(minutes?|mins?|hours?|hrs?)\b/i)
  if (!match) return { minutes: 60, cleaned: phrase }
  const qty = Number.parseInt(match[1], 10)
  const unit = match[2].toLowerCase()
  if (Number.isNaN(qty) || qty <= 0) return { minutes: 60, cleaned: phrase }
  const minutes = unit.startsWith('hour') || unit.startsWith('hr') ? qty * 60 : qty
  const safeMinutes = Math.max(15, Math.min(240, minutes))
  return {
    minutes: safeMinutes,
    cleaned: phrase.replace(match[0], ' ').replace(/\s+/g, ' ').trim(),
  }
}

function parseSimpleCalendarCommand(
  text: string,
  family: FamilyMember[],
): null | { title: string; start: string; end: string; members: string[]; pattern: string } {
  const normalized = text.trim().replace(/\s+/g, ' ')
  if (!normalized || normalized.endsWith('?')) return null
  if (!/^(?:alexa\s+)?(?:please\s+)?(?:add|create|schedule)\b/i.test(normalized)) return null
  if (!/\b(appointment|appt|event|reminder)\b/i.test(normalized)) return null

  const lead = normalized.match(/^(?:alexa\s+)?(?:please\s+)?(?:add|create|schedule)\s+(?:an?\s+)?(?:appointment|appt|event|reminder)\s+(.*)$/i)
  const tail = (lead?.[1] ?? '').trim()
  if (!tail) return null

  const time = parseClockTime(tail)
  if (!time) return null

  const now = new Date()
  const baseDate = resolveDateFromPhrase(tail, now)
  const start = new Date(baseDate)
  start.setHours(time.hour24, time.minute, 0, 0)

  const beforeTime = tail.slice(0, time.index).trim()
  const afterTime = tail.slice(time.index + time.matched.length).trim()

  let pattern: string
  let subjectRaw: string
  if (/^(?:to|for)\s+/i.test(afterTime)) {
    subjectRaw = afterTime.replace(/^(?:to|for)\s+/i, '')
    pattern = 'time-then-to-for-subject'
  } else {
    const connectorSubject = tail.match(/\b(?:to|for)\s+(.+)$/i)
    if (connectorSubject) {
      subjectRaw = connectorSubject[1]
      pattern = 'connector-subject'
    } else if (afterTime.length > 0) {
      subjectRaw = afterTime
      pattern = 'time-then-subject'
    } else {
      subjectRaw = beforeTime
      pattern = 'subject-before-time'
    }
  }

  const durationParsed = parseDurationMinutes(subjectRaw)
  const subject = durationParsed.cleaned
    .replace(/\b(today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/gi, ' ')
    .replace(/\b(?:on\s+)?(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2}(?:st|nd|rd|th)?\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.?!]+$/g, '')
  if (!subject) return null

  if (start < now && !/\b(today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i.test(tail)) {
    start.setDate(start.getDate() + 1)
    pattern = `${pattern}-rolled-next-day`
  }
  const end = new Date(start.getTime() + durationParsed.minutes * 60 * 1000)

  const members = family
    .map((person) => person.name)
    .filter((name) => subject.toLowerCase().includes(name.toLowerCase()))

  return {
    title: subject,
    start: toIsoWithOffset(start),
    end: toIsoWithOffset(end),
    members,
    pattern,
  }
}

function parseFollowupAddMemberCommand(text: string, family: FamilyMember[]): string | null {
  const normalized = text.trim().toLowerCase().replace(/\s+/g, ' ')
  const match = normalized.match(/^(?:also\s+)?add\s+([a-z][a-z\s'-]{0,30}?)(?:\s+(?:to|too))?$/i)
  if (!match) return null
  const requested = match[1].trim()
  const familyMatch = family.find((person) => person.name.toLowerCase() === requested)
  return familyMatch?.name ?? null
}

function buildContext(ctx: AssistantContext) {
  const now = new Date()
  const offsetMins = -now.getTimezoneOffset()
  const offsetSign = offsetMins >= 0 ? '+' : '-'
  const offsetAbs = Math.abs(offsetMins)
  const utcOffset = `${offsetSign}${String(Math.floor(offsetAbs / 60)).padStart(2, '0')}:${String(offsetAbs % 60).padStart(2, '0')}`

  const ambiguousTimeDefaultMeridiem = now.getHours() >= 6 && now.getHours() < 18 ? 'PM' : 'AM'

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
    ambiguousTimeDefaultMeridiem,
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
  const lastDeterministicEventIdRef = useRef<string | null>(null)
  const lastRequestRef = useRef<{
    text: string
    image?: { dataUrl: string; mimeType: string }
    options?: SendOptions
  } | null>(null)
  useEffect(() => { sessionRef.current = session }, [session])
  useEffect(() => { messagesRef.current = messages }, [messages])
  useEffect(() => { ctxRef.current = ctx })

  // Sync messages from session when session loads — but never overwrite messages
  // already accumulated (e.g. user spoke before sessionLoading resolved)
  useEffect(() => {
    if (!sessionLoading && session) {
      const timer = setTimeout(() => {
        setMessages(prev => prev.length === 0 ? session.messages : prev)
      }, 0)
      return () => clearTimeout(timer)
    } else if (!sessionLoading && !session) {
      const timer = setTimeout(() => {
        setMessages(prev => prev.length === 0 ? [] : prev)
      }, 0)
      return () => clearTimeout(timer)
    }
  }, [sessionLoading, session?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const startFresh = useCallback(() => {
    endSession()   // clear localStorage so next open is truly blank
    lastDeterministicEventIdRef.current = null
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
    options?: SendOptions,
  ) => {
    const turnStart = performance.now()
    const trimmedText = text.trim()
    emitAssistantDebug(
      'send_start',
      `page=${ctxRef.current.page} chars=${trimmedText.length} text=${trimmedText.slice(0, 140)}`,
      { payload: { page: ctxRef.current.page, chars: trimmedText.length, text: trimmedText.slice(0, 600) } },
    )
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
    const explicitTraceId = typeof options?.traceId === 'string' ? options.traceId.trim() : ''
    const traceId = explicitTraceId.length > 0 ? explicitTraceId : activeSession.id
    const turnId = userMsg.id
    const deviceId = getVoiceDebugDeviceId()
    const clientBuild = detectClientBuildFingerprint()
    const clientTraceMeta = {
      client_trace_present: Boolean(traceId && turnId && deviceId),
      client_build: clientBuild,
      client_trace_source: 'use-ai-assistant',
    }

    const runSimpleCommandLane = async (): Promise<SimpleCommandExecution> => {
      if (ctxRef.current.page === 'grocery' || Boolean(image)) return { executed: false }
      const followupMember = parseFollowupAddMemberCommand(trimmedText, ctxRef.current.family)
      if (followupMember && lastDeterministicEventIdRef.current) {
        const actionId = genId()
        const correlationId = buildCorrelationId(actionId, activeSession.id)
        const eventId = lastDeterministicEventIdRef.current
        emitAssistantDebug(
          'simple_command_detected',
          `type=update_event_add_member action=${actionId.slice(0, 8)} event=${eventId.slice(0, 8)} member=${followupMember} corr=${correlationId.slice(0, 28)}`,
          { correlationId, actionId, lane: 'command', payload: { eventId, member: followupMember } },
        )
        const stageStart = performance.now()
        const latestRow = await supabase
          .from('events')
          .select('updated_at')
          .eq('id', eventId)
          .single()
        if (latestRow.error || !latestRow.data?.updated_at) {
          emitAssistantDebug('simple_command_error', `update_event_add_member_missing_row:${eventId}`)
          return { executed: false }
        }
        const executePromise = supabase.functions.invoke('execute-ai-action', {
          body: {
            tool: 'update_event',
            args: {
              id: eventId,
              expected_updated_at: latestRow.data.updated_at,
              members_add: [followupMember],
            },
            action_id: actionId,
            session_id: activeSession.id,
            correlation_id: correlationId,
            trace_id: traceId,
            turn_id: turnId,
            lane: 'command',
            device_id: deviceId,
            ...clientTraceMeta,
            sync_mode: 'async',
          },
        })
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`command execute timeout after ${COMMAND_SYNC_TIMEOUT_MS}ms`)), COMMAND_SYNC_TIMEOUT_MS),
        )
        try {
          const exec = await Promise.race([executePromise, timeoutPromise]) as Awaited<typeof executePromise>
          const stageDuration = Math.round(performance.now() - stageStart)
          emitAssistantDebug('simple_command_stage_ms', `execute_ai_action=${stageDuration}`)
          if (stageDuration > SIMPLE_COMMAND_SLO_MS) emitSloBreach('simple_command', stageDuration, SIMPLE_COMMAND_SLO_MS)
          if (exec.error || exec.data?.success === false) {
            const err = exec.error?.message ?? exec.data?.error ?? 'unknown error'
            emitAssistantDebug(
              'simple_command_error',
              `action=${actionId.slice(0, 8)} event=${eventId.slice(0, 8)} ${err}`,
              { correlationId, actionId, lane: 'command', payload: { eventId, error: err } },
            )
            return { executed: true, assistantMessage: `I heard you, but I couldn't add ${followupMember} yet: ${err}` }
          }
          emitAssistantDebug(
            'simple_command_success',
            `action=${actionId.slice(0, 8)} event=${eventId.slice(0, 8)} added_member=${followupMember} sync=${exec.data?.sync_status ?? 'unknown'}`,
            { correlationId, actionId, lane: 'command', payload: { eventId, member: followupMember, syncStatus: exec.data?.sync_status } },
          )
          return { executed: true, assistantMessage: `Done — I added ${followupMember} to that appointment.` }
        } catch (err) {
          const stageDuration = Math.round(performance.now() - stageStart)
          emitAssistantDebug('simple_command_stage_ms', `execute_ai_action=${stageDuration}`)
          emitAssistantDebug(
            'simple_command_exception',
            `action=${actionId.slice(0, 8)} event=${eventId.slice(0, 8)} ${(err as Error).message ?? 'unknown error'}`,
            { correlationId, actionId, lane: 'command', payload: { eventId, error: (err as Error).message ?? 'unknown error' } },
          )
          return { executed: true, assistantMessage: `I heard you, but adding ${followupMember} took too long. Please try once.` }
        }
      }

      const parsed = parseSimpleCalendarCommand(trimmedText, ctxRef.current.family)
      if (!parsed) return { executed: false }
      const actionId = genId()
      const correlationId = buildCorrelationId(actionId, activeSession.id)
      const stageStart = performance.now()
      emitAssistantDebug(
        'simple_command_detected',
        `type=create_event action=${actionId.slice(0, 8)} pattern=${parsed.pattern} corr=${correlationId.slice(0, 28)}`,
        { correlationId, actionId, lane: 'command', payload: { pattern: parsed.pattern, title: parsed.title, start: parsed.start, end: parsed.end } },
      )

      const executePromise = supabase.functions.invoke('execute-ai-action', {
        body: {
          tool: 'create_event',
          args: {
            title: parsed.title,
            start: parsed.start,
            end: parsed.end,
            members: parsed.members,
            all_day: false,
            event_type: 'event',
          },
          action_id: actionId,
          session_id: activeSession.id,
          correlation_id: correlationId,
          trace_id: traceId,
          turn_id: turnId,
          lane: 'command',
          device_id: deviceId,
          ...clientTraceMeta,
          sync_mode: 'async',
        },
      })
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`command execute timeout after ${COMMAND_SYNC_TIMEOUT_MS}ms`)), COMMAND_SYNC_TIMEOUT_MS),
      )

      try {
        const exec = await Promise.race([executePromise, timeoutPromise]) as Awaited<typeof executePromise>
        const stageDuration = Math.round(performance.now() - stageStart)
        emitAssistantDebug('simple_command_stage_ms', `execute_ai_action=${stageDuration}`)
        if (stageDuration > SIMPLE_COMMAND_SLO_MS) {
          emitSloBreach('simple_command', stageDuration, SIMPLE_COMMAND_SLO_MS)
        }
        if (exec.error || exec.data?.success === false) {
          const err = exec.error?.message ?? exec.data?.error ?? 'unknown error'
          emitAssistantDebug(
            'simple_command_error',
            `action=${actionId.slice(0, 8)} ${err}`,
            { correlationId, actionId, lane: 'command', payload: { error: err } },
          )
          return {
            executed: true,
            assistantMessage: `I understood the request, but I couldn't save it yet: ${err}`,
          }
        }
        const createdEventId = typeof exec.data?.event_id === 'string' ? exec.data.event_id : null
        if (createdEventId) lastDeterministicEventIdRef.current = createdEventId
        emitAssistantDebug(
          'simple_command_success',
          `action=${actionId.slice(0, 8)} event=${createdEventId ? createdEventId.slice(0, 8) : 'none'} sync=${exec.data?.sync_status ?? 'unknown'} title=${parsed.title.slice(0, 80)}`,
          { correlationId, actionId, lane: 'command', payload: { createdEventId, syncStatus: exec.data?.sync_status, title: parsed.title } },
        )
        return {
          executed: true,
          assistantMessage: `Done — I added "${parsed.title}" at ${new Date(parsed.start).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.`,
        }
      } catch (err) {
        const stageDuration = Math.round(performance.now() - stageStart)
        emitAssistantDebug('simple_command_stage_ms', `execute_ai_action=${stageDuration}`)
        emitAssistantDebug(
          'simple_command_exception',
          `action=${actionId.slice(0, 8)} ${(err as Error).message ?? 'unknown error'}`,
          { correlationId, actionId, lane: 'command', payload: { error: (err as Error).message ?? 'unknown error' } },
        )
        return {
          executed: true,
          assistantMessage: 'I heard the command, but execution took too long. Please repeat once.',
        }
      }
    }

    const simpleCommand = await runSimpleCommandLane()
    if (simpleCommand.executed) {
      const assistantMsg: AIMessage = {
        id: genId(),
        role: 'assistant',
        content: simpleCommand.assistantMessage ?? 'Done.',
      }
      setMessages(prev => {
        const updated = [...prev, assistantMsg]
        if (activeSession) saveMessages(activeSession.id, updated)
        return updated
      })
      const turnDuration = Math.round(performance.now() - turnStart)
      emitAssistantDebug('assistant_turn_ms', `lane=command elapsed=${turnDuration}`)
      recordLatencyMetric('command', turnDuration)
      if (turnDuration > TURN_SLO_MS) emitSloBreach('turn_total', turnDuration, TURN_SLO_MS)
      setLoading(false)
      return
    }

    if (shouldFastAddGrocery(ctxRef.current.page, trimmedText, Boolean(image), options?.disableFastGroceryLane)) {
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
              trace_id: traceId,
              turn_id: turnId,
              lane: 'fast_add',
              device_id: deviceId,
              ...clientTraceMeta,
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
          const turnDuration = Math.round(performance.now() - turnStart)
          emitAssistantDebug('assistant_turn_ms', `lane=fast_add elapsed=${turnDuration}`)
          recordLatencyMetric('fast_add', turnDuration)
          if (turnDuration > TURN_SLO_MS) emitSloBreach('turn_total', turnDuration, TURN_SLO_MS)
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
        const turnDuration = Math.round(performance.now() - turnStart)
        emitAssistantDebug('assistant_turn_ms', `lane=fast_add_error elapsed=${turnDuration}`)
        recordLatencyMetric('fast_add_error', turnDuration)
        if (turnDuration > TURN_SLO_MS) emitSloBreach('turn_total', turnDuration, TURN_SLO_MS)
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
      emitAssistantDebug(
        'assistant_invoke_start',
        `messages=${allMsgsForApi.length} corr=${aiCorrelationId.slice(0, 28)}`,
        { correlationId: aiCorrelationId, lane: 'llm', payload: { messages: allMsgsForApi.length } },
      )

      const invokeAssistant = async (timeoutMs: number) => {
        const invokePromise = supabase.functions.invoke('ai-assistant', {
          body: {
            messages: allMsgsForApi,
            context: buildContext(ctxRef.current),
            image: imagePayload,
            session_id: activeSession.id,
            correlation_id: aiCorrelationId,
            trace_id: traceId,
            turn_id: turnId,
            lane: 'llm',
            device_id: deviceId,
            ...clientTraceMeta,
          },
        })
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`AI request timed out after ${timeoutMs}ms`)), timeoutMs)
        )
        return await Promise.race([invokePromise, timeoutPromise]) as Awaited<typeof invokePromise>
      }

      let data: AIAssistantResponse | undefined
      let invokeError: unknown = null
      for (let attempt = 1; attempt <= ASSISTANT_STAGE_TIMEOUTS_MS.length; attempt += 1) {
        if (performance.now() - turnStart > ASSISTANT_TOTAL_BUDGET_MS && attempt > 1) {
          emitAssistantDebug(
            'assistant_budget_exhausted',
            `elapsed=${Math.round(performance.now() - turnStart)}`,
            { correlationId: aiCorrelationId, lane: 'llm', payload: { elapsed: Math.round(performance.now() - turnStart) } },
          )
          break
        }
        const timeoutMs = ASSISTANT_STAGE_TIMEOUTS_MS[attempt - 1]
        const stageStart = performance.now()
        try {
          const result = await invokeAssistant(timeoutMs)
          if (result.error) throw result.error
          data = (result.data ?? {}) as AIAssistantResponse
          invokeError = null
          const elapsed = Math.round(performance.now() - stageStart)
          emitAssistantDebug(
            'assistant_stage_ms',
            `attempt=${attempt} timeout=${timeoutMs} elapsed=${elapsed}`,
            { correlationId: aiCorrelationId, lane: 'llm', payload: { attempt, timeoutMs, elapsed } },
          )
          if (elapsed > timeoutMs) emitSloBreach(`assistant_attempt_${attempt}`, elapsed, timeoutMs)
          if (attempt > 1) {
            emitAssistantDebug('assistant_invoke_retry_success', `attempt=${attempt}`, { correlationId: aiCorrelationId, lane: 'llm', payload: { attempt } })
          }
          break
        } catch (err) {
          invokeError = err
          const kind = classifyAssistantError(err)
          const retriable = isRetriableAssistantError(err)
          const elapsed = Math.round(performance.now() - stageStart)
          emitAssistantDebug(
            'assistant_stage_ms',
            `attempt=${attempt} timeout=${timeoutMs} elapsed=${elapsed}`,
            { correlationId: aiCorrelationId, lane: 'llm', payload: { attempt, timeoutMs, elapsed } },
          )
          emitAssistantDebug(
            'assistant_invoke_attempt_error',
            `attempt=${attempt} kind=${kind} retriable=${retriable} ${(err as Error).message ?? 'unknown error'}`,
            { correlationId: aiCorrelationId, lane: 'llm', payload: { attempt, kind, retriable, error: (err as Error).message ?? 'unknown error' } },
          )
          if (!retriable || attempt === ASSISTANT_STAGE_TIMEOUTS_MS.length) break
          await new Promise((resolve) => setTimeout(resolve, 450))
          emitAssistantDebug('assistant_invoke_retry', `attempt=${attempt + 1}`, { correlationId: aiCorrelationId, lane: 'llm', payload: { attempt: attempt + 1 } })
        }
      }
      if (invokeError) throw invokeError
      if (!data) throw new Error('AI request returned no data')
      emitAssistantDebug(
        'assistant_invoke_result',
        `type=${data.type ?? 'unknown'} code=${data.code ?? 'none'} tool=${typeof data.tool === 'string' ? data.tool : 'none'}`,
        { correlationId: aiCorrelationId, lane: 'llm', payload: { type: data.type, code: data.code, tool: data.tool } },
      )

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
              trace_id: traceId,
              turn_id: turnId,
              lane: 'tool_action',
              device_id: deviceId,
              ...clientTraceMeta,
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

      emitAssistantDebug(
        'assistant_response_text',
        assistantMsg.content.slice(0, 240),
        { correlationId: aiCorrelationId, lane: data.type === 'tool_action' ? 'tool_action' : 'llm', payload: { content: assistantMsg.content } },
      )
      setMessages(prev => {
        const updated = [...prev, assistantMsg]
        if (activeSession) saveMessages(activeSession.id, updated)
        return updated
      })
      const turnDuration = Math.round(performance.now() - turnStart)
      emitAssistantDebug('assistant_turn_ms', `lane=llm elapsed=${turnDuration}`, { correlationId: aiCorrelationId, lane: 'llm', payload: { elapsed: turnDuration } })
      recordLatencyMetric('llm', turnDuration)
      if (turnDuration > TURN_SLO_MS) emitSloBreach('turn_total', turnDuration, TURN_SLO_MS)
    } catch (e) {
      emitAssistantDebug('assistant_invoke_exception', (e as Error).message ?? 'unknown error', { lane: 'llm', payload: { error: (e as Error).message ?? 'unknown error' } })
      const kind = classifyAssistantError(e)
      const isTimeout = kind === 'timeout'
      const errMsg: AIMessage = {
        id: genId(),
        role: 'assistant',
        content: isTimeout
          ? '⏱ Taking too long to respond. Please try again.'
          : 'Sorry, something went wrong. Please try again.',
      }
      setMessages(prev => [...prev, errMsg])
      const turnDuration = Math.round(performance.now() - turnStart)
      emitAssistantDebug('assistant_turn_ms', `lane=error elapsed=${turnDuration} kind=${kind}`, { lane: 'error', payload: { elapsed: turnDuration, kind } })
      recordLatencyMetric('error', turnDuration)
      if (turnDuration > TURN_SLO_MS) emitSloBreach('turn_total', turnDuration, TURN_SLO_MS)
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
