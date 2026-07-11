import { createClient } from 'npm:@supabase/supabase-js@2'
import {
  AMBIGUITY_GUARDRAILS,
  DIFF_AND_OUTPUT_GUARDRAILS,
  EDIT_INTENT_GUARDRAILS,
  RECOVERY_AND_CONFLICT_GUARDRAILS,
} from '../_shared/ai-prompt-guardrails.mjs'
import { optionalEnv, requireEnv } from '../_shared/env.mjs'
import { computeTravelEta } from '../_shared/travel-eta.mjs'
import { classifyAssistantIntent } from '../_shared/assistant-intent-profile.mjs'
import { resolveDeterministicEventMutation } from '../_shared/deterministic-event-mutation.mjs'
import {
  answerGroundedEventFollowUp,
  eventConversationState,
  normalizeConversationState,
} from '../_shared/assistant-conversation-grounding.mjs'
import { secureAssistantResult } from '../_shared/assistant-output-safety.mjs'
import { resolveCalendarDayRead } from '../_shared/assistant-calendar-read.mjs'
import { resolveBringListEdit } from '../_shared/assistant-event-list-edit.mjs'
import { resolveUniqueEventTitle } from '../_shared/assistant-event-selection.mjs'
import {
  classifyEventTravelFollowUp,
  eventTravelDestination,
  formatEventTravelAnswer,
} from '../_shared/assistant-event-travel.mjs'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface ImagePayload { mimeType: string; data: string }
type GeminiUsageMetadata = {
  promptTokenCount?: number
  candidatesTokenCount?: number
  totalTokenCount?: number
}
type LlmTelemetry = {
  provider: string
  model: string
  llm_calls: number
  llm_inference_ms: number
  input_tokens: number
  output_tokens: number
  total_tokens: number
}

const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash-lite'
const SUPPORTED_GEMINI_MODELS = new Set([
  'gemini-2.5-flash-lite',
  'gemini-2.5-flash',
  'gemini-3.5-flash',
])

function isSupportedGeminiModel(value: string): boolean {
  return SUPPORTED_GEMINI_MODELS.has(value)
}

function sanitizeIngressText(value: unknown, maxLen = 1800): string | null {
 if (typeof value !== 'string') return null
 const normalized = value.replace(/\s+/g, ' ').trim()
 if (!normalized) return null
 return normalized.slice(0, maxLen)
}

function toNonNegativeInt(value: unknown): number {
 return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.round(value) : 0
}

