import { createClient } from 'npm:@supabase/supabase-js@2'
import {
  AMBIGUITY_GUARDRAILS,
  DIFF_AND_OUTPUT_GUARDRAILS,
  EDIT_INTENT_GUARDRAILS,
  RECOVERY_AND_CONFLICT_GUARDRAILS,
} from '../_shared/ai-prompt-guardrails.mjs'
import { optionalEnv, requireEnv } from '../_shared/env.mjs'
import {
  computeCachedTravelEta,
  createSupabaseRouteEtaCache,
} from '../_shared/route-eta-cache.mjs'
import {
  isProductionGeminiModel,
  PRIMARY_GEMINI_MODEL,
  resolveProductionGeminiModel,
} from '../_shared/llm-model-policy.mjs'
import { createTrackedMapsFetch, createTrackedProviderFetch } from '../_shared/provider-call-ledger.mjs'
import { classifyAssistantIntent } from '../_shared/assistant-intent-profile.mjs'
import { isHouseholdDirectoryQuestion, isDirectoryFollowUpLanguage } from '../_shared/assistant-household-directory.mjs'
import {
  canonicalizeFamilyReferences,
  formatFamilyIdentityAliases,
} from '../_shared/family-identity.mjs'
import { resolveDeterministicEventMutation } from '../_shared/deterministic-event-mutation.mjs'
import {
  answerPendingSelectiveClear,
  calendarDeleteAmbiguityClarification,
  isCalendarMutationDisambiguationFollowUp,
  calendarMutationClarification,
  resolveActiveCalendarMutation,
  resolveCalendarDeleteDisambiguation,
  resolveClarifiedCalendarCreate,
  resolveDefaultCalendarCreate,
  resolvePendingCalendarCorrection,
  singularBulkDeleteClarification,
} from '../_shared/assistant-calendar-mutation-edge.mjs'
import {
  isCanonicalRecurringEvent,
  resolvePendingRecurringScope,
  scopeCanonicalMutation,
} from '../_shared/assistant-recurring-mutation.mjs'
import {
  answerGroundedEventFollowUp,
  answerGroundedEventSemanticFrame,
  calendarClarificationConversationState,
  eventConversationState,
  groceryClarificationConversationState,
  groceryConversationState,
  normalizeConversationState,
  resolveCalendarClarificationSelection,
  resolveGroceryClarificationSelection,
} from '../_shared/assistant-conversation-grounding.mjs'
import { secureAssistantResult } from '../_shared/assistant-output-safety.mjs'
import { missingCompleteRecipeSections } from '../_shared/assistant-recipe-completeness.mjs'
import { resolveCalendarDayRead } from '../_shared/assistant-calendar-read.mjs'
import { resolveBringListEdit } from '../_shared/assistant-event-list-edit.mjs'
import { resolveUniqueEventTitle } from '../_shared/assistant-event-selection.mjs'
import {
  classifyEventTravelFollowUp,
  eventTravelDestination,
  formatEventTravelAnswer,
} from '../_shared/assistant-event-travel.mjs'
import {
  inheritCalendarReadScope,
  isCalendarLikeLanguage,
  parseCalendarLanguage,
} from '../_shared/assistant-calendar-language.mjs'
import {
  calendarRangeForScope,
  resolveCalendarSemanticRead,
} from '../_shared/assistant-calendar-semantic-read.mjs'
import {
  cookingFrameGuidance,
  isCookingRetryLanguage,
  isCookingLikeLanguage,
  parseCookingLanguage,
} from '../_shared/assistant-cooking-language.mjs'
import {
  cookingPolicyGuidance,
  cookingToolNames,
  formatAuthoritativeRecipes,
  validateCookingGroceryItems,
} from '../_shared/assistant-cooking-policy.mjs'
import { findSavedRecipes, formatSavedRecipeMatches } from '../_shared/assistant-recipe-read.mjs'
import {
  isGroceryLikeLanguage,
  parseGroceryLanguage,
} from '../_shared/assistant-grocery-language.mjs'
import { shouldRetryTransientLlmStatus } from '../_shared/assistant-llm-retry.mjs'
import { resolveGrocerySemantic } from '../_shared/assistant-grocery-semantic.mjs'
import { classifyAssistantAmbiguity, safeFullProfileToolNames } from '../_shared/assistant-request-safety.mjs'
import { saveGroceryItems } from '../_shared/assistant-grocery-write.mjs'
import { getAgentToolByLegacyName } from '../_shared/assistant-agent-tools.mjs'
import { isAgentWriteCompatible } from '../_shared/assistant-agent-write-compatibility.mjs'
import {
  formatBugTrackerSummary,
  formatMemoryInsightsSummary,
  isBugTrackerReadRequest,
  isMemoryInsightsReadRequest,
  resolveBugReportRequest,
} from '../_shared/assistant-memory-insights.mjs'
import {
  explicitReminderCreateRequestForMessages,
  explicitReminderSubject,
  explicitReminderSearchForMessages,
  hasReminderLanguage,
  isExplicitReminderCompletion,
  isExplicitReminderRequest,
  isReminderCompletionFollowUp,
  parseExplicitReminderDurationMinutes,
  reminderCreateClarification,
  resolveExplicitReminderDaypartRange,
  resolveStructuredReminderDueBy,
} from '../_shared/assistant-reminder-intent.mjs'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface ImagePayload { mimeType: string; data: string }
type GeminiUsageMetadata = {
  promptTokenCount?: number
  candidatesTokenCount?: number
  cachedContentTokenCount?: number
  thoughtsTokenCount?: number
  totalTokenCount?: number
}
type LlmTelemetry = {
  provider: string
  model: string
  llm_calls: number
  llm_inference_ms: number
  input_tokens: number
  cached_input_tokens: number
  output_tokens: number
  thought_tokens: number
  total_tokens: number
}

type MemoryObservationRow = {
  id: string
  title: string
  details: string | null
  status: 'active' | 'review' | 'archived'
  observed_at: string
}

type BugReportRow = {
  id: string
  title: string
  severity: 'low' | 'medium' | 'high' | 'critical'
  status: 'open' | 'in_progress' | 'blocked' | 'resolved' | 'wont_fix'
  discovered_at: string
}

const DEFAULT_GEMINI_MODEL = PRIMARY_GEMINI_MODEL
const providerFetch = createTrackedProviderFetch({
  functionName: 'ai-assistant',
  capability: 'assistant',
  trafficClass: 'user',
})
const mapsFetch = createTrackedMapsFetch({
  functionName: 'ai-assistant',
  service: 'places',
  sku: 'Places Text Search',
  callPurpose: 'assistant-place-search',
})
const AGENT_GENERAL_PAGES = new Set(['app', 'briefing', 'calendar', 'grocery', 'home'])

function isSupportedGeminiModel(value: string): boolean {
  return isProductionGeminiModel(value)
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

function extractGeminiUsage(payload: unknown): { inputTokens: number; cachedInputTokens: number; outputTokens: number; thoughtTokens: number; totalTokens: number } {
 const usage = (payload as { usageMetadata?: GeminiUsageMetadata } | null)?.usageMetadata
 return {
   inputTokens: toNonNegativeInt(usage?.promptTokenCount),
   cachedInputTokens: toNonNegativeInt(usage?.cachedContentTokenCount),
   outputTokens: toNonNegativeInt(usage?.candidatesTokenCount),
   thoughtTokens: toNonNegativeInt(usage?.thoughtsTokenCount),
   totalTokens: toNonNegativeInt(usage?.totalTokenCount),
 }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })

  const sb = createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'))
  const routeEtaCache = createSupabaseRouteEtaCache(sb)
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
    image_context: imageContextRaw,
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
  const NORMAL_REQUEST_HARD_TIMEOUT_MS = 9000
  const RECIPE_REQUEST_HARD_TIMEOUT_MS = 15000
  const IMAGE_REQUEST_HARD_TIMEOUT_MS = 26000
  const PRIMARY_HARD_TIMEOUT_MS = 6800
  const RECIPE_PRIMARY_HARD_TIMEOUT_MS = 14500
  const IMAGE_PRIMARY_HARD_TIMEOUT_MS = 22000
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
  let requestHardTimeoutMs = NORMAL_REQUEST_HARD_TIMEOUT_MS
  const remainingRequestBudgetMs = () =>
    Math.max(0, requestHardTimeoutMs - (Date.now() - requestStartMs))
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
  const userMessageTexts = Array.isArray(messages)
    ? messages.flatMap((msg) =>
      msg && typeof msg === 'object' && msg.role === 'user' && typeof msg.content === 'string'
        ? [sanitizeIngressText(msg.content, 2000)]
        : []
    ).filter((text): text is string => Boolean(text))
    : []
  const familyMembers = Array.isArray(context?.family) ? context.family : []
  const rawLatestUserText = userMessageTexts.at(-1) ?? null
  const latestUserText = rawLatestUserText
    ? canonicalizeFamilyReferences(rawLatestUserText, familyMembers)
    : null
  const previousUserText = userMessageTexts.at(-2)
    ? canonicalizeFamilyReferences(userMessageTexts.at(-2), familyMembers)
    : null
  const bugReportRequest = resolveBugReportRequest(latestUserText, previousUserText)
  const reminderDomainLanguage = hasReminderLanguage(latestUserText)
  const explicitReminderRead = explicitReminderSearchForMessages(messages)
  const reminderCreateRequestText = explicitReminderCreateRequestForMessages(messages)
  const incomingConversationState = normalizeConversationState(context?.conversationState)
  const reminderCompletionFollowUp = isReminderCompletionFollowUp(
    latestUserText,
    incomingConversationState,
  )
  const explicitReminderCreate = Boolean(
    reminderCreateRequestText &&
    isExplicitReminderRequest(reminderCreateRequestText) &&
    !isExplicitReminderCompletion(reminderCreateRequestText)
  )
  const reminderClarification = explicitReminderCreate
    ? reminderCreateClarification(reminderCreateRequestText)
    : null
  const reminderDaypartRange = explicitReminderCreate
    ? resolveExplicitReminderDaypartRange(reminderCreateRequestText, {
        currentDate: context?.currentDate,
        utcOffset: context?.utcOffset,
      })
    : null
  // App-generated structured drafts (Prep & Action) embed an explicit
  // "Due: YYYY-MM-DD H:MM AM/PM ET" stamp — parse it deterministically rather
  // than letting the LLM convert the date, which was misresolving to the
  // wrong week. Takes priority over the vague-daypart resolution above.
  const structuredReminderDueBy = explicitReminderCreate
    ? resolveStructuredReminderDueBy(reminderCreateRequestText, { utcOffset: context?.utcOffset })
    : null
  const parsedCalendarFrame = parseCalendarLanguage(latestUserText, {
    focusedEvent: Boolean(context?.focusedEvent),
    activeEntityType: incomingConversationState?.activeEntityType,
  })
  const previousCalendarFrame = previousUserText
    ? parseCalendarLanguage(previousUserText, {
      focusedEvent: Boolean(context?.focusedEvent),
      activeEntityType: incomingConversationState?.activeEntityType,
    })
    : null
  const calendarFrame = inheritCalendarReadScope(parsedCalendarFrame, previousCalendarFrame)
  const calendarReadContext = calendarFrame?.intent === 'calendar.list' &&
      calendarFrame.slots?.temporalScope
    ? calendarRangeForScope(calendarFrame.slots.temporalScope, {
        now: new Date(),
        utcOffset: context?.utcOffset,
      })
    : null
  const householdDirectoryQuestion = isHouseholdDirectoryQuestion(latestUserText)
  const groceryFrame = householdDirectoryQuestion || isExplicitReminderCompletion(latestUserText) || reminderCompletionFollowUp
    ? null
    : parseGroceryLanguage(latestUserText, {
    activeEntityType: incomingConversationState?.activeEntityType,
    page: context?.page,
      })
  const authoritativeGroceryContext = Boolean(
    groceryFrame && (
      context?.page === 'grocery' ||
      ['grocery_item', 'grocery_clarification'].includes(incomingConversationState?.activeEntityType ?? '') ||
      isGroceryLikeLanguage(latestUserText)
    )
  )
  const cookingLanguageOptions = {
    assistantMode: context?.assistant_mode,
    activeEntityType: incomingConversationState?.activeEntityType,
  }
  const latestCookingFrame = parseCookingLanguage(latestUserText, cookingLanguageOptions)
  const inheritedCookingFrame = !latestCookingFrame &&
      previousUserText &&
      isCookingRetryLanguage(latestUserText)
    ? parseCookingLanguage(previousUserText, cookingLanguageOptions)
    : null
  const cookingFrame = latestCookingFrame ?? inheritedCookingFrame
  const cookingRequestText = inheritedCookingFrame ? previousUserText : latestUserText
  const cookingSurfaceContext = Boolean(
    context?.assistant_mode === 'chef' ||
    context?.page === 'cooking' ||
    incomingConversationState?.activeEntityType === 'recipe'
  )
  const authoritativeCookingContext = Boolean(
    cookingFrame && cookingSurfaceContext
  )
  const cookingGuidance = cookingFrameGuidance(cookingFrame)
  const cookingMutationIntent = ['recipe.save', 'cooking.add_to_grocery'].includes(cookingFrame?.intent ?? '')
  const requestAmbiguity = classifyAssistantAmbiguity(latestUserText, {
    hasActiveEntity: Boolean(incomingConversationState?.activeEntityType || context?.focusedEvent),
    hasGroundedSemanticIntent: cookingMutationIntent || householdDirectoryQuestion,
  })
  const classifiedIntentRouting = classifyAssistantIntent(latestUserText, {
    focusedEvent: Boolean(context?.focusedEvent),
    assistantMode: context?.assistant_mode,
    activeEntityType: incomingConversationState?.activeEntityType,
    pendingEventAction: [
      'create_event',
      'update_event',
      'bulk_update_events',
      'delete_event',
      'delete_events_by_title',
    ].includes(String(context?.pendingAction?.tool ?? '')),
  })
  const calendarMutationDisambiguationFollowUp = isCalendarMutationDisambiguationFollowUp(
    previousUserText,
    latestUserText,
  )
  const calendarFrameNeedsSearch = Boolean(
    calendarFrame &&
    !incomingConversationState &&
    !context?.focusedEvent &&
    calendarFrame.intent !== 'event.create' &&
    !calendarFrame.requiresActiveEvent
  )
  const imageEventCreateHint = Boolean(
    image &&
    latestUserText &&
    !calendarFrame &&
    !authoritativeCookingContext &&
    /\b(?:event|appointment|appt|apt|calendar)\b/i.test(latestUserText) &&
    /\b(?:add|create|schedule|book|make|put)\b/i.test(latestUserText)
  )
  const imageEventCreateFollowUp = Boolean(
    image &&
    imageContextRaw === 'conversation' &&
    !calendarFrame &&
    previousCalendarFrame?.intent === 'event.create' &&
    latestUserText &&
    /\b(?:again|retry|try again|do it|go ahead|create it|book it|schedule it|add it|make it|use this|from this|this one)\b/i.test(latestUserText)
  )
  const intentRoutingDecision = explicitReminderRead
    ? { route: { profile: 'event', forceEventSearch: true }, source: 'explicit_reminder' }
    : explicitReminderCreate
    ? { route: { profile: 'event', forceEventSearch: false }, source: 'explicit_reminder_create' }
    : incomingConversationState?.activeEntityType === 'calendar_clarification'
    ? { route: { profile: 'event', forceEventSearch: false }, source: 'calendar_clarification' }
    : incomingConversationState?.activeEntityType === 'grocery_clarification'
    ? { route: { profile: 'grocery', forceEventSearch: false }, source: 'grocery_clarification' }
    : calendarMutationDisambiguationFollowUp
    ? { route: { profile: 'event', forceEventSearch: false }, source: 'calendar_disambiguation' }
    : imageEventCreateFollowUp
    ? { route: { profile: 'event', forceEventSearch: false }, source: 'image_event_followup' }
    : imageEventCreateHint
    ? { route: { profile: 'event', forceEventSearch: false }, source: 'image_event_hint' }
    : authoritativeCookingContext
    ? { route: { profile: 'recipe', forceEventSearch: false }, source: 'cooking_semantic' }
    : authoritativeGroceryContext
    ? { route: { profile: 'grocery', forceEventSearch: false }, source: 'grocery_semantic' }
    : calendarFrame
    ? { route: { profile: 'event', forceEventSearch: calendarFrameNeedsSearch }, source: 'calendar_semantic' }
    : cookingSurfaceContext
    ? { route: { profile: 'recipe', forceEventSearch: false }, source: 'cooking_surface' }
    : groceryFrame
      ? { route: { profile: 'grocery', forceEventSearch: false }, source: 'grocery_semantic' }
      : cookingFrame
        ? { route: { profile: 'recipe', forceEventSearch: false }, source: 'cooking_semantic' }
        : { route: classifiedIntentRouting, source: 'lexical_fallback' }
  const intentRouting = intentRoutingDecision.route
  requestHardTimeoutMs = image
    ? Math.max(IMAGE_REQUEST_HARD_TIMEOUT_MS, intentRouting.profile === 'recipe' ? RECIPE_REQUEST_HARD_TIMEOUT_MS : NORMAL_REQUEST_HARD_TIMEOUT_MS)
    : intentRouting.profile === 'recipe'
      ? RECIPE_REQUEST_HARD_TIMEOUT_MS
      : NORMAL_REQUEST_HARD_TIMEOUT_MS
  const imageContext = image
    ? imageContextRaw === 'conversation' ? 'conversation' : 'current_turn'
    : 'none'
  const requiresCompleteRecipe = cookingFrame?.intent === 'cooking.recipe'
  const userRequestedWriteIntent = /\b(move|resched|reschedule|change|update|edit|delete|remove|cancel|add|create|set|shift|push|book|schedule|plan)\b/i
    .test(latestUserText ?? '') && (!authoritativeCookingContext || cookingMutationIntent)
  appendServerTrace('server_ai_assistant_start', `messages=${Array.isArray(messages) ? messages.length : 0}`, {
    message_count: Array.isArray(messages) ? messages.length : 0,
    has_image: Boolean(image),
    image_context: imageContext,
    dry_run: dryRun,
    client_trace_present: clientTracePresent,
    client_build: clientBuild,
    client_trace_source: clientTraceSource,
    intent_profile: intentRouting.profile,
    intent_routing_source: intentRoutingDecision.source,
    force_event_search: intentRouting.forceEventSearch,
    active_entity_type: incomingConversationState?.activeEntityType ?? null,
    active_event_id: incomingConversationState?.activeEventId ?? null,
    calendar_semantic_intent: calendarFrame?.intent ?? null,
    calendar_semantic_confidence: calendarFrame?.confidence ?? null,
    grocery_semantic_intent: groceryFrame?.intent ?? null,
    grocery_semantic_confidence: groceryFrame?.confidence ?? null,
    cooking_semantic_intent: cookingFrame?.intent ?? null,
    cooking_semantic_confidence: cookingFrame?.confidence ?? null,
    cooking_retry_inherited: Boolean(inheritedCookingFrame),
    image_event_create_hint: imageEventCreateHint,
    image_event_create_followup: imageEventCreateFollowUp,
    reminder_daypart: reminderDaypartRange?.label ?? null,
    reminder_daypart_start: reminderDaypartRange?.start ?? null,
  })
  if (calendarFrame) {
    appendServerTrace('server_ai_assistant_calendar_language_match', `intent=${calendarFrame.intent}`, {
      intent: calendarFrame.intent,
      confidence: calendarFrame.confidence,
      source: calendarFrame.source,
      requires_active_event: calendarFrame.requiresActiveEvent,
      temporal_scope: calendarFrame.slots?.temporalScope?.kind ?? null,
    })
  } else if (latestUserText && isCalendarLikeLanguage(latestUserText)) {
    appendServerTrace('server_ai_assistant_calendar_language_unmatched', 'calendar_like=1', {
      intent_profile: intentRouting.profile,
      has_active_event: incomingConversationState?.activeEntityType === 'event',
      word_count: latestUserText.split(/\s+/).length,
    })
  }
  if (groceryFrame) {
    appendServerTrace('server_ai_assistant_grocery_language_match', `intent=${groceryFrame.intent}`, {
      intent: groceryFrame.intent,
      confidence: groceryFrame.confidence,
      source: groceryFrame.source,
      slots: groceryFrame.slots,
    })
  } else if (latestUserText && isGroceryLikeLanguage(latestUserText)) {
    appendServerTrace('server_ai_assistant_grocery_language_unmatched', latestUserText.slice(0, 300), {
      user_text: latestUserText,
      active_entity_type: incomingConversationState?.activeEntityType ?? null,
    })
  }
  if (cookingFrame) {
    appendServerTrace('server_ai_assistant_cooking_language_match', `intent=${cookingFrame.intent}`, {
      intent: cookingFrame.intent,
      confidence: cookingFrame.confidence,
      source: cookingFrame.source,
      slots: cookingFrame.slots,
    })
  } else if (latestUserText && isCookingLikeLanguage(latestUserText)) {
    appendServerTrace('server_ai_assistant_cooking_language_unmatched', latestUserText.slice(0, 300), {
      user_text: latestUserText,
      assistant_mode: context?.assistant_mode ?? null,
    })
  }
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
  if (reminderClarification) {
    appendServerTrace('server_ai_assistant_reminder_clarification', reminderClarification, {
      missing_title: /what should/i.test(reminderClarification),
      missing_timing: /when/i.test(reminderClarification),
    })
    return {
      status: 200,
      payload: {
        type: 'text',
        text: reminderClarification,
        correlation_id: cid,
        telemetry: {
          llm_calls: 0,
          llm_input_tokens: 0,
          llm_output_tokens: 0,
          llm_total_tokens: 0,
          llm_thought_tokens: 0,
          llm_inference_ms: 0,
          request_total_ms: Date.now() - requestStartMs,
          context_load_ms: 0,
        },
      },
    }
  }
  if (bugReportRequest.kind === 'clarify') {
    const requestTotalMs = Date.now() - requestStartMs
    const text = 'What happened? Include the problem you want me to put in the bug tracker.'
    appendServerTrace('server_ai_assistant_bug_report_clarification', 'missing_report_details', {
      request_ms: requestTotalMs,
      llm_calls: 0,
    })
    return {
      status: 200,
      payload: {
        type: 'text',
        text,
        correlation_id: cid,
        telemetry: { llm_calls: 0, request_total_ms: requestTotalMs, context_load_ms: 0 },
      },
    }
  }
  if (bugReportRequest.kind === 'create') {
    if (dryRun) {
      const requestTotalMs = Date.now() - requestStartMs
      appendServerTrace('server_ai_assistant_bug_report_dry_run', bugReportRequest.title, {
        title: bugReportRequest.title,
        severity: bugReportRequest.severity,
        request_ms: requestTotalMs,
        llm_calls: 0,
      })
      return {
        status: 200,
        payload: {
          type: 'text',
          text: `Dry run: I would save bug report "${bugReportRequest.title}".`,
          correlation_id: cid,
          write_verified: false,
          telemetry: { llm_calls: 0, request_total_ms: requestTotalMs, context_load_ms: 0 },
        },
      }
    }
    const { data: createdBug, error: createBugError } = await sb
      .from('ai_bug_reports')
      .insert({
        title: bugReportRequest.title,
        details: bugReportRequest.details,
        severity: bugReportRequest.severity,
        status: 'open',
        source: 'assistant',
      })
      .select('id, title, severity, status')
      .single()
    const requestTotalMs = Date.now() - requestStartMs
    if (createBugError || !createdBug) {
      console.error(`[ai-assistant][${cid}] bug_report_insert_error:`, createBugError)
      appendServerTrace('server_ai_assistant_bug_report_failed', createBugError?.message ?? 'missing_inserted_row', {
        title: bugReportRequest.title,
        severity: bugReportRequest.severity,
        request_ms: requestTotalMs,
        llm_calls: 0,
      })
      return {
        status: 500,
        payload: {
          type: 'text',
          text: 'I could not save that bug report. Please try again.',
          correlation_id: cid,
          write_verified: false,
          telemetry: { llm_calls: 0, request_total_ms: requestTotalMs, context_load_ms: 0 },
        },
      }
    }
    appendServerTrace('server_ai_assistant_bug_report_created', createdBug.id, {
      bug_id: createdBug.id,
      title: createdBug.title,
      severity: createdBug.severity,
      status: createdBug.status,
      source: 'assistant',
      follow_up: bugReportRequest.follow_up === true,
      request_ms: requestTotalMs,
      llm_calls: 0,
    })
    return {
      status: 200,
      payload: {
        type: 'text',
        text: `Saved bug report "${createdBug.title}" as ${createdBug.severity} priority.`,
        correlation_id: cid,
        write_verified: true,
        authoritative_provenance: {
          source: 'ai_bug_reports',
          bug_id: createdBug.id,
        },
        telemetry: { llm_calls: 0, request_total_ms: requestTotalMs, context_load_ms: 0 },
      },
    }
  }

  // Load config, saved places, contacts, grocery list, events in parallel
  const now = new Date()
  // Start from 24h ago so in-progress events (started earlier today) are visible
  const windowStart = new Date(now.getTime() - 24 * 60 * 60 * 1000)
  const yearEnd = new Date(); yearEnd.setFullYear(yearEnd.getFullYear() + 1, 11, 31); yearEnd.setHours(23,59,59,999)
  const imageDirectEventCreateFlow = Boolean(
    image &&
    intentRouting.profile === 'event' &&
    !intentRouting.forceEventSearch &&
    (
      calendarFrame?.intent === 'event.create' ||
      imageEventCreateHint ||
      imageEventCreateFollowUp
    )
  )
  const directReminderCreateFlow = explicitReminderCreate &&
    intentRouting.profile === 'event' &&
    !intentRouting.forceEventSearch
  const needsEventData = !requestAmbiguity &&
    ['event', 'full', 'travel', 'general'].includes(intentRouting.profile) &&
    !imageDirectEventCreateFlow &&
    !directReminderCreateFlow
  const needsPlaceData = !requestAmbiguity && (
    ['event', 'full', 'travel', 'places'].includes(intentRouting.profile) ||
    householdDirectoryQuestion
  )
  const needsContactData = !requestAmbiguity && (
    ['event', 'full', 'places'].includes(intentRouting.profile) ||
    householdDirectoryQuestion
  )
  const needsGroceryData = !requestAmbiguity && (
    context?.page === 'grocery' ||
    ['grocery', 'full'].includes(intentRouting.profile)
  )
  const referencesSavedRecipe = Boolean(
    incomingConversationState?.activeEntityType === 'recipe' ||
    cookingFrame?.intent === 'recipe.find' ||
    /\b(?:(?:saved|my)\s+recipes?|recipe library)\b/i.test(latestUserText)
  )
  const needsRecipeData = !requestAmbiguity && (
    intentRouting.profile === 'full' ||
    (intentRouting.profile === 'recipe' && referencesSavedRecipe)
  )
  const needsFoodProfileData = !requestAmbiguity && ['recipe', 'full'].includes(intentRouting.profile)
  const needsAvailabilityData = !requestAmbiguity && ['event', 'full'].includes(intentRouting.profile)
  const memoryInsightsReadIntent = isMemoryInsightsReadRequest(latestUserText)
  const bugTrackerReadIntent = bugReportRequest.kind === 'none' && isBugTrackerReadRequest(latestUserText)
  const needsMemoryObservationData = !requestAmbiguity && memoryInsightsReadIntent
  const needsBugReportData = !requestAmbiguity && bugTrackerReadIntent
  const skippedRows = Promise.resolve({ data: [], error: null })
  const skippedRow = Promise.resolve({ data: null, error: null })

  const contextLoadStartMs = Date.now()
  const [
    { data: cfgRow },
    agentRuntimeConfigResult,
    agentShadowConfigResult,
    agentReadConfigResult,
    agentWriteConfigResult,
    homeConfigResult,
    { data: savedPlaces },
    savedContactsResult,
    confirmedFamilyContactRelationshipsResult,
    confirmedContactPlaceRelationshipsResult,
    suggestedPlacesResult,
    suggestedContactsResult,
    eventsResult,
    { data: groceryLists },
    { data: groceryItems },
    { data: recipes },
    foodProfileResult,
    availabilityRulesResult,
    availabilityExceptionsResult,
    memoryObservationsResult,
    bugReportsResult,
  ] = await Promise.all([
    sb.from('settings').select('value').eq('key', 'llm_config').limit(1),
    sb.from('settings').select('value').eq('key', 'agent_runtime_config').maybeSingle()
      .then(r => r).catch(() => ({ data: null, error: null })),
    sb.from('settings').select('value').eq('key', 'agent_shadow_config').maybeSingle()
      .then(r => r).catch(() => ({ data: null, error: null })),
    sb.from('settings').select('value').eq('key', 'agent_read_config').maybeSingle()
      .then(r => r).catch(() => ({ data: null, error: null })),
    sb.from('settings').select('value').eq('key', 'agent_write_config').maybeSingle()
      .then(r => r).catch(() => ({ data: null, error: null })),
    needsPlaceData
      ? sb.from('settings').select('value').eq('key', 'home_config').maybeSingle()
      : skippedRow,
    needsPlaceData
      // Only surface confirmed entries in prompt context — unconfirmed/derived
      // candidates (auto-extracted from event history) await human review and
      // must not be presented to the model as authoritative household facts.
      ? sb.from('saved_places').select('id, name, aliases, address, city, state, zip, category, notes, phone').eq('confirmed', true).order('name')
      : skippedRows,
    needsContactData
      ? sb.from('saved_contacts')
        .select('id, name, aliases, phone, email, address, relationship, notes, primary_place:saved_places!saved_contacts_primary_place_id_fkey(name, address, city, state, zip, category)')
        .eq('confirmed', true)
        .order('name')
        .then(r => r)
        .catch(() => ({ data: null, error: null }))
      : skippedRows,
    needsContactData
      ? sb.from('family_contact_relationships')
        .select('relationship, family_member:family_members(name, full_name), contact:saved_contacts(name, phone, primary_place:saved_places!saved_contacts_primary_place_id_fkey(name, address, city, state, zip))')
        .eq('confirmed', true)
        .order('relationship')
      : skippedRows,
    needsContactData
      ? sb.from('contact_place_relationships')
        .select('relationship, is_default, contact:saved_contacts(id, name, aliases, phone), place:saved_places(id, name, aliases, address, city, state, zip, category, phone)')
        .eq('confirmed', true)
        .order('is_default', { ascending: false })
      : skippedRows,
    householdDirectoryQuestion
      ? sb.from('saved_places')
        .select('id, name, aliases, address, city, state, zip, occurrence_count')
        .eq('confirmed', false)
        .order('occurrence_count', { ascending: false })
        .limit(30)
      : skippedRows,
    householdDirectoryQuestion
      ? sb.from('saved_contacts')
        .select('id, name, aliases, relationship, phone, primary_place_id, occurrence_count')
        .eq('confirmed', false)
        .order('occurrence_count', { ascending: false })
        .limit(30)
      : skippedRows,
    needsEventData
      ? sb.from('events')
      .select('id, title, start_time, end_time, updated_at, location_name, address, all_day, event_type, description, recurrence_master_id, rrule, series_id, record_kind, series_revision_applied, original_start_time, original_start_date, event_enrichments(prep_notes, category, what_to_bring, outfit_suggestion, parking_notes, contact_name, contact_phone, cost_estimate, dietary_notes, meal_impact), event_checklist_items(id, label, note, checked, category, sort_order, created_at), event_action_items(id, title, description, due_date, is_urgent, completed, assigned_to, created_at), event_members(family_members(id, name))')
      .is('deleted_at', null)
      .eq('status', 'confirmed')
      .or(`start_time.gte.${windowStart.toISOString()},end_time.gte.${windowStart.toISOString()}`)
      .lte('start_time', yearEnd.toISOString())
      .order('start_time')
      : skippedRows,
    needsGroceryData
      ? sb.from('grocery_lists').select('id, name').order('created_at').limit(5)
      : skippedRows,
    needsGroceryData
      ? sb.from('grocery_items')
      .select('id, list_id, name, quantity, unit, category, checked, notes, updated_at')
      .is('deleted_at', null)
      .order('category')
      .order('name')
      : skippedRows,
    needsRecipeData
      ? sb.from('recipes')
      .select('id, name, cook_time, servings, recipe_ingredients(name, raw_text, quantity, unit, optional, sort_order), recipe_steps(step_number, instruction)')
      .order('last_used_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(30)
      : skippedRows,
    needsFoodProfileData
      ? sb.from('settings').select('value').eq('key', 'food_profile').maybeSingle().then(r => r).catch(() => ({ data: null, error: null }))
      : skippedRow,
    needsAvailabilityData
      ? sb.from('member_availability_rules').select('member_id, day_of_week, start_local, end_local, availability_type, reason').then(r => r).catch(() => ({ data: null, error: null }))
      : skippedRows,
    needsAvailabilityData
      ? sb.from('member_availability_exceptions').select('member_id, start_at, end_at, override_type, note').gte('end_at', windowStart.toISOString()).then(r => r).catch(() => ({ data: null, error: null }))
      : skippedRows,
    needsMemoryObservationData
      ? sb.from('ai_memory_observations')
        .select('id, title, details, status, observed_at')
        .in('status', ['active', 'review'])
        .order('observed_at', { ascending: false })
        .limit(12)
      : skippedRows,
    needsBugReportData
      ? sb.from('ai_bug_reports')
        .select('id, title, severity, status, discovered_at')
        .order('discovered_at', { ascending: false })
        .limit(25)
      : skippedRows,
  ])
  const homeConfig = homeConfigResult?.data?.value as { address?: string; city?: string; state?: string; zip?: string } | null
  const homeAddress = [homeConfig?.address, homeConfig?.city, homeConfig?.state, homeConfig?.zip].filter(Boolean).join(', ')

  if (eventsResult.error) {
    console.error('[ai-assistant] events query error:', JSON.stringify(eventsResult.error))
    return { status: 200, payload: { type: 'debug', error: eventsResult.error, yearStart: windowStart.toISOString(), yearEnd: yearEnd.toISOString(), correlation_id: cid } }
  }
  const allEvents = eventsResult.data
  const needsEmailKnowledgeContext = /\b(?:school|class|teacher|forms?|paperwork|payment|fee|bill|delivery|package|order|insurance|utility|appointment|doctor|dentist|therapy|therapist|medical|medicine|transport|bus|pickup|drop[\s-]?off|athletic|sports?|practice|game|coordination|coordinate|heads?\s*up|remind(?:er)?)\b/i
    .test(latestUserText ?? '')
  const { data: emailKnowledgeClaims, error: emailKnowledgeError } = needsEmailKnowledgeContext
    ? await sb
      .from('family_knowledge_claims')
      .select('title, summary, requiredness, effective_at, expires_at, confidence, family_members(name), canonical_inbox_emails(from_email, subject, received_at)')
      .eq('status', 'active')
      .eq('privacy_class', 'standard')
      .or(`expires_at.is.null,expires_at.gte.${now.toISOString()}`)
      .order('requiredness', { ascending: false })
      .order('expires_at', { ascending: true, nullsFirst: false })
      .limit(6)
    : { data: [], error: null }
  if (emailKnowledgeError) {
    return {
      status: 500,
      payload: {
        type: 'error',
        error: `Could not load family email knowledge: ${emailKnowledgeError.message}`,
        correlation_id: cid,
      },
    }
  }
  const activeConversationEvent = incomingConversationState
    ? allEvents?.find((event: { id: string }) => event.id === incomingConversationState.activeEventId) ?? null
    : null
  const activeConversationGroceryItem = incomingConversationState?.activeEntityType === 'grocery_item'
    ? groceryItems?.find((item: { id: string }) => item.id === incomingConversationState.activeGroceryItemId) ?? null
    : null
  let responseConversationState = activeConversationEvent
    ? eventConversationState(activeConversationEvent, now)
    : null
  console.log('[ai-assistant] events loaded:', allEvents?.length ?? 0)
  const contextLoadMs = Date.now() - contextLoadStartMs
  console.log(`[ai-assistant][${cid}] stage=context_load ms=${contextLoadMs}`)
  warnIfSlow('context_load', contextLoadMs, STAGE_SLO.contextLoadMs)

  const savedContacts = (savedContactsResult as { data: unknown }).data
  const confirmedFamilyContactRelationships = (confirmedFamilyContactRelationshipsResult as { data: unknown }).data
  const confirmedContactPlaceRelationships = (confirmedContactPlaceRelationshipsResult as { data: unknown }).data
  const suggestedPlaces = suggestedPlacesResult.data ?? []
  const suggestedContacts = suggestedContactsResult.data ?? []
  const emailKnowledgeText = (emailKnowledgeClaims ?? []).map((claim: {
    title: string
    summary: string | null
    requiredness: 'required' | 'optional' | 'fyi'
    effective_at: string | null
    expires_at: string | null
    confidence: number
    family_members: { name: string } | null
    canonical_inbox_emails: { from_email: string | null, subject: string | null, received_at: string | null } | null
  }) => {
    const source = claim.canonical_inbox_emails?.from_email || claim.canonical_inbox_emails?.subject || 'family email'
    const owner = claim.family_members?.name ? ` for ${claim.family_members.name}` : ''
    const due = claim.expires_at ? `; due ${claim.expires_at}` : ''
    return `[${claim.requiredness}] ${claim.title}${owner}: ${claim.summary ?? 'No additional summary'}${due}. Source: ${source}.`
  }).join('\n')

  const config = cfgRow?.[0]?.value ?? { provider: 'gemini', model: DEFAULT_GEMINI_MODEL, api_key: '' }
  const apiKey = config.api_key as string
  const provider = String(config.provider ?? 'gemini')
  const configuredModel = ((config.model as string) || DEFAULT_GEMINI_MODEL).trim()
  const validatedConfiguredModel = provider === 'gemini'
    ? resolveProductionGeminiModel(configuredModel)
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
    cached_input_tokens: 0,
    output_tokens: 0,
    thought_tokens: 0,
    total_tokens: 0,
  }
  const providerRoleWordPattern =
    /\b(doctors?|dentists?|orthodontists?|dermatologists?|therapists?|coach(?:es)?|providers?|counselors?|tutors?|vets?|veterinarians?)\b/i
  const ownProviderListRoleMatch = latestUserText?.match(providerRoleWordPattern)
  // Bare follow-ups ("can you guess?") carry no role word of their own — if
  // the previous turn was a directory question with a role word, inherit its
  // role/member context so the conversation doesn't die on a plain LLM
  // refusal.
  const previousProviderListRoleMatch = !ownProviderListRoleMatch && previousUserText
    ? previousUserText.match(providerRoleWordPattern)
    : null
  const providerListFollowUp = Boolean(
    !ownProviderListRoleMatch &&
    previousProviderListRoleMatch &&
    isDirectoryFollowUpLanguage(latestUserText ?? '') &&
    isHouseholdDirectoryQuestion(previousUserText),
  )
  const providerListRoleMatch = ownProviderListRoleMatch ?? (providerListFollowUp ? previousProviderListRoleMatch : null)
  const providerListEffectiveText = ownProviderListRoleMatch ? latestUserText : (providerListFollowUp ? previousUserText : latestUserText)
  const providerListRequest = Boolean(providerListRoleMatch) &&
    (householdDirectoryQuestion || providerListFollowUp) &&
    (providerListFollowUp || /\b(?:list|name|other|what|which|who)\b/i.test(latestUserText ?? ''))
  if (providerListRequest && providerListEffectiveText) {
    const normalizedQuestion = normalizeSearchText(providerListEffectiveText)
    const member = (familyMembers as { id?: string; name?: string; full_name?: string | null }[])
      .filter((candidate) => candidate.id && candidate.name)
      .find((candidate) =>
        [candidate.name, candidate.full_name]
          .filter((value): value is string => Boolean(value))
          .map(normalizeSearchText)
          .some((term) => normalizedQuestion.includes(term)),
      )
    const requestedRoleWord = normalizeSearchText(providerListRoleMatch[1])
    const requestedRole = requestedRoleWord === 'coaches'
      ? 'coach'
      : requestedRoleWord.replace(/s$/, '')
    const requestedRolePlural = requestedRole === 'coach' ? 'coaches' : `${requestedRole}s`
    const roleMatches = (relationship: string | null | undefined) => {
      const normalized = normalizeSearchText(relationship ?? '')
      if (requestedRole === 'doctor' || requestedRole === 'provider') {
        return /\b(?:dentist|dermatologist|doctor|orthodontist|physician|therapist)\b/.test(normalized)
      }
      if (requestedRole === 'vet') return /\b(?:vet|veterinarian)\b/.test(normalized)
      return normalized.includes(requestedRole)
    }
    if (member?.id && member.name) {
      type FamilyProviderRelationship = {
        relationship?: string
        family_member?: { name?: string } | null
        contact?: {
          name?: string
          phone?: string | null
          primary_place?: {
            name?: string
            address?: string | null
            city?: string | null
            state?: string | null
            zip?: string | null
          } | null
        } | null
      }
      const assistantHistory = Array.isArray(messages)
        ? messages
          .flatMap((message) =>
            message?.role === 'assistant' && typeof message.content === 'string' ? [message.content] : [])
          .join(' ')
        : ''
      const confirmedProviders = (confirmedFamilyContactRelationships as FamilyProviderRelationship[] ?? [])
        .filter((association) =>
          association.family_member?.name?.toLowerCase() === member.name?.toLowerCase() &&
          roleMatches(association.relationship),
        )
        .filter((association) =>
          !/\bother\b/i.test(latestUserText) ||
          !association.contact?.name ||
          !normalizeSearchText(assistantHistory).includes(normalizeSearchText(association.contact.name)),
        )
      if (confirmedProviders.length > 0) {
        const facts = confirmedProviders.map((association) => {
          const contact = association.contact
          const place = contact?.primary_place
          const address = place
            ? [place.address, place.city, place.state, place.zip].filter(Boolean).join(', ')
            : ''
          const location = place?.name && normalizeSearchText(place.name) !== normalizeSearchText(address)
            ? `${place.name}${address ? `, ${address}` : ''}`
            : place?.name || address
          return `${contact?.name ?? 'Unknown provider'} (${association.relationship})${location ? ` at ${location}` : ''}${contact?.phone ? `, ${contact.phone}` : ''}`
        })
        return {
          status: 200,
          payload: {
            type: 'text',
            text: `${member.name}'s confirmed ${requestedRole === 'doctor' ? 'doctors and specialists' : requestedRolePlural}: ${facts.join('; ')}.`,
            correlation_id: cid,
            telemetry: {
              ...llmTelemetry,
              request_total_ms: Date.now() - requestStartMs,
              context_load_ms: contextLoadMs,
            },
          },
        }
      }

      const threeYearsAgo = new Date(now.getTime() - 3 * 365 * 24 * 60 * 60 * 1000).toISOString()
      const { data: providerHistory, error: providerHistoryError } = await sb
        .from('events')
        .select('title, description, start_time, source_member_id, event_members(family_member_id), event_enrichments(category, contact_name)')
        .is('deleted_at', null)
        .eq('status', 'confirmed')
        .gte('start_time', threeYearsAgo)
        .order('start_time', { ascending: false })
        .limit(1000)
      if (providerHistoryError) throw new Error(providerHistoryError.message)

      type ProviderContact = {
        id: string
        name: string
        aliases?: string[]
        phone?: string | null
        relationship?: string | null
        primary_place?: {
          name?: string
          address?: string | null
          city?: string | null
          state?: string | null
          zip?: string | null
        } | null
      }
      const contacts = (savedContacts as ProviderContact[] ?? []).filter((contact) =>
        roleMatches(contact.relationship) || requestedRole === 'provider')
      const contactByName = new Map<string, ProviderContact>()
      for (const contact of contacts) {
        for (const value of [contact.name, ...(contact.aliases ?? [])]) {
          contactByName.set(normalizeSearchText(value), contact)
        }
      }
      const memberPattern = new RegExp(`\\b${member.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i')
      const otherMemberNames = (familyMembers as { name?: string }[])
        .map((candidate) => candidate.name)
        .filter((name): name is string => Boolean(name) && name.toLowerCase() !== member.name!.toLowerCase())
        .map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      const otherMemberPattern = otherMemberNames.length > 0
        ? new RegExp(`\\b(?:${otherMemberNames.join('|')})\\b`, 'i')
        : null
      const priorNormalized = normalizeSearchText(assistantHistory)
      const providerIdentityKey = (contact: { name?: string; phone?: string | null } | null | undefined) =>
        normalizeSearchText(contact?.phone ?? '') || normalizeSearchText(contact?.name ?? '')
      const householdMembersByProvider = new Map<string, Set<string>>()
      for (const association of confirmedFamilyContactRelationships as FamilyProviderRelationship[] ?? []) {
        const key = providerIdentityKey(association.contact)
        const familyName = association.family_member?.name
        if (!key || !familyName || familyName.toLowerCase() === member.name.toLowerCase()) continue
        const sharedMembers = householdMembersByProvider.get(key) ?? new Set<string>()
        sharedMembers.add(familyName)
        householdMembersByProvider.set(key, sharedMembers)
      }
      const candidates = new Map<string, {
        contact: ProviderContact
        score: number
        count: number
        relationship: string
        sharedWith: string[]
      }>()
      for (const event of providerHistory ?? []) {
        const enrichment = Array.isArray(event.event_enrichments)
          ? event.event_enrichments[0]
          : event.event_enrichments
        const contact = contactByName.get(normalizeSearchText(enrichment?.contact_name ?? ''))
        if (!contact || priorNormalized.includes(normalizeSearchText(contact.name))) continue
        const eventText = `${event.title ?? ''} ${event.description ?? ''}`
        if (/\b(?:cancelled|canceled|declined|not attending|will not attend|won't attend)\b/i.test(eventText)) continue
        const explicitMember = memberPattern.test(eventText)
        const explicitOtherMember = otherMemberPattern?.test(eventText) ?? false
        const assignedMember = (event.event_members ?? []).some(
          (assignment: { family_member_id?: string }) => assignment.family_member_id === member.id,
        )
        if (!assignedMember || explicitOtherMember) continue
        const evidenceText = `${eventText} ${enrichment?.category ?? ''} ${contact.relationship ?? ''}`
        if (!roleMatches(evidenceText)) continue
        const relationship = /\borthodont/i.test(evidenceText)
          ? 'orthodontist'
          : /\bdermatolog/i.test(evidenceText)
            ? 'dermatologist'
            : /\bdent/i.test(evidenceText)
              ? 'dentist'
              : /\btherap/i.test(evidenceText)
                ? 'therapist'
                : 'doctor'
        const candidateKey = normalizeSearchText(contact.phone ?? '') || contact.id
        const sharedWith = [...(householdMembersByProvider.get(providerIdentityKey(contact)) ?? [])].sort()
        const current = candidates.get(candidateKey) ?? {
          contact,
          score: Math.min(sharedWith.length, 3) * 0.1,
          count: 0,
          relationship,
          sharedWith,
        }
        current.score += explicitMember ? 4 : 1
        current.count += 1
        if (contact.name.length > current.contact.name.length) current.contact = contact
        candidates.set(candidateKey, current)
      }
      const ranked = [...candidates.values()].sort((a, b) => b.score - a.score || b.count - a.count).slice(0, 2)
      appendServerTrace('server_ai_directory_provider_fallback', `member=${member.name} candidates=${ranked.length}`, {
        member_id: member.id,
        requested_role: requestedRole,
        candidate_count: ranked.length,
      })
      if (ranked.length > 0) {
        const first = ranked[0]
        const alternative = ranked[1]
        const place = first.contact.primary_place
        const address = place
          ? [place.address, place.city, place.state, place.zip].filter(Boolean).join(', ')
          : ''
        const location = place?.name && normalizeSearchText(place.name) !== normalizeSearchText(address)
          ? `${place.name}${address ? `, ${address}` : ''}`
          : place?.name || address
        return {
          status: 200,
          payload: {
            type: 'tool_action',
            tool: 'associate_family_contact',
            args: {
              family_member_id: member.id,
              family_member_name: member.name,
              contact_id: first.contact.id,
              contact_name: first.contact.name,
              relationship: first.relationship,
              place_name: location || undefined,
              evidence_count: first.count,
              shared_with: first.sharedWith,
              evidence_notes: 'Suggested from provider events assigned to this family member; explicit name matches are weighted highest and confirmed household sharing is positive supporting evidence.',
              alternatives: alternative
                ? [{
                    contact_id: alternative.contact.id,
                    contact_name: alternative.contact.name,
                    relationship: alternative.relationship,
                    evidence_count: alternative.count,
                  }]
                : [],
            },
            display_text: `I don't have another confirmed ${requestedRole} saved for ${member.name}. My best calendar-based guess is ${first.contact.name}${location ? ` at ${location}` : ''}, based on ${first.count} ${first.count === 1 ? 'entry' : 'entries'}${first.sharedWith.length ? `. ${first.contact.name} is also confirmed for ${first.sharedWith.join(' and ')}, which supports this being a shared household provider` : ''}${alternative ? `. Another possibility is ${alternative.contact.name}` : ''}. Save ${first.contact.name} as ${member.name}'s ${first.relationship}?`,
            correlation_id: cid,
            telemetry: {
              ...llmTelemetry,
              request_total_ms: Date.now() - requestStartMs,
              context_load_ms: contextLoadMs,
            },
          },
        }
      }
      return {
        status: 200,
        payload: {
          type: 'text',
          text: `I don't have a confirmed ${requestedRole} saved for ${member.name}, and the calendar search didn't find enough member-specific evidence to make a safe guess.`,
          correlation_id: cid,
          telemetry: {
            ...llmTelemetry,
            request_total_ms: Date.now() - requestStartMs,
            context_load_ms: contextLoadMs,
          },
        },
      }
    }
  }
  if (householdDirectoryQuestion && latestUserText) {
    const normalizedQuestion = normalizeSearchText(latestUserText)
    const candidateEntities = [
      ...(suggestedContacts as {
        id: string
        name: string
        aliases?: string[]
        relationship?: string | null
        occurrence_count?: number
      }[]).map((candidate) => ({ ...candidate, entity_type: 'contact' as const })),
      ...(suggestedPlaces as {
        id: string
        name: string
        aliases?: string[]
        address?: string | null
        city?: string | null
        state?: string | null
        zip?: string | null
        occurrence_count?: number
      }[]).map((candidate) => ({ ...candidate, entity_type: 'place' as const })),
    ]
    const candidate = candidateEntities
      .filter((entity) =>
        [entity.name, ...(entity.aliases ?? [])]
          .map(normalizeSearchText)
          .filter((term) => term.length >= 3)
          .some((term) => normalizedQuestion.includes(term)),
      )
      .sort((a, b) => (b.occurrence_count ?? 0) - (a.occurrence_count ?? 0))[0]
    if (candidate) {
      const detail = candidate.entity_type === 'place'
        ? [candidate.address, candidate.city, candidate.state, candidate.zip].filter(Boolean).join(', ')
        : candidate.relationship ?? 'contact'
      return {
        status: 200,
        payload: {
          type: 'tool_action',
          tool: 'confirm_directory_entity',
          args: {
            entity_type: candidate.entity_type,
            entity_id: candidate.id,
            entity_name: candidate.name,
            entity_detail: detail || undefined,
            evidence_count: candidate.occurrence_count ?? 1,
          },
          display_text: `I found a likely ${candidate.entity_type} from ${candidate.occurrence_count ?? 1} calendar ${(candidate.occurrence_count ?? 1) === 1 ? 'entry' : 'entries'}: ${candidate.name}${detail ? ` — ${detail}` : ''}. Add it to the confirmed Household Directory?`,
          correlation_id: cid,
          telemetry: {
            ...llmTelemetry,
            request_total_ms: Date.now() - requestStartMs,
            context_load_ms: contextLoadMs,
          },
        },
      }
    }
  }
  const relationshipLookup = latestUserText?.match(
    /\b(?:(?<memberA>[a-z]+)'s\s+(?<relationshipA>pediatric dentist|dentist|orthodontist|dermatologist|therapist|coach)|(?<relationshipB>pediatric dentist|dentist|orthodontist|dermatologist|therapist|coach)\s+(?:for|of)\s+(?<memberB>[a-z]+))\b/i,
  )
  if (householdDirectoryQuestion && relationshipLookup) {
    const memberName = relationshipLookup.groups?.memberA ?? relationshipLookup.groups?.memberB
    const relationship = (relationshipLookup.groups?.relationshipA ?? relationshipLookup.groups?.relationshipB)?.toLowerCase()
    const member = (familyMembers as { id?: string; name?: string }[]).find((candidate) =>
      candidate.name?.toLowerCase() === memberName?.toLowerCase(),
    )
    if (member?.id && member.name && relationship) {
      const confirmed = (confirmedFamilyContactRelationships as {
        relationship?: string
        family_member?: { name?: string } | null
      }[] ?? []).some((association) =>
        association.relationship?.toLowerCase() === relationship &&
        association.family_member?.name?.toLowerCase() === member.name?.toLowerCase(),
      )
      if (!confirmed) {
        const { data: history, error: historyError } = await sb
          .from('events')
          .select('title, description, start_time, event_enrichments(contact_name), event_members(family_member_id)')
          .is('deleted_at', null)
          .eq('status', 'confirmed')
          .order('start_time', { ascending: false })
          .limit(400)
        if (historyError) throw new Error(historyError.message)

        const contacts = (savedContacts as {
          id: string
          name: string
          aliases?: string[]
        }[] ?? [])
        const contactByName = new Map<string, typeof contacts[number]>()
        for (const contact of contacts) {
          for (const value of [contact.name, ...(contact.aliases ?? [])]) {
            contactByName.set(normalizeSearchText(value), contact)
          }
        }
        const memberPattern = new RegExp(`\\b${member.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i')
        const relationshipEvidencePattern = relationship === 'dermatologist'
          ? /\bdermatolog(?:ist|y)\b/i
          : relationship === 'orthodontist'
            ? /\borthodont(?:ist|ics)\b/i
            : new RegExp(`\\b${relationship.replace(' ', '\\s+')}\\b`, 'i')
        const candidates = new Map<string, { contact: typeof contacts[number]; count: number }>()
        for (const event of history ?? []) {
          const text = `${event.title ?? ''} ${event.description ?? ''}`
          if (!memberPattern.test(text) || !relationshipEvidencePattern.test(text)) continue
          const enrichment = Array.isArray(event.event_enrichments) ? event.event_enrichments[0] : event.event_enrichments
          const contact = contactByName.get(normalizeSearchText(enrichment?.contact_name ?? ''))
          if (!contact) continue
          const current = candidates.get(contact.id) ?? { contact, count: 0 }
          current.count += 1
          candidates.set(contact.id, current)
        }
        const best = [...candidates.values()].sort((a, b) => b.count - a.count).slice(0, 2)
        if (best.length > 0) {
          const first = best[0]
          const alternativeCandidates = best.slice(1)
          const alternatives = alternativeCandidates.map((candidate) => candidate.contact.name)
          const suggestion = `I found ${first.contact.name} as a likely ${relationship} for ${member.name} in ${first.count} calendar ${first.count === 1 ? 'entry' : 'entries'}${alternatives.length ? `. Another possibility is ${alternatives.join(', ')}` : ''}. Save ${first.contact.name} as ${member.name}'s ${relationship}?`
          return {
            status: 200,
            payload: {
              type: 'tool_action',
              tool: 'associate_family_contact',
              args: {
                family_member_id: member.id,
                family_member_name: member.name,
                contact_id: first.contact.id,
                contact_name: first.contact.name,
                relationship,
                evidence_count: first.count,
                evidence_notes: 'Suggested from explicit family-member and provider calendar evidence; confirmed by household.',
                alternatives: alternativeCandidates.map((candidate) => ({
                  contact_id: candidate.contact.id,
                  contact_name: candidate.contact.name,
                  relationship,
                  evidence_count: candidate.count,
                })),
              },
              display_text: suggestion,
              correlation_id: cid,
              telemetry: {
                ...llmTelemetry,
                request_total_ms: Date.now() - requestStartMs,
                context_load_ms: contextLoadMs,
              },
            },
          }
        }
      }
    }
  }
  if (householdDirectoryQuestion && latestUserText) {
    const normalizedQuestion = normalizeSearchText(latestUserText)
    const locationQuestion = /\b(?:address|based|located|location|meet|office|usually|where|works?|lives?)\b/i.test(latestUserText)
    const contacts = (savedContacts as {
      id: string
      name: string
      aliases?: string[]
    }[] ?? [])
    const mentionedContact = contacts
      .flatMap((contact) =>
        [contact.name, ...(contact.aliases ?? [])].map((term) => ({
          contact,
          term: normalizeSearchText(term),
        })),
      )
      .filter((candidate) => candidate.term.length >= 3 && normalizedQuestion.includes(candidate.term))
      .sort((a, b) => b.term.length - a.term.length)[0]?.contact

    if (locationQuestion && mentionedContact) {
      const hasConfirmedPlace = (confirmedContactPlaceRelationships as {
        contact?: { id?: string } | null
      }[] ?? []).some((relationship) => relationship.contact?.id === mentionedContact.id)
      if (!hasConfirmedPlace) {
        const contactLastName = normalizeSearchText(mentionedContact.name).split(' ').at(-1) ?? ''
        const { data: enrichmentEvidence, error: enrichmentEvidenceError } = contactLastName.length >= 3
          ? await sb
            .from('event_enrichments')
            .select('event_id, contact_name')
            .ilike('contact_name', `%${contactLastName}%`)
            .limit(100)
          : { data: [], error: null }
        if (enrichmentEvidenceError) throw new Error(enrichmentEvidenceError.message)
        const evidenceEventIds = [...new Set((enrichmentEvidence ?? []).map((row) => row.event_id))]
        const { data: history, error: historyError } = evidenceEventIds.length > 0
          ? await sb
            .from('events')
            .select('id, title, location_name, address, start_time')
            .in('id', evidenceEventIds)
            .is('deleted_at', null)
            .order('start_time', { ascending: false })
          : { data: [], error: null }
        if (historyError) throw new Error(historyError.message)

        const places = ([
          ...(savedPlaces as unknown[] ?? []),
          ...(suggestedPlaces as unknown[] ?? []),
        ] as {
          id: string
          name: string
          aliases?: string[]
          address?: string | null
          city?: string | null
          state?: string | null
          zip?: string | null
        }[])
        const genericPlaceTerms = new Set(['doctor', 'dentist', 'school', 'office', 'clinic', 'hospital'])
        const placeTerms = places.flatMap((place) =>
          [
            { value: place.name, kind: 'name' },
            ...(place.aliases ?? []).map((value) => ({ value, kind: 'name' })),
            { value: place.address ?? '', kind: 'address' },
          ]
            .map(({ value, kind }) => ({ place, kind, term: normalizeSearchText(value) }))
            .filter((candidate) =>
              candidate.term.length >= 5 &&
              (candidate.kind === 'address' || !genericPlaceTerms.has(candidate.term)),
            ),
        )
        const contactTerms = [mentionedContact.name, ...(mentionedContact.aliases ?? [])].map(normalizeSearchText)
        const providerByEventId = new Map((enrichmentEvidence ?? []).map((row) => [
          row.event_id,
          normalizeSearchText(row.contact_name ?? ''),
        ]))
        const candidates = new Map<string, {
          place: typeof places[number] | null
          placeName: string
          address: string
          count: number
        }>()
        for (const event of history ?? []) {
          const provider = providerByEventId.get(event.id) ?? ''
          const title = normalizeSearchText(event.title ?? '')
          if (!contactTerms.some((term) => provider === term || title.includes(term)) &&
              !(contactLastName.length >= 4 && (provider.includes(contactLastName) || title.includes(contactLastName)))) continue
          const location = normalizeSearchText(`${event.location_name ?? ''} ${event.address ?? ''}`)
          const matched = placeTerms
            .filter((candidate) => location.includes(candidate.term))
            .sort((a, b) => b.term.length - a.term.length)[0]?.place
          const rawPlaceName = String(event.location_name ?? '').trim()
          const rawAddress = String(event.address ?? '').trim()
          if (!matched && !rawPlaceName && !rawAddress) continue
          const candidateKey = matched?.id ?? `derived:${normalizeSearchText(rawPlaceName || rawAddress)}`
          const current = candidates.get(candidateKey) ?? {
            place: matched ?? null,
            placeName: (matched?.name ?? rawPlaceName) || rawAddress,
            address: matched
              ? [matched.address, matched.city, matched.state, matched.zip].filter(Boolean).join(', ')
              : rawAddress,
            count: 0,
          }
          current.count += 1
          candidates.set(candidateKey, current)
        }
        const ranked = [...candidates.values()].sort((a, b) => b.count - a.count).slice(0, 2)
        if (ranked.length > 0) {
          const first = ranked[0]
          const alternative = ranked[1]
          const address = first.address
          return {
            status: 200,
            payload: {
              type: 'tool_action',
              tool: 'associate_contact_place',
              args: {
                contact_id: mentionedContact.id,
                contact_name: mentionedContact.name,
                place_id: first.place?.id,
                place_name: first.placeName,
                place_address: first.address || undefined,
                relationship: 'provider_location',
                is_default: true,
                evidence_count: first.count,
                evidence_notes: 'Suggested from exact contact and place matches in calendar history; confirmed by household.',
                confirm_place: true,
                alternatives: alternative
                  ? [{
                      place_id: alternative.place?.id,
                      place_name: alternative.placeName,
                      place_address: alternative.address || undefined,
                      evidence_count: alternative.count,
                    }]
                  : [],
              },
              display_text: `I found ${first.placeName}${address ? ` at ${address}` : ''} as the likely location for ${mentionedContact.name} in ${first.count} calendar ${first.count === 1 ? 'entry' : 'entries'}${alternative ? `. Another possibility is ${alternative.placeName}` : ''}. Save this as the default location?`,
              correlation_id: cid,
              telemetry: {
                ...llmTelemetry,
                request_total_ms: Date.now() - requestStartMs,
                context_load_ms: contextLoadMs,
              },
            },
          }
        }
      }
    }
  }
  if (memoryInsightsReadIntent || bugTrackerReadIntent) {
    const observations = (memoryObservationsResult.data ?? []) as MemoryObservationRow[]
    const bugs = (bugReportsResult.data ?? []) as BugReportRow[]
    const textParts: string[] = []
    if (memoryInsightsReadIntent) {
      textParts.push(formatMemoryInsightsSummary(observations))
    }
    if (bugTrackerReadIntent) {
      textParts.push(formatBugTrackerSummary(bugs))
    }
    const requestTotalMs = Date.now() - requestStartMs
    appendServerTrace('server_ai_assistant_memory_bug_summary', `memory=${observations.length} bugs=${bugs.length}`, {
      memory_requested: memoryInsightsReadIntent,
      bug_requested: bugTrackerReadIntent,
      memory_count: observations.length,
      bug_count: bugs.length,
      memory_error: memoryObservationsResult.error?.message ?? null,
      bug_error: bugReportsResult.error?.message ?? null,
      request_ms: requestTotalMs,
    })
    return {
      status: 200,
      payload: {
        type: 'text',
        text: textParts.join('\n\n'),
        correlation_id: cid,
        authoritative_provenance: {
          source: 'ai_memory_observations+ai_bug_reports',
          observation_ids: observations.map((row) => row.id),
          bug_ids: bugs.map((row) => row.id),
        },
        telemetry: {
          ...llmTelemetry,
          request_total_ms: requestTotalMs,
          context_load_ms: contextLoadMs,
        },
      },
    }
  }
  if (cookingFrame?.intent === 'recipe.find') {
    const query = String(cookingFrame.slots?.query ?? '').trim()
    const matches = findSavedRecipes(recipes, query)
    const text = formatSavedRecipeMatches(matches, query)
    const requestTotalMs = Date.now() - requestStartMs
    appendServerTrace('server_ai_assistant_recipe_find', `matches=${matches.length}`, {
      semantic_intent: cookingFrame.intent,
      query,
      match_count: matches.length,
      recipe_ids: matches.map((recipe: { id?: string }) => recipe.id).filter(Boolean),
      request_ms: requestTotalMs,
      llm_calls: 0,
    })
    appendServerTrace('server_ai_assistant_result', `type=text ms=${requestTotalMs}`, {
      result_type: 'text',
      response_text: text,
      request_ms: requestTotalMs,
      llm_calls: 0,
    })
    return {
      status: 200,
      payload: {
        type: 'text',
        text,
        authoritative_provenance: {
          source: 'recipe_library',
          semantic_intent: cookingFrame.intent,
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
  const agentRuntimeConfig = agentRuntimeConfigResult?.data?.value as {
    enabled?: boolean
    kill_switch?: boolean
    stage?: string
  } | null
  const agentRuntimeEnabled = agentRuntimeConfig?.enabled === true &&
    agentRuntimeConfig?.kill_switch !== true &&
    agentRuntimeConfig?.stage === 'default_with_kill_switch'
  const agentShadowConfig = agentShadowConfigResult?.data?.value as {
    enabled?: boolean
    sample_rate?: number
    model?: string
  } | null
  const agentShadowRate = typeof agentShadowConfig?.sample_rate === 'number'
    ? Math.max(0, Math.min(1, agentShadowConfig.sample_rate))
    : 0
  const agentReadConfig = agentReadConfigResult?.data?.value as {
    enabled?: boolean
    sample_rate?: number
    model?: string
  } | null
  const agentReadRate = typeof agentReadConfig?.sample_rate === 'number'
    ? Math.max(0, Math.min(1, agentReadConfig.sample_rate))
    : 0
  const agentWriteConfig = agentWriteConfigResult?.data?.value as {
    enabled?: boolean
    sample_rate?: number
    model?: string
  } | null
  const agentWriteRate = typeof agentWriteConfig?.sample_rate === 'number'
    ? Math.max(0, Math.min(1, agentWriteConfig.sample_rate))
    : 0
  const isCalendarSemanticRead = Boolean(
    explicitReminderRead ||
    (calendarFrame &&
      !['event.create', 'event.move', 'event.delete', 'event.edit'].includes(calendarFrame.intent)
    )
  )
  const authorizedFamilyNames = Array.isArray(context?.family)
    ? context.family.flatMap((member: { name?: unknown }) =>
        typeof member?.name === 'string' ? [member.name] : []
      )
    : []
  const defaultCalendarCreate = calendarFrame?.intent === 'event.create'
    ? resolveDefaultCalendarCreate(latestUserText, { now, utcOffset: context?.utcOffset })
    : null
  if (defaultCalendarCreate) {
    appendServerTrace('server_ai_assistant_default_calendar_create', defaultCalendarCreate.args.title, {
      defaults: defaultCalendarCreate.defaults,
      start: defaultCalendarCreate.args.start,
      end: defaultCalendarCreate.args.end,
    })
    return {
      status: 200,
      payload: {
        type: 'tool_action',
        tool: defaultCalendarCreate.tool,
        args: defaultCalendarCreate.args,
        display_text: buildDisplayText(defaultCalendarCreate.tool, defaultCalendarCreate.args),
        semantic_intent: 'calendar.default_create',
        correlation_id: cid,
        telemetry: {
          ...llmTelemetry,
          request_total_ms: Date.now() - requestStartMs,
          context_load_ms: contextLoadMs,
        },
      },
    }
  }
  const shouldRunAgentWrite = !dryRun &&
    agentRuntimeEnabled &&
    agentWriteConfig?.enabled === true &&
    agentWriteRate > 0 &&
    !isCalendarSemanticRead &&
    !reminderDomainLanguage &&
    !explicitReminderCreate &&
    !groceryFrame &&
    AGENT_GENERAL_PAGES.has(String(context?.page ?? '')) &&
    context?.assistant_mode !== 'chef' &&
    !image &&
    Math.random() < agentWriteRate
  if (!shouldRunAgentWrite && latestUserText && context?.pendingAction) {
    const pendingCalendarCorrection = resolvePendingCalendarCorrection(
      latestUserText,
      context.pendingAction,
      {
        now,
        utcOffset: context?.utcOffset,
        familyNames: authorizedFamilyNames,
      },
    )
    if (pendingCalendarCorrection) {
      appendServerTrace('server_ai_assistant_pending_calendar_correction', `tool=${pendingCalendarCorrection.tool}`, {
        tool: pendingCalendarCorrection.tool,
      })
      return {
        status: 200,
        payload: {
          type: 'tool_action',
          tool: pendingCalendarCorrection.tool,
          args: pendingCalendarCorrection.args,
          display_text: buildDisplayText(pendingCalendarCorrection.tool, pendingCalendarCorrection.args),
          correlation_id: cid,
          telemetry: {
            ...llmTelemetry,
            request_total_ms: Date.now() - requestStartMs,
            context_load_ms: contextLoadMs,
          },
        },
      }
    }
  }
  if (
    latestUserText &&
    !explicitReminderCreate &&
    incomingConversationState?.activeEntityType === 'calendar_clarification'
  ) {
    const selection = resolveCalendarClarificationSelection(
      latestUserText,
      incomingConversationState,
      allEvents ?? [],
      { currentDate: now.toISOString(), utcOffset: context?.utcOffset },
    )
    if (selection?.text) {
      return {
        status: 200,
        payload: {
          type: 'text',
          text: selection.text,
          conversation_state: selection.conversationState ?? incomingConversationState,
          correlation_id: cid,
          telemetry: {
            ...llmTelemetry,
            request_total_ms: Date.now() - requestStartMs,
            context_load_ms: contextLoadMs,
          },
        },
      }
    }
    if (selection?.tool) {
      appendServerTrace('server_ai_assistant_calendar_clarification_resolved', `tool=${selection.tool}`, {
        tool: selection.tool,
        event_id: selection.event?.id ?? null,
      })
      return {
        status: 200,
        payload: {
          type: 'tool_action',
          tool: selection.tool,
          args: selection.args,
          display_text: buildDisplayText(selection.tool, selection.args),
          conversation_state: eventConversationState(selection.event, now),
          correlation_id: cid,
          telemetry: {
            ...llmTelemetry,
            request_total_ms: Date.now() - requestStartMs,
            context_load_ms: contextLoadMs,
          },
        },
      }
    }
  }
  if (latestUserText && incomingConversationState?.activeEntityType === 'grocery_clarification') {
    const selection = resolveGroceryClarificationSelection(
      latestUserText,
      incomingConversationState,
      groceryItems ?? [],
    )
    if (selection?.text) {
      return {
        status: 200,
        payload: {
          type: 'text',
          text: selection.text,
          conversation_state: selection.conversationState ?? incomingConversationState,
          correlation_id: cid,
          telemetry: {
            ...llmTelemetry,
            request_total_ms: Date.now() - requestStartMs,
            context_load_ms: contextLoadMs,
          },
        },
      }
    }
    if (selection?.tool) {
      appendServerTrace('server_ai_assistant_grocery_clarification_resolved', `tool=${selection.tool}`, {
        tool: selection.tool,
        item_id: selection.item?.id ?? null,
      })
      return {
        status: 200,
        payload: {
          type: 'tool_action',
          tool: selection.tool,
          args: selection.args,
          display_text: buildDisplayText(selection.tool, selection.args),
          conversation_state: incomingConversationState,
          semantic_intent: 'grocery.semantic.v2',
          correlation_id: cid,
          telemetry: {
            ...llmTelemetry,
            request_total_ms: Date.now() - requestStartMs,
            context_load_ms: contextLoadMs,
          },
        },
      }
    }
  }
  if (
    latestUserText &&
    reminderCompletionFollowUp &&
    activeConversationEvent?.event_type === 'reminder'
  ) {
    const args = {
      id: activeConversationEvent.id,
      expected_updated_at: activeConversationEvent.updated_at,
      title: activeConversationEvent.title,
    }
    appendServerTrace('server_ai_assistant_reminder_completion_follow_up', 'tool=complete_reminder', {
      event_id: activeConversationEvent.id,
    })
    return {
      status: 200,
      payload: {
        type: 'tool_action',
        tool: 'complete_reminder',
        args,
        display_text: buildDisplayText('complete_reminder', args),
        conversation_state: eventConversationState(activeConversationEvent, now),
        semantic_intent: 'agent.write.update',
        correlation_id: cid,
        telemetry: {
          ...llmTelemetry,
          request_total_ms: Date.now() - requestStartMs,
          context_load_ms: contextLoadMs,
        },
      },
    }
  }
  if (
    (!shouldRunAgentWrite || isCanonicalRecurringEvent(activeConversationEvent)) &&
    intentRouting.profile === 'event' &&
    latestUserText &&
    activeConversationEvent
  ) {
    const pendingRecurringMutation = resolvePendingRecurringScope(
      latestUserText,
      incomingConversationState,
      activeConversationEvent,
    )
    const activeMutation = pendingRecurringMutation ?? resolveActiveCalendarMutation(
        latestUserText,
        activeConversationEvent,
        allEvents ?? [],
        {
          now,
          utcOffset: context?.utcOffset,
          familyNames: authorizedFamilyNames,
        },
      )
    if (activeMutation?.text || activeMutation?.tool) {
      appendServerTrace('server_ai_assistant_active_calendar_mutation', activeMutation.tool ?? 'clarify', {
        tool: activeMutation.tool ?? null,
        event_id: activeConversationEvent.id,
      })
      return {
        status: 200,
        payload: activeMutation.tool
          ? {
              type: 'tool_action',
              tool: activeMutation.tool,
              args: activeMutation.args,
              display_text: buildDisplayText(activeMutation.tool, activeMutation.args),
              conversation_state: eventConversationState(activeConversationEvent, now),
              correlation_id: cid,
              telemetry: {
                ...llmTelemetry,
                request_total_ms: Date.now() - requestStartMs,
                context_load_ms: contextLoadMs,
              },
            }
          : {
              type: 'text',
              text: activeMutation.text,
              conversation_state: {
                ...eventConversationState(activeConversationEvent, now),
                ...(activeMutation.pendingMutation
                  ? { pendingMutation: activeMutation.pendingMutation }
                  : {}),
              },
              correlation_id: cid,
              telemetry: {
                ...llmTelemetry,
                request_total_ms: Date.now() - requestStartMs,
                context_load_ms: contextLoadMs,
              },
            },
      }
    }
  }
  if (shouldRunAgentWrite) {
    const agentWriteRequest = sb.functions.invoke('ai-agent-write', {
      body: {
        messages,
        context: {
          page: context?.page,
          assistant_mode: context?.assistant_mode,
          currentDate: now.toISOString(),
          utcOffset: context?.utcOffset,
          temporalAssumptions: context?.temporalAssumptions,
          family: context?.family,
          activeEntity: activeConversationEvent
            ? {
                type: 'event',
                id: activeConversationEvent.id,
                version: activeConversationEvent.updated_at,
                title: activeConversationEvent.title,
              }
            : activeConversationGroceryItem
              ? {
                  type: 'grocery_item',
                  id: activeConversationGroceryItem.id,
                  version: activeConversationGroceryItem.updated_at,
                  name: activeConversationGroceryItem.name,
                }
              : null,
          pendingAction: context?.pendingAction,
        },
        authoritative_data: {
          events: allEvents ?? [],
          groceryItems: groceryItems ?? [],
        },
        trace_id: traceId,
        turn_id: turnId,
        correlation_id: `${cid}:agent-write`,
        action_id: `${cid}:agent-write-proposal`,
        household_id: 'default',
        model_override: agentWriteConfig?.model ?? DEFAULT_GEMINI_MODEL,
      },
    })
    const timeout = new Promise<{ data: null; error: { message: string } }>((resolve) => {
      setTimeout(() => resolve({ data: null, error: { message: 'agent_write_timeout' } }), 6500)
    })
    const agentWriteResult = await Promise.race([agentWriteRequest, timeout])
    const agentWriteData = agentWriteResult.data as {
      supported?: boolean
      handled?: boolean
      type?: string
      tool?: string
      text?: string
      args?: Record<string, unknown>
      action_id?: string
      elapsed_ms?: number
      code?: string
      planKind?: string
      planReason?: string | null
      toolName?: string
      plan?: { toolName?: string }
      clarification?: {
        candidates?: Array<{
          id?: string
          title?: string
          start?: string | null
          version?: string | null
        }>
        pendingMutation?: {
          tool?: string
          args?: Record<string, unknown>
          semanticTurn?: Record<string, unknown>
        }
      }
      recurringClarification?: {
        eventId?: string
        pendingMutation?: {
          tool?: string
          args?: Record<string, unknown>
        }
      }
    } | null
    if (
      !agentWriteResult.error &&
      agentWriteData?.supported === true &&
      agentWriteData.type === 'tool_action' &&
      [
        'create_event',
        'update_event',
        'delete_event',
        'complete_reminder',
        'add_grocery_items',
        'check_grocery_item',
        'update_grocery_item_quantity',
        'remove_grocery_item',
      ].includes(String(agentWriteData.tool ?? '')) &&
      isAgentWriteCompatible(String(agentWriteData.tool ?? ''), {
        calendarIntent: calendarFrame?.intent,
        groceryIntent: groceryFrame?.intent,
        explicitReminderCreate,
        args: agentWriteData.args,
      }) &&
      agentWriteData.args &&
      typeof agentWriteData.args === 'object'
    ) {
      appendServerTrace('server_agent_write_adopted', `tool=${agentWriteData.plan?.toolName ?? agentWriteData.tool}`, {
        tool_name: agentWriteData.plan?.toolName ?? null,
        legacy_tool_name: agentWriteData.tool,
        action_id: agentWriteData.action_id ?? null,
        agent_write_ms: agentWriteData.elapsed_ms ?? null,
        rollout_rate: agentWriteRate,
      })
      return {
        status: 200,
        payload: {
          type: 'tool_action',
          tool: agentWriteData.tool,
          args: agentWriteData.args,
          display_text: buildDisplayText(agentWriteData.tool, agentWriteData.args),
          action_id: agentWriteData.action_id,
          conversation_state: responseConversationState,
          semantic_intent: [
            'update_event',
            'delete_event',
            'complete_reminder',
            'check_grocery_item',
            'update_grocery_item_quantity',
            'remove_grocery_item',
          ].includes(agentWriteData.tool)
            ? ['delete_event', 'remove_grocery_item'].includes(agentWriteData.tool)
              ? 'agent.write.destructive'
              : 'agent.write.update'
            : 'agent.write.additive',
          correlation_id: cid,
          telemetry: {
            ...llmTelemetry,
            agentic: true,
            agent_write_ms: agentWriteData.elapsed_ms ?? null,
            request_total_ms: Date.now() - requestStartMs,
            context_load_ms: contextLoadMs,
          },
        },
      }
    }
    if (
      !agentWriteResult.error &&
      agentWriteData?.handled === true &&
      typeof agentWriteData.text === 'string'
    ) {
      const clarification = agentWriteData.clarification
      const recurringClarification = agentWriteData.recurringClarification
      const recurringClarificationEvent = recurringClarification?.eventId
        ? (allEvents ?? []).find((event) => event.id === recurringClarification.eventId)
        : null
      const clarificationState = (
        recurringClarificationEvent &&
        isCanonicalRecurringEvent(recurringClarificationEvent) &&
        ['update_event', 'delete_event'].includes(String(recurringClarification?.pendingMutation?.tool ?? '')) &&
        recurringClarification?.pendingMutation?.args
      )
        ? {
            ...eventConversationState(recurringClarificationEvent, now),
            pendingMutation: recurringClarification.pendingMutation,
          }
        : Array.isArray(clarification?.candidates) &&
          clarification.candidates.length > 1 &&
          ['update_event', 'delete_event', 'complete_reminder'].includes(String(clarification.pendingMutation?.tool ?? '')) &&
          clarification.pendingMutation?.args
        ? calendarClarificationConversationState(
            clarification.candidates,
            clarification.pendingMutation,
            now,
          )
          : responseConversationState
      appendServerTrace('server_agent_write_blocked', agentWriteData.code ?? 'write_rejected', {
        code: agentWriteData.code ?? null,
        tool_name: agentWriteData.toolName ?? agentWriteData.plan?.toolName ?? null,
        rollout_rate: agentWriteRate,
      })
      return {
        status: 200,
        payload: {
          type: 'text',
          text: agentWriteData.text,
          conversation_state: clarificationState,
          semantic_intent: 'agent.write.blocked',
          correlation_id: cid,
          telemetry: {
            ...llmTelemetry,
            agentic: true,
            agent_write_ms: agentWriteData.elapsed_ms ?? null,
            request_total_ms: Date.now() - requestStartMs,
            context_load_ms: contextLoadMs,
          },
        },
      }
    }
    const agentWriteFallback = agentWriteResult.error?.message ??
      (typeof agentWriteData?.code === 'string' ? agentWriteData.code : 'unsupported_plan')
    appendServerTrace('server_agent_write_fallback', agentWriteFallback, {
      rollout_rate: agentWriteRate,
      failure: agentWriteFallback,
    })
    if (
      context?.pendingAction ||
      (activeConversationEvent && agentWriteData?.planReason !== 'read') ||
      ['event.create', 'event.move', 'event.delete', 'event.edit'].includes(calendarFrame?.intent ?? '')
    ) {
      return {
        status: 200,
        payload: {
          type: 'text',
          text: 'I could not prepare that calendar change reliably, so I did not change anything. Please try again.',
          conversation_state: responseConversationState,
          semantic_intent: 'agent.write.failed',
          correlation_id: cid,
          telemetry: {
            ...llmTelemetry,
            agentic: true,
            agent_write_ms: agentWriteData?.elapsed_ms ?? null,
            request_total_ms: Date.now() - requestStartMs,
            context_load_ms: contextLoadMs,
          },
        },
      }
    }
  }
  const shouldRunAgentRead = !dryRun &&
    agentRuntimeEnabled &&
    agentReadConfig?.enabled === true &&
    agentReadRate > 0 &&
    !explicitReminderCreate &&
    (!reminderDomainLanguage || Boolean(explicitReminderRead)) &&
    AGENT_GENERAL_PAGES.has(String(context?.page ?? '')) &&
    context?.assistant_mode !== 'chef' &&
    !context?.pendingAction &&
    !groceryFrame &&
    !image &&
    (isCalendarSemanticRead || Math.random() < agentReadRate)
  if (shouldRunAgentRead) {
    const agentReadRequest = sb.functions.invoke('ai-agent-read', {
      body: {
        messages,
        context: {
          page: context?.page,
          assistant_mode: context?.assistant_mode,
          currentDate: context?.currentDate,
          utcOffset: context?.utcOffset,
          family: context?.family,
          activeEntity: activeConversationEvent
            ? {
                type: 'event',
                id: activeConversationEvent.id,
                version: activeConversationEvent.updated_at,
                title: activeConversationEvent.title,
              }
            : null,
          groceryQuery: groceryFrame?.slots?.item ?? null,
          calendarReadContext,
        },
        authoritative_data: {
          events: allEvents ?? [],
          groceryItems: groceryItems ?? [],
        },
        trace_id: traceId,
        turn_id: turnId,
        correlation_id: `${cid}:agent-read`,
        household_id: 'default',
        model_override: agentReadConfig?.model ?? DEFAULT_GEMINI_MODEL,
      },
    })
    const timeout = new Promise<{ data: null; error: { message: string } }>((resolve) => {
      setTimeout(() => resolve({ data: null, error: { message: 'agent_read_timeout' } }), 4500)
    })
    const agentReadResult = await Promise.race([agentReadRequest, timeout])
    const agentReadData = agentReadResult.data as {
      supported?: boolean
      handled?: boolean
      type?: string
      text?: string
      code?: string
      activeEntity?: Record<string, unknown> | null
      elapsed_ms?: number
      plan?: { toolName?: string }
    } | null
    if (
      !agentReadResult.error &&
      agentReadData?.supported === true &&
      agentReadData.type === 'text' &&
      typeof agentReadData.text === 'string'
    ) {
      appendServerTrace('server_agent_read_adopted', `tool=${agentReadData.plan?.toolName ?? 'clarify'}`, {
        tool_name: agentReadData.plan?.toolName ?? null,
        agent_read_ms: agentReadData.elapsed_ms ?? null,
        rollout_rate: agentReadRate,
      })
      return {
        status: 200,
        payload: {
          type: 'text',
          text: agentReadData.text,
          conversation_state: agentReadData.activeEntity ?? undefined,
          semantic_intent: 'agent.read',
          correlation_id: cid,
          telemetry: {
            ...llmTelemetry,
            agentic: true,
            agent_read_ms: agentReadData.elapsed_ms ?? null,
            request_total_ms: Date.now() - requestStartMs,
            context_load_ms: contextLoadMs,
          },
        },
      }
    }
    if (
      !agentReadResult.error &&
      agentReadData?.handled === true &&
      typeof agentReadData.text === 'string'
    ) {
      appendServerTrace('server_agent_mutation_blocked', agentReadData.code ?? 'mutation_unavailable', {
        code: agentReadData.code ?? null,
        rollout_rate: agentReadRate,
      })
      return {
        status: 200,
        payload: {
          type: 'text',
          text: agentReadData.text,
          conversation_state: responseConversationState,
          semantic_intent: 'agent.write.blocked',
          correlation_id: cid,
          telemetry: {
            ...llmTelemetry,
            agentic: true,
            agent_read_ms: agentReadData.elapsed_ms ?? null,
            request_total_ms: Date.now() - requestStartMs,
            context_load_ms: contextLoadMs,
          },
        },
      }
    }
    appendServerTrace('server_agent_read_fallback', agentReadResult.error?.message ?? 'unsupported_plan', {
      rollout_rate: agentReadRate,
      failure: agentReadResult.error?.message ?? 'unsupported_plan',
    })
  }
  const shouldRunAgentShadow = !shouldRunAgentWrite && !shouldRunAgentRead && !dryRun &&
    agentRuntimeEnabled &&
    agentShadowConfig?.enabled === true &&
    agentShadowRate > 0 &&
    Math.random() < agentShadowRate
  if (shouldRunAgentShadow) {
    const authoritativeEntities = [
      ...(allEvents ?? []).slice(0, 30).map((event: {
        id: string
        updated_at?: string
        title?: string
        start_time?: string
        end_time?: string
        recurrence_master_id?: string | null
        rrule?: string | null
      }) => ({
        type: 'event',
        id: event.id,
        version: event.updated_at ?? null,
        title: event.title ?? null,
        start: event.start_time ?? null,
        end: event.end_time ?? null,
        recurring: Boolean(event.recurrence_master_id || event.rrule),
      })),
      ...(groceryItems ?? []).slice(0, 30).map((item: {
        id: string
        name?: string
        updated_at?: string
        quantity?: string
        unit?: string
        checked?: boolean
      }) => ({
        type: 'grocery_item',
        id: item.id,
        version: item.updated_at ?? null,
        name: item.name ?? null,
        quantity: item.quantity ?? null,
        unit: item.unit ?? null,
        checked: item.checked ?? null,
      })),
      ...(recipes ?? []).slice(0, 20).map((recipe: { id: string; name?: string }) => ({
        type: 'recipe',
        id: recipe.id,
        name: recipe.name ?? null,
      })),
    ]
    const activeEntity = incomingConversationState?.activeEntityType === 'event'
      ? authoritativeEntities.find((entity) => entity.type === 'event' && entity.id === incomingConversationState.activeEventId) ?? null
      : incomingConversationState?.activeEntityType === 'grocery_item'
        ? authoritativeEntities.find((entity) => entity.type === 'grocery_item' && entity.id === incomingConversationState.activeGroceryItemId) ?? null
        : null
    const pendingLegacyTool = getAgentToolByLegacyName(context?.pendingAction?.tool)
    const shadowPromise = sb.functions.invoke('ai-agent-shadow', {
      body: {
        messages,
        context: {
          page: context?.page,
          assistant_mode: context?.assistant_mode,
          currentDate: context?.currentDate,
          utcOffset: context?.utcOffset,
          family: context?.family,
          authoritativeEntities,
          activeEntity,
          pendingAction: context?.pendingAction ? {
            actionId: `${cid}:pending`,
            toolName: pendingLegacyTool?.name ?? context.pendingAction.tool,
            args: context.pendingAction.args ?? {},
          } : null,
        },
        trace_id: traceId,
        turn_id: turnId,
        correlation_id: `${cid}:shadow`,
        household_id: 'default',
        model_override: agentShadowConfig?.model ?? DEFAULT_GEMINI_MODEL,
      },
    }).then(({ error }) => {
      if (error) {
        console.warn(`[ai-assistant][${cid}] agent_shadow_error=${error.message}`)
      }
    }).catch((error) => {
      console.warn(`[ai-assistant][${cid}] agent_shadow_error=${String(error)}`)
    })
    const edgeRuntime = globalThis as unknown as {
      EdgeRuntime?: { waitUntil(promise: Promise<unknown>): void }
    }
    if (edgeRuntime.EdgeRuntime?.waitUntil) {
      edgeRuntime.EdgeRuntime.waitUntil(shadowPromise)
    } else {
      void shadowPromise
    }
    appendServerTrace('server_agent_shadow_scheduled', `sample_rate=${agentShadowRate}`, {
      shadow_model: agentShadowConfig?.model ?? DEFAULT_GEMINI_MODEL,
      sample_rate: agentShadowRate,
      authoritative_entity_count: authoritativeEntities.length,
    })
  }
  if (requestAmbiguity) {
    const requestTotalMs = Date.now() - requestStartMs
    appendServerTrace('server_ai_assistant_ambiguity_clarification', requestAmbiguity.kind, {
      ambiguity_kind: requestAmbiguity.kind,
      request_ms: requestTotalMs,
      llm_calls: 0,
    })
    appendServerTrace('server_ai_assistant_result', `type=text ms=${requestTotalMs}`, {
      result_type: 'text',
      request_ms: requestTotalMs,
      llm_calls: 0,
      response_text: requestAmbiguity.text,
    })
    return {
      status: 200,
      payload: {
        type: 'text',
        text: requestAmbiguity.text,
        correlation_id: cid,
        telemetry: { ...llmTelemetry, request_ms: requestTotalMs },
      },
    }
  }
  const recordLlmCall = (stage: string, elapsedMs: number, status: number, payload?: unknown) => {
    const usage = extractGeminiUsage(payload)
    llmTelemetry.llm_calls += 1
    llmTelemetry.llm_inference_ms += elapsedMs
    llmTelemetry.input_tokens += usage.inputTokens
    llmTelemetry.cached_input_tokens += usage.cachedInputTokens
    llmTelemetry.output_tokens += usage.outputTokens
    llmTelemetry.thought_tokens += usage.thoughtTokens
    llmTelemetry.total_tokens += usage.totalTokens
    const finishReason = (payload as { candidates?: Array<{ finishReason?: unknown }> } | null)
      ?.candidates?.[0]?.finishReason
    appendServerTrace('server_ai_assistant_llm_call', `${stage} ms=${elapsedMs} status=${status}`, {
      stage,
      elapsed_ms: elapsedMs,
      status,
      provider: llmTelemetry.provider,
      model: llmTelemetry.model,
      input_tokens: usage.inputTokens,
      cached_input_tokens: usage.cachedInputTokens,
      output_tokens: usage.outputTokens,
      thought_tokens: usage.thoughtTokens,
      total_tokens: usage.totalTokens,
      finish_reason: typeof finishReason === 'string' ? finishReason : null,
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
      const res = await providerFetch(`${base}:generateContent?key=${apiKey}`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(reqBody), signal: controller.signal,
      }, { correlationId: cid, lane: intentRouting.profile, callIndex: llmTelemetry.llm_calls + 1 })
      if (!res.ok) return { ok: false, status: res.status, data: null, errText: await res.text().catch(() => '') }
      return { ok: true, status: res.status, data: await res.json(), errText: '' }
    }
    const res = await providerFetch(`${base}:streamGenerateContent?alt=sse&key=${apiKey}`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(reqBody), signal: controller.signal,
    }, { correlationId: cid, lane: intentRouting.profile, callIndex: llmTelemetry.llm_calls + 1 })
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
    if (!finishReason) {
      return {
        ok: false,
        status: 502,
        data,
        errText: 'incomplete_stream_missing_finish_reason',
      }
    }
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
    image_direct_event_create_flow: imageDirectEventCreateFlow,
    direct_reminder_create_flow: directReminderCreateFlow,
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

  if (intentRouting.profile === 'event' && calendarFrame) {
    const semanticRead = resolveCalendarSemanticRead(calendarFrame, allEvents ?? [], { now, utcOffset })
    if (semanticRead) {
      if (semanticRead.events.length === 1) {
        responseConversationState = eventConversationState(semanticRead.events[0], now)
      }
      const requestTotalMs = Date.now() - requestStartMs
      appendServerTrace('server_ai_assistant_calendar_semantic_read', `intent=${calendarFrame.intent} count=${semanticRead.events.length} ms=${requestTotalMs}`, {
        intent: calendarFrame.intent,
        confidence: calendarFrame.confidence,
        event_ids: semanticRead.events.map((event: { id: string }) => event.id),
        count: semanticRead.events.length,
        conflict_count: semanticRead.conflicts?.length ?? 0,
        scope: semanticRead.scope ?? null,
        request_ms: requestTotalMs,
      })
      appendServerTrace('server_ai_assistant_result', `type=text ms=${requestTotalMs}`, {
        result_type: 'text',
        request_ms: requestTotalMs,
        llm_calls: 0,
        semantic_intent: calendarFrame.intent,
        response_text: semanticRead.text,
      })
      return {
        status: 200,
        payload: {
          type: 'text',
          text: semanticRead.text,
          semantic_intent: calendarFrame.intent,
          correlation_id: cid,
          authoritative_provenance: {
            source: 'events',
            event_ids: semanticRead.events.map((event: { id: string }) => event.id),
            semantic_intent: calendarFrame.intent,
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

  if (intentRouting.profile === 'grocery' && groceryFrame) {
    const semantic = resolveGrocerySemantic(groceryFrame, groceryItems ?? [], {
      activeItemId: incomingConversationState?.activeEntityType === 'grocery_item'
        ? incomingConversationState.activeGroceryItemId
        : null,
    })
    if (semantic) {
      const requestTotalMs = Date.now() - requestStartMs
      const semanticItems = Array.isArray(semantic.items)
        ? semantic.items
        : semantic.item
          ? [semantic.item]
          : []
      if (semanticItems.length === 1) {
        responseConversationState = groceryConversationState(semanticItems[0], now)
      } else if (semanticItems.length > 1) {
        responseConversationState = groceryClarificationConversationState(semanticItems, now)
      }
      appendServerTrace('server_ai_assistant_grocery_semantic_dispatch', `intent=${groceryFrame.intent} type=${semantic.type} ms=${requestTotalMs}`, {
        intent: groceryFrame.intent,
        confidence: groceryFrame.confidence,
        result_type: semantic.type,
        item_ids: semanticItems.map((item: { id: string }) => item.id),
        tool: semantic.tool ?? null,
        request_ms: requestTotalMs,
      })

      if (semantic.type === 'text') {
        appendServerTrace('server_ai_assistant_result', `type=text ms=${requestTotalMs}`, {
          result_type: 'text',
          request_ms: requestTotalMs,
          llm_calls: 0,
          semantic_intent: groceryFrame.intent,
          response_text: semantic.text,
        })
        return {
          status: 200,
          payload: {
            type: 'text',
            text: semantic.text,
            correlation_id: cid,
            authoritative_provenance: {
              source: 'grocery_items',
              item_ids: semanticItems.map((item: { id: string }) => item.id),
              semantic_intent: groceryFrame.intent,
            },
            semantic_contract: 'grocery-semantic-v2',
            conversation_state: responseConversationState,
            telemetry: {
              ...llmTelemetry,
              request_total_ms: requestTotalMs,
              context_load_ms: contextLoadMs,
            },
          },
        }
      }

      if (semantic.tool === 'add_grocery_items' && !dryRun) {
        const result = await saveGroceryItems(sb, semantic.args.items)
        const savedItems = result.items ?? []
        if (savedItems.length === 1) responseConversationState = groceryConversationState(savedItems[0], now)
        const addedNames = savedItems.filter((item) => !item.already_present).map((item) => item.name)
        const existingNames = savedItems.filter((item) => item.already_present).map((item) => item.name)
        const text = [
          addedNames.length ? `Saved in Casa: ${addedNames.join(', ')}.` : null,
          existingNames.length ? `${existingNames.join(', ')} ${existingNames.length === 1 ? 'was' : 'were'} already on the list.` : null,
          'iOS Reminders sync runs asynchronously.',
        ].filter(Boolean).join(' ')
        const completedMs = Date.now() - requestStartMs
        appendServerTrace('server_ai_assistant_result', `type=text ms=${completedMs}`, {
          result_type: 'text',
          request_ms: completedMs,
          llm_calls: 0,
          semantic_intent: groceryFrame.intent,
          response_text: text,
          saved_count: result.count ?? 0,
          already_present_count: result.already_present_count ?? 0,
        })
        return {
          status: 200,
          payload: {
            type: 'text',
            text,
            write_verified: true,
            correlation_id: cid,
            conversation_state: responseConversationState,
            authoritative_provenance: {
              source: 'grocery_items',
              item_ids: savedItems.map((item) => item.id),
              semantic_intent: groceryFrame.intent,
            },
            semantic_contract: 'grocery-semantic-v2',
            telemetry: {
              ...llmTelemetry,
              request_total_ms: completedMs,
              context_load_ms: contextLoadMs,
            },
          },
        }
      }

      return {
        status: 200,
        payload: {
          type: 'tool_action',
          tool: semantic.tool,
          args: semantic.args,
          display_text: buildDisplayText(semantic.tool, semantic.args),
          conversation_state: responseConversationState,
          correlation_id: cid,
          authoritative_provenance: {
            source: 'grocery_items',
            item_ids: semanticItems.map((item: { id: string }) => item.id),
            semantic_intent: groceryFrame.intent,
          },
          telemetry: {
            ...llmTelemetry,
            request_total_ms: requestTotalMs,
            context_load_ms: contextLoadMs,
          },
        },
      }
    }
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
  const familyNames = familyMembers
    .flatMap((member: { name?: unknown }) => typeof member?.name === 'string' ? [member.name] : [])
    .join(', ')
  const familyIdentityAliases = formatFamilyIdentityAliases(familyMembers)
  const recipesText = formatAuthoritativeRecipes(recipes ?? [])

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
  const cookingPolicy = cookingPolicyGuidance(cookingFrame, foodProfileRaw ?? {})

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
    recurrence_master_id?: string | null;
    rrule?: string | null;
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
    ? (savedContacts as {
      name: string
      aliases?: string[]
      phone?: string
      email?: string
      address?: string
      relationship?: string
      notes?: string
      primary_place?: {
        name?: string
        address?: string
        city?: string
        state?: string
        zip?: string
        category?: string
      } | null
    }[]).map(c => {
        const aliases = c.aliases?.length ? ` (also: ${c.aliases.join(', ')})` : ''
        const primaryPlaceAddress = c.primary_place
          ? [c.primary_place.address, c.primary_place.city, c.primary_place.state, c.primary_place.zip].filter(Boolean).join(', ')
          : ''
        const primaryPlace = c.primary_place
          ? `usually at ${c.primary_place.name}${primaryPlaceAddress ? ` (${primaryPlaceAddress})` : ''}`
          : ''
        const extra = [c.relationship, primaryPlace, c.phone, c.email, c.address, c.notes].filter(Boolean).join(' | ')
        return `- ${c.name}${aliases}${extra ? ': ' + extra : ''}`
      }).join('\n')
    : ''
  const familyRelationshipsText = confirmedFamilyContactRelationships &&
    (confirmedFamilyContactRelationships as unknown[]).length > 0
    ? (confirmedFamilyContactRelationships as {
      relationship: string
      family_member?: { name?: string; full_name?: string | null } | null
      contact?: {
        name?: string
        phone?: string | null
        primary_place?: {
          name?: string
          address?: string
          city?: string
          state?: string
          zip?: string
        } | null
      } | null
    }[]).flatMap((association) => {
      const member = association.family_member?.name
      const contact = association.contact?.name
      if (!member || !contact) return []
      const place = association.contact?.primary_place
      const address = place
        ? [place.address, place.city, place.state, place.zip].filter(Boolean).join(', ')
        : ''
      const destination = place
        ? ` | usually at ${place.name}${address ? ` (${address})` : ''}`
        : ''
      const phone = association.contact?.phone ? ` | ${association.contact.phone}` : ''
      return `- ${member}: ${association.relationship} is ${contact}${destination}${phone}`
    }).join('\n')
    : ''
  const contactPlaceRelationshipsText = confirmedContactPlaceRelationships &&
    (confirmedContactPlaceRelationships as unknown[]).length > 0
    ? (confirmedContactPlaceRelationships as {
      relationship: string
      is_default: boolean
      contact?: { name?: string; phone?: string | null } | null
      place?: {
        name?: string
        address?: string | null
        city?: string | null
        state?: string | null
        zip?: string | null
        phone?: string | null
      } | null
    }[]).flatMap((connection) => {
      const contact = connection.contact?.name
      const place = connection.place?.name
      if (!contact || !place) return []
      const address = [
        connection.place?.address,
        connection.place?.city,
        connection.place?.state,
        connection.place?.zip,
      ].filter(Boolean).join(', ')
      return `- ${contact} ${connection.relationship.replaceAll('_', ' ')} ${place}${connection.is_default ? ' [default]' : ''}${address ? ` | ${address}` : ''}`
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
            title: { type: 'STRING', description: 'Event title only. Never prefix it with an owner, attendee, or family member.' },
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
            category: { type: 'STRING', description: 'Category like appointment, school, sports, child_care, dining, travel, social, other. Use empty string to clear.' },
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
            category: { type: 'STRING', description: 'Category like appointment, school, sports, child_care, dining, travel, social, other. Use empty string to clear.' },
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
        name: 'remove_grocery_item',
        description: 'Soft-delete one exact grocery item so Casa can synchronize the deletion to iOS Reminders.',
        parameters: {
          type: 'OBJECT',
          properties: {
            item_id: { type: 'STRING', description: 'Exact grocery item UUID' },
          },
          required: ['item_id'],
        },
      },
      {
        name: 'update_grocery_item_quantity',
        description: 'Update the quantity of one exact active grocery item.',
        parameters: {
          type: 'OBJECT',
          properties: {
            item_id: { type: 'STRING', description: 'Exact grocery item UUID' },
            quantity: { type: 'STRING', description: 'New quantity, such as 2 or 1.5' },
          },
          required: ['item_id', 'quantity'],
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

  const recipeToolNames = cookingToolNames(cookingFrame)
  const toolNamesByProfile: Record<string, string[]> = {
    event: ['search_events', 'create_event', 'update_event', 'bulk_update_events', 'delete_event', 'delete_events_by_title'],
    grocery: ['add_grocery_items', 'check_grocery_item', 'remove_grocery_item', 'update_grocery_item_quantity', 'clear_checked_grocery_items'],
    weather: ['get_weather_forecast'],
    travel: ['get_travel_eta'],
    places: ['search_places'],
    web: ['search_web'],
    recipe: recipeToolNames,
    general: [],
  }
  const selectedToolNames = householdDirectoryQuestion
    ? new Set()
    : intentRouting.profile === 'full'
    ? new Set(safeFullProfileToolNames(tools[0].function_declarations.map((tool) => tool.name)))
    : new Set(toolNamesByProfile[intentRouting.profile] ?? [])
  const selectedToolDeclarations = tools[0].function_declarations
    .filter((tool) => selectedToolNames.has(tool.name))
  const primaryToolDeclarations = directReminderCreateFlow
    ? selectedToolDeclarations.filter((tool) => tool.name === 'create_event')
    : intentRouting.forceEventSearch
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
  const secondaryToolDeclarations = directReminderCreateFlow
    ? selectedToolDeclarations.filter((tool) => tool.name === 'create_event')
    : intentRouting.profile === 'event' && intentRouting.forceEventSearch
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
  const includeGroceryContext = needsGroceryData
  const includeRecipeContext = needsRecipeData
  const includeFoodProfileContext = needsFoodProfileData
  const includePlaceContext = ['full', 'event', 'places', 'travel'].includes(intentRouting.profile) || householdDirectoryQuestion
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
${householdDirectoryQuestion ? `HOUSEHOLD DIRECTORY ANSWER MODE: Answer from the confirmed SAVED PLACES and SAVED CONTACTS below. Do not call external place or event search tools. If the user asks where to schedule something with a person or provider, give their usual place and full saved address first; only then ask for the missing event details needed to schedule it.` : ''}
${directReminderCreateFlow ? `REMINDER CREATE MODE: Create a new reminder with create_event and event_type="reminder". Never search for or update an appointment merely because the reminder text mentions changing, calling, cancelling, or rescheduling one. Missing details were already checked before this model call, so call create_event rather than asking again.${(structuredReminderDueBy ?? reminderDaypartRange) ? ` Casa deterministically resolved the exact date/time to ${(structuredReminderDueBy ?? reminderDaypartRange)!.start} through ${(structuredReminderDueBy ?? reminderDaypartRange)!.end}; use those exact timestamps.` : ''}` : ''}
FAMILY MEMBERS: ${familyNames}
${familyIdentityAliases ? `FAMILY IDENTITY ALIASES: ${familyIdentityAliases}. These names refer to the same person. Use the canonical short name in tool arguments and event-member updates, but mirror the user's wording in your reply.` : ''}
${includePlaceContext && placesText ? `\nSAVED PLACES (use for location nicknames):\n${placesText}` : ''}
${includePlaceContext && contactsText ? `\nSAVED CONTACTS:\n${contactsText}` : ''}
${includePlaceContext && familyRelationshipsText ? `\nCONFIRMED FAMILY RELATIONSHIPS (authoritative; never infer relationships from event attendees):\n${familyRelationshipsText}` : ''}
${includePlaceContext && contactPlaceRelationshipsText ? `\nCONFIRMED PEOPLE ↔ PLACES (authoritative; Place owns the address):\n${contactPlaceRelationshipsText}` : ''}
${needsEmailKnowledgeContext && emailKnowledgeText ? `\nEMAIL-DERIVED FAMILY KNOWLEDGE (current, source-backed operational context):\n${emailKnowledgeText}\nOnly mention a relevant item when it directly helps answer the user. Do not expose identifiers, credentials, medical details, or raw email content.` : ''}
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

${context.pendingAction ? `
PENDING CONFIRMATION:
Casa already prepared a ${context.pendingAction.tool} action and its confirmation card is still visible.
Do not claim you cannot access the conversation. If the user asks to review or retry, summarize the pending action from the card and direct them to confirm or cancel it.
Never claim the action already ran until Casa supplies a verified execution result.` : ''}

${incomingConversationState?.activeEntityType === 'event' ? `
AUTHORITATIVE CONVERSATION ENTITY:
The current conversation is grounded to event ID ${incomingConversationState.activeEventId}.
Use only the matching database event loaded by Casa. Never copy event facts from earlier assistant prose.
If that event is unavailable, say so and search again instead of guessing.` : ''}

${includeEventContext ? `UPCOMING EVENTS SNAPSHOT (next ${PROMPT_EVENT_WINDOW_DAYS} days, capped; use search_events for anything outside snapshot):\n${eventsText}` : ''}
${includeGroceryContext ? `\nGROCERY LIST (unchecked items):\n${groceryText}\n${defaultListId ? `Default list ID: ${defaultListId}` : ''}` : ''}
${includeRecipeContext ? `\nRECIPE LIBRARY SNAPSHOT (recent):\n${recipesText || 'No recipes saved yet.'}` : ''}
${includeFoodProfileContext && foodProfileText ? `\nFOOD PROFILE (household dietary needs & preferences — honor for all meal/grocery/recipe suggestions):\n${foodProfileText}` : ''}
${image ? `\nIMAGE CONTEXT:\n- Casa supplied ${imageContext === 'conversation' ? 'the most recent image from this conversation' : 'an image attached to this turn'} for direct visual analysis.\n- You can analyze this image. Never claim that you cannot see, read, or interpret images.\n- If this specific image is too unclear to interpret reliably, say that the image could not be read clearly and ask for a clearer upload. Do not guess.` : ''}
${cookingFrame ? `\nCOOKING SEMANTIC FRAME (Casa's normalized interpretation; answer the concept, not the wording):\nIntent: ${cookingFrame.intent}\nSlots: ${JSON.stringify(cookingFrame.slots)}${inheritedCookingFrame && cookingRequestText ? `\nOriginal request to retry: ${cookingRequestText}` : ''}${cookingGuidance ? `\nRequired handling: ${cookingGuidance}` : ''}` : ''}
${cookingPolicy ? `\n${cookingPolicy}` : ''}
${includeAvailabilityContext && availabilityText ? `\nMEMBER AVAILABILITY (recurring rules + upcoming overrides — use to warn about conflicts and pick times people are free):\n${availabilityText}` : ''}

INSTRUCTIONS:
- You are allowed to answer general/random questions directly (facts, explanations, ideas, writing help, etc.) when no Casa data/action is needed.
- If assistant_mode is "chef", bias responses toward cooking, recipe planning, pantry-aware substitutions, and grocery execution.
- Call create_recipe only when the COOKING SEMANTIC FRAME is recipe.save; include complete structured ingredients and ordered steps.
- create_recipe is low-risk and should execute immediately once the explicit recipe.save request has structured details ready.
- In cooking mode, use add_grocery_items only when the COOKING SEMANTIC FRAME is cooking.add_to_grocery. Never mutate groceries merely because you suggested a recipe or listed missing ingredients.
- Treat recipe IDs, saved ingredients, saved steps, grocery rows, and the food profile supplied by Casa as authoritative. Conversationally generated recipes are suggestions until explicitly saved.
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
- Tone: warm and proactive. Except when a semantic requirement explicitly calls for complete long-form output, stay concise (1–3 sentences).
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
  const latestUserMessageIndex = msgList.findLastIndex((message) => message.role === 'user')

  for (const [index, m] of msgList.entries()) {
    const rawText = (m.content ?? '').trim()
    const text = index === latestUserMessageIndex && cookingGuidance
      ? `${rawText}\n\nCasa semantic requirement: ${cookingGuidance}`
      : rawText
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
        const res = await mapsFetch('https://places.googleapis.com/v1/places:searchText', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'X-Goog-Api-Key': mapsKey,
            'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.location',
          },
          body: JSON.stringify({ textQuery: `${query} near ${city}`, maxResultCount: 3 }),
        }, { correlationId: cid })
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

      let payload = await computeCachedTravelEta({
        mapsKey,
        origin,
        destination,
        arrivalTimeIso,
        departureTimeIso,
        bufferMins,
      }, routeEtaCache)
      if (!payload.found && /no route found/i.test(String(payload.error ?? ''))) {
        const cleanedDestination = sanitizeTravelLocation(destination)
        const cleanedOriginRaw = sanitizeTravelLocation(origin)
        const cleanedOrigin = /^home$/i.test(cleanedOriginRaw) ? (homeAddress || String(context.homeCity ?? '')) : cleanedOriginRaw
        if ((cleanedDestination && cleanedDestination !== destination) || (cleanedOrigin && cleanedOrigin !== origin)) {
          payload = await computeCachedTravelEta({
            mapsKey,
            origin: cleanedOrigin || origin,
            destination: cleanedDestination || destination,
            arrivalTimeIso,
            departureTimeIso,
            bufferMins,
          }, routeEtaCache)
        }
      }
      if (!payload.found && /no route found/i.test(String(payload.error ?? ''))) {
        const inferredDestination = inferTravelDestinationFromText(String(latestUserText ?? ''))
        if (inferredDestination) {
          const inferredOrigin = inferTravelOriginFromText(String(latestUserText ?? ''))
          payload = await computeCachedTravelEta({
            mapsKey,
            origin: inferredOrigin || homeAddress || String(context.homeCity ?? '') || origin,
            destination: inferredDestination,
            arrivalTimeIso,
            departureTimeIso,
            bufferMins,
          }, routeEtaCache)
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
    const userLikelyRequestedWrite = explicitReminderCreate || userRequestedWriteIntent
    const primaryHardTimeoutMs = image
      ? Math.max(IMAGE_PRIMARY_HARD_TIMEOUT_MS, intentRouting.profile === 'recipe' ? RECIPE_PRIMARY_HARD_TIMEOUT_MS : PRIMARY_HARD_TIMEOUT_MS)
      : intentRouting.profile === 'recipe'
        ? RECIPE_PRIMARY_HARD_TIMEOUT_MS
        : PRIMARY_HARD_TIMEOUT_MS
    const primaryWriteToolNames = primaryToolDeclarations
      .filter((tool) => ['create_event', 'update_event', 'bulk_update_events', 'delete_event', 'delete_events_by_title', 'create_recipe', 'add_grocery_items'].includes(tool.name))
      .map((tool) => tool.name)
    const primaryToolConfig = directReminderCreateFlow
      ? { function_calling_config: { mode: 'ANY', allowed_function_names: ['create_event'] } }
      : intentRouting.forceEventSearch
      ? { function_calling_config: { mode: 'ANY', allowed_function_names: ['search_events'] } }
      : userLikelyRequestedWrite && primaryWriteToolNames.length > 0
        ? { function_calling_config: { mode: 'ANY', allowed_function_names: primaryWriteToolNames } }
        : { function_calling_config: { mode: 'AUTO' } }
    const body = {
      system_instruction: { parts: [{ text: systemInstruction }] },
      contents,
      generation_config: {
        temperature: 0.4,
        max_output_tokens: intentRouting.profile === 'full'
          ? 2048
          : intentRouting.profile === 'recipe'
            ? 1536
            : intentRouting.profile === 'general'
              ? 1024
              : 768,
        thinking_config: {
          thinking_budget: intentRouting.profile === 'full' ? 512 : 0,
        },
      },
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
        image_context: imageContext,
        requires_complete_recipe: requiresCompleteRecipe,
        request_budget_ms: requestHardTimeoutMs,
      },
    )

    let res = await callModel(body, { stream: wantStream, timeoutMs: primaryHardTimeoutMs })
    let llmPrimaryMs = Date.now() - llmStartMs
    let recipeTextRecoveryUsed = false
    if (shouldRetryTransientLlmStatus(res.status, remainingRequestBudgetMs())) {
      recordLlmCall('llm_primary_transient', llmPrimaryMs, res.status)
      appendServerTrace('server_ai_assistant_llm_retry', `status=${res.status}`, {
        retry_reason: 'transient_provider_status',
        first_status: res.status,
        first_attempt_ms: llmPrimaryMs,
        remaining_budget_ms: remainingRequestBudgetMs(),
      })
      await new Promise((resolve) => setTimeout(resolve, 100))
      const retryStartMs = Date.now()
      res = await callModel(body, { stream: wantStream, timeoutMs: primaryHardTimeoutMs })
      llmPrimaryMs = Date.now() - retryStartMs
    }
    console.log(`[ai-assistant][${cid}] stage=llm_primary ms=${llmPrimaryMs} status=${res.status}`)
    const latestUserTextForFallback = [...contents]
      .reverse()
      .find((turn) => turn.role === 'user')
      ?.parts.flatMap((part) => 'text' in part && typeof part.text === 'string' ? [part.text.trim()] : [])
      .find((part) => part.length > 0)

    const runCompactFallback = async (reason: 'empty_response' | 'primary_timeout') => {
      if (
        intentRouting.profile === 'recipe' ||
        !latestUserTextForFallback ||
        userLikelyRequestedWrite ||
        remainingRequestBudgetMs() < 500
      ) {
        return null
      }
      const fallbackBody = {
        system_instruction: {
          parts: [{
            text: 'You are the Casa Tabor assistant. Respond helpfully in 1-3 concise sentences. If data is missing, ask one clear follow-up question.',
          }],
        },
        contents: [{ role: 'user', parts: [{ text: latestUserTextForFallback }] }],
        generation_config: {
          temperature: 0.2,
          max_output_tokens: 320,
          thinking_config: { thinking_budget: 0 },
        },
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
          appendServerTrace('server_ai_assistant_fallback_recovered', `reason=${reason} ms=${fallbackElapsedMs}`, {
            reason,
            fallback_ms: fallbackElapsedMs,
            request_elapsed_ms: Date.now() - requestStartMs,
          })
          console.log(`[ai-assistant][${cid}] recovered ${reason} via compact fallback`)
          return { type: 'text', text: fallbackText }
        }
      } else {
        recordLlmCall('llm_fallback', fallbackElapsedMs, fallbackRes.status)
        console.error(`[ai-assistant][${cid}] compact fallback failed status=${fallbackRes.status} body=${fallbackRes.errText.slice(0, 180)}`)
      }
      return null
    }

    const runRecipeTextRecovery = async (reason: 'unexpected_tool_call' | 'incomplete_recipe') => {
      if (
        recipeTextRecoveryUsed ||
        !requiresCompleteRecipe ||
        !cookingRequestText ||
        remainingRequestBudgetMs() < 1000
      ) {
        return null
      }
      recipeTextRecoveryUsed = true
      const recoveryBody = {
        system_instruction: {
          parts: [{
            text: [
              'You are the Casa Tabor cooking assistant.',
              'Answer the user with one complete read-only recipe in Markdown.',
              'Include a Markdown title, a numbered Servings line, an Ingredients heading with bullets, and an Instructions heading with every numbered step.',
              'Do not call tools, save anything, emit JSON, or describe future work.',
            ].join(' '),
          }],
        },
        contents: image
          ? contents
          : [{ role: 'user', parts: [{ text: cookingRequestText }] }],
        generation_config: {
          temperature: 0.2,
          max_output_tokens: 2048,
          thinking_config: { thinking_budget: 0 },
        },
      }
      const recoveryStartMs = Date.now()
      const recoveryRes = await callModel(recoveryBody, {
        stream: false,
        timeoutMs: Math.min(SECONDARY_HARD_TIMEOUT_MS, remainingRequestBudgetMs()),
      })
      const recoveryElapsedMs = Date.now() - recoveryStartMs
      console.log(`[ai-assistant][${cid}] stage=llm_recipe_text_recovery ms=${recoveryElapsedMs} status=${recoveryRes.status}`)
      if (!recoveryRes.ok || !recoveryRes.data) {
        recordLlmCall('llm_recipe_text_recovery', recoveryElapsedMs, recoveryRes.status)
        return null
      }

      recordLlmCall('llm_recipe_text_recovery', recoveryElapsedMs, recoveryRes.status, recoveryRes.data)
      const recoveryText = recoveryRes.data.candidates?.[0]?.content?.parts
        ?.flatMap((part: { text?: string }) => typeof part.text === 'string' && part.text.trim() ? [part.text.trim()] : [])
        .join('\n') ?? ''
      const missingSections = missingCompleteRecipeSections(recoveryText)
      if (!recoveryText || missingSections.length > 0) {
        appendServerTrace('server_ai_assistant_recipe_recovery_failed', `reason=${reason}`, {
          reason,
          missing_sections: missingSections,
          recovery_ms: recoveryElapsedMs,
        })
        return null
      }
      appendServerTrace('server_ai_assistant_recipe_recovered', `reason=${reason}`, {
        reason,
        recovery_ms: recoveryElapsedMs,
      })
      return { type: 'text', text: recoveryText }
    }

    if (res.ok) {
      const data = res.data
      recordLlmCall('llm_primary', llmPrimaryMs, res.status, data)
      warnIfSlow('llm_primary', llmPrimaryMs, STAGE_SLO.llmPrimaryMs)

      const candidate = data.candidates?.[0]
      if (!candidate) return { type: 'error', code: 'llm_error', message: 'No response from AI' }

      // Check for safety/finish reason blocks
      const finishReason = candidate.finishReason
      if (finishReason === 'UNEXPECTED_TOOL_CALL' && requiresCompleteRecipe) {
        const recoveredRecipe = await runRecipeTextRecovery('unexpected_tool_call')
        if (recoveredRecipe) return recoveredRecipe
      }
      if (finishReason === 'MAX_TOKENS') {
        return {
          type: 'text',
          text: "I couldn't finish that response within the answer limit, so I left out the partial result. Please try once more.",
        }
      }
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

      const writeToolNameSet = new Set([
        'create_event',
        'update_event',
        'bulk_update_events',
        'delete_event',
        'delete_events_by_title',
        'create_recipe',
        'add_grocery_items',
        'check_grocery_item',
        'remove_grocery_item',
        'update_grocery_item_quantity',
        'clear_checked_grocery_items',
      ])
      const writeToolDeclarations = secondaryToolDeclarations.filter((tool) => writeToolNameSet.has(tool.name))
      const writeTools = writeToolDeclarations.length > 0
        ? [{ function_declarations: writeToolDeclarations }]
        : []

      const runWriteToolRescue = async (
        reason: string,
        rescueContents: GeminiContent[],
        secondaryDepth: number,
      ): Promise<GeminiPart[] | null> => {
        if (!userLikelyRequestedWrite || writeTools.length === 0 || remainingRequestBudgetMs() < 1000) {
          return null
        }
        const rescueBody = {
          system_instruction: {
            parts: [{
              text: `${systemInstruction}\n\nWRITE TOOL RESCUE: The user requested a write action. You MUST return exactly one valid function call using the available write tools. Do not return plain text first.`,
            }],
          },
          contents: rescueContents,
          generation_config: {
            temperature: 0.1,
            max_output_tokens: 512,
            thinking_config: { thinking_budget: 0 },
          },
          tools: writeTools,
          tool_config: { function_calling_config: { mode: 'ANY' } },
        }
        const rescueStartMs = Date.now()
        const rescueRes = await callModel(rescueBody, {
          stream: false,
          timeoutMs: SECONDARY_HARD_TIMEOUT_MS,
        })
        const rescueElapsedMs = Date.now() - rescueStartMs
        console.log(`[ai-assistant][${cid}] stage=llm_write_tool_rescue ms=${rescueElapsedMs} status=${rescueRes.status}`)
        if (!rescueRes.ok) {
          recordLlmCall('llm_write_tool_rescue', rescueElapsedMs, rescueRes.status)
          appendServerTrace('server_ai_assistant_write_tool_rescue_failed', `reason=${reason} status=${rescueRes.status}`, {
            reason,
            status: rescueRes.status,
            request_elapsed_ms: Date.now() - requestStartMs,
          })
          return null
        }
        const rescueData = rescueRes.data
        recordLlmCall('llm_write_tool_rescue', rescueElapsedMs, rescueRes.status, rescueData)
        appendServerTrace('server_ai_assistant_write_tool_rescue', `reason=${reason} ms=${rescueElapsedMs}`, {
          reason,
          request_elapsed_ms: Date.now() - requestStartMs,
          tool_names: writeToolDeclarations.map((tool) => tool.name),
        })
        return rescueData?.candidates?.[0]?.content?.parts ?? null
      }

      const resolveModelParts = async (parts: GeminiPart[], secondaryDepth = 0, writeRescueUsed = false) => {
        const funcCallPart = parts.find((p: { functionCall?: { name: string; args: Record<string, unknown> } }) => p.functionCall)
        const textParts = parts
          .flatMap((p) => 'text' in p && typeof p.text === 'string' && p.text.trim() ? [p.text.trim()] : [])

        if (!funcCallPart && textParts.length > 0) {
          if (userLikelyRequestedWrite && !writeRescueUsed) {
            const rescueParts = await runWriteToolRescue('text_without_tool', contents, secondaryDepth)
            if (rescueParts) {
              const rescueResolved = await resolveModelParts(rescueParts, secondaryDepth + 1, true)
              if (rescueResolved) return rescueResolved
            }
          }
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
            (name === 'search_events' && (userLikelyRequestedWrite || (resultFound && userAsksSynthesis))) ||
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
            if (name === 'search_events' && userLikelyRequestedWrite && !writeRescueUsed) {
              const rescueContents: GeminiContent[] = [
                ...contents,
                { role: 'model', parts: [funcCallPart as GeminiPart] },
                { role: 'user', parts: [{ functionResponse: { name, response: toolResult } } as GeminiPart] },
              ]
              const rescueParts = await runWriteToolRescue('search_events_no_secondary', rescueContents, secondaryDepth)
              if (rescueParts) {
                const rescueResolved = await resolveModelParts(rescueParts, secondaryDepth + 1, true)
                if (rescueResolved) return rescueResolved
              }
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
                tool_config: {
                  function_calling_config: isListRead
                    ? { mode: 'AUTO' }
                    : { mode: 'ANY', allowed_function_names: secondaryToolDeclarations.map((tool) => tool.name) },
                },
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
          const secondaryResolved = await resolveModelParts(secondaryParts, secondaryDepth + 1, writeRescueUsed)
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
          if (cookingFrame?.intent === 'cooking.add_to_grocery') {
            const policyResult = validateCookingGroceryItems(itemsList, foodProfileRaw ?? {})
            if (!policyResult.allowed) {
              appendServerTrace('server_ai_assistant_cooking_grocery_blocked', 'allergy_policy', {
                blocked_item_count: policyResult.blockedItems.length,
                semantic_intent: cookingFrame.intent,
              })
              return {
                type: 'text',
                text: `I did not add ${policyResult.blockedItems.join(', ')} because ${policyResult.blockedItems.length === 1 ? 'it conflicts' : 'they conflict'} with the household allergy profile.`,
              }
            }
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
          if (explicitReminderCreate) {
            const reminderSubject = explicitReminderSubject(reminderCreateRequestText)
            if (reminderSubject) args.title = reminderSubject
            args.event_type = 'reminder'
            const resolvedReminderRange = structuredReminderDueBy ?? reminderDaypartRange
            if (resolvedReminderRange) {
              args.start = resolvedReminderRange.start
              args.end = resolvedReminderRange.end
              args.all_day = false
            } else {
              // No deterministic date range applied (e.g. a free-form "remind
              // me at 3pm" request the LLM parsed itself) — still enforce the
              // standard 15-minute reminder duration unless the user's own
              // text explicitly requested a different length.
              const explicitDurationMinutes = parseExplicitReminderDurationMinutes(reminderCreateRequestText)
              const startMsForDuration = Date.parse(String(args.start ?? ''))
              if (Number.isFinite(startMsForDuration)) {
                args.end = new Date(
                  startMsForDuration + (explicitDurationMinutes ?? 15) * 60000,
                ).toISOString()
              }
            }
          }
          const title = typeof args.title === 'string' ? args.title.trim() : ''
          const start = typeof args.start === 'string' ? args.start : ''
          const end = typeof args.end === 'string' ? args.end : ''
          const location = typeof args.location === 'string' ? args.location.trim() : ''
          const notes = typeof args.notes === 'string' ? args.notes.trim() : ''
          const requestedReminder = typeof args.event_type === 'string' &&
            ['reminder', 'task', 'todo'].includes(args.event_type.trim().toLowerCase())
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

            if (requestedReminder) {
              return { type: 'text', text: `Got it — reminder set for "${title}".`, write_verified: true }
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
        const singularDeleteClarification = singularBulkDeleteClarification(
          latestUserText,
          name,
          args,
          allEvents ?? [],
          toLocal,
        )
        if (singularDeleteClarification) {
          return { type: 'text', text: singularDeleteClarification }
        }
        return {
          type: 'tool_action',
          tool: name,
          args,
          display_text: buildDisplayText(name, args),
        }
      }

      const initialParts = candidate.content?.parts ?? []
      const initialResolved = await resolveModelParts(initialParts)
      if (initialResolved) {
        if (requiresCompleteRecipe && initialResolved.type === 'text') {
          const missingSections = missingCompleteRecipeSections(initialResolved.text)
          if (missingSections.length > 0) {
            appendServerTrace('server_ai_assistant_recipe_incomplete', `missing=${missingSections.join(',')}`, {
              missing_sections: missingSections,
              finish_reason: finishReason ?? null,
              output_tokens: extractGeminiUsage(data).outputTokens,
            })
            const recoveredRecipe = await runRecipeTextRecovery('incomplete_recipe')
            if (recoveredRecipe) return recoveredRecipe
            return {
              type: 'error',
              code: 'incomplete_recipe',
              message: 'The recipe response was incomplete. Please try again.',
            }
          }
        }
        return initialResolved
      }

      // Rare provider edge case: use one compact, bounded fallback. Do not retry
      // the full tool prompt first; that compounds tail latency without new context.
      console.error('[ai-assistant] Empty Gemini response. finishReason:', finishReason, 'parts:', JSON.stringify(initialParts))
      const emptyResponseRecovered = await runCompactFallback('empty_response')
      if (emptyResponseRecovered) {
        return emptyResponseRecovered
      }

      return {
        type: 'text',
        text: userLikelyRequestedWrite
          ? 'I could not prepare that change safely. Nothing was changed—please say the request again.'
          : 'I heard you, but I hit a brief response issue. Please try that once more.',
      }
    }
    warnIfSlow('llm_primary', llmPrimaryMs, STAGE_SLO.llmPrimaryMs)
    recordLlmCall('llm_primary', llmPrimaryMs, res.status, res.data)
    if (!res.ok) {
      const errText = res.errText
      const isQuota = res.status === 429 || errText.includes('RESOURCE_EXHAUSTED')
      const isTimeout = res.status === 504 || errText.startsWith('model_timeout_')
      if (isTimeout) {
        const timeoutRecovered = await runCompactFallback('primary_timeout')
        if (timeoutRecovered) {
          return timeoutRecovered
        }
      }
      return {
        type: 'error',
        code: isQuota ? 'quota_exceeded' : isTimeout ? 'model_timeout' : 'llm_error',
        message: isQuota
          ? 'AI quota exceeded.'
          : isTimeout
            ? 'The AI model took too long to respond. Please try again.'
            : 'The AI model could not complete the request. Please try again.',
      }
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
    if (name === 'complete_reminder') return `Mark done: **${args.title}**`
    if (name === 'delete_events_by_title') {
      const ids = Array.isArray(args.ids) ? args.ids.filter((id): id is string => typeof id === 'string' && id.trim().length > 0) : []
      const titleQuery = String(args.title_query ?? '').trim()
      const count = Number.isFinite(Number(args.count)) ? Number(args.count) : ids.length
      const exclusion = titleQuery.match(/\bexcept\s+(.+)$/i)?.[1]?.trim()
      if (exclusion) return `Delete ${count} calendar event${count === 1 ? '' : 's'}, preserving **${exclusion}**`
      const label = titleQuery.length > 0 ? titleQuery : 'matching appointments'
      return `Delete ${count} event${count === 1 ? '' : 's'} named **${label}**`
    }
    if (name === 'add_grocery_items') {
      const items = args.items as { name: string; quantity?: string }[]
      return `Add to grocery list: ${items.map(i => `${i.name}${i.quantity ? ` (${i.quantity})` : ''}`).join(', ')}`
    }
    if (name === 'check_grocery_item') return `Mark **${args.item_name ?? 'grocery item'}** as ${args.checked ? 'done' : 'needed'}`
    if (name === 'remove_grocery_item') return `Remove **${args.item_name ?? 'this grocery item'}**`
    if (name === 'update_grocery_item_quantity') {
      return `Change grocery quantity to ${[args.quantity, args.unit].filter(Boolean).join(' ')}`
    }
    if (name === 'clear_checked_grocery_items') return 'Clear all checked grocery items'
    return `Action: ${name}`
  }

  const logUsage = () => {
    sb.from('ai_usage_log').insert({
      function_name: 'ai-assistant',
      provider: llmTelemetry.provider,
      model: llmTelemetry.model,
      input_tokens: llmTelemetry.input_tokens,
      cached_input_tokens: llmTelemetry.cached_input_tokens,
      output_tokens: llmTelemetry.output_tokens,
      cached: false,
    }).then(() => {}).catch(() => {})
  }

  try {
    const deleteAmbiguity = calendarDeleteAmbiguityClarification(
      latestUserText,
      allEvents ?? [],
      { now, utcOffset },
      toLocal,
    )
    if (intentRouting.profile === 'event' && deleteAmbiguity) {
      return {
        status: 200,
        payload: {
          type: 'text',
          text: deleteAmbiguity,
          correlation_id: cid,
          telemetry: {
            ...llmTelemetry,
            request_total_ms: Date.now() - requestStartMs,
            context_load_ms: contextLoadMs,
          },
        },
      }
    }
    const clarifiedCreate = !shouldRunAgentWrite
      ? resolveClarifiedCalendarCreate(previousUserText, latestUserText, { now })
      : null
    if (clarifiedCreate) {
      return {
        status: 200,
        payload: {
          type: 'tool_action',
          tool: clarifiedCreate.tool,
          args: clarifiedCreate.args,
          display_text: buildDisplayText(clarifiedCreate.tool, clarifiedCreate.args),
          correlation_id: cid,
          telemetry: {
            ...llmTelemetry,
            request_total_ms: Date.now() - requestStartMs,
            context_load_ms: contextLoadMs,
          },
        },
      }
    }
    const disambiguatedDelete = resolveCalendarDeleteDisambiguation(
      previousUserText,
      latestUserText,
      allEvents ?? [],
      { utcOffset },
    )
    if (disambiguatedDelete) {
      return {
        status: 200,
        payload: {
          type: 'tool_action',
          tool: disambiguatedDelete.tool,
          args: disambiguatedDelete.args,
          display_text: buildDisplayText(disambiguatedDelete.tool, disambiguatedDelete.args),
          conversation_state: eventConversationState(disambiguatedDelete.event, now),
          correlation_id: cid,
          telemetry: {
            ...llmTelemetry,
            request_total_ms: Date.now() - requestStartMs,
            context_load_ms: contextLoadMs,
          },
        },
      }
    }
    const pendingSelectiveAnswer = answerPendingSelectiveClear(latestUserText, context?.pendingAction)
    if (pendingSelectiveAnswer) {
      return {
        status: 200,
        payload: {
          type: 'text',
          text: pendingSelectiveAnswer,
          correlation_id: cid,
          telemetry: {
            ...llmTelemetry,
            request_total_ms: Date.now() - requestStartMs,
            context_load_ms: contextLoadMs,
          },
        },
      }
    }
    const mutationClarification = latestUserText ? calendarMutationClarification(latestUserText) : null
    if (intentRouting.profile === 'event' && mutationClarification) {
      return {
        status: 200,
        payload: {
          type: 'text',
          text: mutationClarification,
          correlation_id: cid,
          telemetry: {
            ...llmTelemetry,
            request_total_ms: Date.now() - requestStartMs,
            context_load_ms: contextLoadMs,
          },
        },
      }
    }
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
            route = await computeCachedTravelEta({
              mapsKey,
              origin: homeAddress,
              destination,
              arrivalTimeIso: Number.isFinite(eventStartMs) && eventStartMs > Date.now() + 2 * 60 * 1000
                ? activeConversationEvent.start_time
                : null,
              bufferMins: 10,
              signal: controller.signal,
            }, routeEtaCache)
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
      const groundedAnswer = answerGroundedEventSemanticFrame(calendarFrame, activeConversationEvent, toLocal)
        ?? answerGroundedEventFollowUp(latestUserText, activeConversationEvent, toLocal)
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
    // Skip the generic single-line deterministic fast path for app-generated
    // structured drafts (Prep & Action "Title:"/"Due:" prompts) — its regex
    // title/date/duration extraction assumes a short natural-language
    // one-liner and mangles multi-field text, producing garbage titles and a
    // hardcoded 60-minute duration. Structured drafts have their own correct
    // deterministic handling (resolveStructuredReminderDueBy) inside the LLM
    // tool-result path below, so let them fall through to that instead.
    const isStructuredDraftText = /^\s*Title:\s*\S/im.test(String(latestUserText ?? ''))
    if (intentRouting.profile === 'event' && latestUserText && !context.focusedEvent && !isStructuredDraftText) {
      const rawDeterministicMutation = resolveDeterministicEventMutation(
        latestUserText,
        allEvents ?? [],
        {
          now,
          utcOffset,
          familyNames: (context.family as { name: string }[]).map((member) => member.name),
        },
      )
      const deterministicMutation = rawDeterministicMutation?.event
        ? scopeCanonicalMutation(
            latestUserText,
            rawDeterministicMutation,
            rawDeterministicMutation.event,
          )
        : rawDeterministicMutation
      if (deterministicMutation) {
        const reminderSubject = explicitReminderCreate
          ? explicitReminderSubject(reminderCreateRequestText)
          : null
        const deterministicArgs = (
          deterministicMutation.tool === 'create_event' &&
          explicitReminderCreate
        )
          ? {
              ...deterministicMutation.args,
              ...(reminderSubject ? { title: reminderSubject } : {}),
              event_type: 'reminder',
            }
          : deterministicMutation.args
        const requestTotalMs = Date.now() - requestStartMs
        appendServerTrace(
          'server_ai_assistant_deterministic_mutation',
          `tool=${deterministicMutation.tool} ms=${requestTotalMs}`,
          {
            tool: deterministicMutation.tool ?? null,
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
            type: deterministicMutation.tool ? 'tool_action' : 'text',
            tool: deterministicMutation.tool,
            args: deterministicArgs,
            text: deterministicMutation.text,
            display_text: deterministicMutation.tool
              ? buildDisplayText(deterministicMutation.tool, deterministicArgs)
              : undefined,
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
      userRequestedWrite: userRequestedWriteIntent,
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
        cached_input_tokens: llmTelemetry.cached_input_tokens,
        output_tokens: llmTelemetry.output_tokens,
        thought_tokens: llmTelemetry.thought_tokens,
        total_tokens: llmTelemetry.total_tokens,
        image_context: imageContext,
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
      authoritative_provenance: cookingFrame
        ? {
            source: 'cooking_language_contract',
            semantic_intent: cookingFrame.intent,
          }
        : undefined,
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