function extractGeminiUsage(payload: unknown): { inputTokens: number; outputTokens: number; totalTokens: number } {
 const usage = (payload as { usageMetadata?: GeminiUsageMetadata } | null)?.usageMetadata
 return {
   inputTokens: toNonNegativeInt(usage?.promptTokenCount),
   outputTokens: toNonNegativeInt(usage?.candidatesTokenCount),
   totalTokens: toNonNegativeInt(usage?.totalTokenCount),
 }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })

  const sb = createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'))
  const mapsKey = optionalEnv('GOOGLE_MAPS_API_KEY', '')
  const braveKey = optionalEnv('BRAVE_API_KEY', '')

  const {
    messages,
    context,
    image,
    correlation_id: correlationId,
    trace_id: traceIdRaw,
    turn_id: turnIdRaw,
    lane: laneRaw,
    device_id: deviceIdRaw,
    client_trace_present: clientTracePresentRaw,
    client_build: clientBuildRaw,
    client_trace_source: clientTraceSourceRaw,
    dry_run: dryRunRaw,
    model_override: modelOverrideRaw,
    stream: streamRaw,
  } = await req.json()
  const wantStream = streamRaw === true
  // Assigned by the SSE ReadableStream controller when streaming; no-op otherwise.
  // Token-producing LLM calls forward text deltas through this so the client can
  // render the answer progressively. Default no-op = identical non-streaming behavior.
  let emitToken: (delta: string) => void = () => {}
  const modelOverride = typeof modelOverrideRaw === 'string' && modelOverrideRaw.trim().length > 0
    ? modelOverrideRaw.trim()
    : null
  const cid = correlationId ?? `${context?.page ?? 'unknown'}:${Date.now().toString(36)}`
  const traceId = typeof traceIdRaw === 'string' && traceIdRaw.trim().length > 0
    ? traceIdRaw
    : String(cid.split(':')[0] || cid)
  const turnId = typeof turnIdRaw === 'string' && turnIdRaw.trim().length > 0 ? turnIdRaw : null
  const lane = typeof laneRaw === 'string' && laneRaw.trim().length > 0 ? laneRaw : 'llm'
  const deviceId = typeof deviceIdRaw === 'string' && deviceIdRaw.trim().length > 0 ? deviceIdRaw : null
  const dryRun = dryRunRaw === true
  const clientBuild = typeof clientBuildRaw === 'string' && clientBuildRaw.trim().length > 0
    ? clientBuildRaw.slice(0, 120)
    : null
  const clientTraceSource = typeof clientTraceSourceRaw === 'string' && clientTraceSourceRaw.trim().length > 0
    ? clientTraceSourceRaw.slice(0, 80)
    : null
  const inferredClientTracePresent = Boolean(traceId && turnId && deviceId)
  const clientTracePresent = typeof clientTracePresentRaw === 'boolean'
    ? clientTracePresentRaw
    : inferredClientTracePresent
  const requestStartMs = Date.now()
  const REQUEST_HARD_TIMEOUT_MS = 9000
  const PRIMARY_HARD_TIMEOUT_MS = 6000
  const SECONDARY_HARD_TIMEOUT_MS = 5000
  const FALLBACK_HARD_TIMEOUT_MS = 2200
  const STAGE_SLO = {
    contextLoadMs: 1200,
    llmPrimaryMs: 4500,
    requestTotalMs: 7000,
  } as const
  const warnIfSlow = (stage: string, elapsedMs: number, budgetMs: number) => {
    if (elapsedMs > budgetMs) {
      console.warn(`[ai-assistant][${cid}] slo_breach stage=${stage} elapsed=${elapsedMs} budget=${budgetMs}`)
    }
  }
  const remainingRequestBudgetMs = () =>
    Math.max(0, REQUEST_HARD_TIMEOUT_MS - (Date.now() - requestStartMs))
  const appendServerTrace = (event: string, detail: string, payload?: Record<string, unknown>) => {
    const dedupeKey = `${cid}|${event}|${turnId ?? 'no-turn'}|${detail.slice(0, 80)}`
    sb.from('ai_drawer_debug_events').insert({
      event,
      detail: detail.slice(0, 2000),
      channel: 'debug',
      session_id: traceId,
      turn_id: turnId,
      correlation_id: cid,
      lane,
      payload: payload ?? null,
      device_id: deviceId,
      page: context?.page ?? 'app',
      source_component: 'server:ai-assistant',
      source_origin: context?.page ?? null,
      source_href: null,
      user_agent: null,
      platform: Deno.build.os,
      dedupe_key: dedupeKey,
    }).then(() => {}).catch(() => {})
  }
  console.log(`[ai-assistant][${cid}] request messages=${Array.isArray(messages) ? messages.length : 0}`)
  const latestUserText = Array.isArray(messages)
    ? sanitizeIngressText(
      [...messages].reverse().find((msg) =>
        msg && typeof msg === 'object' && msg.role === 'user' && typeof msg.content === 'string'
      )?.content,
      2000,
    )
    : null
  const incomingConversationState = normalizeConversationState(context?.conversationState)
  const intentRouting = classifyAssistantIntent(latestUserText, {
    focusedEvent: Boolean(context?.focusedEvent),
    assistantMode: context?.assistant_mode,
    activeEntityType: incomingConversationState?.activeEntityType,
    pendingEventAction: context?.pendingAction?.tool === 'update_event',
  })
  appendServerTrace('server_ai_assistant_start', `messages=${Array.isArray(messages) ? messages.length : 0}`, {
    message_count: Array.isArray(messages) ? messages.length : 0,
    has_image: Boolean(image),
    dry_run: dryRun,
    client_trace_present: clientTracePresent,
    client_build: clientBuild,
    client_trace_source: clientTraceSource,
    intent_profile: intentRouting.profile,
    force_event_search: intentRouting.forceEventSearch,
    active_entity_type: incomingConversationState?.activeEntityType ?? null,
    active_event_id: incomingConversationState?.activeEventId ?? null,
  })
  if (latestUserText) {
    appendServerTrace('server_ai_assistant_ingress_user_text', latestUserText.slice(0, 300), {
      user_text: latestUserText,
      user_text_length: latestUserText.length,
      message_count: Array.isArray(messages) ? messages.length : 0,
      lane,
      client_build: clientBuild,
    })
  }
  if (!dryRun && !clientTracePresent && lane !== 'regression') {
    appendServerTrace('client_trace_absent_at_ingress', `lane=${lane}`, {
      lane,
      client_trace_present: false,
      client_build: clientBuild,
      client_trace_source: clientTraceSource,
    })
  }

  const run = async (): Promise<{ status: number; payload: Record<string, unknown> }> => {
  // Load config, saved places, contacts, grocery list, events in parallel
  const now = new Date()
  // Start from 24h ago so in-progress events (started earlier today) are visible
  const windowStart = new Date(now.getTime() - 24 * 60 * 60 * 1000)
  const yearEnd = new Date(); yearEnd.setFullYear(yearEnd.getFullYear() + 1, 11, 31); yearEnd.setHours(23,59,59,999)
  const needsEventData = ['event', 'full', 'travel'].includes(intentRouting.profile)
  const needsPlaceData = ['event', 'full', 'travel', 'places'].includes(intentRouting.profile)
  const needsContactData = ['event', 'full', 'places'].includes(intentRouting.profile)
  const needsGroceryData = ['grocery', 'recipe', 'full'].includes(intentRouting.profile)
  const needsRecipeData = ['recipe', 'full'].includes(intentRouting.profile)
  const needsAvailabilityData = ['event', 'full'].includes(intentRouting.profile)
  const skippedRows = Promise.resolve({ data: [], error: null })
  const skippedRow = Promise.resolve({ data: null, error: null })

  const contextLoadStartMs = Date.now()
  const [
    { data: cfgRow },
    homeConfigResult,
    { data: savedPlaces },
    savedContactsResult,
    eventsResult,
    { data: groceryLists },
    { data: groceryItems },
    { data: recipes },
    foodProfileResult,
    availabilityRulesResult,
    availabilityExceptionsResult,
  ] = await Promise.all([
    sb.from('settings').select('value').eq('key', 'llm_config').limit(1),
    needsPlaceData
      ? sb.from('settings').select('value').eq('key', 'home_config').maybeSingle()
      : skippedRow,
    needsPlaceData
      ? sb.from('saved_places').select('name, aliases, address, city, state, zip, category, notes, phone').order('name')
      : skippedRows,
    needsContactData
      ? sb.from('saved_contacts').select('name, aliases, phone, email, address, relationship, notes').order('name').then(r => r).catch(() => ({ data: null, error: null }))
      : skippedRows,
    needsEventData
      ? sb.from('events')
      .select('id, title, start_time, end_time, updated_at, location_name, address, all_day, event_type, description, event_enrichments(prep_notes, category, what_to_bring, outfit_suggestion, parking_notes, contact_name, contact_phone, cost_estimate, dietary_notes, meal_impact), event_checklist_items(id, label, note, checked, category, sort_order, created_at), event_action_items(id, title, description, due_date, is_urgent, completed, assigned_to, created_at), event_members(family_members(id, name))')
      .eq('status', 'confirmed')
      .gte('start_time', windowStart.toISOString())
      .lte('start_time', yearEnd.toISOString())
      .order('start_time')
      : skippedRows,
    needsGroceryData
      ? sb.from('grocery_lists').select('id, name').order('created_at').limit(5)
      : skippedRows,
    needsGroceryData
      ? sb.from('grocery_items')
      .select('id, list_id, name, quantity, unit, category, checked, notes')
      .eq('checked', false)
      .is('deleted_at', null)
      .order('category')
      .order('name')
      : skippedRows,
    needsRecipeData
      ? sb.from('recipes')
      .select('id, name, cook_time, servings')
      .order('last_used_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(30)
      : skippedRows,
    needsRecipeData
      ? sb.from('settings').select('value').eq('key', 'food_profile').maybeSingle().then(r => r).catch(() => ({ data: null, error: null }))
      : skippedRow,
    needsAvailabilityData
      ? sb.from('member_availability_rules').select('member_id, day_of_week, start_local, end_local, availability_type, reason').then(r => r).catch(() => ({ data: null, error: null }))
      : skippedRows,
    needsAvailabilityData
      ? sb.from('member_availability_exceptions').select('member_id, start_at, end_at, override_type, note').gte('end_at', windowStart.toISOString()).then(r => r).catch(() => ({ data: null, error: null }))
      : skippedRows,
  ])
  const homeConfig = homeConfigResult?.data?.value as { address?: string; city?: string; state?: string; zip?: string } | null
  const homeAddress = [homeConfig?.address, homeConfig?.city, homeConfig?.state, homeConfig?.zip].filter(Boolean).join(', ')

  if (eventsResult.error) {
    console.error('[ai-assistant] events query error:', JSON.stringify(eventsResult.error))
    return { status: 200, payload: { type: 'debug', error: eventsResult.error, yearStart: windowStart.toISOString(), yearEnd: yearEnd.toISOString(), correlation_id: cid } }
  }
  const allEvents = eventsResult.data
  const activeConversationEvent = incomingConversationState
    ? allEvents?.find((event: { id: string }) => event.id === incomingConversationState.activeEventId) ?? null
    : null
  let responseConversationState = activeConversationEvent
    ? eventConversationState(activeConversationEvent, now)
    : null
  console.log('[ai-assistant] events loaded:', allEvents?.length ?? 0)
  const contextLoadMs = Date.now() - contextLoadStartMs
  console.log(`[ai-assistant][${cid}] stage=context_load ms=${contextLoadMs}`)
  warnIfSlow('context_load', contextLoadMs, STAGE_SLO.contextLoadMs)

  const savedContacts = (savedContactsResult as { data: unknown }).data

  const config = cfgRow?.[0]?.value ?? { provider: 'gemini', model: DEFAULT_GEMINI_MODEL, api_key: '' }
  const apiKey = config.api_key as string
  const provider = String(config.provider ?? 'gemini')
  const configuredModel = ((config.model as string) || DEFAULT_GEMINI_MODEL).trim()
  const validatedConfiguredModel = provider === 'gemini' && !isSupportedGeminiModel(configuredModel)
    ? DEFAULT_GEMINI_MODEL
    : configuredModel
  const validatedOverrideModel = modelOverride && provider === 'gemini' && !isSupportedGeminiModel(modelOverride)
    ? null
    : modelOverride
  const model = validatedOverrideModel ?? validatedConfiguredModel
  const llmTelemetry: LlmTelemetry = {
    provider,
    model,
    llm_calls: 0,
    llm_inference_ms: 0,
    input_tokens: 0,
    output_tokens: 0,
    total_tokens: 0,
  }
  const recordLlmCall = (stage: string, elapsedMs: number, status: number, payload?: unknown) => {
    const usage = extractGeminiUsage(payload)
    llmTelemetry.llm_calls += 1
    llmTelemetry.llm_inference_ms += elapsedMs
    llmTelemetry.input_tokens += usage.inputTokens
    llmTelemetry.output_tokens += usage.outputTokens
    llmTelemetry.total_tokens += usage.totalTokens
    appendServerTrace('server_ai_assistant_llm_call', `${stage} ms=${elapsedMs} status=${status}`, {
      stage,
      elapsed_ms: elapsedMs,
      status,
      provider: llmTelemetry.provider,
      model: llmTelemetry.model,
      input_tokens: usage.inputTokens,
      output_tokens: usage.outputTokens,
      total_tokens: usage.totalTokens,
      llm_calls: llmTelemetry.llm_calls,
    })
  }
  // Unified Gemini call. When `stream` is true, uses streamGenerateContent (SSE),
  // forwards text-part deltas through emitToken, and re-assembles chunks into the
  // exact same shape as generateContent ({candidates:[{content:{parts},finishReason}], usageMetadata})
  // so ALL downstream logic (functionCall detection, resolveModelParts, telemetry) is unchanged.
  const callModel = async (
    reqBody: unknown,
    opts: { stream: boolean; timeoutMs: number },
  ): Promise<{ ok: boolean; status: number; data: any; errText: string }> => {
    const base = `https://generativelanguage.googleapis.com/v1beta/models/${model}`
    const timeoutMs = Math.max(1, Math.min(opts.timeoutMs, remainingRequestBudgetMs()))
    if (timeoutMs < 500) {
      return { ok: false, status: 504, data: null, errText: 'request_budget_exhausted' }
    }
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
    try {
    if (!opts.stream) {
      const res = await fetch(`${base}:generateContent?key=${apiKey}`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(reqBody), signal: controller.signal,
      })
      if (!res.ok) return { ok: false, status: res.status, data: null, errText: await res.text().catch(() => '') }
      return { ok: true, status: res.status, data: await res.json(), errText: '' }
    }
    const res = await fetch(`${base}:streamGenerateContent?alt=sse&key=${apiKey}`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(reqBody), signal: controller.signal,
    })
    if (!res.ok || !res.body) {
      return { ok: res.ok && Boolean(res.body), status: res.status, data: null, errText: await res.text().catch(() => '') }
    }
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buf = ''
    let textAccum = ''
    const funcParts: any[] = []
    let finishReason: string | undefined
    let usageMetadata: any
    const handleData = (jsonStr: string) => {
      let obj: any
      try { obj = JSON.parse(jsonStr) } catch { return }
      const cand = obj?.candidates?.[0]
      if (cand?.finishReason) finishReason = cand.finishReason
      if (obj?.usageMetadata) usageMetadata = obj.usageMetadata
      const parts = cand?.content?.parts ?? []
      for (const p of parts) {
        if (typeof p?.text === 'string') { textAccum += p.text; emitToken(p.text) }
        else if (p?.functionCall) funcParts.push(p)
      }
    }
    // SSE frames: each event is `data: {json}` on its own line, separated by \n\n.
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })
      let nl: number
      while ((nl = buf.indexOf('\n')) !== -1) {
        const line = buf.slice(0, nl).trim()
        buf = buf.slice(nl + 1)
        if (line.startsWith('data:')) handleData(line.slice(5).trim())
      }
    }
    const tail = buf.trim()
    if (tail.startsWith('data:')) handleData(tail.slice(5).trim())
    const parts: any[] = []
    if (textAccum) parts.push({ text: textAccum })
    parts.push(...funcParts)
    const data = { candidates: [{ content: { parts }, finishReason }], usageMetadata }
    return { ok: true, status: res.status, data, errText: '' }
    } catch (error) {
      const timedOut = controller.signal.aborted
      return {
        ok: false,
        status: timedOut ? 504 : 502,
        data: null,
        errText: timedOut ? `model_timeout_${timeoutMs}ms` : String((error as Error).message ?? 'model_request_failed'),
      }
    } finally {
      clearTimeout(timeoutId)
    }
  }
  appendServerTrace('server_ai_assistant_context_load', `ms=${contextLoadMs}`, {
    context_load_ms: contextLoadMs,
    events_loaded: allEvents?.length ?? 0,
    grocery_items_loaded: Array.isArray(groceryItems) ? groceryItems.length : 0,
    loaded_domains: [
      needsEventData ? 'events' : null,
      needsPlaceData ? 'places' : null,
      needsContactData ? 'contacts' : null,
      needsGroceryData ? 'grocery' : null,
      needsRecipeData ? 'recipes' : null,
      needsAvailabilityData ? 'availability' : null,
    ].filter(Boolean),
  })
  if (modelOverride && !validatedOverrideModel) {
    appendServerTrace('server_ai_assistant_model_override_rejected', `unsupported_override=${modelOverride}`, {
      requested_model_override: modelOverride,
      fallback_model: model,
      provider,
    })
  }
  if (provider === 'gemini' && configuredModel !== validatedConfiguredModel) {
    appendServerTrace('server_ai_assistant_config_model_fallback', `unsupported_config_model=${configuredModel}`, {
      configured_model: configuredModel,
      fallback_model: validatedConfiguredModel,
      provider,
    })
  }

  if (!apiKey) {
    return { status: 200, payload: { type: 'error', code: 'no_api_key', message: 'No AI API key configured. Go to Settings → AI to add one.', correlation_id: cid } }
  }

  const utcOffset = (context.utcOffset as string) ?? '-04:00'

  // Convert a UTC ISO string to a human-readable local time string using the user's offset
  function toLocal(iso: string): string {
    if (!iso) return ''
    const offsetMatch = utcOffset.match(/([+-])(\d{2}):(\d{2})/)
    if (!offsetMatch) return iso
    const sign = offsetMatch[1] === '+' ? 1 : -1
    const offsetMs = sign * (parseInt(offsetMatch[2]) * 60 + parseInt(offsetMatch[3])) * 60000
    const local = new Date(new Date(iso).getTime() + offsetMs)
    return local.toLocaleString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric',
      hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'UTC'
    })
  }

  function normalizeSearchText(value: string): string {
    return value
      .toLowerCase()
      .replace(/\b(appt|apt)\b/g, 'appointment')
      .replace(/\bdr\b/g, 'doctor')
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  }

  function tokenized(value: string): string[] {
    return normalizeSearchText(value).split(' ').filter((token) => token.length > 1)
  }

  function sanitizeTravelLocation(value: string): string {
    return value
      .replace(/\b(right now|now|today|tomorrow|tonight|please|thanks)\b/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  }

  function inferTravelDestinationFromText(text: string): string | null {
    if (!text) return null
    const cleaned = text.replace(/\s+/g, ' ').trim()
    const toMatches = Array.from(cleaned.matchAll(/\bto\s+(.+?)(?=\s+(?:right now|now|today|tomorrow|tonight|when|how|what)\b|[?.!,]|$)/gi))
    const toCandidate = toMatches.length > 0 ? toMatches[toMatches.length - 1]?.[1] : null
    if (toCandidate) return sanitizeTravelLocation(toCandidate).replace(/^home\s+to\s+/i, '').replace(/^drive\s+from\s+/i, '').trim() || null
    const atMatch = cleaned.match(/\bat\s+(.+?)(?:\s+at\s+\d|\s+(?:today|tomorrow|tonight|when|how|what)\b|[?.!,]|$)/i)
    if (atMatch?.[1]) return sanitizeTravelLocation(atMatch[1]).trim() || null
    return null
  }

  function inferTravelOriginFromText(text: string): string | null {
    if (!text) return null
    const cleaned = text.replace(/\s+/g, ' ').trim()
    const fromMatch = cleaned.match(/\bfrom\s+(.+?)\s+to\s+/i)
    if (!fromMatch?.[1]) return null
    const inferred = sanitizeTravelLocation(fromMatch[1])
    if (!inferred || /^home$/i.test(inferred)) return null
    return inferred
  }

  // Build context strings
  const familyNames = (context.family as {name: string}[]).map(f => f.name).join(', ')
  const recipesText = (recipes ?? []).map((row: { name: string; cook_time?: string | null; servings?: string | null }, idx: number) =>
    `${idx + 1}. ${row.name}${row.cook_time ? ` · ${row.cook_time}` : ''}${row.servings ? ` · serves ${row.servings}` : ''}`
  ).join('\n')

  // ── Food profile (dietary rules, allergies, preferences) ──
  const foodProfileRaw = (foodProfileResult as { data?: { value?: Record<string, unknown> } } | null)?.data?.value ?? null
  const foodProfileText = (() => {
    if (!foodProfileRaw || typeof foodProfileRaw !== 'object') return ''
    const fp = foodProfileRaw as Record<string, unknown>
    const lines: string[] = []
    const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
    if (str(fp.dietaryRules)) lines.push(`- Dietary rules: ${str(fp.dietaryRules)}`)
    if (str(fp.allergies)) lines.push(`- Allergies (NEVER suggest these): ${str(fp.allergies)}`)
    if (str(fp.dislikedFoods)) lines.push(`- Disliked foods (avoid): ${str(fp.dislikedFoods)}`)
    if (str(fp.preferredCuisines)) lines.push(`- Preferred cuisines: ${str(fp.preferredCuisines)}`)
    if (str(fp.preferredProteins)) lines.push(`- Preferred proteins: ${str(fp.preferredProteins)}`)
    if (str(fp.pantryStaples)) lines.push(`- Pantry staples on hand: ${str(fp.pantryStaples)}`)
    if (typeof fp.householdSize === 'number') lines.push(`- Household size: ${fp.householdSize}`)
    if (typeof fp.weeknightMaxMinutes === 'number') lines.push(`- Weeknight cook-time limit: ${fp.weeknightMaxMinutes} min`)
    if (typeof fp.weeklyBudgetUsd === 'number') lines.push(`- Weekly grocery budget: $${fp.weeklyBudgetUsd}`)
    return lines.join('\n')
  })()

  // ── Member availability (recurring rules + upcoming exceptions) ──
  const memberNameById = new Map<string, string>()
  for (const f of (context.family as { id?: string; name: string }[])) {
    if (f.id) memberNameById.set(f.id, f.name)
  }
  const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const availRules = ((availabilityRulesResult as { data?: unknown } | null)?.data as {
    member_id: string; day_of_week: number; start_local: string; end_local: string; availability_type: string; reason: string | null
  }[] | null) ?? []
  const availExceptions = ((availabilityExceptionsResult as { data?: unknown } | null)?.data as {
    member_id: string; start_at: string; end_at: string; override_type: string; note: string | null
  }[] | null) ?? []
  const availabilityText = (() => {
    const lines: string[] = []
    for (const r of availRules) {
      const name = memberNameById.get(r.member_id) ?? 'Someone'
      const kind = r.availability_type === 'unavailable' ? 'unavailable' : 'available'
      const day = DOW[r.day_of_week] ?? `day ${r.day_of_week}`
      lines.push(`- ${name}: ${kind} ${day} ${r.start_local}–${r.end_local}${r.reason ? ` (${r.reason})` : ''}`)
    }
    for (const e of availExceptions) {
      const name = memberNameById.get(e.member_id) ?? 'Someone'
      const kind = e.override_type === 'manual_available' ? 'available (override)' : e.override_type === 'day_off' ? 'day off' : 'blocked'
      lines.push(`- ${name}: ${kind} ${toLocal(e.start_at)} → ${toLocal(e.end_at)}${e.note ? ` (${e.note})` : ''}`)
    }
    return lines.join('\n')
  })()

  type DbEvent = {
    id: string; title: string; start_time: string; end_time: string; updated_at: string;
    location_name: string | null; address: string | null; all_day: boolean; event_type: string; description: string | null;
    event_enrichments?: {
      prep_notes?: string | null;
      category?: string | null;
      what_to_bring?: string[] | null;
      outfit_suggestion?: string | null;
      parking_notes?: string | null;
      contact_name?: string | null;
      contact_phone?: string | null;
      cost_estimate?: string | null;
      dietary_notes?: string | null;
      meal_impact?: string | null;
    }[] | null;
    event_checklist_items?: {
      id: string;
      label: string;
      note?: string | null;
      checked?: boolean | null;
      category?: string | null;
      sort_order?: number | null;
      created_at?: string | null;
    }[] | null;
    event_action_items?: {
      id: string;
      title: string;
      description?: string | null;
      due_date?: string | null;
      is_urgent?: boolean | null;
      completed?: boolean | null;
      assigned_to?: string | null;
      created_at?: string | null;
    }[] | null;
    event_members: { family_members: { id: string; name: string } | null }[];
  }

  const PROMPT_EVENT_WINDOW_DAYS = 14
  const PROMPT_EVENT_CAP = 50
  const promptEventWindowEnd = new Date(now.getTime() + PROMPT_EVENT_WINDOW_DAYS * 24 * 60 * 60 * 1000)
  const promptEvents = (allEvents as DbEvent[] ?? [])
    .filter((e) => {
      const start = new Date(e.start_time).getTime()
      return Number.isFinite(start) && start <= promptEventWindowEnd.getTime()
    })
    .slice(0, PROMPT_EVENT_CAP)
  const omittedPromptEventCount = Math.max(0, (allEvents as DbEvent[] ?? []).length - promptEvents.length)

  const eventsText = promptEvents.length === 0
    ? 'No upcoming events in the next 21 days.'
    : promptEvents.map(e => {
        const members = e.event_members?.map(m => m.family_members?.name).filter(Boolean).join(', ') ?? ''
        const loc = e.address ?? e.location_name ?? ''
        const timeStr = e.all_day ? 'all-day' : `${toLocal(e.start_time)} – ${toLocal(e.end_time)}`
        return `- ID:${e.id} | updated_at:${e.updated_at} | "${e.title}" | ${timeStr}${loc ? ` | 📍${loc}` : ''}${members ? ` | 👤${members}` : ''}`
      }).join('\n')
      + (omittedPromptEventCount > 0
        ? `\n- … ${omittedPromptEventCount} additional events omitted from prompt for latency. Use search_events when needed.`
        : '')

  const placesText = savedPlaces && savedPlaces.length > 0
    ? savedPlaces.map((p: {name: string; aliases?: string[]; address?: string; city?: string; state?: string; zip?: string; phone?: string; notes?: string}) => {
        const addr = [p.address, p.city, p.state, p.zip].filter(Boolean).join(', ')
        const aliases = p.aliases?.length ? ` (also: ${p.aliases.join(', ')})` : ''
        return `- ${p.name}${aliases}: ${addr}${p.phone ? ` | ${p.phone}` : ''}`
      }).join('\n')
    : ''

  const contactsText = savedContacts && (savedContacts as unknown[]).length > 0
    ? (savedContacts as {name: string; aliases?: string[]; phone?: string; email?: string; address?: string; relationship?: string; notes?: string}[]).map(c => {
        const aliases = c.aliases?.length ? ` (also: ${c.aliases.join(', ')})` : ''
        const extra = [c.relationship, c.phone, c.email, c.address, c.notes].filter(Boolean).join(' | ')
        return `- ${c.name}${aliases}${extra ? ': ' + extra : ''}`
      }).join('\n')
    : ''

  const defaultListId = groceryLists?.[0]?.id ?? null
  const groceryText = groceryItems && groceryItems.length > 0
    ? groceryItems.map((i: {id: string; name: string; quantity?: string; unit?: string; category: string; checked: boolean}) =>
        `- ID:${i.id} | ${i.name}${i.quantity ? ` (${i.quantity}${i.unit ? ' ' + i.unit : ''})` : ''} [${i.category}]`
      ).join('\n')
    : 'Grocery list is empty.'

  // Tool definitions for Gemini
  const tools = [{
    function_declarations: [
      {
        name: 'search_events',
        description: 'Search for events by title keyword, date, or family member name. Returns matching events. Use this when you need to find a specific event before updating it.',
        parameters: {
          type: 'OBJECT',
          properties: {
            query: { type: 'STRING', description: 'Search keyword for event title (partial match ok)' },
            date_hint: { type: 'STRING', description: 'Natural date hint like "Tuesday", "June 9", "next week"' },
            member_name: { type: 'STRING', description: 'Filter by family member name' },
          },
          required: [],
        },
      },
      {
        name: 'create_event',
        description: 'Create a new calendar event or reminder. Low-risk creates may execute immediately; otherwise require confirmation.',
        parameters: {
          type: 'OBJECT',
          properties: {
            title: { type: 'STRING', description: 'Event title in format "Owner | Description"' },
            start: { type: 'STRING', description: 'ISO datetime with UTC offset e.g. 2026-06-09T18:30:00-04:00' },
            end: { type: 'STRING', description: 'ISO datetime with UTC offset' },
            location: { type: 'STRING', description: 'Full street address or place name' },
            members: { type: 'ARRAY', items: { type: 'STRING' }, description: 'Family member names to include' },
            notes: { type: 'STRING', description: 'Optional notes or description' },
            all_day: { type: 'BOOLEAN', description: 'True for all-day events' },
            event_type: { type: 'STRING', description: '"event" or "reminder"' },
          },
          required: ['title', 'start', 'end'],
        },
      },
      {
        name: 'update_event',
        description: 'Update one or more fields of an existing event. Requires the event ID (from search_events or the events list). Requires user confirmation before executing.',
        parameters: {
          type: 'OBJECT',
          properties: {
            id: { type: 'STRING', description: 'Exact event UUID from the events list' },
            expected_updated_at: { type: 'STRING', description: 'Current event updated_at timestamp from context. Required for safe edit/undo protection.' },
            title: { type: 'STRING', description: 'New title' },
            start: { type: 'STRING', description: 'New start ISO datetime with UTC offset' },
            end: { type: 'STRING', description: 'New end ISO datetime with UTC offset' },
            location: { type: 'STRING', description: 'New location name or venue label. Use empty string to clear.' },
            address: { type: 'STRING', description: 'New street address. Use empty string to clear.' },
            members_add: { type: 'ARRAY', items: { type: 'STRING' }, description: 'Family member names to ADD to the event' },
            members_remove: { type: 'ARRAY', items: { type: 'STRING' }, description: 'Family member names to REMOVE from the event' },
            members_primary: { type: 'STRING', description: 'Set the PRIMARY family member for the event (single name)' },
            members_attendees: {
              type: 'ARRAY',
              items: { type: 'STRING' },
              description: 'Full replacement list of attendee family members (secondary participants). Primary member is managed separately.',
            },
            notes: { type: 'STRING', description: 'Visible Notes field in the event details panel (prep_notes). Use empty string to clear.' },
            description: { type: 'STRING', description: 'Underlying calendar description/body text. Use empty string to clear.' },
            all_day: { type: 'BOOLEAN', description: 'Toggle all-day status' },
            category: { type: 'STRING', description: 'Category like appointment, school, sports, dining, travel, social, other. Use empty string to clear.' },
            what_to_bring: { type: 'ARRAY', items: { type: 'STRING' }, description: 'Full replacement list for What to Bring. Send the complete final list.' },
            outfit_suggestion: { type: 'STRING', description: 'What to Wear field. Use empty string to clear.' },
            parking_notes: { type: 'STRING', description: 'Parking field. Use empty string to clear.' },
            contact_name: { type: 'STRING', description: 'Contact name. Use empty string to clear.' },
            contact_phone: { type: 'STRING', description: 'Contact phone number. Use empty string to clear.' },
            cost_estimate: { type: 'STRING', description: 'Cost Estimate field. Use empty string to clear.' },
            dietary_notes: { type: 'STRING', description: 'Dietary Notes field. Use empty string to clear.' },
            meal_impact: { type: 'STRING', description: 'Meal Impact field. Use empty string to clear.' },
            checklist_items: {
              type: 'ARRAY',
              description: 'Full replacement checklist for the event. Send the complete final list; use [] to clear.',
              items: {
                type: 'OBJECT',
                properties: {
                  id: { type: 'STRING', description: 'Existing checklist item ID when editing an existing item' },
                  label: { type: 'STRING', description: 'Checklist item text' },
                  note: { type: 'STRING', description: 'Optional secondary note. Use empty string to clear.' },
                  checked: { type: 'BOOLEAN', description: 'Whether the item is already checked off' },
                  category: { type: 'STRING', description: 'Optional grouping/category label. Use empty string to clear.' },
                },
                required: ['label'],
              },
            },
            action_items: {
              type: 'ARRAY',
              description: 'Full replacement action-item list for the event. Send the complete final list; use [] to clear.',
              items: {
                type: 'OBJECT',
                properties: {
                  id: { type: 'STRING', description: 'Existing action item ID when editing an existing item' },
                  title: { type: 'STRING', description: 'Action item title' },
                  description: { type: 'STRING', description: 'Optional longer description. Use empty string to clear.' },
                  due_date: { type: 'STRING', description: 'Optional ISO datetime with UTC offset. Use empty string to clear.' },
                  is_urgent: { type: 'BOOLEAN', description: 'True if this should appear as the urgent banner' },
                  completed: { type: 'BOOLEAN', description: 'Whether the action is already completed' },
                  assigned_to: { type: 'STRING', description: 'Optional assignee name. Use empty string to clear.' },
                },
                required: ['title'],
              },
            },
          },
          required: ['id', 'expected_updated_at'],
        },
      },
      {
        name: 'bulk_update_events',
        description: 'Apply the same event-detail updates to multiple events at once. Use after search_events confirms exact matches.',
        parameters: {
          type: 'OBJECT',
          properties: {
            ids: {
              type: 'ARRAY',
              items: { type: 'STRING' },
              description: 'Exact event UUIDs to update (from search_events)',
            },
            title_query: { type: 'STRING', description: 'Shared title phrase used for matching' },
            count: { type: 'NUMBER', description: 'Expected number of events to update' },
            title: { type: 'STRING', description: 'New title' },
            start: { type: 'STRING', description: 'New start ISO datetime with UTC offset' },
            end: { type: 'STRING', description: 'New end ISO datetime with UTC offset' },
            location: { type: 'STRING', description: 'New location name or venue label. Use empty string to clear.' },
            address: { type: 'STRING', description: 'New street address. Use empty string to clear.' },
            members_add: { type: 'ARRAY', items: { type: 'STRING' }, description: 'Family member names to ADD to each event' },
            members_remove: { type: 'ARRAY', items: { type: 'STRING' }, description: 'Family member names to REMOVE from each event' },
            members_primary: { type: 'STRING', description: 'Set the PRIMARY family member for each event (single name)' },
            members_attendees: {
              type: 'ARRAY',
              items: { type: 'STRING' },
              description: 'Full replacement attendee list for each event (secondary participants).',
            },
            notes: { type: 'STRING', description: 'Visible Notes field in the event details panel (prep_notes). Use empty string to clear.' },
            description: { type: 'STRING', description: 'Underlying calendar description/body text. Use empty string to clear.' },
            all_day: { type: 'BOOLEAN', description: 'Toggle all-day status' },
            category: { type: 'STRING', description: 'Category like appointment, school, sports, dining, travel, social, other. Use empty string to clear.' },
            what_to_bring: { type: 'ARRAY', items: { type: 'STRING' }, description: 'Full replacement list for What to Bring. Send the complete final list.' },
            outfit_suggestion: { type: 'STRING', description: 'What to Wear field. Use empty string to clear.' },
            parking_notes: { type: 'STRING', description: 'Parking field. Use empty string to clear.' },
            contact_name: { type: 'STRING', description: 'Contact name. Use empty string to clear.' },
            contact_phone: { type: 'STRING', description: 'Contact phone number. Use empty string to clear.' },
            cost_estimate: { type: 'STRING', description: 'Cost Estimate field. Use empty string to clear.' },
            dietary_notes: { type: 'STRING', description: 'Dietary Notes field. Use empty string to clear.' },
            meal_impact: { type: 'STRING', description: 'Meal Impact field. Use empty string to clear.' },
            checklist_items: {
              type: 'ARRAY',
              description: 'Full replacement checklist for each event. Send the complete final list; use [] to clear.',
              items: {
                type: 'OBJECT',
                properties: {
                  id: { type: 'STRING', description: 'Existing checklist item ID when editing an existing item' },
                  label: { type: 'STRING', description: 'Checklist item text' },
                  note: { type: 'STRING', description: 'Optional secondary note. Use empty string to clear.' },
                  checked: { type: 'BOOLEAN', description: 'Whether the item is already checked off' },
                  category: { type: 'STRING', description: 'Optional grouping/category label. Use empty string to clear.' },
                },
                required: ['label'],
              },
            },
            action_items: {
              type: 'ARRAY',
              description: 'Full replacement action-item list for each event. Send the complete final list; use [] to clear.',
              items: {
                type: 'OBJECT',
                properties: {
                  id: { type: 'STRING', description: 'Existing action item ID when editing an existing item' },
                  title: { type: 'STRING', description: 'Action item title' },
                  description: { type: 'STRING', description: 'Optional longer description. Use empty string to clear.' },
                  due_date: { type: 'STRING', description: 'Optional ISO datetime with UTC offset. Use empty string to clear.' },
                  is_urgent: { type: 'BOOLEAN', description: 'True if this should appear as the urgent banner' },
                  completed: { type: 'BOOLEAN', description: 'Whether the action is already completed' },
                  assigned_to: { type: 'STRING', description: 'Optional assignee name. Use empty string to clear.' },
                },
                required: ['title'],
              },
            },
          },
          required: ['ids'],
        },
      },
      {
        name: 'delete_event',
        description: 'Delete (cancel) a calendar event. Requires user confirmation before executing.',
        parameters: {
          type: 'OBJECT',
          properties: {
            id: { type: 'STRING', description: 'Exact event UUID' },
            title: { type: 'STRING', description: 'Event title for confirmation display' },
          },
          required: ['id', 'title'],
        },
      },
      {
        name: 'delete_events_by_title',
        description: 'Delete (cancel) multiple calendar events that match the same appointment title. Use after search_events confirms the exact matches. Requires user confirmation before executing.',
        parameters: {
          type: 'OBJECT',
          properties: {
            ids: {
              type: 'ARRAY',
              items: { type: 'STRING' },
              description: 'Exact event UUIDs to cancel (from search_events)',
            },
            title_query: { type: 'STRING', description: 'Shared title phrase used for matching, e.g. "Liv Med-Check Appointment"' },
            count: { type: 'NUMBER', description: 'Number of matched events expected to be deleted' },
          },
          required: ['ids', 'title_query'],
        },
      },
      {
        name: 'search_places',
        description: 'Search Google Places for a business or address. Use when user gives a business name or partial address.',
        parameters: {
          type: 'OBJECT',
          properties: {
            query: { type: 'STRING', description: 'Business name or location query' },
            city: { type: 'STRING', description: 'City to search in' },
          },
          required: ['query'],
        },
      },
      {
        name: 'search_web',
        description: 'Search the live web for current information, reviews, news, prices, and factual lookups that need fresh sources. DO NOT use for: math/calculations, weather (already in context), general knowledge, or anything answerable from model reasoning.',
        parameters: {
          type: 'OBJECT',
          properties: {
            query: { type: 'STRING', description: 'Search query' },
            max_results: { type: 'NUMBER', description: 'Number of results to return (1-8). Default 5.' },
          },
          required: ['query'],
        },
      },
      {
        name: 'get_weather_forecast',
        description: 'Get live weather forecast for a city with current conditions, next-hour outlook, and next 3 days. Use this for weather beyond the in-context snapshot (forecast, rain timing, UV outlook, tomorrow/weekend weather).',
        parameters: {
          type: 'OBJECT',
          properties: {
            location: { type: 'STRING', description: 'City or location name. Defaults to home city when omitted.' },
            hours_ahead: { type: 'NUMBER', description: 'How many upcoming hours to summarize (1-24). Default 12.' },
          },
          required: [],
        },
      },
      {
        name: 'get_travel_eta',
        description: 'Get live traffic-aware drive ETA, leave-by recommendation, and route summary between origin and destination. Use for "when should we leave", "how long is the drive", and commute timing decisions.',
        parameters: {
          type: 'OBJECT',
          properties: {
            destination: { type: 'STRING', description: 'Destination address or place.' },
            origin: { type: 'STRING', description: 'Origin address. Defaults to home address when omitted.' },
            arrival_time: { type: 'STRING', description: 'Desired arrival ISO datetime with UTC offset. Optional.' },
            departure_time: { type: 'STRING', description: 'Planned departure ISO datetime with UTC offset. Optional.' },
            buffer_mins: { type: 'NUMBER', description: 'Arrival buffer minutes before event start. Default 10.' },
          },
          required: ['destination'],
        },
      },
      {
        name: 'add_grocery_items',
        description: 'Add one or more items to the grocery list immediately (no confirmation step). Infer category and normalize likely product names/brands when needed.',
        parameters: {
          type: 'OBJECT',
          properties: {
            items: {
              type: 'ARRAY',
              items: {
                type: 'OBJECT',
                properties: {
                  name: { type: 'STRING' },
                  quantity: { type: 'STRING' },
                  unit: { type: 'STRING' },
                  category: { type: 'STRING', description: 'One of: produce, dairy, meat, pantry, frozen, bakery, beverages, other' },
                  notes: { type: 'STRING' },
                },
                required: ['name'],
              },
              description: 'Items to add',
            },
          },
          required: ['items'],
        },
      },
      {
        name: 'check_grocery_item',
        description: 'Mark a grocery item as checked/done or uncheck it.',
        parameters: {
          type: 'OBJECT',
          properties: {
            item_id: { type: 'STRING', description: 'Item UUID' },
            checked: { type: 'BOOLEAN', description: 'True to check off, false to uncheck' },
          },
          required: ['item_id', 'checked'],
        },
      },
      {
        name: 'clear_checked_grocery_items',
        description: 'Remove all checked/completed items from the grocery list.',
        parameters: { type: 'OBJECT', properties: {} },
      },
      {
        name: 'create_recipe',
        description: 'Save a recipe to the Recipe Library with structured ingredients and steps. Requires confirmation before executing.',
        parameters: {
          type: 'OBJECT',
          properties: {
            name: { type: 'STRING', description: 'Recipe name/title' },
            servings: { type: 'STRING', description: 'Serving size text, e.g. "4" or "serves 6"' },
            cook_time: { type: 'STRING', description: 'Cook/total time text, e.g. "35 min"' },
            source_url: { type: 'STRING', description: 'Optional source URL' },
            image_url: { type: 'STRING', description: 'Optional recipe image URL. If omitted, the server may auto-select one.' },
            ingredients: {
              type: 'ARRAY',
              description: 'Structured ingredient lines.',
              items: {
                type: 'OBJECT',
                properties: {
                  raw_text: { type: 'STRING', description: 'Full line, e.g. "2 tbsp olive oil"' },
                  name: { type: 'STRING', description: 'Ingredient name, e.g. "olive oil"' },
                  quantity: { type: 'STRING', description: 'Quantity text, e.g. "2"' },
                  unit: { type: 'STRING', description: 'Unit text, e.g. "tbsp"' },
                  optional: { type: 'BOOLEAN', description: 'Whether ingredient is optional' },
                },
                required: ['name'],
              },
            },
            steps: {
              type: 'ARRAY',
              description: 'Ordered direction steps.',
              items: {
                type: 'STRING',
              },
            },
          },
          required: ['name', 'ingredients', 'steps'],
        },
      },
    ],
  }]

  const toolNamesByProfile: Record<string, string[]> = {
    event: ['search_events', 'create_event', 'update_event', 'bulk_update_events', 'delete_event', 'delete_events_by_title'],
    grocery: ['add_grocery_items', 'check_grocery_item', 'clear_checked_grocery_items'],
    weather: ['get_weather_forecast'],
    travel: ['get_travel_eta'],
    places: ['search_places'],
    web: ['search_web'],
    recipe: ['create_recipe', 'add_grocery_items'],
    general: [],
  }
  const selectedToolNames = intentRouting.profile === 'full'
    ? new Set(tools[0].function_declarations.map((tool) => tool.name))
    : new Set(toolNamesByProfile[intentRouting.profile] ?? [])
  const selectedToolDeclarations = tools[0].function_declarations
    .filter((tool) => selectedToolNames.has(tool.name))
  const primaryToolDeclarations = intentRouting.forceEventSearch
    ? selectedToolDeclarations.filter((tool) => tool.name === 'search_events')
    : selectedToolDeclarations
  const primaryTools = primaryToolDeclarations.length > 0
    ? [{ function_declarations: primaryToolDeclarations }]
    : []
  const routedWriteIntent = /\b(move|resched|reschedule|change|update|edit|delete|remove|cancel|shift|push)\b/i
    .test(latestUserText ?? '')
  const secondaryEventToolNames = /\b(delete|remove|cancel)\b/i.test(latestUserText ?? '')
    ? ['delete_event', 'delete_events_by_title']
    : /\b(all|every|each)\b/i.test(latestUserText ?? '')
      ? ['bulk_update_events']
      : ['update_event']
  const secondaryToolDeclarations = intentRouting.profile === 'event' && intentRouting.forceEventSearch
    ? routedWriteIntent
      ? selectedToolDeclarations.filter((tool) => secondaryEventToolNames.includes(tool.name))
      : []
    : selectedToolDeclarations
  const secondaryTools = secondaryToolDeclarations.length > 0
    ? [{ function_declarations: secondaryToolDeclarations }]
    : []

  const includeEventContext =
    intentRouting.profile === 'full' ||
    (intentRouting.profile === 'event' && !intentRouting.forceEventSearch)
  const includeGroceryContext = ['full', 'grocery', 'recipe'].includes(intentRouting.profile)
  const includeRecipeContext = ['full', 'recipe'].includes(intentRouting.profile)
  const includePlaceContext = ['full', 'event', 'places', 'travel'].includes(intentRouting.profile)
  const includeAvailabilityContext = ['full', 'event'].includes(intentRouting.profile)

  // Build Gemini conversation with system instruction + history
  // Pull user-editable custom instructions (persist across all chats)
  const customRow = await sb.from('settings').select('value').eq('key', 'ai_custom_instructions').maybeSingle()
  const customInstructions = (customRow.data?.value as { text?: string } | null)?.text?.trim() || ''

  const systemInstruction = `You are the Casa Tabor family assistant — a smart, warm, conversational AI for the ${familyNames} family.
Current date/time: ${context.currentDate}
User's local UTC offset: ${context.utcOffset ?? '-04:00'} (use this for all times you generate)
Home city: ${context.homeCity ?? 'West Palm Beach'}
TEMPORAL ASSUMPTIONS (default unless user clearly overrides):
- Default day: ${context.temporalAssumptions?.inferredDefaultDay ?? 'today'}.
- Reason: ${context.temporalAssumptions?.inferredDefaultDayReason ?? 'Prefer near-future scheduling when date is omitted.'}
- If no date is given and inferred same-day time is already in the past by >${context.temporalAssumptions?.nearFutureCutoffMinutes ?? 90} minutes, default to tomorrow.
- Bare-hour intent heuristics:
  - 7-11 usually means AM (especially appointments/school).
  - 12 usually means 12 PM (unless user says midnight).
  - 1-6 means the next sensible daytime occurrence; prefer same-day PM when still upcoming.
  - "10" should usually be treated as 10 AM unless context strongly indicates otherwise.

INTENT PROFILE: ${intentRouting.profile}
FAMILY MEMBERS: ${familyNames}
${includePlaceContext && placesText ? `\nSAVED PLACES (use for location nicknames):\n${placesText}` : ''}
${includePlaceContext && contactsText ? `\nSAVED CONTACTS:\n${contactsText}` : ''}
${context.focusedEvent ? `
⭐ EVENT EDIT MODE — CRITICAL INSTRUCTIONS:
You are EXCLUSIVELY focused on editing this one event. Do not answer general questions, discuss other events, or go off-topic. Every response must stay in the context of editing this event.

CURRENT EVENT DATA:
ID: ${(context.focusedEvent as {id:string}).id}
Title: ${(context.focusedEvent as {title:string}).title}
Time: ${(context.focusedEvent as {start_time:string}).start_time} → ${(context.focusedEvent as {end_time:string}).end_time}${(context.focusedEvent as {all_day:boolean}).all_day ? ' (all-day)' : ''}
Updated at: ${(context.focusedEvent as {updated_at:string}).updated_at}
Location name: ${(context.focusedEvent as {location_name:string|null}).location_name ?? '⚠️ MISSING'}
Address: ${(context.focusedEvent as {address:string|null}).address ?? '⚠️ MISSING'}
Members: ${((context.focusedEvent as {members:string[]}).members ?? []).join(', ') || '⚠️ MISSING'}
Category: ${(context.focusedEvent as {category:string|null}).category ?? '⚠️ MISSING'}
Notes/Prep: ${(context.focusedEvent as {notes:string|null}).notes ?? '⚠️ MISSING'}
Description: ${(context.focusedEvent as {description:string|null}).description ?? '⚠️ MISSING'}
What to bring: ${((context.focusedEvent as {what_to_bring?: string[]}).what_to_bring ?? []).join(', ') || '⚠️ MISSING'}
What to wear: ${(context.focusedEvent as {outfit_suggestion:string|null}).outfit_suggestion ?? '⚠️ MISSING'}
Parking: ${(context.focusedEvent as {parking_notes:string|null}).parking_notes ?? '⚠️ MISSING'}
Contact name: ${(context.focusedEvent as {contact_name:string|null}).contact_name ?? '⚠️ MISSING'}
Contact phone: ${(context.focusedEvent as {contact_phone:string|null}).contact_phone ?? '⚠️ MISSING'}
Cost estimate: ${(context.focusedEvent as {cost_estimate:string|null}).cost_estimate ?? '⚠️ MISSING'}
Dietary notes: ${(context.focusedEvent as {dietary_notes:string|null}).dietary_notes ?? '⚠️ MISSING'}
Meal impact: ${(context.focusedEvent as {meal_impact:string|null}).meal_impact ?? '⚠️ MISSING'}
Checklist items: ${JSON.stringify((context.focusedEvent as {checklist?: unknown[]}).checklist ?? [])}
Action items: ${JSON.stringify((context.focusedEvent as {actions?: unknown[]}).actions ?? [])}

RULES:
- Always use update_event with ID: ${(context.focusedEvent as {id:string}).id} for any changes. You already have the event — never search for it.
- Always include expected_updated_at: ${(context.focusedEvent as {updated_at:string}).updated_at} in every update_event call for this event.
- Use notes for the visible Notes section, and description for the underlying calendar body text.
- Use empty string to clear a text field.
- Never invent or send fields outside the update_event schema.
- For what_to_bring, send the complete final list, not just the newly added item.
- For checklist_items and action_items, send the complete final list, not just the delta. Preserve existing item IDs when keeping/editing an item so state stays stable.
- Batch related edits into one update_event call whenever possible so the user confirms once.
- Hard limits: what_to_bring max 25 items, checklist_items max 30, action_items max 30, members_add/members_remove max 10 names per action. If the user wants more, ask to split it up.
- After the user confirms a change, apply it immediately with update_event; confirm what you changed in one sentence.
- If the user changes the location, mention that driving logistics and weather will refresh automatically.
- If the user tries to discuss something unrelated to this event, politely redirect them back to editing it.
${EDIT_INTENT_GUARDRAILS}
${DIFF_AND_OUTPUT_GUARDRAILS}
${RECOVERY_AND_CONFLICT_GUARDRAILS}
 
ON OPEN (the [EVENT_EDIT_MODE] signal): Give a concise friendly summary of the event so the user knows you're primed — include title, date/time, who's attending, and location if set. Then highlight any ⚠️ MISSING fields as things worth filling in, and ask what they'd like to change or add first.` : ''}

${context.lastContextReference?.summary ? `
RECENT CONTEXT (helps you infer vague references like "it", "that", "her"):
Last mentioned: ${context.lastContextReference.summary}
This prose is not authoritative data. Never assert event facts or prepare an event write from it alone.` : ''}

${incomingConversationState?.activeEntityType === 'event' ? `
AUTHORITATIVE CONVERSATION ENTITY:
The current conversation is grounded to event ID ${incomingConversationState.activeEventId}.
Use only the matching database event loaded by Casa. Never copy event facts from earlier assistant prose.
If that event is unavailable, say so and search again instead of guessing.` : ''}

${includeEventContext ? `UPCOMING EVENTS SNAPSHOT (next ${PROMPT_EVENT_WINDOW_DAYS} days, capped; use search_events for anything outside snapshot):\n${eventsText}` : ''}
${includeGroceryContext ? `\nGROCERY LIST (unchecked items):\n${groceryText}\n${defaultListId ? `Default list ID: ${defaultListId}` : ''}` : ''}
${includeRecipeContext ? `\nRECIPE LIBRARY SNAPSHOT (recent):\n${recipesText || 'No recipes saved yet.'}` : ''}
${includeRecipeContext && foodProfileText ? `\nFOOD PROFILE (household dietary needs & preferences — honor for all meal/grocery/recipe suggestions):\n${foodProfileText}` : ''}
${includeAvailabilityContext && availabilityText ? `\nMEMBER AVAILABILITY (recurring rules + upcoming overrides — use to warn about conflicts and pick times people are free):\n${availabilityText}` : ''}

INSTRUCTIONS:
- You are allowed to answer general/random questions directly (facts, explanations, ideas, writing help, etc.) when no Casa data/action is needed.
- If assistant_mode is "chef", bias responses toward cooking, recipe planning, pantry-aware substitutions, and grocery execution.
- When the user asks you to save/store/add a recipe to the Recipe Library, call create_recipe with complete structured ingredients and ordered steps.
- create_recipe is low-risk and should execute immediately once structured details are ready.
- For simple math and calculations (tips, percentages, unit conversions, arithmetic) — answer directly from reasoning. Do NOT call search_web.
- Use tools for calendar/grocery/place actions. Reads (search) execute immediately. Most writes need confirmation, but low-risk create_event, create_recipe, and add_grocery_items should execute immediately.
- Always operate on UUIDs from the events list. ALWAYS call search_events FIRST for delete_event, delete_events_by_title, bulk_update_events, and update_event — never attempt them without a search result providing the event ID(s). Use search_events when unsure, then update/delete with the exact ID(s) from the search result.
- For update_event, always copy the event's updated_at value from context/events list into expected_updated_at.
- Batch related field updates into a single update_event action instead of many small ones.
- When editing an event found via search_events, preserve unchanged detail-pane data from that event response (notes, category, bring list, checklist_items, action_items, etc.).
- what_to_bring is a full replacement field. When adding/removing one item, preserve existing items from the selected event and send the complete final list.
- Always apply append/replace/clear/transform intent classification before building update_event args.
- Prefer append semantics for "add/include/also/plus" phrasing unless user explicitly asks to replace.
- IMPORTANT: For write proposals (update_event, bulk_update_events, create_event, create_recipe, delete_event, delete_events_by_title) — return the tool_action DIRECTLY. Do NOT show a "Will change / Will preserve" text turn before the tool_action. The confirmation card in the UI is the preflight diff. One step only.
- If user asks to delete all appointments/events with a specific name, run search_events first and then use delete_events_by_title with every matched ID in one confirmation.
- If user asks to update all events/appointments matching a title, run search_events first and then use bulk_update_events with every matched ID in one confirmation.
- For add_grocery_items, do NOT ask for confirmation. Just add items immediately. If you inferred/corrected an item name or category, mention it briefly after adding.
- Treat shopping, groceries, pantry restocks, and food purchase intents as add_grocery_items by default. Unless user explicitly asks a question instead of an action, auto-add immediately.
- Confirmation budget: one confirmation only. If the user says "yes", "confirmed", "ok", "do it", or similar — that IS the confirmation; execute immediately.
- For low-risk write intents (add_grocery_items, create_recipe, and straightforward create_event), execute immediately and offer undo language instead of asking for confirmation.
- Never claim "done/completed/updated/saved" for write actions unless the tool execution result confirms success; for calendar writes, only use completion wording when sync_status is synced.
- If user already stated a time, do not ask for time again unless there is a true ambiguity conflict.
- Default time window: when no date is given, search from NOW (${context.currentDate}) forward — never return past events.
- "Next event" / "what's next" = first event whose start_time is strictly AFTER NOW. If an event is currently in progress (started before NOW, ends after NOW), mention it as "currently happening" first, then state what starts next.
- Default duration: 1 hour if not specified for normal appointments. For trip/vacation/travel intents or explicit multi-day language ("3-day", "through Friday", "until Sunday"), default to a multi-day event instead of 1 hour and preserve the implied span.
- Ambiguous time default: when user says a bare time without AM/PM, apply temporal assumptions first.
- For appointment-style scheduling, treat bare 7-11 as AM by default.
- When no date is given, prefer the nearest sensible future slot (today if feasible, otherwise tomorrow) instead of choosing a past time.
- Fuzzy match titles, nicknames, partial names, relative dates. If multiple events match, ask which one.
- If an initial event search is empty or returns low confidence, retry with a shorter/broader query (e.g., just "dentist" instead of "dentist appointment") before telling the user nothing was found.
- Never perform writes (update_event, bulk_update_events, delete_event, delete_events_by_title, create_event) when search_events reports ambiguous=true or top confidence < 0.75; ask a disambiguation question first. This rule applies ONLY to writes — for read/list queries (what's on my calendar, give me a briefing, what's this week), always enumerate all found events regardless of ambiguity score. Do not ask for clarification on list reads.
- Working context: keep operating on the same event we're discussing unless the user clearly switches.
- Relative shifts ("push it 1h later"): compute from the event's current start_time.
- "Add my wife"/"add Kelly": resolve from FAMILY MEMBERS.
- SAVED PLACES: when a place name matches, use its address directly — never ask for the address.
- Conflict awareness: warn if a new event overlaps an existing one by >15 min.
- Prefer edit over create: if a similar event exists at the same time, update it instead of creating a duplicate.
- Tone: warm, concise (1–3 sentences). Be proactive — flag conflicts, drive-time buffers, busy days.
- AVAILABILITY AWARENESS: when scheduling or moving events, prefer times when the involved members are available per MEMBER AVAILABILITY, and warn (briefly) if a proposed time lands in someone's unavailable window or an upcoming day-off/block.
- FOOD PROFILE AWARENESS: for any meal, recipe, or grocery suggestion, respect FOOD PROFILE — never suggest allergens, avoid disliked foods, honor dietary rules, and lean on preferred cuisines/proteins and pantry staples. Do not over-explain; just make good suggestions that fit.
- For timeless facts and general knowledge (e.g., ages/biographies/math/history), answer directly from model knowledge and simple reasoning. Do not refuse just because live web access is unavailable.
- For weather questions (including “right now”), call get_weather_forecast first, then answer clearly from tool data.
- For weather activity decisions ("beach day", "kayaking", "umbrella", "what should I wear"), use get_weather_forecast and give a concrete recommendation.
- If user asks weather-based scheduling advice ("should I keep or move it because of weather?"), treat it as weather guidance unless they explicitly ask to modify a calendar event.
- If user asks weather for a location other than home city, ALWAYS call get_weather_forecast with that location (even for right-now questions).
- If get_weather_forecast cannot resolve a location, say that clearly and ask for a corrected city/region. Do not pretend you can only check the home city.
- Never use search_web for weather unless get_weather_forecast fails.
- For commute/traffic timing ("when should we leave", "how long will it take", "do we have enough buffer"), call get_travel_eta with destination and relevant arrival/departure time.
- For upcoming events with a destination, proactively offer a leave-by recommendation when useful.
- For live/public info requests (latest news, current prices, recent reviews, sports scores, stock prices), use search_web first. For local business lookups (address/phone/location), use search_places. When using search_web, cite the source links you used in your reply.
- DISMISSAL PHRASES ("never mind", "forget it", "cancel that", "actually never mind", "stop", "nvm"): respond with a brief acknowledgment ONLY — do not search, do not list events, do not take any action. Example: "No problem!" or "Got it, ignoring that."
- GROCERY LIST READS ("how many items", "what's on the grocery list", "show me the grocery list", "what do I need to buy"): answer directly from GROCERY LIST context above — enumerate the items. Do NOT call search_events.
- RELATIVE DATE RESOLUTION: for "next weekend", "this Saturday", "next Friday", call search_events with the correct concrete date — do NOT ask the user what date they mean. Use the TEMPORAL ASSUMPTIONS and current date to resolve it first.${customInstructions ? `\n\nUSER'S CUSTOM RULES (always apply, override defaults if they conflict):\n${customInstructions}` : ''}
${AMBIGUITY_GUARDRAILS}
${DIFF_AND_OUTPUT_GUARDRAILS}
${RECOVERY_AND_CONFLICT_GUARDRAILS}`

  // Convert message history to Gemini format
  type GeminiPart = { text: string } | { inlineData: { mimeType: string; data: string } } | { functionCall: { name: string; args: Record<string, unknown> } } | { functionResponse: { name: string; response: Record<string, unknown> } }
  type GeminiContent = { role: 'user' | 'model'; parts: GeminiPart[] }

  const history: GeminiContent[] = []
  const msgList = messages as { role: 'user' | 'assistant'; content: string }[]

  for (const m of msgList) {
    const text = (m.content ?? '').trim()
    if (!text) continue  // skip empty messages — Gemini rejects them silently
    const role = m.role === 'user' ? 'user' : 'model'
    // Enforce strict alternation — merge consecutive same-role messages
    const prev = history[history.length - 1]
    if (prev?.role === role) {
      (prev.parts[0] as { text: string }).text += '\n' + text
    } else {
      history.push({ role, parts: [{ text }] })
    }
  }

  // Gemini requires conversation to start with a user turn
  if (history.length > 0 && history[0].role !== 'user') {
    history.shift()
  }

  // Add current user message with optional image
  const lastMsg = history[history.length - 1]
  if (lastMsg?.role === 'user' && image) {
    lastMsg.parts.unshift({ inlineData: { mimeType: (image as ImagePayload).mimeType, data: (image as ImagePayload).data } })
  }

  // Helper: execute read-only tools server-side
  async function executeReadTool(name: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
    const stageStartMs = Date.now()
    if (name === 'search_events') {
      const query = normalizeSearchText((args.query as string) ?? '')
      const queryTokens = tokenized(query)
      const dateHint = normalizeSearchText((args.date_hint as string) ?? '')
      const memberName = normalizeSearchText((args.member_name as string) ?? '')

      let results = allEvents as DbEvent[] ?? []
      // Hoist date range resolution so ambiguity check can see it
      let resolvedDateStart: Date | null = null
      let resolvedDateEnd: Date | null = null

      if (memberName) {
        results = results.filter(e =>
          e.event_members?.some(m => normalizeSearchText(m.family_members?.name ?? '').includes(memberName))
        )
      }
      if (dateHint) {
        // Resolve relative date hints to actual calendar dates server-side
        const offsetMatch = utcOffset.match(/([+-])(\d{2}):(\d{2})/)
        const offsetMs = offsetMatch
          ? (offsetMatch[1] === '+' ? 1 : -1) * (parseInt(offsetMatch[2]) * 60 + parseInt(offsetMatch[3])) * 60000
          : 0
        const localNow = new Date(now.getTime() + offsetMs)
        const localToday = new Date(localNow)
        localToday.setUTCHours(0, 0, 0, 0)

        // Normalize "this X" → "X" so the weekday matcher handles it
        const normalizedDateHint = dateHint.replace(/^this\s+/i, '').trim()

        // Build a resolved date range for common relative expressions
        const dow = localToday.getUTCDay() // 0=Sun
        if (normalizedDateHint === 'today') {
          resolvedDateStart = localToday
          resolvedDateEnd = new Date(localToday.getTime() + 86400000)
        } else if (normalizedDateHint === 'tomorrow') {
          resolvedDateStart = new Date(localToday.getTime() + 86400000)
          resolvedDateEnd = new Date(localToday.getTime() + 2 * 86400000)
        } else if (normalizedDateHint === 'week' || normalizedDateHint === "week's events" || normalizedDateHint === 'week s events') {
          resolvedDateStart = localToday
          resolvedDateEnd = new Date(localToday.getTime() + 7 * 86400000)
        } else if (dateHint === 'next week') {
          const daysToNextMonday = dow === 0 ? 1 : 8 - dow
          resolvedDateStart = new Date(localToday.getTime() + daysToNextMonday * 86400000)
          resolvedDateEnd = new Date(resolvedDateStart.getTime() + 7 * 86400000)
        } else if (normalizedDateHint === 'weekend') {
          const daysToSat = dow === 6 ? 0 : (6 - dow)
          resolvedDateStart = new Date(localToday.getTime() + daysToSat * 86400000)
          resolvedDateEnd = new Date(resolvedDateStart.getTime() + 2 * 86400000)
        } else if (dateHint === 'next weekend') {
          const daysToSat = dow === 0 ? 6 : dow === 6 ? 7 : (6 - dow)
          resolvedDateStart = new Date(localToday.getTime() + daysToSat * 86400000)
          resolvedDateEnd = new Date(resolvedDateStart.getTime() + 2 * 86400000)
        } else {
          // Resolve "saturday", "next monday", "this friday", etc.
          const weekdays = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday']
          const dayMatch = normalizedDateHint.match(/^(?:next\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)$/)
          if (dayMatch) {
            const targetDay = weekdays.indexOf(dayMatch[1])
            if (targetDay >= 0) {
              let daysAhead = targetDay - dow
              if (daysAhead <= 0) daysAhead += 7
              // "next X" forces at least 7 days ahead
              if (dateHint.startsWith('next ') && daysAhead < 7) daysAhead += 7
              resolvedDateStart = new Date(localToday.getTime() + daysAhead * 86400000)
              resolvedDateEnd = new Date(resolvedDateStart.getTime() + 86400000)
            }
          }
        }

        results = results.filter(e => {
          const d = new Date(e.start_time)
          // If we resolved to a concrete date range, use that
          if (resolvedDateStart && resolvedDateEnd) {
            const eventLocalMs = d.getTime() + offsetMs
            return eventLocalMs >= resolvedDateStart.getTime() && eventLocalMs < resolvedDateEnd.getTime()
          }
          // Fallback: match against day name or date string for specific dates like "june 30", "tuesday"
          const dayName = normalizeSearchText(d.toLocaleDateString('en-US', { weekday: 'long' }))
          const dateStr = normalizeSearchText(d.toLocaleDateString('en-US', { month: 'long', day: 'numeric' }))
          return dayName.includes(dateHint) || dateStr.includes(dateHint) || e.start_time.includes(dateHint.replace(/[^0-9-]/g, ''))
        })
      }

      const scoredResults = results.map((event) => {
        let score = 0
        const title = normalizeSearchText(event.title)
        const searchableText = normalizeSearchText([
          event.title,
          event.location_name ?? '',
          event.address ?? '',
          event.description ?? '',
          event.event_enrichments?.[0]?.prep_notes ?? '',
        ].join(' '))

        let queryMatched = !query
        if (query) {
          if (title === query) score += 0.85
          else if (title.includes(query)) score += 0.65
          else if (searchableText.includes(query)) score += 0.5

          if (queryTokens.length > 0) {
            const overlap = queryTokens.filter((token) => searchableText.includes(token)).length / queryTokens.length
            score += overlap * 0.25
            queryMatched = overlap > 0
          }
          queryMatched = queryMatched || title === query || title.includes(query) || searchableText.includes(query)
        }
        if (memberName) {
          const memberHit = event.event_members?.some((m) => m.family_members?.name.toLowerCase().includes(memberName))
          if (memberHit) score += 0.2
        }
        if (dateHint) score += 0.15
        if (!query && !memberName && !dateHint) score += 0.5
        return { event, confidence: Math.min(1, Number(score.toFixed(2))), queryMatched }
      })
        .filter(({ confidence, queryMatched }) => (!query || queryMatched) && confidence >= 0.2)
        .sort((a, b) => b.confidence - a.confidence)

      if (scoredResults.length === 0) return { found: false, message: 'No matching events found.' }

      const topConfidence = scoredResults[0]?.confidence ?? 0
      const secondConfidence = scoredResults[1]?.confidence ?? 0
      // Date-range searches (today/tomorrow/this week/next weekend etc.) are deterministic —
      // all results passed a concrete date filter, so they're not ambiguous even if scores are close.
      const isDateRangeSearch = Boolean(resolvedDateStart && resolvedDateEnd)
      const ambiguous = !isDateRangeSearch && scoredResults.length > 1 && (topConfidence < 0.75 || topConfidence - secondConfidence < 0.15)

      const payload = {
        found: true,
        count: scoredResults.length,
        ambiguity: {
          ambiguous,
          top_confidence: topConfidence,
          second_confidence: secondConfidence,
          recommended_action: ambiguous ? 'ask_user_to_disambiguate' : 'safe_to_proceed_after_confirmation',
        },
        events: scoredResults.slice(0, 10).map(({ event: e, confidence }) => ({
          id: e.id,
          confidence,
          title: e.title,
          start: e.start_time,
          end: e.end_time,
          updated_at: e.updated_at,
          location: e.location_name,
          address: e.address,
          members: e.event_members?.map(m => m.family_members?.name).filter(Boolean),
          all_day: e.all_day,
          description: e.description,
          notes: e.event_enrichments?.[0]?.prep_notes ?? null,
          category: e.event_enrichments?.[0]?.category ?? null,
          what_to_bring: e.event_enrichments?.[0]?.what_to_bring ?? [],
          outfit_suggestion: e.event_enrichments?.[0]?.outfit_suggestion ?? null,
          parking_notes: e.event_enrichments?.[0]?.parking_notes ?? null,
          contact_name: e.event_enrichments?.[0]?.contact_name ?? null,
          contact_phone: e.event_enrichments?.[0]?.contact_phone ?? null,
          cost_estimate: e.event_enrichments?.[0]?.cost_estimate ?? null,
          dietary_notes: e.event_enrichments?.[0]?.dietary_notes ?? null,
          meal_impact: e.event_enrichments?.[0]?.meal_impact ?? null,
          checklist_items: (e.event_checklist_items ?? [])
            .slice()
            .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || String(a.created_at ?? '').localeCompare(String(b.created_at ?? '')))
            .map((item) => ({
              id: item.id,
              label: item.label,
              note: item.note ?? null,
              checked: item.checked === true,
              category: item.category ?? null,
            })),
          action_items: (e.event_action_items ?? [])
            .slice()
            .sort((a, b) => String(a.created_at ?? '').localeCompare(String(b.created_at ?? '')))
            .map((item) => ({
              id: item.id,
              title: item.title,
              description: item.description ?? null,
              due_date: item.due_date ?? null,
              is_urgent: item.is_urgent === true,
              completed: item.completed === true,
              assigned_to: item.assigned_to ?? null,
            })),
        })),
      }
      if (payload.count === 1 && payload.ambiguity.ambiguous === false) {
        responseConversationState = eventConversationState(scoredResults[0].event, now)
      }
      console.log(`[ai-assistant][${cid}] stage=read_tool name=${name} ms=${Date.now() - stageStartMs} results=${payload.count ?? 0}`)
      return payload
    }

    if (name === 'search_places') {
      const query = args.query as string
      const city = (args.city as string) || (context.homeCity as string) || 'West Palm Beach'
      try {
        const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'X-Goog-Api-Key': mapsKey,
            'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.location',
          },
          body: JSON.stringify({ textQuery: `${query} near ${city}`, maxResultCount: 3 }),
        })
        const data = await res.json()
        const places = (data.places ?? []).map((p: { displayName?: { text: string }; formattedAddress?: string; nationalPhoneNumber?: string }) => ({
          name: p.displayName?.text,
          address: p.formattedAddress,
          phone: p.nationalPhoneNumber,
        }))
        const payload = { places, count: places.length }
        console.log(`[ai-assistant][${cid}] stage=read_tool name=${name} ms=${Date.now() - stageStartMs} results=${payload.count}`)
        return payload
      } catch {
        console.log(`[ai-assistant][${cid}] stage=read_tool name=${name} ms=${Date.now() - stageStartMs} results=0 error=fetch_failed`)
        return { places: [], count: 0 }
      }
    }

    if (name === 'get_weather_forecast') {
      const rawLocation = String(args.location ?? '').trim()
      const location = rawLocation || String(context.homeCity ?? 'West Palm Beach')
      const requestedHours = Number(args.hours_ahead ?? 12)
      const hoursAhead = Number.isFinite(requestedHours) ? Math.max(1, Math.min(24, Math.round(requestedHours))) : 12

      const weatherCodeLabel = (code: number | null): string => {
        const map: Record<number, string> = {
          0: 'Clear sky',
          1: 'Mainly clear',
          2: 'Partly cloudy',
          3: 'Overcast',
          45: 'Fog',
          48: 'Depositing rime fog',
          51: 'Light drizzle',
          53: 'Moderate drizzle',
          55: 'Dense drizzle',
          56: 'Light freezing drizzle',
          57: 'Dense freezing drizzle',
          61: 'Slight rain',
          63: 'Moderate rain',
          65: 'Heavy rain',
          66: 'Light freezing rain',
          67: 'Heavy freezing rain',
          71: 'Slight snow',
          73: 'Moderate snow',
          75: 'Heavy snow',
          77: 'Snow grains',
          80: 'Slight rain showers',
          81: 'Moderate rain showers',
          82: 'Violent rain showers',
          85: 'Slight snow showers',
          86: 'Heavy snow showers',
          95: 'Thunderstorm',
          96: 'Thunderstorm with slight hail',
          99: 'Thunderstorm with heavy hail',
        }
        return map[code ?? -1] ?? 'Unknown'
      }

      try {
        const geoUrl = new URL('https://geocoding-api.open-meteo.com/v1/search')
        geoUrl.searchParams.set('name', location)
        geoUrl.searchParams.set('count', '1')
        geoUrl.searchParams.set('language', 'en')
        geoUrl.searchParams.set('format', 'json')
        const geoRes = await fetch(geoUrl.toString())
        const geoData = await geoRes.json()
        const place = geoData?.results?.[0]
        if (!place || !Number.isFinite(place.latitude) || !Number.isFinite(place.longitude)) {
          return { location, found: false, error: `Could not resolve weather location: ${location}` }
        }

        const forecastUrl = new URL('https://api.open-meteo.com/v1/forecast')
        forecastUrl.searchParams.set('latitude', String(place.latitude))
        forecastUrl.searchParams.set('longitude', String(place.longitude))
        forecastUrl.searchParams.set('timezone', 'auto')
        forecastUrl.searchParams.set('forecast_days', '3')
        forecastUrl.searchParams.set('temperature_unit', 'fahrenheit')
        forecastUrl.searchParams.set('windspeed_unit', 'mph')
        forecastUrl.searchParams.set('precipitation_unit', 'inch')
        forecastUrl.searchParams.set('current', 'temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code,wind_speed_10m,uv_index')
        forecastUrl.searchParams.set('hourly', 'temperature_2m,precipitation_probability,precipitation,weather_code')
        forecastUrl.searchParams.set('daily', 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,uv_index_max,sunrise,sunset')
        const fcRes = await fetch(forecastUrl.toString())
        const fcData = await fcRes.json()
        if (!fcRes.ok) {
          return { location, found: false, error: 'Weather provider request failed' }
        }

        const nowIso = String(fcData?.current?.time ?? '')
        const hourlyTime = Array.isArray(fcData?.hourly?.time) ? fcData.hourly.time : []
        const idxNow = Math.max(0, hourlyTime.findIndex((t: string) => t >= nowIso))
        const endIdx = Math.min(hourlyTime.length, idxNow + hoursAhead)

        const hourly = hourlyTime.slice(idxNow, endIdx).map((time: string, i: number) => {
          const at = idxNow + i
          return {
            time,
            temp_f: fcData?.hourly?.temperature_2m?.[at] ?? null,
            precip_probability: fcData?.hourly?.precipitation_probability?.[at] ?? null,
            precip_mm: fcData?.hourly?.precipitation?.[at] ?? null,
            weather_code: fcData?.hourly?.weather_code?.[at] ?? null,
            weather_label: weatherCodeLabel(fcData?.hourly?.weather_code?.[at] ?? null),
          }
        })

        const dailyTime = Array.isArray(fcData?.daily?.time) ? fcData.daily.time : []
        const daily = dailyTime.slice(0, 3).map((date: string, i: number) => ({
          date,
          temp_max_f: fcData?.daily?.temperature_2m_max?.[i] ?? null,
          temp_min_f: fcData?.daily?.temperature_2m_min?.[i] ?? null,
          precip_probability_max: fcData?.daily?.precipitation_probability_max?.[i] ?? null,
          uv_index_max: fcData?.daily?.uv_index_max?.[i] ?? null,
          weather_code: fcData?.daily?.weather_code?.[i] ?? null,
          weather_label: weatherCodeLabel(fcData?.daily?.weather_code?.[i] ?? null),
          sunrise: fcData?.daily?.sunrise?.[i] ?? null,
          sunset: fcData?.daily?.sunset?.[i] ?? null,
        }))

        const payload = {
          found: true,
          location: `${place.name}${place.admin1 ? `, ${place.admin1}` : ''}${place.country_code ? ` (${place.country_code})` : ''}`,
          latitude: place.latitude,
          longitude: place.longitude,
          timezone: fcData?.timezone ?? null,
          current: {
            time: fcData?.current?.time ?? null,
            temp_f: fcData?.current?.temperature_2m ?? null,
            feels_like_f: fcData?.current?.apparent_temperature ?? null,
            humidity: fcData?.current?.relative_humidity_2m ?? null,
            precip_mm: fcData?.current?.precipitation ?? null,
            wind_mph: fcData?.current?.wind_speed_10m ?? null,
            uv_index: fcData?.current?.uv_index ?? null,
            weather_code: fcData?.current?.weather_code ?? null,
            weather_label: weatherCodeLabel(fcData?.current?.weather_code ?? null),
          },
          hourly,
          daily,
          rain_expected_next_hours: hourly.some((h: { precip_probability?: number; precip_mm?: number }) => (h.precip_probability ?? 0) >= 40 || (h.precip_mm ?? 0) > 0.5),
          alerts: {
            provider: 'open-meteo',
            official_alerts_available: false,
            note: 'Open-Meteo endpoint used here does not provide official government warning feeds.',
          },
        }
        console.log(`[ai-assistant][${cid}] stage=read_tool name=${name} ms=${Date.now() - stageStartMs} results=${payload.daily.length}`)
        return payload
      } catch {
        console.log(`[ai-assistant][${cid}] stage=read_tool name=${name} ms=${Date.now() - stageStartMs} results=0 error=weather_fetch_failed`)
        return { location, found: false, error: 'Unable to reach weather provider' }
      }
    }

    if (name === 'get_travel_eta') {
      const destination = String(args.destination ?? '').trim()
      if (!destination) return { found: false, error: 'Missing destination for travel ETA' }
      const origin = String(args.origin ?? '').trim() || homeAddress || String(context.homeCity ?? '')
      if (!origin) return { found: false, error: 'No origin available. Configure home address in Settings.' }

      const arrivalTimeIso = typeof args.arrival_time === 'string' ? String(args.arrival_time) : null
      const departureTimeIso = typeof args.departure_time === 'string' ? String(args.departure_time) : null
      const rawBuffer = Number(args.buffer_mins ?? 10)
      const bufferMins = Number.isFinite(rawBuffer) ? Math.max(0, Math.min(45, Math.round(rawBuffer))) : 10

      let payload = await computeTravelEta({
        mapsKey,
        origin,
        destination,
        arrivalTimeIso,
        departureTimeIso,
        bufferMins,
      })
      if (!payload.found && /no route found/i.test(String(payload.error ?? ''))) {
        const cleanedDestination = sanitizeTravelLocation(destination)
        const cleanedOriginRaw = sanitizeTravelLocation(origin)
        const cleanedOrigin = /^home$/i.test(cleanedOriginRaw) ? (homeAddress || String(context.homeCity ?? '')) : cleanedOriginRaw
        if ((cleanedDestination && cleanedDestination !== destination) || (cleanedOrigin && cleanedOrigin !== origin)) {
          payload = await computeTravelEta({
            mapsKey,
            origin: cleanedOrigin || origin,
            destination: cleanedDestination || destination,
            arrivalTimeIso,
            departureTimeIso,
            bufferMins,
          })
        }
      }
      if (!payload.found && /no route found/i.test(String(payload.error ?? ''))) {
        const inferredDestination = inferTravelDestinationFromText(String(latestUserText ?? ''))
        if (inferredDestination) {
          const inferredOrigin = inferTravelOriginFromText(String(latestUserText ?? ''))
          payload = await computeTravelEta({
            mapsKey,
            origin: inferredOrigin || homeAddress || String(context.homeCity ?? '') || origin,
            destination: inferredDestination,
            arrivalTimeIso,
            departureTimeIso,
            bufferMins,
          })
        }
      }
      console.log(`[ai-assistant][${cid}] stage=read_tool name=${name} ms=${Date.now() - stageStartMs} found=${payload.found ? 1 : 0}`)
      return payload
    }

    if (name === 'search_web') {
      const query = String(args.query ?? '').trim()
      const parsedMax = Number(args.max_results ?? 5)
      const maxResults = Number.isFinite(parsedMax) ? Math.max(1, Math.min(8, Math.round(parsedMax))) : 5
      if (!query) return { results: [], count: 0, error: 'Missing query' }

      // Server-side math interceptor: catch tip/percentage/arithmetic queries
      const mathIntercept =
        /^[\s\d\.\+\-\*\/x×÷()]+$/.test(query) ||
        /\b\d+\s*(percent|%)\s*(tip|off|of|on)\s+\$?\d+/i.test(query) ||
        /\btip\b.*\$?\d+/i.test(query) ||
        /\b(what\s+is|calc(ulate)?|compute|solve)\b.{0,30}\b\d+\b.{0,20}\b\d+\b/i.test(query) ||
        /\b\d+\s*(divided\s+by|times|plus|minus|multiplied)\s*\d+/i.test(query)
      if (mathIntercept) {
        return { results: [], count: 0, math_query: true, hint: 'This is a math/calculation query. Answer directly from reasoning — no web search needed.' }
      }

      if (!braveKey) return { results: [], count: 0, error: 'BRAVE_API_KEY not configured' }

      try {
        const url = new URL('https://api.search.brave.com/res/v1/web/search')
        url.searchParams.set('q', query)
        url.searchParams.set('count', String(maxResults))
        url.searchParams.set('safesearch', 'moderate')

        const res = await fetch(url.toString(), {
          headers: {
            'Accept': 'application/json',
            'X-Subscription-Token': braveKey,
          },
        })
        const data = await res.json()
        if (!res.ok) {
          const message = data?.error?.detail ?? data?.error ?? 'Brave search failed'
          const payload = { results: [], count: 0, error: message }
          console.log(`[ai-assistant][${cid}] stage=read_tool name=${name} ms=${Date.now() - stageStartMs} results=0 error=provider`)
          return payload
        }

        const results = (data?.web?.results ?? []).map((item: {
          title?: string
          url?: string
          description?: string
          age?: string
          page_age?: string
          profile?: { long_name?: string }
        }) => ({
          title: item.title ?? '',
          url: item.url ?? '',
          snippet: item.description ?? '',
          source: item.profile?.long_name ?? null,
          age: item.age ?? item.page_age ?? null,
        }))
        const payload = { results, count: results.length, query }
        console.log(`[ai-assistant][${cid}] stage=read_tool name=${name} ms=${Date.now() - stageStartMs} results=${payload.count}`)
        return payload
      } catch {
        console.log(`[ai-assistant][${cid}] stage=read_tool name=${name} ms=${Date.now() - stageStartMs} results=0 error=network`)
        return { results: [], count: 0, error: 'Unable to reach Brave Search' }
      }
    }

    return { error: 'Unknown tool' }
  }

  // Call Gemini with function calling — one primary and at most one synthesis round.
  async function callGeminiWithTools(contents: GeminiContent[]): Promise<{ type: string; [key: string]: unknown }> {
    const llmStartMs = Date.now()
    const primaryToolConfig = intentRouting.forceEventSearch
      ? { function_calling_config: { mode: 'ANY', allowed_function_names: ['search_events'] } }
      : { function_calling_config: { mode: 'AUTO' } }
    const body = {
      system_instruction: { parts: [{ text: systemInstruction }] },
      contents,
      generation_config: { temperature: 0.4, max_output_tokens: 2048 },
      ...(primaryTools.length > 0 ? {
        tools: primaryTools,
        tool_config: primaryToolConfig,
      } : {}),
    }
    appendServerTrace(
      'server_ai_assistant_prompt_profile',
      `profile=${intentRouting.profile} tools=${primaryToolDeclarations.length} chars=${systemInstruction.length}`,
      {
        intent_profile: intentRouting.profile,
        force_event_search: intentRouting.forceEventSearch,
        tool_count: primaryToolDeclarations.length,
        tool_names: primaryToolDeclarations.map((tool) => tool.name),
        secondary_tool_count: secondaryToolDeclarations.length,
        system_instruction_chars: systemInstruction.length,
        history_turns: contents.length,
      },
    )

    const res = await callModel(body, { stream: wantStream, timeoutMs: PRIMARY_HARD_TIMEOUT_MS })
    const llmPrimaryMs = Date.now() - llmStartMs
    console.log(`[ai-assistant][${cid}] stage=llm_primary ms=${llmPrimaryMs} status=${res.status}`)
    if (res.ok) {
      const data = res.data
      recordLlmCall('llm_primary', llmPrimaryMs, res.status, data)
      warnIfSlow('llm_primary', llmPrimaryMs, STAGE_SLO.llmPrimaryMs)

      const candidate = data.candidates?.[0]
      if (!candidate) return { type: 'error', code: 'llm_error', message: 'No response from AI' }

      // Check for safety/finish reason blocks
      const finishReason = candidate.finishReason
      if (finishReason && finishReason !== 'STOP' && finishReason !== 'TOOL_USE' && !candidate.content) {
        return { type: 'text', text: `I had trouble processing that (${finishReason}). Could you rephrase?` }
      }

      const summarizeReadTool = (name: string, toolResult: Record<string, unknown>): string => {
        if (name === 'search_events') {
          const count = Number(toolResult.count ?? 0)
          const events = (toolResult.events as Array<{ title?: string; start?: string }> | undefined) ?? []
          if (count > 0) {
            const items = events
              .slice(0, 5)
              .flatMap((event) => event.title && event.start ? [`${event.title} at ${toLocal(event.start)}`] : [])
            const remaining = Math.max(0, count - items.length)
            const remainder = remaining > 0 ? `, plus ${remaining} more` : ''
            return items.length > 0
              ? `I found ${count} matching event${count === 1 ? '' : 's'}: ${items.join('; ')}${remainder}.`
              : `I found ${count} matching event${count === 1 ? '' : 's'}.`
          }
          return 'I could not find any matching events.'
        }
        if (name === 'search_places') {
          const count = Number(toolResult.count ?? 0)
          if (count > 0) return `I found ${count} place option${count === 1 ? '' : 's'}.`
          return 'I could not find a matching place yet.'
        }
        if (name === 'search_web') {
          const count = Number(toolResult.count ?? 0)
          if (count > 0) return `I found ${count} web result${count === 1 ? '' : 's'} for that query.`
          return 'I could not find web results for that query.'
        }
        if (name === 'get_weather_forecast') {
          const found = Boolean(toolResult.found)
          if (!found) return String(toolResult.error ?? 'I could not retrieve weather forecast data right now.')
          const loc = String(toolResult.location ?? 'that location')
          const cur = toolResult.current as { temp_f?: number; weather_label?: string } | undefined
          const t = typeof cur?.temp_f === 'number' ? `${Math.round(cur.temp_f)}°F` : 'current weather'
          const label = cur?.weather_label ? String(cur.weather_label).toLowerCase() : 'conditions'
          return `I pulled the weather forecast for ${loc}: ${t}, ${label}.`
        }
        if (name === 'get_travel_eta') {
          const found = Boolean(toolResult.found)
          if (!found) {
            const error = String(toolResult.error ?? 'I could not retrieve travel ETA right now.')
            if (/no route found/i.test(error)) {
              return "I couldn't resolve that route yet. Try adding a city or full address for the destination."
            }
            return error
          }
          const drive = Number(toolResult.drive_time_mins ?? 0)
          const leaveBy = typeof toolResult.leave_by === 'string' ? toLocal(toolResult.leave_by) : null
          const summary = typeof toolResult.route_summary === 'string' ? toolResult.route_summary : null
          const assumedTomorrow = Boolean(toolResult.assumed_next_day)
          if (leaveBy) {
            const prefix = assumedTomorrow
              ? `That arrival time already passed today, so I shifted it to tomorrow. Leave by ${leaveBy}.`
              : `Leave by ${leaveBy}.`
            return `${prefix} ${summary ?? `${drive} min drive`}`.trim()
          }
          return summary ?? `${drive} min drive`
        }
        return 'I found results for your request.'
      }

      const userLikelyRequestedWrite = /\b(move|resched|reschedule|change|update|edit|delete|remove|cancel|add|create|set|shift|push)\b/i
        .test(latestUserText ?? '')

      const resolveModelParts = async (parts: GeminiPart[], secondaryDepth = 0) => {
        const funcCallPart = parts.find((p: { functionCall?: { name: string; args: Record<string, unknown> } }) => p.functionCall)
        const textParts = parts
          .flatMap((p) => 'text' in p && typeof p.text === 'string' && p.text.trim() ? [p.text.trim()] : [])

        if (!funcCallPart && textParts.length > 0) {
          const userText = latestUserText ?? ''
          const homeCity = String(context.homeCity ?? 'West Palm Beach').toLowerCase()
          const weatherLocRaw = userText.match(/\b(?:weather|forecast)\s+(?:in|for)\s+([a-zA-Z][a-zA-Z\s,'-]{1,80})/i)?.[1] ?? ''
          const weatherLoc = weatherLocRaw
            .split(/\b(?:today|tomorrow|tonight|this|next|and|with|should|do|will)\b|[?,.]/i)[0]
            .trim()
          const isNonHomeWeatherLocation = weatherLoc.length > 1 && !weatherLoc.toLowerCase().includes(homeCity)

          // Deterministic weather rescue lane:
          // If user explicitly asked weather for a non-home location but model didn't call tools,
          // fetch forecast directly so we never respond with a false "home city only" limitation.
          if (isNonHomeWeatherLocation) {
            const weatherResult = await executeReadTool('get_weather_forecast', { location: weatherLoc, hours_ahead: 12 })
            if (!(weatherResult as { found?: boolean }).found) {
              return {
                type: 'text',
                text: `I couldn't find weather for "${weatherLoc}" yet. Try a nearby city plus region (for example: "London, UK" or "Springfield, IL").`,
              }
            }
            const wr = weatherResult as {
              location?: string
              current?: { temp_f?: number; weather_label?: string }
              daily?: Array<{ temp_max_f?: number; temp_min_f?: number; precip_probability_max?: number }>
            }
            const loc = wr.location ?? weatherLoc
            const currentTemp = typeof wr.current?.temp_f === 'number' ? `${Math.round(wr.current.temp_f)}°F` : 'current conditions'
            const currentLabel = wr.current?.weather_label ? String(wr.current.weather_label).toLowerCase() : 'conditions'
            const tomorrow = wr.daily?.[1]
            const tomorrowText = tomorrow
              ? ` Tomorrow looks like a high near ${Math.round(Number(tomorrow.temp_max_f ?? 0))}°F, low near ${Math.round(Number(tomorrow.temp_min_f ?? 0))}°F, with up to ${Math.round(Number(tomorrow.precip_probability_max ?? 0))}% rain chance.`
              : ''
            return { type: 'text', text: `In ${loc}, current weather is ${currentTemp} and ${currentLabel}.${tomorrowText}` }
          }
          return { type: 'text', text: textParts.join('\n') }
        }

        if (!funcCallPart) return null

        const { name, args } = (funcCallPart as { functionCall: { name: string; args: Record<string, unknown> } }).functionCall

        // Read-only tools: execute server-side. Only escalate to a second LLM call when the user likely wants a write.
        if (name === 'search_events' || name === 'search_places' || name === 'search_web' || name === 'get_weather_forecast' || name === 'get_travel_eta') {
          const toolResult = await executeReadTool(name, args)
          const resultFound = Boolean((toolResult as { found?: boolean }).found)
          const isMathQuery = Boolean((toolResult as { math_query?: boolean }).math_query)
          const isWeatherForecast = name === 'get_weather_forecast'
          const isTravelEta = name === 'get_travel_eta'
          // Run secondary LLM call when:
          // - user wants a write (search → then propose change), OR
          // - a question requires actual analysis of the results
          // - math_query intercepted: LLM needs to compute directly
          const userAsksSynthesis = /\b(how busy|compare|any.*overlap|conflict|double[- ]?book|together)\b/i
            .test(latestUserText ?? '')
          const shouldRunSecondary = secondaryDepth === 0 && remainingRequestBudgetMs() >= 1000 && (
            (name === 'search_events' && resultFound && (userLikelyRequestedWrite || userAsksSynthesis)) ||
            (name === 'search_web' && isMathQuery) ||
            (name === 'get_weather_forecast' && resultFound)
          )

          if (!shouldRunSecondary) {
            if (secondaryDepth > 0) {
              appendServerTrace('server_ai_assistant_secondary_cap', `tool=${name} depth=${secondaryDepth}`, {
                tool: name,
                secondary_depth: secondaryDepth,
                request_elapsed_ms: Date.now() - requestStartMs,
              })
            }
            return { type: 'text', text: summarizeReadTool(name, toolResult) }
          }

          // Feed result back to Gemini for final answer
          const newContents: GeminiContent[] = [
            ...contents,
            { role: 'model', parts: [funcCallPart as GeminiPart] },
            { role: 'user', parts: [{ functionResponse: { name, response: toolResult } } as GeminiPart] },
          ]

          // Second call for final answer.
          const isListRead = !userLikelyRequestedWrite
          const secondaryAddendum = isMathQuery
            ? '\n\nSECONDARY CALL — MATH MODE: The search_web call was intercepted because this is a math/calculation query. Ignore the empty web results. Compute the answer directly from your own reasoning and give a concise numerical answer.'
            : isWeatherForecast
              ? '\n\nSECONDARY CALL — WEATHER MODE: Use the get_weather_forecast result above to answer directly and concretely. Include practical guidance (umbrella/heat timing/UV/rain window) when relevant. Do NOT call other tools unless weather data is missing.'
            : isTravelEta
              ? '\n\nSECONDARY CALL — TRAVEL MODE: Use get_travel_eta result above to answer with a concrete leave-by recommendation, drive duration, and traffic impact. Keep it operationally clear.'
            : isListRead
              ? '\n\nSECONDARY CALL — LIST MODE: The search_events result above contains all matching events. Enumerate them clearly in a concise list. Do NOT ask for clarification. Do NOT call any write tool.'
              : '\n\nSECONDARY CALL — WRITE MODE: You have the search result. Now IMMEDIATELY call the appropriate write tool (update_event, bulk_update_events, delete_event, delete_events_by_title, create_event, create_recipe). Do not output text first — call the tool directly.'
          const secondaryPrompt = systemInstruction + secondaryAddendum
          const secondaryBody = {
            system_instruction: { parts: [{ text: secondaryPrompt }] },
            contents: newContents,
            generation_config: body.generation_config,
            ...(secondaryTools.length > 0
              ? {
                tools: secondaryTools,
                tool_config: { function_calling_config: { mode: 'AUTO' } },
              }
              : {}),
          }
          const secondaryStartMs = Date.now()
          const res2 = await callModel(secondaryBody, {
            stream: wantStream,
            timeoutMs: SECONDARY_HARD_TIMEOUT_MS,
          })
          const secondaryElapsedMs = Date.now() - secondaryStartMs
          console.log(`[ai-assistant][${cid}] stage=llm_secondary ms=${secondaryElapsedMs} status=${res2.status}`)
          if (!res2.ok) {
            recordLlmCall('llm_secondary', secondaryElapsedMs, res2.status)
            const summary = summarizeReadTool(name, toolResult)
            return {
              type: 'text',
              text: userLikelyRequestedWrite
                ? `${summary} I could not safely prepare the requested change, so nothing was changed.`
                : summary,
            }
          }
          const data2 = res2.data
          recordLlmCall('llm_secondary', secondaryElapsedMs, res2.status, data2)
          const secondaryParts = data2.candidates?.[0]?.content?.parts ?? []
          console.log(
            `[ai-assistant][${cid}] secondary_parts_count=${secondaryParts.length} has_func_call=${secondaryParts.some((p: { functionCall?: unknown }) => Boolean(p.functionCall))} has_text=${secondaryParts.some((p: { text?: unknown }) => Boolean(p.text))}`,
          )
          // Recursively resolve secondary response in case it contains a tool call (e.g., update_event after search_events)
          const secondaryResolved = await resolveModelParts(secondaryParts, secondaryDepth + 1)
          console.log(`[ai-assistant][${cid}] secondary_resolved type=${secondaryResolved?.type ?? 'null'}`)
          if (secondaryResolved) return secondaryResolved
          // Fallback to text if no tool was called
          const finalText = secondaryParts.find((p: { text?: string }) => p.text)?.text ?? ''
          return { type: 'text', text: finalText || summarizeReadTool(name, toolResult) }
        }

        if (name === 'add_grocery_items') {
          const itemsList = Array.isArray(args.items) ? args.items.filter((i: { name?: string }) => i?.name?.trim()) : []
          if (itemsList.length === 0) {
            return { type: 'text', text: "I didn't catch what you'd like to add to the grocery list. Could you say the item name?" }
          }
          const groceryArgs = { ...args, items: itemsList }
          if (dryRun) {
            return {
              type: 'tool_action',
              tool: name,
              args: groceryArgs,
              display_text: buildDisplayText(name, groceryArgs),
            }
          }
          const autoActionId = `auto-grocery-${Date.now().toString(36)}`
          const execResult = await sb.functions.invoke('execute-ai-action', {
            body: {
              tool: name,
              args: groceryArgs,
              action_id: autoActionId,
              session_id: traceId,
              correlation_id: `${cid}:auto-grocery:${Date.now().toString(36)}`,
              trace_id: traceId,
              turn_id: turnId,
              lane: 'tool_action',
              device_id: deviceId,
              client_trace_present: clientTracePresent,
              client_build: clientBuild,
              client_trace_source: clientTraceSource ?? 'ai-assistant-auto',
            },
          })

          const execError = execResult.error?.message ?? (execResult.data as { error?: string } | null)?.error ?? null
          if (execError) {
            return { type: 'text', text: `I couldn't add that to grocery yet: ${execError}` }
          }

          const payload = (execResult.data as {
            success?: boolean
            count?: number
            items?: { name: string; category?: string; normalized_from?: string | null }[]
          } | null) ?? {}
          if (!payload.success) {
            return { type: 'text', text: "I couldn't add that to grocery right now. Please try again." }
          }

          const addedItems = Array.isArray(payload.items) ? payload.items : []
          const names = addedItems.map((item) => item.name).filter(Boolean)
          const corrected = addedItems
            .filter((item) => item.normalized_from && item.normalized_from !== item.name)
            .map((item) => `${item.normalized_from} → ${item.name}`)

          const addedLine = names.length > 0
            ? `Added to grocery: ${names.join(', ')}.`
            : `Added ${payload.count ?? 0} grocery item${payload.count === 1 ? '' : 's'}.`
          const correctionLine = corrected.length > 0
            ? ` I interpreted ${corrected.join('; ')}.`
            : ''

          return { type: 'text', text: `${addedLine}${correctionLine}`, write_verified: true }
        }

        if (name === 'create_event') {
          const title = typeof args.title === 'string' ? args.title.trim() : ''
          const start = typeof args.start === 'string' ? args.start : ''
          const end = typeof args.end === 'string' ? args.end : ''
          const location = typeof args.location === 'string' ? args.location.trim() : ''
          const notes = typeof args.notes === 'string' ? args.notes.trim() : ''
          const members = Array.isArray(args.members)
            ? args.members.filter((member): member is string => typeof member === 'string' && member.trim().length > 0)
            : []
          const startMs = Date.parse(start)
          const endMs = Date.parse(end)
          const durationMinutes = Number.isFinite(startMs) && Number.isFinite(endMs)
            ? (endMs - startMs) / 60000
            : NaN
          const isLowRiskCreate = (
            title.length >= 3 &&
            title.length <= 140 &&
            Number.isFinite(durationMinutes) &&
            durationMinutes >= 5 &&
            durationMinutes <= 240 &&
            members.length <= 2 &&
            location.length === 0 &&
            notes.length === 0
          )

          if (isLowRiskCreate && !dryRun) {
            const autoActionId = `auto-create-${Date.now().toString(36)}`
            const execResult = await sb.functions.invoke('execute-ai-action', {
              body: {
                tool: name,
                args,
                action_id: autoActionId,
                session_id: traceId,
                correlation_id: `${cid}:auto-create:${Date.now().toString(36)}`,
                trace_id: traceId,
                turn_id: turnId,
                lane: 'tool_action',
                device_id: deviceId,
                client_trace_present: clientTracePresent,
                client_build: clientBuild,
                client_trace_source: clientTraceSource ?? 'ai-assistant-auto',
              },
            })

            const execError = execResult.error?.message ?? (execResult.data as { error?: string } | null)?.error ?? null
            if (execError) {
              return { type: 'text', text: `I heard you but couldn't auto-create that yet: ${execError}` }
            }

            const payload = (execResult.data as { success?: boolean; sync_status?: 'synced' | 'queued' | 'failed'; sync_warning?: string } | null) ?? {}
            if (!payload.success) {
              return { type: 'text', text: "I couldn't auto-create that yet. Please try once more." }
            }

            if (payload.sync_status === 'synced') {
              return { type: 'text', text: `Confirmed — I created "${title}" at ${start}.`, write_verified: true }
            }
            if (payload.sync_status === 'queued') {
              return { type: 'text', text: `Saved in Casa Tabor. Google sync is queued and still in progress for "${title}".`, write_verified: true }
            }
            return {
              type: 'text',
              write_verified: true,
              text: payload.sync_warning
                ? payload.sync_warning
                : `Saved in Casa Tabor, but I could not confirm Google sync yet for "${title}".`,
            }
          }
        }

        if (name === 'create_recipe' && !dryRun) {
          const autoActionId = `auto-recipe-${Date.now().toString(36)}`
          const execResult = await sb.functions.invoke('execute-ai-action', {
            body: {
              tool: name,
              args,
              action_id: autoActionId,
              session_id: traceId,
              correlation_id: `${cid}:auto-recipe:${Date.now().toString(36)}`,
              trace_id: traceId,
              turn_id: turnId,
              lane: 'tool_action',
              device_id: deviceId,
              client_trace_present: clientTracePresent,
              client_build: clientBuild,
              client_trace_source: clientTraceSource ?? 'ai-assistant-auto',
            },
          })

          const execError = execResult.error?.message ?? (execResult.data as { error?: string } | null)?.error ?? null
          if (execError) {
            return { type: 'text', text: `I couldn't save that recipe yet: ${execError}` }
          }

          const payload = (execResult.data as { success?: boolean; recipe_id?: string; image_url?: string | null } | null) ?? {}
          if (!payload.success) {
            return { type: 'text', text: "I couldn't save that recipe yet. Please try once more." }
          }
          return {
            type: 'text',
            write_verified: true,
            text: payload.image_url
              ? 'Saved to Recipe Library with ingredients, steps, and a photo.'
              : 'Saved to Recipe Library with complete ingredients and steps. (No photo found yet.)',
          }
        }

        // Write tools: return to frontend for confirmation
        return {
          type: 'tool_action',
          tool: name,
          args,
          display_text: buildDisplayText(name, args),
        }
      }

      const initialParts = candidate.content?.parts ?? []
      const initialResolved = await resolveModelParts(initialParts)
      if (initialResolved) return initialResolved

      // Rare provider edge case: use one compact, bounded fallback. Do not retry
      // the full tool prompt first; that compounds tail latency without new context.
      console.error('[ai-assistant] Empty Gemini response. finishReason:', finishReason, 'parts:', JSON.stringify(initialParts))
      const fallbackUserText = [...contents]
        .reverse()
        .find((turn) => turn.role === 'user')
        ?.parts.flatMap((part) => 'text' in part && typeof part.text === 'string' ? [part.text.trim()] : [])
        .find((part) => part.length > 0)

      // Last-resort reliability pass: no tools, compact prompt, latest user turn only.
      // This avoids occasional empty tool-call responses from Gemini under load.
      if (fallbackUserText && !userLikelyRequestedWrite && remainingRequestBudgetMs() >= 500) {
        const fallbackBody = {
          system_instruction: {
            parts: [{
              text: 'You are the Casa Tabor assistant. Respond helpfully in 1-3 concise sentences. If data is missing, ask one clear follow-up question.',
            }],
          },
          contents: [{ role: 'user', parts: [{ text: fallbackUserText }] }],
          generation_config: { temperature: 0.2, max_output_tokens: 320 },
        }
        const fallbackStartMs = Date.now()
        const fallbackRes = await callModel(fallbackBody, {
          stream: false,
          timeoutMs: FALLBACK_HARD_TIMEOUT_MS,
        })
        const fallbackElapsedMs = Date.now() - fallbackStartMs
        console.log(`[ai-assistant][${cid}] stage=llm_fallback ms=${fallbackElapsedMs} status=${fallbackRes.status}`)
        if (fallbackRes.ok && fallbackRes.data) {
          const fallbackData = fallbackRes.data
          recordLlmCall('llm_fallback', fallbackElapsedMs, fallbackRes.status, fallbackData)
          const fallbackParts = fallbackData.candidates?.[0]?.content?.parts ?? []
          const fallbackText = fallbackParts
            .flatMap((part: { text?: string }) => typeof part.text === 'string' && part.text.trim() ? [part.text.trim()] : [])
            .join('\n')
          if (fallbackText) {
            console.log(`[ai-assistant][${cid}] recovered empty response via compact fallback`)
            return { type: 'text', text: fallbackText }
          }
        } else {
          recordLlmCall('llm_fallback', fallbackElapsedMs, fallbackRes.status)
          console.error(`[ai-assistant][${cid}] compact fallback failed status=${fallbackRes.status} body=${fallbackRes.errText.slice(0, 180)}`)
        }
      }

      return {
        type: 'text',
        text: userLikelyRequestedWrite
          ? 'I could not prepare that change safely. Nothing was changed—please say the request again.'
          : 'I heard you, but I hit a brief response issue. Please try that once more.',
      }
    }
    warnIfSlow('llm_primary', llmPrimaryMs, STAGE_SLO.llmPrimaryMs)
    recordLlmCall('llm_primary', llmPrimaryMs, res.status)
    if (!res.ok) {
      const errText = res.errText
      const isQuota = res.status === 429 || errText.includes('RESOURCE_EXHAUSTED')
      return { type: 'error', code: isQuota ? 'quota_exceeded' : 'llm_error', message: errText.slice(0, 200) }
    }
    return { type: 'error', code: 'llm_error', message: 'Primary LLM call failed without details' }
  }

  function buildDisplayText(name: string, args: Record<string, unknown>): string {
    if (name === 'create_event') return `Create: **${args.title}** on ${args.start}`
    if (name === 'create_recipe') {
      const ingredients = Array.isArray(args.ingredients) ? args.ingredients.length : 0
      const steps = Array.isArray(args.steps) ? args.steps.length : 0
      return `Save recipe: **${String(args.name ?? 'Untitled recipe')}** · ${ingredients} ingredient${ingredients === 1 ? '' : 's'} · ${steps} step${steps === 1 ? '' : 's'}`
    }
    if (name === 'update_event') {
      // Build a human-readable single-line summary of what will change
      const parts: string[] = []
      if (args.title !== undefined) parts.push(`title → "${String(args.title).slice(0, 40)}"`)
      if (args.start !== undefined) parts.push(`time → ${String(args.start).slice(0, 30)}`)
      if (args.location !== undefined || args.address !== undefined) parts.push(`location → "${String(args.location ?? args.address ?? '').slice(0, 30)}"`)
      if (args.notes !== undefined) parts.push('notes updated')
      if (args.category !== undefined) parts.push(`category → ${String(args.category)}`)
      if (Array.isArray(args.what_to_bring)) parts.push(`bring list → ${(args.what_to_bring as string[]).join(', ')}`)
      if (args.checklist_items !== undefined) parts.push('checklist updated')
      if (args.action_items !== undefined) parts.push('actions updated')
      if ((args.members_add as string[])?.length) parts.push(`add ${(args.members_add as string[]).join(', ')}`)
      if ((args.members_remove as string[])?.length) parts.push(`remove ${(args.members_remove as string[]).join(', ')}`)
      if (
        args.outfit_suggestion !== undefined || args.parking_notes !== undefined ||
        args.contact_name !== undefined || args.contact_phone !== undefined ||
        args.cost_estimate !== undefined || args.dietary_notes !== undefined ||
        args.meal_impact !== undefined
      ) parts.push('details updated')

      if (parts.length === 0) return 'Update event'
      const preview = parts.slice(0, 3).join(' · ')
      const extra = parts.length > 3 ? ` +${parts.length - 3} more` : ''
      return `Update: ${preview}${extra}`
    }
    if (name === 'bulk_update_events') {
      const ids = Array.isArray(args.ids) ? args.ids.filter((id): id is string => typeof id === 'string' && id.trim().length > 0) : []
      const count = Number.isFinite(Number(args.count)) ? Number(args.count) : ids.length
      const titleQuery = String(args.title_query ?? '').trim()
      const label = titleQuery.length > 0 ? titleQuery : 'matching events'
      return `Update ${count} event${count === 1 ? '' : 's'} matching **${label}**`
    }
    if (name === 'delete_event') return `Delete: **${args.title}**`
    if (name === 'delete_events_by_title') {
      const ids = Array.isArray(args.ids) ? args.ids.filter((id): id is string => typeof id === 'string' && id.trim().length > 0) : []
      const titleQuery = String(args.title_query ?? '').trim()
      const count = Number.isFinite(Number(args.count)) ? Number(args.count) : ids.length
      const label = titleQuery.length > 0 ? titleQuery : 'matching appointments'
      return `Delete ${count} event${count === 1 ? '' : 's'} named **${label}**`
    }
    if (name === 'add_grocery_items') {
      const items = args.items as { name: string; quantity?: string }[]
      return `Add to grocery list: ${items.map(i => `${i.name}${i.quantity ? ` (${i.quantity})` : ''}`).join(', ')}`
    }
    if (name === 'check_grocery_item') return `Mark grocery item as ${args.checked ? 'done' : 'undone'}`
    if (name === 'clear_checked_grocery_items') return 'Clear all checked grocery items'
    return `Action: ${name}`
  }

  const logUsage = () => {
    sb.from('ai_usage_log').insert({
      function_name: 'ai-assistant',
      provider: llmTelemetry.provider,
      model: llmTelemetry.model,
      input_tokens: llmTelemetry.input_tokens,
      output_tokens: llmTelemetry.output_tokens,
      cached: false,
    }).then(() => {}).catch(() => {})
  }

  try {
    if (intentRouting.profile === 'event' && latestUserText) {
      const dayRead = resolveCalendarDayRead(latestUserText, allEvents ?? [], { now, utcOffset })
      if (dayRead) {
        if (dayRead.events.length === 1) {
          responseConversationState = eventConversationState(dayRead.events[0], now)
        }
        const requestTotalMs = Date.now() - requestStartMs
        appendServerTrace('server_ai_assistant_calendar_day_read', `day=${dayRead.day} count=${dayRead.events.length} ms=${requestTotalMs}`, {
          day: dayRead.day,
          event_ids: dayRead.events.map((event: { id: string }) => event.id),
          count: dayRead.events.length,
          request_ms: requestTotalMs,
        })
        return {
          status: 200,
          payload: {
            type: 'text',
            text: dayRead.text,
            correlation_id: cid,
            authoritative_provenance: {
              source: 'events',
              event_ids: dayRead.events.map((event: { id: string }) => event.id),
            },
            conversation_state: responseConversationState,
            telemetry: {
              ...llmTelemetry,
              request_total_ms: requestTotalMs,
              context_load_ms: contextLoadMs,
            },
          },
        }
      }
    }
    if (intentRouting.profile === 'event' && latestUserText && activeConversationEvent) {
      const bringListMutation = resolveBringListEdit(latestUserText, activeConversationEvent, {
        pendingAction: context?.pendingAction,
      })
      if (bringListMutation) {
        const requestTotalMs = Date.now() - requestStartMs
        appendServerTrace('server_ai_assistant_deterministic_mutation', `tool=${bringListMutation.tool} field=what_to_bring ms=${requestTotalMs}`, {
          tool: bringListMutation.tool,
          field: 'what_to_bring',
          event_id: activeConversationEvent.id,
          item_count: bringListMutation.args.what_to_bring.length,
          request_ms: requestTotalMs,
        })
        return {
          status: 200,
          payload: {
            type: 'tool_action',
            tool: bringListMutation.tool,
            args: bringListMutation.args,
            display_text: buildDisplayText(bringListMutation.tool, bringListMutation.args),
            conversation_state: eventConversationState(activeConversationEvent, now),
            correlation_id: cid,
            telemetry: {
              ...llmTelemetry,
              request_total_ms: requestTotalMs,
              context_load_ms: contextLoadMs,
            },
          },
        }
      }
    }
    if (intentRouting.profile === 'event' && latestUserText && activeConversationEvent) {
      const travelFollowUp = classifyEventTravelFollowUp(latestUserText)
      if (travelFollowUp === 'ambiguous') {
        const requestTotalMs = Date.now() - requestStartMs
        const text = `Do you mean the drive time to "${activeConversationEvent.title}", or how long the event lasts?`
        appendServerTrace('server_ai_assistant_event_travel_clarification', `event=${activeConversationEvent.id} ms=${requestTotalMs}`, {
          event_id: activeConversationEvent.id,
          request_ms: requestTotalMs,
        })
        return {
          status: 200,
          payload: {
            type: 'text',
            text,
            conversation_state: responseConversationState,
            correlation_id: cid,
            telemetry: { ...llmTelemetry, request_total_ms: requestTotalMs, context_load_ms: contextLoadMs },
          },
        }
      }
      if (travelFollowUp === 'route') {
        const destination = eventTravelDestination(activeConversationEvent)
        let text: string
        let route: Record<string, unknown> | null = null
        if (!destination) {
          text = `The calendar does not have a destination saved for "${activeConversationEvent.title}".`
        } else if (!homeAddress) {
          text = 'I have the event destination, but the home address is not configured in Settings.'
        } else {
          const controller = new AbortController()
          const timeoutId = setTimeout(() => controller.abort(), 5000)
          try {
            const eventStartMs = Date.parse(activeConversationEvent.start_time)
            route = await computeTravelEta({
              mapsKey,
              origin: homeAddress,
              destination,
              arrivalTimeIso: Number.isFinite(eventStartMs) && eventStartMs > Date.now() + 2 * 60 * 1000
                ? activeConversationEvent.start_time
                : null,
              bufferMins: 10,
              signal: controller.signal,
            })
            text = formatEventTravelAnswer(activeConversationEvent, route, toLocal)
              ?? `I could not calculate a reliable route to "${activeConversationEvent.title}" right now.`
          } catch (error) {
            text = error instanceof DOMException && error.name === 'AbortError'
              ? `Route lookup timed out for "${activeConversationEvent.title}". Please try again.`
              : `Route lookup failed for "${activeConversationEvent.title}". Please try again.`
          } finally {
            clearTimeout(timeoutId)
          }
        }
        const requestTotalMs = Date.now() - requestStartMs
        appendServerTrace('server_ai_assistant_event_travel', `event=${activeConversationEvent.id} found=${route?.found ? 1 : 0} ms=${requestTotalMs}`, {
          event_id: activeConversationEvent.id,
          destination_source: activeConversationEvent.address ? 'event_address' : 'event_location',
          route_found: route?.found === true,
          drive_time_mins: route?.drive_time_mins ?? null,
          request_ms: requestTotalMs,
        })
        appendServerTrace('server_ai_assistant_result', `type=text ms=${requestTotalMs}`, {
          result_type: 'text',
          request_ms: requestTotalMs,
          llm_calls: 0,
          authoritative_event_id: activeConversationEvent.id,
          response_text: text,
        })
        return {
          status: 200,
          payload: {
            type: 'text',
            text,
            conversation_state: responseConversationState,
            authoritative_provenance: {
              source: 'events+google_routes',
              event_id: activeConversationEvent.id,
              updated_at: activeConversationEvent.updated_at,
            },
            correlation_id: cid,
            telemetry: { ...llmTelemetry, request_total_ms: requestTotalMs, context_load_ms: contextLoadMs },
          },
        }
      }
    }
    if (intentRouting.profile === 'event' && latestUserText && activeConversationEvent) {
      const groundedAnswer = answerGroundedEventFollowUp(latestUserText, activeConversationEvent, toLocal)
      if (groundedAnswer) {
        const requestTotalMs = Date.now() - requestStartMs
        appendServerTrace('server_ai_assistant_grounded_follow_up', `event=${activeConversationEvent.id} ms=${requestTotalMs}`, {
          event_id: activeConversationEvent.id,
          event_updated_at: activeConversationEvent.updated_at,
          request_ms: requestTotalMs,
        })
        appendServerTrace('server_ai_assistant_result', `type=text ms=${requestTotalMs}`, {
          result_type: 'text',
          request_ms: requestTotalMs,
          llm_calls: 0,
          authoritative_event_id: activeConversationEvent.id,
          response_text: groundedAnswer,
        })
        return {
          status: 200,
          payload: {
            type: 'text',
            text: groundedAnswer,
            conversation_state: responseConversationState,
            authoritative_provenance: {
              source: 'events',
              event_id: activeConversationEvent.id,
              updated_at: activeConversationEvent.updated_at,
            },
            correlation_id: cid,
            telemetry: {
              ...llmTelemetry,
              request_total_ms: requestTotalMs,
              context_load_ms: contextLoadMs,
            },
          },
        }
      }
    }
    if (intentRouting.profile === 'event' && latestUserText && !activeConversationEvent) {
      const selectedEvent = resolveUniqueEventTitle(latestUserText, allEvents ?? [])
      if (selectedEvent) {
        responseConversationState = eventConversationState(selectedEvent, now)
        const groundedAnswer = answerGroundedEventFollowUp(latestUserText, selectedEvent, toLocal)
          ?? `I'm using the calendar event "${selectedEvent.title}" for this conversation.`
        const requestTotalMs = Date.now() - requestStartMs
        appendServerTrace('server_ai_assistant_event_selected', `event=${selectedEvent.id} ms=${requestTotalMs}`, {
          event_id: selectedEvent.id,
          event_updated_at: selectedEvent.updated_at,
          request_ms: requestTotalMs,
        })
        return {
          status: 200,
          payload: {
            type: 'text',
            text: groundedAnswer,
            conversation_state: responseConversationState,
            authoritative_provenance: {
              source: 'events',
              event_id: selectedEvent.id,
              updated_at: selectedEvent.updated_at,
            },
            correlation_id: cid,
            telemetry: {
              ...llmTelemetry,
              request_total_ms: requestTotalMs,
              context_load_ms: contextLoadMs,
            },
          },
        }
      }
    }
    if (intentRouting.profile === 'event' && latestUserText && !context.focusedEvent) {
      const deterministicMutation = resolveDeterministicEventMutation(
        latestUserText,
        allEvents ?? [],
        {
          now,
          utcOffset,
          familyNames: (context.family as { name: string }[]).map((member) => member.name),
        },
      )
      if (deterministicMutation) {
        const requestTotalMs = Date.now() - requestStartMs
        appendServerTrace(
          'server_ai_assistant_deterministic_mutation',
          `tool=${deterministicMutation.tool} ms=${requestTotalMs}`,
          {
            tool: deterministicMutation.tool,
            event_id: deterministicMutation.event?.id ?? null,
            request_ms: requestTotalMs,
          },
        )
        appendServerTrace('server_ai_assistant_result', `type=tool_action ms=${requestTotalMs}`, {
          result_type: 'tool_action',
          request_ms: requestTotalMs,
          llm_calls: 0,
          llm_inference_ms: 0,
          input_tokens: 0,
          output_tokens: 0,
          total_tokens: 0,
        })
        return {
          status: 200,
          payload: {
            type: 'tool_action',
            tool: deterministicMutation.tool,
            args: deterministicMutation.args,
            display_text: buildDisplayText(deterministicMutation.tool, deterministicMutation.args),
            conversation_state: deterministicMutation.event
              ? eventConversationState(deterministicMutation.event, now)
              : responseConversationState,
            correlation_id: cid,
            telemetry: {
              ...llmTelemetry,
              request_total_ms: requestTotalMs,
              context_load_ms: contextLoadMs,
            },
          },
        }
      }
    }
    const rawResult = await callGeminiWithTools(history)
    const result = secureAssistantResult(rawResult, {
      userRequestedWrite: /\b(move|resched|change|update|edit|delete|remove|cancel|add|create|set|shift|push)\b/i.test(latestUserText ?? ''),
      writeWasVerified: rawResult?.write_verified === true,
    })
    if (result?.safety_rejection) {
      appendServerTrace('server_ai_assistant_output_rejected', String(result.safety_rejection), {
        reason: result.safety_rejection,
        original_response_preview: typeof rawResult?.text === 'string' ? rawResult.text.slice(0, 240) : null,
      })
    }
    const requestTotalMs = Date.now() - requestStartMs
    console.log(`[ai-assistant][${cid}] stage=request_total ms=${requestTotalMs} result_type=${String(result?.type ?? 'unknown')}`)
    appendServerTrace(
      'server_ai_assistant_llm_usage',
      `calls=${llmTelemetry.llm_calls} ms=${llmTelemetry.llm_inference_ms} input=${llmTelemetry.input_tokens} output=${llmTelemetry.output_tokens}`,
      {
        ...llmTelemetry,
        request_total_ms: requestTotalMs,
        context_load_ms: contextLoadMs,
      },
    )
    appendServerTrace(
      'server_ai_assistant_result',
      `type=${String(result?.type ?? 'unknown')} ms=${requestTotalMs}`,
      {
        result_type: String(result?.type ?? 'unknown'),
        request_ms: requestTotalMs,
        llm_calls: llmTelemetry.llm_calls,
        llm_inference_ms: llmTelemetry.llm_inference_ms,
        input_tokens: llmTelemetry.input_tokens,
        output_tokens: llmTelemetry.output_tokens,
        total_tokens: llmTelemetry.total_tokens,
        response_text: typeof (result as { text?: unknown })?.text === 'string'
          ? String((result as { text?: string }).text).slice(0, 1200)
          : null,
      },
    )
    warnIfSlow('request_total', requestTotalMs, STAGE_SLO.requestTotalMs)
    logUsage()
    
    // Log detailed breakdown for debugging
    if (result?.type === 'tool_action') {
      console.log(`[ai-assistant][${cid}] ✓ TOOL_ACTION: ${result.tool}`)
    } else if (result?.type === 'text') {
      console.log(`[ai-assistant][${cid}] → TEXT_RESPONSE: ${String(result.text ?? '').slice(0, 80)}`)
    } else {
      console.log(`[ai-assistant][${cid}] ? UNKNOWN_TYPE: ${String(result?.type ?? 'null')}`)
    }
    
    return { status: 200, payload: {
      ...result,
      conversation_state: responseConversationState,
      correlation_id: cid,
      telemetry: {
        ...llmTelemetry,
        request_total_ms: requestTotalMs,
        context_load_ms: contextLoadMs,
      },
    } }
  } catch (e) {
    const msg = (e as Error).message ?? 'Unknown error'
    console.error(`[ai-assistant][${cid}] error ${msg}`)
    appendServerTrace('server_ai_assistant_error', msg, { error: msg })
    return { status: 200, payload: { type: 'error', code: 'llm_error', message: msg, correlation_id: cid } }
  }
  }

  if (!wantStream) {
    const { status, payload } = await run()
    return new Response(JSON.stringify(payload), {
      status,
      headers: { ...CORS, 'content-type': 'application/json' },
    })
  }

  // Streaming path: open an SSE response immediately, run the same pipeline, and
  // forward text deltas as `token` events. The complete payload (identical to the
  // non-streaming JSON body) is always sent as a final `final` event so the client
  // can authoritatively reconcile tool_action/error/text results.
  const encoder = new TextEncoder()
  const sse = (event: string, data: unknown) => encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
  const stream = new ReadableStream({
    async start(controller) {
      // Model output remains buffered until the final result passes the server
      // safety validator. This prevents pseudo-tool syntax from reaching UI/TTS.
      emitToken = () => {}
      try {
        const { payload } = await run()
        if (payload.type === 'text' && typeof payload.text === 'string' && payload.text) {
          controller.enqueue(sse('token', { delta: payload.text }))
        }
        controller.enqueue(sse('final', payload))
      } catch (e) {
        controller.enqueue(sse('final', {
          type: 'error',
          code: 'llm_error',
          message: (e as Error)?.message ?? 'stream error',
          correlation_id: cid,
        }))
      } finally {
        emitToken = () => {}
        try { controller.close() } catch { /* already closed */ }
      }
    },
  })
  return new Response(stream, {
    headers: { ...CORS, 'content-type': 'text/event-stream', 'cache-control': 'no-cache', 'connection': 'keep-alive' },
  })
})
