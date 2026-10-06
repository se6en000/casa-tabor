import { createClient } from 'npm:@supabase/supabase-js@2'
import { placeOnCard } from '../_shared/ai-event-edit.mjs'
import { optionalEnv, requireEnv } from '../_shared/env.mjs'
import { createSupabaseRouteEtaCache } from '../_shared/route-eta-cache.mjs'
import { PLANNING_GEMINI_MODEL, PRIMARY_GEMINI_MODEL } from '../_shared/llm-model-policy.mjs'
import { normalizeAssistantExperienceMode } from '../_shared/assistant-experience-mode.mjs'
import { formatLocal, humanWhen, localNowLine } from '../_shared/assistant-local-time.mjs'
import { applyDraftChanges, buildAnswerPrompt, draftOverlaps, buildTurnPrompt, changeArgs, hasTurnToRead, newItemArgs, openDraft, readTurnResolution, referentIds, sameDayChoices, settleDate, carryOverChange, buildAsidePrompt, readAsideCheck, aboutMail } from '../_shared/assistant-turn-context.mjs'
import {
  resolveTalkPlanIntentGate,
  shouldUseTalkPlanDeterministicLane,
} from '../_shared/talk-plan-intent-gate.mjs'
import { isPlanningProposalAcceptance } from '../_shared/talk-plan-proposal-state.mjs'
import { checkAiCircuitBreaker, createTrackedMapsFetch, createTrackedProviderFetch } from '../_shared/provider-call-ledger.mjs'
import {
  classifyAssistantIntent,
  shouldUseTalkPlanCalendarCommandLane,
} from '../_shared/assistant-intent-profile.mjs'
import { isHouseholdDirectoryQuestion } from '../_shared/assistant-household-directory.mjs'
import { canonicalizeFamilyReferences } from '../_shared/family-identity.mjs'
import { isCalendarMutationDisambiguationFollowUp } from '../_shared/assistant-calendar-mutation-edge.mjs'
import { calendarClarificationConversationState, calendarDateNeededConversationState, calendarRangeConversationState, eventConversationState, normalizeConversationState } from '../_shared/assistant-conversation-grounding.mjs'
import { filterImmediateFamilyMembers } from '../_shared/immediate-family-scope.mjs'
import { inheritCalendarReadScope, isBareCalendarAddRequest, isCalendarLikeLanguage, parseCalendarLanguage } from '../_shared/assistant-calendar-language.mjs'
import { preferredAssistantLanguageDomain, shouldPreferCalendarOverGrocery } from '../_shared/assistant-domain-arbitration.mjs'
import { calendarRangeForScope } from '../_shared/assistant-calendar-semantic-read.mjs'
import {
  cookingFrameGuidance,
  isCookingRetryLanguage,
  isCookingLikeLanguage,
  parseCookingLanguage,
} from '../_shared/assistant-cooking-language.mjs'
import {
  isGroceryLikeLanguage,
  parseGroceryLanguage,
} from '../_shared/assistant-grocery-language.mjs'
import { classifyAssistantAmbiguity } from '../_shared/assistant-request-safety.mjs'
import { groceryAddedText, saveGroceryItems } from '../_shared/assistant-grocery-write.mjs'
import { draftPlace } from '../_shared/event-place-resolution.mjs'
import { resolveBugReportRequest } from '../_shared/assistant-memory-insights.mjs'
import { retrieveFamilyContext } from '../_shared/retrieve-family-context.mjs'
import { verifyProfileSessionToken } from '../_shared/profile-session.mjs'
import { explicitReminderCreateRequestForMessages, explicitReminderSearchForMessages, hasReminderLanguage, isExplicitReminderCompletion, isExplicitReminderRequest, isReminderCompletionFollowUp, looksLikeCompoundCalendarRequest, reminderCreateClarification, resolveExplicitReminderDaypartRange, resolveStructuredReminderDueBy } from '../_shared/assistant-reminder-intent.mjs'
import { runLookup } from './lookups.ts'
import { defaultPeople, dueThought, mayChangeMemory, readRemember, speakerLine } from '../_shared/casa-memory.mjs'
import { promisesAction } from '../_shared/assistant-full-ai.mjs'
import { READ_TOOLS, buildFullAiSystem, isTripTalk, alreadyOnCalendar, alreadyOnCalendarText, describesExistingLeg, tripLegOf, fullAiRequest, fullAiStatus, promisesLookup, fullAiTools, THINK_IT_THROUGH, flubSignal, fullAiCard, fullAiContents, fullAiWindow, giftIdeasForViewer, choresForCasa, todoForCasa, comingUpForModel, mentionedIds, findEventsRange, describeFoundEvents, emailSearchWords, rankEmails, writtenCall, readShowDay, directionsFor, askAddress, addressReply } from '../_shared/assistant-full-ai.mjs'

// Thinking for the drawer's turn and the answers it writes stays off (a small budget only for
// the full profile's main call). Tested 2026-09-26 on lifelike conversations: medium thinking
// (1,024) was no more right (14 vs 13 of 22 turns) and ~3x slower (6.8 s vs 2.4 s typical), and
// skipping the turn-reading rules fell to 6/22 — so the fast path with the rules stays. A dry run
// can still set a budget (`thinking_budget_override`), for the next side-by-side test.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-casa-history-session',
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

type MemoryRow = {
  id: string
  title: string
  content: string
  scope: 'personal' | 'household'
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

// ── A turn in its conversation (assistant-turn-context.mjs). ──────────────────────────
const TURN_CONTEXT_TIMEOUT_MS = 4500
// deno-lint-ignore no-explicit-any
type TurnDb = { from: (table: string) => any }
const WRITE_TOOLS = new Set(['create_event', 'update_event', 'bulk_update_events', 'delete_event', 'delete_events_by_title', 'complete_reminder', 'add_grocery_items', 'check_grocery_item', 'remove_grocery_item', 'update_grocery_item_quantity', 'clear_checked_grocery_items', 'add_gift_idea', 'add_to_coming_up', 'add_coming_up_rule', 'change_coming_up_item', 'add_todo', 'plan_project', 'save_address', 'add_prep_item', 'keep_me_posted'])
let llmConfigCache: { at: number; value: Record<string, unknown> | null } | null = null
async function loadLlmConfig(sb: TurnDb): Promise<Record<string, unknown> | null> {
  if (llmConfigCache && Date.now() - llmConfigCache.at < 60_000) return llmConfigCache.value
  const { data } = await sb.from('settings').select('value').eq('key', 'llm_config').limit(1)
  const value = ((data as Array<{ value?: unknown }> | null)?.[0]?.value ?? null) as Record<string, unknown> | null
  llmConfigCache = { at: Date.now(), value }
  return value
}

/** Thinking takes time: a call that thinks gets this much longer before it's given up on. */
function thinkingAllowanceMs(thinkingBudget: number): number {
  return thinkingBudget > 0 ? 8_000 : 0
}

/** One small JSON call to the family's configured Gemini model (tracked like every other call). */
async function geminiJson(sb: TurnDb, prompt: string, purpose: string, cid: string, timeoutMs: number, thinkingBudget = 0): Promise<unknown> {
  const config = await loadLlmConfig(sb)
  const apiKey = String(config?.api_key ?? '')
  const model = String(config?.model ?? DEFAULT_GEMINI_MODEL)
  if (!apiKey) throw new Error('no model configured')
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs + thinkingAllowanceMs(thinkingBudget))
  try {
    const res = await providerFetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0, responseMimeType: 'application/json', thinkingConfig: { thinkingBudget } },
      }),
      signal: controller.signal,
    }, { callPurpose: purpose, correlationId: cid, model })
    const body = await res.json()
    const text = body?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? '').join('') ?? ''
    return JSON.parse(text)
  } finally {
    clearTimeout(timer)
  }
}

type TurnReferent = { id: string; title: string; start_time: string; end_time: string; all_day: boolean; event_type: string | null; updated_at?: string; people: string[]; drivers: string[]; place: string | null; address: string | null; repeating: boolean }

/** The calendar items a conversation is about, with who's on them and who drives. */
async function loadReferents(sb: TurnDb, ids: string[], family: Array<{ id: string; name: string }>): Promise<TurnReferent[]> {
  if (ids.length === 0) return []
  const [events, members, plans] = await Promise.all([
    sb.from('events').select('id, title, start_time, end_time, all_day, event_type, location_name, address, updated_at, series_id, recurrence_master_id, rrule, record_kind').in('id', ids),
    sb.from('event_members').select('event_id, family_member_id, role').in('event_id', ids),
    sb.from('event_plan_overrides').select('event_id, transportation_plan').in('event_id', ids),
  ])
  const nameOf = (id: string | null) => family.find((m) => m.id === id)?.name ?? null
  const rows = (events.data ?? []) as Array<Record<string, unknown>>
  return ids.flatMap((id) => {
    const e = rows.find((r) => r.id === id)
    if (!e) return []
    const legs = (((plans.data ?? []) as Array<{ event_id: string; transportation_plan: unknown }>).find((p) => p.event_id === id)?.transportation_plan as { legs?: Array<{ driverId?: string }> } | null)?.legs ?? []
    return [{
      id,
      title: String(e.title ?? ''),
      start_time: String(e.start_time),
      end_time: String(e.end_time),
      all_day: e.all_day === true,
      event_type: (e.event_type as string) ?? null,
      updated_at: e.updated_at as string | undefined,
      people: ((members.data ?? []) as Array<{ event_id: string; family_member_id: string; role: string }>)
        .filter((m) => m.event_id === id && m.role !== 'driver').map((m) => nameOf(m.family_member_id)).filter((n): n is string => Boolean(n)),
      drivers: [...new Set(legs.map((l) => nameOf(l.driverId ?? null)).filter((n): n is string => Boolean(n)))],
      place: String(e.location_name ?? e.address ?? '').split(',')[0].trim() || null,
      address: [e.location_name, e.address].filter((v, i, all) => v && all.indexOf(v) === i).join(' — ') || null,
      repeating: Boolean(e.series_id || e.recurrence_master_id || e.rrule || (e.record_kind && e.record_kind !== 'single')),
    }]
  })
}

type TurnContext = {
  resolution: ReturnType<typeof readTurnResolution> | null
  /** A card to show: a revised draft, a new item, or a change to one calendar item. */
  card: { tool: string; args: Record<string, unknown>; about: TurnReferent | null; note?: string } | null
  cancelledDraft: { tool: string } | null
  /** A question about one calendar item, answered from its facts. */
  /** `calendarSays` false: the calendar doesn't hold the answer (the hybrid's layer 2 can look it up). */
  answer: { text: string; about: TurnReferent | null; mentioned: TurnReferent[]; calendarSays?: boolean } | null
  /** A change that could mean several items: which one? (The change is kept for the answer.) */
  clarify: { question: string; candidates: TurnReferent[]; changes: Record<string, unknown> | null } | null
  referents: TurnReferent[]
  originalText: string | null
  /** Get & pack by voice: a line for one event's list, as a card. */
  prepCard?: { tool: string; args: Record<string, unknown>; about: TurnReferent | null } | null
  keepPostedCard?: { tool: string; args: Record<string, unknown> } | null
  ms: number
}

const TURN_UPCOMING_DAYS = 14
const TURN_UPCOMING_CAP = 60
const TURN_BUDGET_MS = 7000
/** Version D's one call gets room to think, so time limits don't decide the comparison. */
// Room to think and look things up while talking something through (P3.25 phase 1; Jake: "extra time
// is fine when planning, as long as it does a good job") — the band shows what it's doing meanwhile.
const FULL_AI_TIMEOUT_MS = 45_000
// A project plan is a long answer, like a recipe (a live one hit the 9 s limit, 2026-09-28).
const PROJECT_PLAN_REQUEST = /\b(?:project|break (?:it|this|that) down|steps? (?:to|for)|plan (?:out|for))\b/i
/** The hybrid for real turns (P3.17). */
const HYBRID_LAYER2_LIVE = true

/** The next two weeks of the calendar, for reading what a turn refers to. */
async function loadUpcomingIds(sb: TurnDb): Promise<string[]> {
  const from = new Date(Date.now() - 12 * 3600e3).toISOString()
  const until = new Date(Date.now() + TURN_UPCOMING_DAYS * 86400e3).toISOString()
  const { data } = await sb.from('events').select('id').is('deleted_at', null).eq('status', 'confirmed').neq('record_kind', 'series_template')
    .gte('start_time', from).lt('start_time', until).order('start_time').limit(TURN_UPCOMING_CAP)
  return ((data ?? []) as Array<{ id: string }>).map((r) => r.id)
}

/**
 * Reads the latest turn in its conversation before anything else does. Fails open: if
 * the call is slow or its answer malformed, the turn goes on exactly as it was said.
 */
async function resolveTurnContext(
  sb: TurnDb,
  messages: Array<{ role: string; content: string }>,
  context: Record<string, unknown> | null | undefined,
  cid: string,
  thinkingBudget = 0,
): Promise<TurnContext> {
  const none: TurnContext = { resolution: null, card: null, cancelledDraft: null, answer: null, clarify: null, referents: [], originalText: null, ms: 0 }
  if (!Array.isArray(messages) || !hasTurnToRead(messages)) return none
  const started = Date.now()
  // Never the reason a turn is slow: past its budget, the turn goes on as it was said.
  const budget = new Promise<TurnContext>((resolve) => setTimeout(() => resolve({ ...none, ms: Date.now() - started }), TURN_BUDGET_MS + 2 * thinkingAllowanceMs(thinkingBudget)))
  return await Promise.race([readTurn(sb, messages, context, cid, started, thinkingBudget), budget])
}

async function readTurn(
  sb: TurnDb,
  messages: Array<{ role: string; content: string }>,
  context: Record<string, unknown> | null | undefined,
  cid: string,
  started: number,
  thinkingBudget = 0,
): Promise<TurnContext> {
  const none: TurnContext = { resolution: null, card: null, cancelledDraft: null, answer: null, clarify: null, referents: [], originalText: null, ms: 0 }
  const pendingAction = context?.pendingAction as { tool?: string; args?: Record<string, unknown> } | undefined
  const family = (Array.isArray(context?.family) ? context.family : []) as Array<{ id: string; name: string; role?: string }>
  const familyNames = family.map((m) => m.name)
  const utcOffset = (context?.utcOffset as string) ?? '-04:00'
  const draft = openDraft(pendingAction)
  const ids = referentIds(context?.conversationState, pendingAction)
  const nowLine = localNowLine(String(context?.currentDate ?? new Date().toISOString()), utcOffset)
  try {
    const upcomingIds = await loadUpcomingIds(sb)
    const loaded = await loadReferents(sb, [...new Set([...ids, ...upcomingIds])], family)
    const referents = ids.flatMap((id) => loaded.filter((e) => e.id === id))
    const upcoming = loaded.filter((e) => !ids.includes(e.id))
    const raw = await geminiJson(sb, buildTurnPrompt({ messages, draft, referents, upcoming, family, nowLine, utcOffset, nowIso: String(context?.currentDate ?? new Date().toISOString()) }), 'turn-context', cid, TURN_CONTEXT_TIMEOUT_MS, thinkingBudget)
    const asked = context?.conversationState as { activeEntityType?: string; pendingMutation?: { tool?: string } } | undefined
    const pendingChange = asked?.activeEntityType === 'calendar_clarification' && asked.pendingMutation?.tool === 'turn_change'
    const offsetMin = (() => { const m = /^([+-])(\d{2}):(\d{2})$/.exec(utcOffset); return m ? (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) : 0 })()
    const localToday = new Date(Date.parse(String(context?.currentDate ?? new Date().toISOString())) + offsetMin * 60000).toISOString().slice(0, 10)
    const resolution = readTurnResolution(raw, { draft, knownIds: loaded.map((e) => e.id), pendingChange, today: localToday, heard: String(messages.at(-1)?.content ?? '') })
    // An aside gets a second look that asks only who the words were said to (overnight queue 4: with a
    // card waiting, a new subject said to Casa was dropped). Unsure, or no answer: it's for Casa.
    if (resolution.act === 'aside') {
      const second = await geminiJson(sb, buildAsidePrompt({ messages }), 'aside-check', cid, 4000).catch(() => null)
      if (readAsideCheck(second) === 'casa') resolution.act = 'other'
    }
    // Days are settled here, not by the model: a bare weekday is the next one.
    const nowIso = String(context?.currentDate ?? new Date().toISOString())
    const settle = (fields: Record<string, unknown> | null) => {
      if (fields && typeof fields.date === 'string') fields.date = settleDate(fields.date, fields.date_basis as string, nowIso, utcOffset)
    }
    settle(resolution.newItem as Record<string, unknown> | null)
    settle(resolution.draftChanges as Record<string, unknown> | null)
    settle(resolution.day as Record<string, unknown> | null)
    const originalText = String(messages.at(-1)?.content ?? '')
    const about = resolution.eventId ? loaded.find((e) => e.id === resolution.eventId) ?? null : null
    const out: TurnContext = { ...none, resolution, referents: about && !referents.includes(about) ? [about, ...referents] : referents, originalText }
    if (resolution.act === 'revise_draft' && draft) {
      out.card = { tool: draft.tool, args: applyDraftChanges(draft, resolution.draftChanges, { utcOffset, familyNames }), about: null }
    } else if (resolution.act === 'none' && resolution.closesDraft && draft) {
      out.cancelledDraft = { tool: draft.tool }
    } else if (resolution.prep) {
      // Get & pack by voice (bug report 2026-09-29; Jake 2026-09-30: "dry Liv's cleats"): a line on that
      // event's list, as a card — ahead of a plain add ("can you add check Olivia's softball shoes…" was
      // read as an add and became an all-day event).
      const prep = resolution.prep
      const card = fullAiCard({ name: 'add_prep_item', args: { event_id: prep.eventId, item: prep.item } }, { events: loaded, utcOffset, now: new Date() }) as { tool?: string; args?: Record<string, unknown> }
      if (card.tool && card.args) out.prepCard = { tool: card.tool, args: card.args, about: loaded.find((e) => e.id === prep.eventId) ?? null }
    } else if (resolution.keepPosted) {
      // Keep me posted, said in any words (canvas 15e; live 2026-09-30: the model said "I'll make a card" and
      // made none): the card, from the reader's words for who or what.
      const card = fullAiCard({ name: 'keep_me_posted', args: { about: resolution.keepPosted } }, { events: loaded, utcOffset, now: new Date() }) as { tool?: string; args?: Record<string, unknown> }
      if (card.tool && card.args) out.keepPostedCard = { tool: card.tool, args: card.args }
    } else if (resolution.act === 'add') {
      const args = newItemArgs(resolution.newItem, { utcOffset, familyNames })
      if (args) out.card = { tool: 'create_event', args, about: null }
    } else if (resolution.act === 'remove' && about && !about.repeating) {
      // Taking one item off (Jake's bug report 2026-09-30 17:47: "cancel the softball game tonight" was read
      // as a title change): the delete card for the item named; a repeating one goes on to the full assistant.
      const card = fullAiCard({ name: 'delete_event', args: { id: about.id } }, { events: loaded, utcOffset, now: new Date() }) as { tool?: string; args?: Record<string, unknown> }
      if (card.tool && card.args) out.card = { tool: card.tool, args: { ...card.args, start: about.start_time, all_day: about.all_day }, about, note: resolution.calledOff ? 'Sorry it’s off. ' : '' }
    } else if (resolution.act === 'change' && about && !about.repeating) {
      // Answering Casa's "which one?": apply the change asked for then to the item picked now.
      const asked = context?.conversationState as { activeEntityType?: string; candidateEvents?: Array<{ id: string }>; pendingMutation?: { tool?: string; args?: Record<string, unknown> } } | undefined
      if (asked?.activeEntityType === 'calendar_clarification' && asked.pendingMutation?.tool === 'turn_change' && asked.candidateEvents?.some((c) => c.id === about.id)) {
        resolution.draftChanges = carryOverChange(asked.pendingMutation.args ?? null, resolution.draftChanges as Record<string, unknown> | null, about, utcOffset)
      }
      const dayOf = (e: TurnReferent) => formatLocal(e.start_time, utcOffset).split(',').slice(0, 2).join(',')
      const choices = sameDayChoices(about, loaded.filter((e) => dayOf(e) === dayOf(about)), { latestText: originalText, conversationIds: ids, utcOffset }) as TurnReferent[] | null
      if (choices) {
        const when = (e: TurnReferent) => formatLocal(e.start_time, utcOffset).split(', ').pop()
        out.clarify = { question: `Which one did you mean: ${choices.map((e) => `${e.title} at ${when(e)}`).join(', or ')}?`, candidates: choices, changes: resolution.draftChanges as Record<string, unknown> | null }
      } else {
        const args = changeArgs(about, resolution.draftChanges, { utcOffset, familyNames })
        if (args) out.card = { tool: 'update_event', args, about }
      }
    } else if (resolution.act === 'clarify' && resolution.clarifyQuestion) {
      out.clarify = { question: resolution.clarifyQuestion, candidates: (resolution.candidates as string[]).flatMap((id: string) => loaded.filter((e) => e.id === id)), changes: resolution.draftChanges as Record<string, unknown> | null }
    } else if (resolution.search) {
      // A whole-calendar question (any / every / the last time / the past; bug report 2026-09-27): searched
      // here, then answered from what was found — the model alone answered from the next weeks, or said it
      // could only see three weeks.
      const searched = await searchCalendar(sb, resolution.search, { now: new Date(), utcOffset, family })
      if (!('error' in searched)) {
        const { text, mentioned, calendarSays } = await answerFromCalendar(sb, resolution.standalone ?? originalText, searched.found, context, cid, thinkingBudget)
        out.answer = { text, about: null, mentioned, calendarSays }
      }
    } else if (resolution.act === 'question' && (about || resolution.answerable)) {
      // About one item, or answerable from the next two weeks it's holding: answered from those facts.
      const focus = about ? [about, ...loaded.filter((e) => e !== about)] : [...referents, ...loaded.filter((e) => !referents.includes(e))]
      const { text, mentioned, calendarSays } = await answerFromCalendar(sb, resolution.standalone ?? originalText, focus, context, cid, thinkingBudget)
      out.answer = { text, about, mentioned, calendarSays }
    }
    return { ...out, ms: Date.now() - started }
  } catch (error) {
    console.warn(`[ai-assistant][${cid}] turn context skipped: ${error instanceof Error ? error.message : String(error)}`)
    return { ...none, ms: Date.now() - started }
  }
}

/**
 * The whole calendar, past and future (Jake, 2026-09-28: "search my whole calendar"): a day, a span, and/or
 * words that must all appear in the title or place; no dates → two years either way. Used by the full
 * model's find_events and, when the turn reader says a question needs it, by the server directly.
 */
async function searchCalendar(sb: TurnDb, args: Record<string, unknown> | undefined, { now, utcOffset, family }: { now: Date; utcOffset: string; family: Array<{ id: string; name: string }> }): Promise<{ from: string; to: string; found: TurnReferent[]; more: boolean } | { error: string }> {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
  const range = findEventsRange(args, today)
  if (!range) return { error: 'Dates must be YYYY-MM-DD' }
  const dayAfter = new Date(Date.parse(`${range.to}T12:00:00Z`) + 86400e3).toISOString().slice(0, 10)
  let q = sb.from('events').select('id').is('deleted_at', null).neq('status', 'cancelled').neq('record_kind', 'series_template')
    .gte('start_time', `${range.from}T00:00:00${utcOffset}`).lt('start_time', `${dayAfter}T00:00:00${utcOffset}`)
  // Every word must appear, in the title or the place.
  for (const w of range.words) q = q.or(`title.ilike.%${w}%,location_name.ilike.%${w}%`)
  const { data, error } = await q.order('start_time').limit(30)
  if (error) return { error: 'The calendar search failed' }
  const ids = ((data ?? []) as Array<{ id: string }>).map((r) => r.id)
  return { from: range.from, to: range.to, found: await loadReferents(sb, ids, family), more: ids.length === 30 }
}

/** The conversation state after an answer: the one item it was about, or the items it named in order. */
function answerState(mentioned: TurnReferent[], about: TurnReferent | null): Record<string, unknown> | null {
  const items = mentioned.length ? mentioned : about ? [about] : []
  if (items.length === 1) return eventConversationState(items[0], new Date())
  if (items.length === 0) return null
  const starts = items.map((e) => Date.parse(e.start_time)).filter(Number.isFinite)
  const ends = items.map((e) => Date.parse(e.end_time)).filter(Number.isFinite)
  try {
    return calendarRangeConversationState({ start: new Date(Math.min(...starts)).toISOString(), end: new Date(Math.max(...ends, Math.min(...starts) + 60e3)).toISOString(), label: 'the items just listed' }, items, new Date())
  } catch {
    return null
  }
}

/** A question's answer from the calendar, the item it's about first (drivers included). */
async function answerFromCalendar(
  sb: TurnDb,
  question: string,
  events: TurnReferent[],
  context: Record<string, unknown> | null | undefined,
  cid: string,
  thinkingBudget = 0,
): Promise<{ text: string; mentioned: TurnReferent[] }> {
  const utcOffset = (context?.utcOffset as string) ?? '-04:00'
  let known = events
  // With a draft on screen, the whole next two weeks — "does that clash" needs every item on its day.
  const hasDraft = Boolean(openDraft(context?.pendingAction as { tool: string; args: Record<string, unknown> } | undefined))
  if (known.length < 2 || hasDraft) {
    const family = (Array.isArray(context?.family) ? context.family : []) as Array<{ id: string; name: string }>
    known = await loadReferents(sb, [...new Set([...events.map((e) => e.id), ...(await loadUpcomingIds(sb))])], family)
  }
  const line = (e: TurnReferent) => `- [${e.id}] ${e.title} — ${formatLocal(e.start_time, utcOffset)}${e.all_day ? ' (all day)' : ''}${e.people.length ? ` — people: ${e.people.join(', ')}` : ''} — drivers: ${e.drivers.length ? e.drivers.join(', ') : 'none set'}${e.address ? ` — place: ${e.address}` : ''}${e.event_type === 'reminder' ? ' (a reminder)' : ''}`
  const draft = openDraft(context?.pendingAction as { tool: string; args: Record<string, unknown> } | undefined)
  const prompt = buildAnswerPrompt({
    question,
    calendarLines: known.map(line),
    nowLine: localNowLine(String(context?.currentDate ?? new Date().toISOString()), utcOffset),
    draft,
    utcOffset,
    overlaps: draft ? draftOverlaps(draft, known).map((e) => `${e.title} (${formatLocal(e.start_time, utcOffset)})`) : [],
  })
  const out = await geminiJson(sb, prompt, 'question-answer', cid, 6000, thinkingBudget) as { answer?: string; mentioned?: string[]; calendar_says?: boolean }
  const mentioned = (Array.isArray(out?.mentioned) ? out.mentioned : []).flatMap((id) => known.filter((e) => e.id === id))
  return { text: String(out?.answer ?? '').trim() || 'I couldn’t find that on the calendar.', mentioned, calendarSays: out?.calendar_says !== false }
}

function sanitizeIngressText(value: unknown, maxLen = 1800): string | null {
 if (typeof value !== 'string') return null
 const normalized = value.replace(/\s+/g, ' ').trim()
 if (!normalized) return null
 return normalized.slice(0, maxLen)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })

  // Answer up front while the AI circuit breaker pauses user traffic. Otherwise the
  // first blocked provider call (the family-data retrieval embedding) surfaces as a
  // misleading "could not search your family data" error. HTTP 200 so the client's
  // non-streaming path renders the message instead of a generic transport failure.
  if ((await checkAiCircuitBreaker('user')).blocked) {
    return new Response(JSON.stringify({
      type: 'error',
      code: 'ai_paused',
      message: 'The assistant is paused by the circuit breaker.',
    }), {
      status: 200,
      headers: { ...CORS, 'content-type': 'application/json' },
    })
  }

  const sb = createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'))
  const profileToken = req.headers.get('x-casa-history-session')?.trim()
  let activeMemberId: string | null = null
  if (profileToken) {
    try {
      const session = await verifyProfileSessionToken({
        token: profileToken,
        secret: requireEnv('AI_HISTORY_SESSION_SECRET'),
        loadCredentialVersion: async (claims: { role: string; member_id: string | null }) => {
          const query = sb
            .from('ai_history_pin_credentials')
            .select('credential_version')
            .eq('credential_kind', claims.role)
          const { data, error } = claims.role === 'family_member'
            ? await query.eq('member_id', claims.member_id).maybeSingle()
            : await query.is('member_id', null).maybeSingle()
          if (error) throw error
          return data?.credential_version ?? null
        },
      })
      activeMemberId = session.role === 'family_member' ? session.member_id : null
    } catch (error) {
      return new Response(JSON.stringify({
        type: 'error',
        code: 'profile_session_invalid',
        message: error instanceof Error ? error.message : String(error),
      }), {
        status: 401,
        headers: { ...CORS, 'content-type': 'application/json' },
      })
    }
  }
  const routeEtaCache = createSupabaseRouteEtaCache(sb)
  const mapsKey = optionalEnv('GOOGLE_MAPS_API_KEY', '')
  const braveKey = optionalEnv('BRAVE_API_KEY', '')

  const requestBody = await req.json()
  let messages = requestBody.messages
  let context = requestBody.context
  const {
    image: singleImageRaw,
    images: imagesArrayRaw,
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
    model_access_check: modelAccessCheckRaw,
    private_conversation_id: privateConversationIdRaw,
  } = requestBody

  const rawImagesList: ImagePayload[] = Array.isArray(imagesArrayRaw)
    ? (imagesArrayRaw as ImagePayload[]).filter((img): img is ImagePayload => Boolean(img && typeof img.data === 'string' && typeof img.mimeType === 'string'))
    : singleImageRaw && typeof (singleImageRaw as ImagePayload).data === 'string' && typeof (singleImageRaw as ImagePayload).mimeType === 'string'
      ? [singleImageRaw as ImagePayload]
      : []
  const hasImages = rawImagesList.length > 0
  const image = hasImages ? rawImagesList[0] : null
  const wantStream = streamRaw === true
  // Assigned by the SSE ReadableStream controller when streaming; no-op otherwise.
  // Token-producing LLM calls forward text deltas through this so the client can
  // render the answer progressively. Default no-op = identical non-streaming behavior.
  let emitToken: (delta: string) => void = () => {}
  // A line on the band while the turn runs ("Searching the web: …"), streamed as `status` events.
  let emitStatus: (text: string) => void = () => {}
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
  // Side-by-side tests only (scripts/assistant-situations --thinking=…): a dry run may ask for a
  // thinking budget. Real turns never can: null keeps each call's own fast setting.
  const thinkingOverrideRaw = (context as Record<string, unknown> | undefined)?.thinking_budget_override
  const drawerThinkingBudget = dryRun && typeof thinkingOverrideRaw === 'number' && Number.isInteger(thinkingOverrideRaw) && thinkingOverrideRaw >= 0 && thinkingOverrideRaw <= 2048
    ? thinkingOverrideRaw
    : null
  const privateConversationId = typeof privateConversationIdRaw === 'string' && privateConversationIdRaw.trim()
    ? privateConversationIdRaw.trim()
    : null
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
  const experienceMode = normalizeAssistantExperienceMode(context?.experience_mode)
  const NORMAL_REQUEST_HARD_TIMEOUT_MS = 9000
  const TALK_PLAN_REQUEST_HARD_TIMEOUT_MS = 20000
  const RECIPE_REQUEST_HARD_TIMEOUT_MS = 15000
  const IMAGE_REQUEST_HARD_TIMEOUT_MS = 26000
  let requestHardTimeoutMs = NORMAL_REQUEST_HARD_TIMEOUT_MS
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
  // The turn in its conversation, read before anything else looks at the latest message:
  // a revision or a call-off of the open draft is answered directly (in run()), and any
  // other turn goes on as a complete request, pointed at the calendar item it's about.
  // Side-by-side tests only: a dry run may skip the turn-reading rules, so the model with its
  // tools handles the turn by itself (does the rule layer help or hurt?). Real turns always read.
  const turnRulesOff = dryRun && (context as Record<string, unknown> | undefined)?.turn_rules_off === true
  // Version D (P3.16): Gemini with the family's data in its context and a few broad tools — its
  // own path, no rules. Dry runs only (side-by-side tests); real turns never take it.
  const fullAi = dryRun && (context as Record<string, unknown> | undefined)?.full_ai === true
  // The hybrid's layer 2 (P3.17): off for real turns until the side-by-side runs hold up; a dry run
  // can turn it on (`hybrid: true`) or off (`hybrid: false`) to compare.
  const hybridRequested = (context as Record<string, unknown> | undefined)?.hybrid
  const hybridLayer2 = dryRun && typeof hybridRequested === 'boolean' ? hybridRequested : HYBRID_LAYER2_LIVE
  const turnContext = image || turnRulesOff || fullAi ? null : await resolveTurnContext(sb, messages, context, cid, drawerThinkingBudget ?? 0)
  const turnResolution = turnContext?.resolution ?? null
  // Words not said to Casa, heard by the wall's open mic (P3.13): no reply, nothing changes.
  // (Only once Casa has answered: the first thing said follows the wake word or a tap, so it's for Casa —
  // "I'm thinking about redoing the backyard, can you help me think it through?" was dropped, 2026-09-29.)
  const asideOnWall = turnResolution?.act === 'aside' && context?.page === 'wall' && Array.isArray(messages) && (messages as Array<{ role?: string }>).some((m) => m?.role === 'assistant')
  if (turnResolution && !asideOnWall && !turnContext?.card && !turnContext?.cancelledDraft && !turnContext?.answer && !turnContext?.clarify && Array.isArray(messages) && messages.length > 0) {
    const last = messages[messages.length - 1]
    if (turnResolution.standalone && last?.role === 'user' && turnResolution.standalone !== String(last.content ?? '').trim()) {
      messages = [...messages.slice(0, -1), { ...last, content: turnResolution.standalone }]
    }
    // The rewritten turn carries its own context now: the state only points at the one item it's about, if any.
    const about = turnResolution.eventId ? turnContext?.referents.find((r) => r.id === turnResolution.eventId) : null
    context = { ...context, conversationState: about ? eventConversationState(about, new Date()) : undefined }
  }
  const userMessageTexts = Array.isArray(messages)
    ? messages.flatMap((msg) =>
      msg && typeof msg === 'object' && msg.role === 'user' && typeof msg.content === 'string'
        ? [sanitizeIngressText(msg.content, 2000)]
        : []
    ).filter((text): text is string => Boolean(text))
    : []
  const familyMembers = filterImmediateFamilyMembers(Array.isArray(context?.family) ? context.family : [])
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
  const incomingConversationState = normalizeConversationState(context?.conversationState) ??
    (context?.focusedEvent ? eventConversationState(context.focusedEvent, new Date()) : null)
  const acceptedPlanningProposal = Boolean(
    experienceMode === 'talk_plan' &&
    incomingConversationState?.activeEntityType === 'planning_proposal' &&
    isPlanningProposalAcceptance(latestUserText),
  )
  const reminderCompletionFollowUp = isReminderCompletionFollowUp(
    latestUserText,
    incomingConversationState,
  )
  const explicitReminderCreate = Boolean(
    reminderCreateRequestText &&
    isExplicitReminderRequest(reminderCreateRequestText) &&
    !isExplicitReminderCompletion(reminderCreateRequestText) &&
    // A message that also names 2+ distinct days likely describes more than
    // one calendar item (e.g. "add soccer Tuesday..., piano Thursday..., and
    // remind me about the dentist Monday..."), which this deterministic
    // single-reminder fast path has no way to notice -- back off and let the
    // general planner (calendar_batch_create) handle it instead. See
    // looksLikeCompoundCalendarRequest's own comment for the live bug this
    // closes.
    !looksLikeCompoundCalendarRequest(reminderCreateRequestText)
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
  const talkPlanIntentResolution = context?.talk_plan_intent_resolution === 'confirmed_action'
    ? 'confirmed_action'
    : context?.talk_plan_intent_resolution === 'conversation_only'
      ? 'conversation_only'
      : null
  const talkPlanIntentGate = experienceMode === 'talk_plan'
    ? resolveTalkPlanIntentGate(latestUserText, talkPlanIntentResolution)
    : null
  const explicitTalkPlanCalendarCommand = shouldUseTalkPlanCalendarCommandLane(latestUserText, {
      hasActiveEvent: Boolean(
        context?.focusedEvent ||
        incomingConversationState?.activeEntityType === 'event' ||
        context?.pendingAction,
      ),
    })
  const talkPlanCalendarCommand = experienceMode !== 'talk_plan' ||
    (explicitTalkPlanCalendarCommand && (
      !talkPlanIntentGate?.actionKind ||
      talkPlanIntentGate.decision === 'run_action'
    ))
  const parsedCalendarFrame = talkPlanCalendarCommand
    ? parseCalendarLanguage(latestUserText, {
        focusedEvent: Boolean(context?.focusedEvent),
        activeEntityType: incomingConversationState?.activeEntityType,
      })
    : null
  const previousCalendarFrame = talkPlanCalendarCommand && previousUserText
    ? parseCalendarLanguage(previousUserText, {
      focusedEvent: Boolean(context?.focusedEvent),
      activeEntityType: incomingConversationState?.activeEntityType,
    })
    : null
  const calendarFrame = inheritCalendarReadScope(parsedCalendarFrame, previousCalendarFrame)
  const parsedCalendarReadContext = ['calendar.list', 'calendar.availability'].includes(calendarFrame?.intent ?? '') &&
      calendarFrame.slots?.temporalScope
    ? calendarRangeForScope(calendarFrame.slots.temporalScope, {
        now: new Date(),
        utcOffset: context?.utcOffset,
      })
    : null
  const calendarReadContext = parsedCalendarReadContext ??
    (['calendar.list', 'calendar.availability'].includes(calendarFrame?.intent ?? '') &&
      incomingConversationState?.activeEntityType === 'calendar_range'
      ? incomingConversationState.range
      : null)
  const householdDirectoryQuestion = isHouseholdDirectoryQuestion(latestUserText)
  const preferCalendarDomain = shouldPreferCalendarOverGrocery(latestUserText, {
    page: context?.page,
    activeEntityType: incomingConversationState?.activeEntityType,
    calendarFrame,
  })
  const groceryFrame = householdDirectoryQuestion ||
      isExplicitReminderCompletion(latestUserText) ||
      reminderCompletionFollowUp ||
      preferCalendarDomain
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
  const preferredLanguageDomain = preferredAssistantLanguageDomain({
    calendarFrame,
    cookingFrame,
    preferCalendarDomain,
  })
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
  const talkPlanCommandLane = shouldUseTalkPlanDeterministicLane(experienceMode, talkPlanIntentGate)
  const requestAmbiguity = classifyAssistantAmbiguity(latestUserText, {
    experienceMode,
    hasActiveEntity: Boolean(incomingConversationState?.activeEntityType || context?.focusedEvent),
    hasGroundedSemanticIntent: cookingMutationIntent || householdDirectoryQuestion,
  })
  const classifiedIntentRouting = classifyAssistantIntent(latestUserText, {
    focusedEvent: Boolean(context?.focusedEvent),
    assistantMode: context?.assistant_mode,
    experienceMode,
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
    !context?.focusedEvent &&
    calendarFrame.intent !== 'event.create' &&
    !calendarFrame.requiresActiveEvent &&
    (calendarFrame.intent === 'calendar.list' || !incomingConversationState)
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
  const intentRoutingDecision = experienceMode === 'talk_plan' && !talkPlanCommandLane
    ? { route: { profile: 'talk_plan', forceEventSearch: false }, source: 'talk_plan_conversation' }
    : explicitReminderRead
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
    : intentRouting.profile === 'recipe' || PROJECT_PLAN_REQUEST.test(latestUserText ?? '')
      ? RECIPE_REQUEST_HARD_TIMEOUT_MS
      : experienceMode === 'talk_plan'
        ? TALK_PLAN_REQUEST_HARD_TIMEOUT_MS
        : NORMAL_REQUEST_HARD_TIMEOUT_MS
  const imageContext = image
    ? imageContextRaw === 'conversation' ? 'conversation' : 'current_turn'
    : 'none'
  const isScheduleQuery = /\b(?:check|overlap|conflicts?|what time|who is driving|when is|schedule overlap|how far|tell me about)\b/i.test(latestUserText ?? '')
  // A short reply continuing an already-established creation/edit flow (e.g. "Monday." answering
  // "When should I remind you?") has none of the write-intent keywords below, but it's still part
  // of a write flow -- the conversation state already tracks that via expectedFollowUp. Without
  // this, such replies were misclassified as fresh family-data questions, triggering the full RAG
  // evidence pipeline (Gemini embedding call + search_family_data) for a one-word date answer --
  // the root cause of the 30-40s "confirm card" delays reported in ai_bug_reports a6f58eba.
  const isActiveWriteFlowContinuation = Boolean(
    !isScheduleQuery &&
    incomingConversationState?.expectedFollowUp &&
    incomingConversationState.expectedFollowUp !== 'none'
  )
  const userRequestedWriteIntent = !isScheduleQuery && (
    /\b(move|resched|reschedule|change|update|edit|delete|remove|cancel|add|create|set|shift|push|book|drive|driving|driver|drop\s*off|dropoff|pick\s*up|pickup|stay|tag|bring|pack|rename|make|assign|switch|clear)\b/i
      .test(latestUserText ?? '') || isActiveWriteFlowContinuation
  ) && (!authoritativeCookingContext || cookingMutationIntent)
  appendServerTrace('server_ai_assistant_start', `messages=${Array.isArray(messages) ? messages.length : 0}`, {
    message_count: Array.isArray(messages) ? messages.length : 0,
    has_image: Boolean(image),
    image_context: imageContext,
    dry_run: dryRun,
    client_trace_present: clientTracePresent,
    client_build: clientBuild,
    client_trace_source: clientTraceSource,
    intent_profile: intentRouting.profile,
    experience_mode: experienceMode,
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

  /** Version D (P3.16): one Gemini call with the family's data in context; changes come back as the usual cards. */
  // Automatic bug reports (P3.17): when D flubs, the conversation is filed next to the bug-icon
  // reports (event "auto_bug_report", `node scripts/bug-reports.mjs`), for review by pattern.
  // Real turns only — the side-by-side test runs would drown the list.
  const autoBugReport = (signal: string, detail: string, extra: Record<string, unknown> = {}) => {
    if (dryRun) return
    appendServerTrace('auto_bug_report', `${signal}: ${detail}`.slice(0, 300), {
      signal,
      layer: 'hybrid',
      page: context?.page ?? null,
      conversation: (Array.isArray(messages) ? messages : []).slice(-10).map((m) => ({ role: m.role, content: String(m.content ?? '').slice(0, 600) })),
      pending_action: context?.pendingAction ?? null,
      ...extra,
    })
  }

  // D answers every turn the rules don't (the old path was retired Oct 5): a time-out or an empty answer says so.
  // `startPlanning`: a plan is on screen (P3.25), so the planning model answers from the start.
  // A new event with no one on it (Jake's bug report 2026-09-30 11:44: "they should never be unassigned"): whoever
  // its words point to in Casa's memory, else whoever is speaking, else the admin; a parent going drives.
  // Who "I" is: whoever is signed in on their phone; the wall is the family's screen, so its sign-in isn't who's talking.
  const talkerId = context?.page === 'wall' ? null : activeMemberId
  // "I" is whoever is signed in (Jake, Oct 3): they go, and a parent going drives; named people with no driver: the
  // one parent going drives.
  const withWho = async (tool: string, args: Record<string, unknown>): Promise<Record<string, unknown>> => {
    const named = Array.isArray(args.members) ? (args.members as unknown[]).map(String).filter(Boolean) : []
    const hasDriver = typeof args.driver_name === 'string' && args.driver_name.trim() !== ''
    if (tool !== 'create_event' || (named.length && hasDriver)) return args
    const [{ data: fam }, { data: facts }] = await Promise.all([
      sb.from('family_members').select('id, name, role, can_drive, is_admin').neq('name', 'Tabor Family').order('sort_order'),
      sb.from('casa_memory').select('kind, about_member_id, text, words, confidence').eq('status', 'active').eq('kind', 'fact').eq('confidence', 'sure'),
    ])
    const d = defaultPeople({ title: String(args.title ?? ''), said: latestUserText, people: named, speakerId: talkerId, facts: facts ?? [], family: fam ?? [] })
    const reminder = args.event_type === 'reminder'
    return { ...args, ...(d.people.length ? { members: d.people } : {}), ...(d.driver && !hasDriver && !reminder && args.all_day !== true ? { driver_name: d.driver } : {}) }
  }
  // Where the place is, before the yes (Jake, Oct 2: "Go for which one"): a sure place comes with its address, a
  // not-sure one with up to three choices to pick from on the card ("Which one?"); no idea keeps the name as said.
  // Never holds the card up for long: past 2.5 s the card comes without it, and the event page asks after the save.
  const withPlace = async (tool: string, args: Record<string, unknown>): Promise<Record<string, unknown>> => {
    const query = typeof args.location === 'string' ? args.location.trim() : ''
    if (tool !== 'create_event' || !query || (typeof args.address === 'string' && args.address.trim())) return args
    const look = async () => {
      const [{ data: home }, { data: saved }, { data: fam }] = await Promise.all([
        sb.from('settings').select('value').eq('key', 'home_config').maybeSingle(),
        sb.from('saved_places').select('name, aliases, address, city, state, zip').eq('confirmed', true).limit(300),
        sb.from('family_members').select('id, name'),
      ])
      const going = new Set((Array.isArray(args.members) ? args.members : []).map((n) => String(n).trim().toLowerCase()))
      const memberIds = ((fam ?? []) as Array<{ id: string; name: string }>).filter((m) => going.has(m.name.toLowerCase())).map((m) => m.id)
      return await draftPlace(sb, { query, homeConfig: home?.value ?? null, savedPlaces: saved ?? [], memberIds }) as { name: string; address: string } | { choices: Array<{ name: string; address: string }> } | null
    }
    try {
      const place = await Promise.race([look(), new Promise<null>((resolve) => setTimeout(() => resolve(null), 2500))])
      if (!place) return args
      if ('choices' in place) return { ...args, place_choices: place.choices }
      return { ...args, location: place.name, address: place.address }
    } catch {
      return args
    }
  }
  const fillCard = async (tool: string, args: Record<string, unknown>) => withPlace(tool, await withWho(tool, args))
  const runFullAi = async (buildDisplayText: (tool: string, args: Record<string, unknown>) => string, startPlanning = false): Promise<{ status: number; payload: Record<string, unknown> }> => {
    const config = await loadLlmConfig(sb)
    const apiKey = String(config?.api_key ?? '')
    // A dry run may try another production model on the same turn (P3.25: "which AI plans?").
    let model = startPlanning ? PLANNING_GEMINI_MODEL : dryRun && modelOverride && /^gemini-[a-z0-9.-]+$/.test(modelOverride) ? modelOverride : String(config?.model ?? DEFAULT_GEMINI_MODEL)
    const utcOffset = typeof context?.utcOffset === 'string' ? context.utcOffset : '-04:00'
    const now = new Date(String(context?.currentDate ?? new Date().toISOString()))
    const { from, until } = fullAiWindow(now, utcOffset)
    // Everything D answers from, in its context rather than behind search tools.
    const [familyRows, idRows, groceryRows, homeRow, placeRows, contactRows, recipeRows, memoryRows] = await Promise.all([
      sb.from('family_members').select('id, name, full_name, role, can_drive, is_admin').order('sort_order'),
      sb.from('events').select('id').is('deleted_at', null).eq('status', 'confirmed').neq('record_kind', 'series_template')
        .gte('start_time', from).lt('start_time', until).order('start_time').limit(200),
      sb.from('grocery_items').select('id, name, quantity, checked').is('deleted_at', null).order('checked').order('name').limit(200),
      sb.from('settings').select('value').eq('key', 'home_config').maybeSingle(),
      sb.from('saved_places').select('name, address, city, phone').eq('confirmed', true).order('name').limit(80),
      // Where each person lives, from one place (contact_directory: their address, their main place, or a place confirmed for them).
      sb.from('contact_directory').select('id, name, aliases, relationship, phone, email, address, place_name').eq('confirmed', true).is('dismissed_at', null).order('name').limit(120),
      sb.from('recipes').select('id, name').order('last_used_at', { ascending: false, nullsFirst: false }).limit(60),
      // Casa's memory (phase 1): the facts and open thoughts, each with where it came from.
      sb.from('casa_memory').select('id, kind, about_label, about_member_id, text, words, confidence, source, evidence, created_at, last_nudged_at, nudge_count, status, sensitive').eq('status', 'active').order('about_label').order('created_at').limit(300),
    ])
    // The privacy switch (built, off by default — Jake: "I want to see everything on the wall when I ask"): when on,
    // health, therapy and money facts are left out on the wall; they're answered on a phone.
    const { data: privacy } = await sb.from('settings').select('value').eq('key', 'memory_private_on_wall').maybeSingle()
    const onWall = String(context?.page ?? '').startsWith('wall')
    const memory = ((memoryRows.data ?? []) as Array<Record<string, unknown> & { id: string; kind: string; sensitive?: boolean }>)
      .filter((m) => !(privacy?.value === true && onWall && m.sensitive))
    // Phase 4: at most one open thought a day comes back, at the end of an answer.
    const due = dueThought(memory, now) as { id: string } | null
    const family = ((familyRows.data ?? []) as Array<{ id: string; name: string; role: string | null; can_drive: boolean | null; is_admin?: boolean | null }>)
    const events = await loadReferents(sb, ((idRows.data ?? []) as Array<{ id: string }>).map((r) => r.id), family)
    const groceries = (groceryRows.data ?? []) as Array<{ id: string; name: string; quantity: string | null; checked: boolean }>
    const homeCfg = (homeRow.data?.value ?? null) as { address?: string; city?: string; state?: string; zip?: string } | null
    const home = [homeCfg?.address, homeCfg?.city, homeCfg?.state, homeCfg?.zip].filter(Boolean).join(', ')
    const places = ((placeRows.data ?? []) as Array<{ name: string; address: string | null; city: string | null; phone: string | null }>)
      .map((p) => ({ name: p.name, address: [p.address, p.city].filter(Boolean).join(', ') || null, phone: p.phone }))
    const contacts = ((contactRows.data ?? []) as Array<{ id: string; name: string; aliases: string[] | null; relationship: string | null; phone: string | null; email: string | null; address: string | null; place_name: string | null }>)
      .map((c) => ({ id: c.id, name: c.name, aliases: c.aliases ?? [], relationship: c.relationship, phone: c.phone, email: c.email, address: c.address, place: c.place_name }))
    const recipes = (recipeRows.data ?? []) as Array<{ id: string; name: string }>
    // His open to-dos (the "To Do" list on his phone): so a repeat is noticed and a project grows from it.
    // With its time and whether it's late, and the household's chores beside it (Jake's bug report, Oct 1: "nothing on
    // todos or reminders?" was answered from the calendar, calling Kelly's gym a reminder, and never named a chore).
    const [todoRes, choreRes, choreDoneRes] = await Promise.all([
      sb.from('events').select('id, title, has_due_date, start_time, all_day').eq('event_type', 'reminder').eq('record_kind', 'single')
        .is('deleted_at', null).neq('status', 'cancelled').order('created_at', { ascending: false }).limit(60),
      sb.from('household_chores').select('id, title, member_id, days_of_week, time_local, enabled, every_weeks, starts_on').eq('enabled', true),
      sb.from('household_chore_done').select('chore_id').eq('on_date', new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)),
    ])
    const nyDay = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso))
    const todayNy = nyDay(now.toISOString())
    const todos = ((todoRes.data ?? []) as Array<{ id: string; title: string; has_due_date: boolean; start_time: string; all_day: boolean | null }>)
      .map((t) => todoForCasa(t, now))
    const chores = choresForCasa(choreRes.data ?? [], new Set(((choreDoneRes.data ?? []) as Array<{ chore_id: string }>).map((r) => r.chore_id)), family, todayNy)
    // His saved projects with every step (P3.25 phase 1), so "change that project" isn't answered with
    // a second one and "what's left on the roof?" is answered from the steps.
    const [projRes, stepRes, comingUpRes] = await Promise.all([
      sb.from('todo_projects').select('id, title, aim_date').eq('status', 'active').limit(20),
      sb.from('todo_steps').select('id, project_id, position, grp, title, who, minutes, cost_cents, cal_start, cal_end, child_project_id, done_at'),
      // The whole Coming up list (~0.3 s, alongside the rest), so a season's starter plan is known.
      sb.functions.invoke('coming-up', { body: { action: 'list' } }).catch(() => ({ data: null })),
    ])
    const comingUp = (((comingUpRes as { data?: { items?: unknown[] } | null }).data?.items ?? []) as Array<Record<string, unknown>>)
    type StepRow = { id: string; project_id: string; position: number; grp: number | null; title: string; who: string | null; minutes: number | null; cost_cents: number | null; cal_start: string | null; cal_end: string | null; child_project_id: string | null; done_at: string | null }
    const allSteps = (stepRes.data ?? []) as StepRow[]
    const stepsOf = (id: string) => allSteps.filter((st) => st.project_id === id).sort((a, b) => (a.grp ?? a.position) - (b.grp ?? b.position) || a.position - b.position)
    const childIds = new Set(allSteps.map((st) => st.child_project_id).filter(Boolean))
    // A project inside another is listed too, with its parent (phase 4: "Kelly's doing the tentacles" on Emme's jellyfish).
    const parentOf = (id: string) => ((projRes.data ?? []) as Array<{ id: string; title: string }>).find((pp) => allSteps.some((st) => st.project_id === pp.id && st.child_project_id === id)) ?? null
    const projects = ((projRes.data ?? []) as Array<{ id: string; title: string; aim_date: string | null }>).map((p) => {
      const own = stepsOf(p.id)
      const steps = own.map((st) => {
        const inside = st.child_project_id ? ((projRes.data ?? []) as Array<{ id: string; title: string }>).find((c) => c.id === st.child_project_id) : null
        const kids = st.child_project_id ? stepsOf(st.child_project_id) : []
        return { id: st.id, title: st.title, grp: st.grp ?? st.position, done: Boolean(st.done_at), who: st.who, minutes: st.minutes, cost_cents: st.cost_cents, cal_start: st.cal_start, cal_end: st.cal_end, child: inside ? { title: inside.title, done: kids.filter((k) => k.done_at).length, total: kids.length } : null }
      })
      const parent = childIds.has(p.id) ? parentOf(p.id) : null
      return { id: p.id, title: p.title, parent: parent?.title ?? null, aim_date: p.aim_date, done: own.filter((st) => st.done_at).length, total: own.length, next: own.find((st) => !st.done_at)?.title ?? null, steps }
    })
    const state = incomingConversationState as Record<string, unknown> | null
    const onScreenIds = [
      ...(typeof state?.activeEventId === 'string' ? [state.activeEventId] : []),
      ...(Array.isArray(state?.eventIds) ? (state.eventIds as string[]) : []),
      ...(Array.isArray(state?.candidateEvents) ? (state.candidateEvents as Array<{ id: string }>).map((c) => c.id) : []),
    ]
    const pending = context?.pendingAction && typeof context.pendingAction === 'object' ? context.pendingAction as { tool: string; args: Record<string, unknown> } : null
    const systemFor = (planningTurn: boolean) => buildFullAiSystem({ family, events, groceries, pending, onScreenIds, utcOffset, now, homeCity: typeof context?.homeCity === 'string' ? context.homeCity : null, home: home || null, places, contacts, recipes, todos, chores, projects, comingUp, planning: planningTurn, memory, dueThoughtId: due?.id ?? null, speaker: speakerLine(talkerId, family) })
    let system = systemFor(startPlanning)
    const contents: Array<{ role: string; parts: Array<Record<string, unknown>> }> = fullAiContents(messages as Array<{ role: string; content: string }>)
    // A photo (a flyer, a schedule) goes to the model with the words; Gemini reads images itself.
    const lastUser = [...contents].reverse().find((c) => c.role === 'user')
    if (lastUser && rawImagesList.length) lastUser.parts.push(...rawImagesList.map((img) => ({ inline_data: { mime_type: img.mimeType, data: img.data } })))

    const lookupDeps = { cid, context: (context ?? {}) as Record<string, any>, apiKey, model, provider: 'gemini', braveKey, mapsKey, homeAddress: home, routeEtaCache, providerFetch: providerFetch as never, mapsFetch: mapsFetch as never, experienceMode, latestUserText: null, callIndex: 2 }
    let deadline = Date.now() + FULL_AI_TIMEOUT_MS
    // Talking something through (P3.25): the fast model hands the turn to the planning model.
    let planning = startPlanning
    const asked = contents.length
    let parts: Array<Record<string, unknown>> = []
    let retriedEmpty = false
    let finishReason: string | null = null
    // The day the answer is about (show_day): the wall opens it, or offers to.
    let shownDay: { date: string; open: boolean } | null = null
    // The route the answer carries (show_directions): a QR code on the wall, a button elsewhere.
    let shownRoute: { name: string; address: string; phone: string | null; maps: string } | null = null
    // The email review (canvas row 14): the screen opens it.
    let emailReview = false
    // What the memory tools did this turn (dry runs report it; the trace keeps it).
    const memoryCalls: Array<{ tool: string; args: Record<string, unknown>; result: unknown }> = []
    let nudgedPromise = false
    // Only the request right after the promise is sent back must call a tool.
    let mustActNext: boolean | 'look' = false
    let wordsOnlyNext = false
    const roundLog: Array<Record<string, unknown>> = []
    // D says it couldn't answer itself when the old path would have no time left (the 9:12 AM 504).
    const couldNotAnswer = { status: 200, payload: { type: 'text', text: 'Sorry, I lost my train of thought there. Can you say that again?', semantic_intent: 'full_ai.no_answer', correlation_id: cid } }
    // Up to five rounds: a lookup's answer goes back to the model, which then answers or proposes; the
    // last round is for words (the planning model once ran out of rounds mid-lookup).
    const FULL_AI_ROUNDS = 5
    for (let round = 0; round < FULL_AI_ROUNDS; round++) {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), Math.max(1000, deadline - Date.now()))
      try {
        const res = await providerFetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
          body: JSON.stringify(fullAiRequest({ system, contents, tools: fullAiTools({ planning }), retryAfterEmpty: wordsOnlyNext, finalRound: round === FULL_AI_ROUNDS - 1, mustAct: mustActNext })),
          signal: controller.signal,
        }, { callPurpose: planning ? 'full-ai-plan' : 'full-ai', correlationId: cid, model, callIndex: round + 1 })
        const forced = mustActNext
        mustActNext = false
        wordsOnlyNext = false
        const body = await res.json() as Record<string, unknown>
        const candidate = (body?.candidates as Array<{ content?: { parts?: Array<Record<string, unknown>> }; finishReason?: string }> | undefined)?.[0]
        parts = candidate?.content?.parts ?? []
        // A call written out as words ("finish_todo(id='…')"): taken as the call it meant.
        if (!parts.some((p) => p.functionCall)) {
          const said = parts.filter((p) => typeof p.text === 'string' && p.thought !== true).map((p) => p.text as string).join('').trim()
          const meant = writtenCall(said, fullAiTools({ planning }).map((t: { name: string }) => t.name))
          if (meant) parts = [{ functionCall: meant }]
        }
        if (dryRun) roundLog.push({ round, model, forced, parts: parts.map((p) => (p.functionCall ? `call:${(p.functionCall as { name: string }).name}` : p.thought ? 'thought' : 'text')), error: (body as { error?: { message?: string } }).error?.message ?? null })
        finishReason = candidate?.finishReason ?? null
      } catch {
        autoBugReport('timeout', `no answer within ${FULL_AI_TIMEOUT_MS / 1000} s`, { round })
        return couldNotAnswer
      } finally {
        clearTimeout(timer)
      }
      // Gemini 2.5 Flash sometimes answers a thinking + tools call with nothing at all: ask once more,
      // for words this time (fullAiRequest's retryAfterEmpty).
      if (!parts.length && !retriedEmpty) {
        // Once, for words only — and only that one request: left on, words-only turned the tools off for the rest
        // of the turn, so every later round could only say what it would do (open bug 8f58eddc: "I'll set that up
        // for you", no card). A retry with the tools on came back empty again (tried 2026-09-30).
        retriedEmpty = true
        wordsOnlyNext = true
        round -= 1
        continue
      }
      if (!planning && parts.some((p) => (p.functionCall as { name?: string } | undefined)?.name === THINK_IT_THROUGH)) {
        planning = true
        model = PLANNING_GEMINI_MODEL
        system = systemFor(true)
        contents.length = asked
        parts = []
        retriedEmpty = false
        deadline = Date.now() + FULL_AI_TIMEOUT_MS
        round = -1
        continue
      }
      const reads = parts.filter((p) => p.functionCall && READ_TOOLS.has(String((p.functionCall as { name: string }).name)))
      if (!reads.length) {
        // Promised, not done (open bug 8f58eddc: "I'll set that up for you", "I'll remember that …" with no tool
        // called): once, back to the model — call the tool now, or say plainly that nothing was saved.
        const words = parts.filter((p) => typeof p.text === 'string' && p.thought !== true).map((p) => p.text as string).join('').trim()
        const lookOnly = !promisesAction(words) && promisesLookup(words)
        if (!nudgedPromise && !memoryCalls.length && (promisesAction(words) || lookOnly) && !parts.some((p) => p.functionCall) && round < FULL_AI_ROUNDS - 1) {
          nudgedPromise = true
          mustActNext = lookOnly ? 'look' : true
          contents.push({ role: 'model', parts }, { role: 'user', parts: [{ text: lookOnly ? 'You said you would look that up, but you called no tool, so they have no answer yet. Look it up now, then answer.' : 'You said you would do that, but you called no tool, so nothing has happened yet. Call the tool for it now.' }] })
          parts = []
          continue
        }
        break
      }
      for (const p of reads) { const line = fullAiStatus(p.functionCall); if (line) emitStatus(line) }
      const answers = await Promise.all(reads.map(async (p) => {
        const call = p.functionCall as { name: string; args: Record<string, unknown> }
        let result: Record<string, unknown> | null = null
        if (call.name === 'open_email_review') {
          const { data } = await sb.functions.invoke('email-offers', { body: { action: 'list' } })
          emailReview = true
          result = { waiting: (data as { count?: number } | null)?.count ?? 0, note: 'The review is on the screen, one email at a time.' }
        } else if (call.name === 'show_directions') {
          const found = directionsFor(call.args?.to, { contacts, places })
          if (found && 'address' in found) {
            shownRoute = found
            result = { name: found.name, address: found.address, phone: found.phone, note: 'The route is on the screen.' }
          } else {
            result = found ? { error: `No address saved for ${found.missing}. Ask him for it, then save_address.` } : { error: 'No one and no place by that name in CONTACTS or PLACES.' }
          }
        } else if (call.name === 'remember' || call.name === 'forget' || call.name === 'undo_memory') {
          // Casa's memory (phase 1): saved at once in his words, no card. A dry run saves nothing.
          const speaker = family.find((m) => m.id === activeMemberId)?.name ?? null
          if (!mayChangeMemory(activeMemberId, family)) result = { error: 'Only Jake and Kelly change what Casa remembers. Say so kindly.' }
          else if (call.name === 'remember') {
            const read = readRemember(call.args, { family, rows: memory })
            if ('error' in read) result = { error: read.error }
            else if (dryRun) result = { saved: true, dry_run: true, about: read.about, text: read.text, kind: read.kind, replaces: read.replaces }
            else {
              const { data, error } = await sb.rpc('casa_memory_remember', { p_about: read.about, p_member: read.memberId, p_text: read.text, p_kind: read.kind, p_words: read.words, p_replaces: read.replaces, p_said_by: speaker })
              result = error ? { error: error.message } : { saved: true, id: (data as { id: string }).id, about: read.about, text: read.text, replaced: (data as { replaced?: string | null }).replaced ?? null }
            }
          } else {
            const id = String(call.args?.id ?? '')
            if (!/^[0-9a-f-]{36}$/.test(id)) result = { error: 'Which one? Use its [id] from WHAT CASA KNOWS.' }
            else if (dryRun) result = { saved: true, dry_run: true, id }
            else {
              const { data, error } = call.name === 'forget'
                ? await sb.rpc('casa_memory_forget', { p_id: id, p_status: call.args?.done === true ? 'done' : 'forgotten' })
                : await sb.rpc('casa_memory_undo', { p_id: id })
              result = error ? { error: error.message } : (data as Record<string, unknown>)
            }
          }
        } else if (call.name === 'show_day') {
          shownDay = readShowDay(call.args) ?? shownDay
          result = shownDay ? { shown: shownDay.date, note: shownDay.open ? 'It is on the screen now. Say one short line about the day.' : 'The screen offers to open it.' } : { error: 'The date must be YYYY-MM-DD' }
        } else if (call.name === 'get_recipe') {
          const { data } = await sb.from('recipes').select('name, servings, cook_time, recipe_ingredients(raw_text, name, quantity, unit, optional, sort_order), recipe_steps(step_number, instruction)').eq('id', String(call.args?.id ?? '')).maybeSingle()
          result = data ? data as Record<string, unknown> : { error: 'No recipe with that id' }
        } else if (call.name === 'get_coming_up') {
          const { data, error } = await sb.functions.invoke('coming-up', { body: { action: 'list' } })
          result = error ? { error: 'The Coming up list could not be read' } : comingUpForModel(data?.items ?? [], data?.rules ?? [], { today: String(data?.today ?? ''), withinDays: call.args?.within_days as number | undefined })
        } else if (call.name === 'get_gift_ideas') {
          // Surprise-safe (P3.19 step 2): only on the asker's phone, never the ideas for them.
          const { data } = await sb.from('gift_ideas').select('for_name, for_member_id, idea, created_at').is('done_at', null).is('dismissed_at', null).order('created_at').limit(100)
          result = giftIdeasForViewer(data ?? [], { viewerMemberId: activeMemberId, page: context?.page ?? null, forName: call.args?.for ?? null, family })
        } else if (call.name === 'find_events') {
          // The whole calendar, past and future (Jake, 2026-09-28: "search my whole calendar").
          const searched = await searchCalendar(sb, call.args, { now, utcOffset, family })
          result = 'error' in searched ? { error: searched.error } : { from: searched.from, to: searched.to, events: describeFoundEvents(searched.found, utcOffset), ...(searched.more ? { more: 'there are more — narrow the dates or words' } : {}) }
        } else if (call.name === 'search_email') {
          // Everything the email reader has seen (both mailboxes), with its one-line summary when it made one.
          const words = emailSearchWords(String(call.args?.query ?? latestUserText ?? ''))
          const since = new Date(Date.now() - Math.min(180, Math.max(1, Number(call.args?.days ?? 30) || 30)) * 86400e3).toISOString()
          if (!words.length) result = { found: 0, note: 'Nothing to search for.' }
          else {
            const ors = words.flatMap((w) => ['subject', 'from_email', 'email_body'].map((col) => `${col}.ilike.%${w.replace(/[%,()]/g, '')}%`)).join(',')
            const [{ data: mail }, { data: gists }] = await Promise.all([
              sb.from('gmail_processed_messages').select('gmail_message_id, subject, from_email, received_at, email_body, family_member_id').gte('received_at', since).or(ors).order('received_at', { ascending: false }).limit(60),
              sb.from('email_offers').select('gmail_message_id, gist').gte('received_at', since).not('gist', 'is', null).limit(400),
            ])
            const gistOf = new Map(((gists ?? []) as Array<{ gmail_message_id: string; gist: string }>).map((g) => [g.gmail_message_id, g.gist]))
            const rows = ((mail ?? []) as Array<Record<string, unknown>>).map((m) => ({ ...m, gist: gistOf.get(String(m.gmail_message_id)) ?? null }))
            const seen = new Set<string>()
            const unique = rows.filter((m) => { const k = `${m.subject}|${m.received_at}`; if (seen.has(k)) return false; seen.add(k); return true })
            const best = rankEmails(unique, words) as Array<Record<string, unknown>>
            const whose = (id: unknown) => family.find((m) => m.id === id)?.name ?? null
            result = { found: best.length, next: 'Anything here to go to or do by a date that is not on the calendar: call create_event for it now, in this same answer — the card is the question, never ask in words.', emails: best.map((m) => ({
              from: String(m.from_email ?? '').replace(/<[^>]+>/, '').replace(/"/g, '').trim(),
              subject: m.subject,
              received: new Date(String(m.received_at)).toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }),
              mailbox: whose(m.family_member_id) === 'Tabor Family' ? 'the family mailbox' : whose(m.family_member_id) ? `${whose(m.family_member_id)}'s mailbox` : null,
              summary: m.gist ?? null,
              text: String(m.email_body ?? '').replace(/\s+/g, ' ').slice(0, 900),
            })) }
          }
        } else if (call.name === 'search_family_notes') {
          // The same retrieval the old path loaded on every turn — here only when D asks.
          const found = await retrieveFamilyContext({ sb, providerFetch, apiKey, query: String(call.args?.query ?? latestUserText ?? '') }).catch(() => null)
          result = found ? { notes: found.evidence.map((e: Record<string, unknown>) => ({ source: e.source_type, title: e.title, excerpt: e.excerpt })) } : { error: 'The family notes search failed' }
        } else {
          result = await runLookup(call.name, call.args ?? {}, lookupDeps).catch(() => ({ error: 'That lookup failed' }))
        }
        if (['remember', 'forget', 'undo_memory'].includes(call.name)) memoryCalls.push({ tool: call.name, args: call.args ?? {}, result })
        if (result && typeof result === 'object' && 'error' in result) autoBugReport('lookup_failed', `${call.name}: ${String((result as { error: unknown }).error)}`, { tool: call.name, args: call.args })
        return { functionResponse: { name: call.name, response: result ?? { error: 'Unknown lookup' } } }
      }))
      contents.push({ role: 'model', parts }, { role: 'user', parts: answers })
      parts = []
    }

    // Re-read what a change is about right before proposing it (the Oct 4 report: a change offered for something that
    // wasn't there, then a dead end). Outside the three weeks held here, it's read from the calendar; not there at all,
    // the check below says so plainly and offers to add it.
    const unseen = parts
      .map((p) => p.functionCall as { name: string; args?: Record<string, unknown> } | undefined)
      .filter((c) => c && (c.name === 'update_event' || c.name === 'delete_event'))
      .map((c) => String(c!.args?.id ?? ''))
      .filter((id) => id && !events.some((e) => e.id === id))
    if (unseen.length) {
      const { data: live } = await sb.from('events').select('id').in('id', unseen).is('deleted_at', null).neq('status', 'cancelled')
      const found = await loadReferents(sb, ((live ?? []) as Array<{ id: string }>).map((r) => r.id), family)
      events.push(...(found as typeof events))
    }
    const changes = parts.filter((p) => p.functionCall && !READ_TOOLS.has(String((p.functionCall as { name: string }).name)))
      .map((p) => fullAiCard(p.functionCall as { name: string; args: Record<string, unknown> }, { events, utcOffset, now, groceries, family, todos, projects, contacts }))
    if (changes.length) {
      if (changes.some((c) => 'error' in c)) {
        autoBugReport('hard_check', (changes.find((c) => 'error' in c) as { error: string }).error, { proposed: parts.filter((p) => p.functionCall).map((p) => p.functionCall) })
        const failed = changes.find((c) => 'error' in c) as { error: string }
        return { status: 200, payload: { type: 'text', text: failed.error, semantic_intent: 'full_ai.checked', correlation_id: cid } }
      }
      let cards = changes as Array<{ tool: string; args: Record<string, unknown> }>
      // Groceries go straight on the list and are said plainly — no card, no yes (Jake, Oct 2: "Just commit it and say
      // 'x' added to the list … If there's a mistake I'll just delete it from the list"). Anything else asked in the
      // same breath still comes back as its card.
      let groceryNote = ''
      const groceryCards = cards.filter((c) => c.tool === 'add_grocery_items')
      if (groceryCards.length) {
        const items = groceryCards.flatMap((c) => (Array.isArray(c.args.items) ? c.args.items : []))
        // A dry run saves nothing (Oct 5: the nightly check's "add milk and a dozen eggs" put them on the real list).
        const result = dryRun
          ? { items: items.map((i) => ({ name: String((i as { name?: string })?.name ?? i), already_present: false })) }
          : await saveGroceryItems(sb, items)
        groceryNote = groceryAddedText(result.items ?? [])
        cards = cards.filter((c) => c.tool !== 'add_grocery_items')
        if (!cards.length) return { status: 200, payload: { type: 'text', text: groceryNote, write_verified: !dryRun, ...(dryRun ? { dry_run: true, would_add: items } : {}), semantic_intent: 'full_ai.grocery_added', correlation_id: cid } }
      }
      // A trip already on the calendar is never added again (Jake, 2026-10-01: Casa proposed his Dallas trip a second
      // time, though the work email had put it there): its days are read in full, past the three weeks Casa holds.
      let alreadyNote = groceryNote
      const tripCards = cards.filter((c) => c.tool === 'create_event' && tripLegOf(c.args.title, c.args.all_day === true))
      if (tripCards.length) {
        const times = tripCards.flatMap((c) => [Date.parse(String(c.args.start ?? '')), Date.parse(String(c.args.end ?? c.args.start ?? ''))]).filter(Number.isFinite)
        const { data: around } = await sb.from('events').select('id, title, start_time, end_time, all_day')
          .gte('end_time', new Date(Math.min(...times) - 86_400_000).toISOString())
          .lte('start_time', new Date(Math.max(...times) + 86_400_000).toISOString())
          .is('deleted_at', null).neq('status', 'cancelled').limit(400)
        const { keep, already } = alreadyOnCalendar(cards, [...(around ?? []), ...events] as Array<{ id: string; title: string; start_time: string; end_time: string; all_day: boolean }>)
        if (already.length) {
          alreadyNote = alreadyOnCalendarText(already)
          if (!keep.length) return { status: 200, payload: { type: 'text', text: `${alreadyNote} Nothing to add.`, semantic_intent: 'full_ai.trip_already_there', correlation_id: cid } }
          cards = keep
        }
      }
      // Describing a flight that's already there is not changing it (the same live check: "lands DFW at 3:30 their
      // time" became a time edit with a Dallas time read as home time).
      const edits = cards.filter((c) => c.tool === 'update_event')
      if (edits.length) {
        const heardNow = Array.isArray(messages) ? String((messages as Array<{ role?: string; content?: unknown }>).filter((m) => m?.role === 'user').pop()?.content ?? '') : ''
        const { data: targets } = await sb.from('events').select('id, title, start_time, end_time, all_day').in('id', edits.map((c) => String(c.args.id ?? '')).filter(Boolean))
        const known = (targets ?? []) as Array<{ id: string; title: string; start_time: string; end_time: string; all_day: boolean }>
        const described = cards.filter((c) => describesExistingLeg(c, known, heardNow))
        if (described.length) {
          const legs = described.map((c) => ({ event: known.find((e) => e.id === c.args.id)! }))
          alreadyNote = `${alreadyNote}${alreadyNote ? ' ' : ''}${alreadyOnCalendarText(legs)}`
          cards = cards.filter((c) => !described.includes(c))
          if (!cards.length) return { status: 200, payload: { type: 'text', text: `${alreadyNote} Nothing to change.`, semantic_intent: 'full_ai.trip_already_there', correlation_id: cid } }
        }
      }
      if (cards.length > 1) {
        // Several changes at once (a flyer with three dates): one batch, each still needing a yes.
        const filled = await Promise.all(cards.map(async (c) => ({ tool: c.tool, args: await fillCard(c.tool, c.args) })))
        return { status: 200, payload: { type: 'tool_action_batch', actions: filled.map((c, i) => ({ id: `full-ai-${i}`, status: 'proposed', tool: c.tool, args: c.args, display_text: `${i === 0 && alreadyNote ? `${alreadyNote} ` : ''}${buildDisplayText(c.tool, c.args)}` })), semantic_intent: 'full_ai.batch', correlation_id: cid } }
      }
      const card = { tool: cards[0].tool, args: await fillCard(cards[0].tool, cards[0].args) }
      const about = events.find((e) => e.id === card.args.id) ?? null
      // A plan (P3.25 phase 3) comes with what the planning model said about it, shown above the draft.
      const said = parts.filter((p) => typeof p.text === 'string' && p.thought !== true).map((p) => p.text as string).join('').trim()
      const shown = card.tool === 'apply_plan' ? (said || `Here’s the plan: ${String(card.args.title ?? '')}.`) : `${alreadyNote ? `${alreadyNote} ` : ''}${buildDisplayText(card.tool, card.args)}`
      return { status: 200, payload: { ...(planning ? { planning: true } : {}), type: 'tool_action', tool: card.tool, args: card.args, display_text: shown, conversation_state: about ? eventConversationState(about, new Date()) : incomingConversationState ?? null, semantic_intent: `full_ai.${card.tool}`, correlation_id: cid } }
    }
    const said = parts.filter((p) => typeof p.text === 'string' && p.thought !== true).map((p) => p.text as string).join('').trim()
    // A day opened with nothing more to say still says which day it is.
    const text = said || (shownDay ? `Here’s ${new Date(`${shownDay.date}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' })}.` : '')
    if (!text) autoBugReport('empty', 'no words and no change', { parts: parts.length, finishReason })
    if (!text) return couldNotAnswer
    const mentioned = mentionedIds(text, events).flatMap((id) => events.filter((e) => e.id === id))
    // The due thought was offered with this answer: counted, so it comes back no more than weekly (quiet after three).
    const dueWords = due ? String((memory.find((m) => m.id === due.id) as { text?: string } | undefined)?.text ?? '').toLowerCase().match(/\p{L}{5,}/gu) ?? [] : []
    if (due && !dryRun && text && dueWords.some((w) => text.toLowerCase().includes(w))) await sb.from('casa_memory').update({ last_nudged_at: new Date().toISOString(), nudge_count: (Number((memory.find((m) => m.id === due.id) as { nudge_count?: number } | undefined)?.nudge_count) || 0) + 1 }).eq('id', due.id)
    return { status: 200, payload: { ...(planning ? { planning: true } : {}), ...(shownDay ? { show_day: shownDay } : {}), ...(shownRoute ? { directions: shownRoute } : {}), ...(emailReview ? { email_review: true } : {}), ...(memoryCalls.length ? { memory: memoryCalls } : {}), ...(nudgedPromise ? { promise_sent_back: true } : {}), ...(dryRun ? { rounds: roundLog } : {}), type: 'text', text: text || 'I didn’t get an answer that time.', conversation_state: answerState(mentioned, null) ?? incomingConversationState ?? null, semantic_intent: planning ? 'full_ai.plan_answer' : 'full_ai.answer', correlation_id: cid } }
  }

  const runPipeline = async (): Promise<{ status: number; payload: Record<string, unknown> }> => {
  // (buildDisplayText is declared further down this pipeline, so D's cards read exactly like A's.)
  if (fullAi) return await runFullAi(buildDisplayText)
  if (asideOnWall) {
    // Traced, so a turn meant for Casa but dropped as an aside shows up (P3.25: a planning opener,
    // "I'm thinking about redoing the backyard, can you help me think it through?", came back blank once).
    appendServerTrace('server_ai_assistant_aside', String(latestUserText ?? '').slice(0, 200), { messages: Array.isArray(messages) ? messages.length : 0 })
    return {
      status: 200,
      payload: { type: 'text', text: '', aside: true, semantic_intent: 'conversation.aside', conversation_state: incomingConversationState ?? null, correlation_id: cid },
    }
  }
  // Directions (canvas 13c/13d): the reader heard who or where, and the route goes on the screen from here,
  // every time (the model sometimes answered "would you like the route on the screen?" — live, 2026-09-30).
  // A name it can't place goes on to the model, which can look a business up.
  if (turnResolution?.directionsTo && !context?.pendingAction) {
    const [contactRows, placeRows] = await Promise.all([
      sb.from('contact_directory').select('id, name, aliases, relationship, phone, address, place_name').eq('confirmed', true).is('dismissed_at', null).limit(300),
      sb.from('saved_places').select('name, address, city, phone').eq('confirmed', true).is('dismissed_at', null).limit(300),
    ])
    const known = ((contactRows.data ?? []) as Array<{ id: string; name: string; aliases: string[] | null; relationship: string | null; phone: string | null; address: string | null; place_name: string | null }>)
      .map((c) => ({ ...c, aliases: c.aliases ?? [], place: c.place_name }))
    const spots = ((placeRows.data ?? []) as Array<{ name: string; address: string | null; city: string | null; phone: string | null }>)
      .map((p) => ({ name: p.name, address: [p.address, p.city].filter(Boolean).join(', ') || null, phone: p.phone }))
    const found = directionsFor(turnResolution.directionsTo, { contacts: known, places: spots })
    if (found && 'address' in found) {
      return { status: 200, payload: { type: 'text', text: `Here’s the way to ${found.name}: ${found.address}.`, directions: found, conversation_state: incomingConversationState ?? null, semantic_intent: 'conversation.directions', correlation_id: cid } }
    }
    if (found) {
      return { status: 200, payload: { type: 'text', text: askAddress(found.missing), conversation_state: incomingConversationState ?? null, semantic_intent: 'conversation.directions_missing', correlation_id: cid } }
    }
  }
  // An address he gives for someone (after "What is it?", or "Alice lives at …"): a card to save it on
  // them, on his yes (the model once answered "I'll show the route" and did neither — live, 2026-09-30).
  const lastSaid = [...(Array.isArray(messages) ? messages as Array<{ role?: string; content?: unknown }> : [])].reverse().find((m) => m?.role === 'assistant')?.content
  const addressGiven = addressReply(lastSaid, turnContext?.originalText ?? latestUserText) ?? turnResolution?.addressFor ?? null
  if (addressGiven && !context?.pendingAction) {
    const { data: rows } = await sb.from('contact_directory').select('id, name, aliases, relationship, phone, address, place_name').eq('confirmed', true).is('dismissed_at', null).limit(300)
    const known = ((rows ?? []) as Array<{ id: string; name: string; aliases: string[] | null; relationship: string | null; phone: string | null; address: string | null; place_name: string | null }>)
      .map((c) => ({ ...c, aliases: c.aliases ?? [], place: c.place_name }))
    const card = fullAiCard({ name: 'save_address', args: { contact: addressGiven.who, address: addressGiven.address } }, { events: [], utcOffset: String(context?.utcOffset ?? '-04:00'), now: new Date(), contacts: known }) as { tool?: string; args?: Record<string, unknown> }
    if (card.tool && card.args) {
      return { status: 200, payload: { type: 'tool_action', tool: card.tool, args: card.args, display_text: buildDisplayText(card.tool, card.args), conversation_state: incomingConversationState ?? null, semantic_intent: 'conversation.save_address', correlation_id: cid } }
    }
  }
  // A plan on screen (P3.25): "make the build night Friday" is a change to the plan — the planning
  // model's, not the quick turn reader's (it read it as an edit to an ordinary draft, and failed).
  // A yes or a never-mind still goes the usual way (the band opens the Agree card on a yes).
  const planOnScreen = (context?.pendingAction as { tool?: string } | undefined)?.tool === 'apply_plan'
  // …and a conversation that already went to the planning model stays there (the app sends `planning`).
  const planningConversation = planOnScreen || (context as { planning?: boolean } | undefined)?.planning === true
  // A change to a project step's calendar entry ("move Emme's build night to Sunday") is a change to
  // the step, made through its project — not an edit of the all-day entry (live check, 2026-09-29).
  const stepEventId = turnContext?.card && ['update_event', 'delete_event'].includes(turnContext.card.tool) ? String((turnContext.card.args as { id?: unknown })?.id ?? turnContext.card.about?.id ?? '') : ''
  const stepCard = stepEventId ? Boolean((await sb.from('todo_steps').select('id').eq('cal_event_id', stepEventId).limit(1).maybeSingle()).data) : false
  if ((planningConversation || stepCard) && turnResolution?.act !== 'confirm_draft' && !turnContext?.cancelledDraft) {
    const planned = await runFullAi(buildDisplayText, true)
    if (planned) return { ...planned, payload: { ...planned.payload, layer: 'plan' } }
  }
  if (turnContext?.keepPostedCard) {
    const { tool, args } = turnContext.keepPostedCard
    return { status: 200, payload: { type: 'tool_action', tool, args, display_text: buildDisplayText(tool, args), conversation_state: incomingConversationState ?? null, semantic_intent: 'conversation.keep_posted', correlation_id: cid } }
  }
  if (turnContext?.prepCard) {
    const { tool, args, about } = turnContext.prepCard
    return { status: 200, payload: { type: 'tool_action', tool, args, display_text: buildDisplayText(tool, args), conversation_state: about ? eventConversationState(about, new Date()) : incomingConversationState ?? null, semantic_intent: 'conversation.prep_item', correlation_id: cid } }
  }
  // Someone going away (design doc "Casa: Travel design"): the full model asks for the flights or the drive and adds
  // the trip as events the wall reads; the quick reader made a one-day "Work trip to Dallas" and asked nothing.
  const lastHeard = Array.isArray(messages) ? String((messages as Array<{ role?: string; content?: unknown }>).filter((m) => m?.role === 'user').pop()?.content ?? '') : ''
  if (turnContext?.card?.tool === 'create_event' && isTripTalk(lastHeard)) {
    const trip = await runFullAi(buildDisplayText)
    return { ...trip, payload: { ...trip.payload, layer: 'trip' } }
  }
  if (turnContext?.card) {
    const { tool, about, note } = turnContext.card
    const args = await fillCard(tool, turnContext.card.args)
    return {
      status: 200,
      payload: {
        type: 'tool_action',
        tool,
        args,
        display_text: `${note ?? ''}${buildDisplayText(tool, args)}`,
        conversation_state: about ? eventConversationState(about, new Date()) : incomingConversationState ?? null,
        semantic_intent: `conversation.${turnResolution?.act ?? 'card'}`,
        correlation_id: cid,
      },
    }
  }
  if (turnContext?.clarify) {
    return {
      status: 200,
      payload: {
        type: 'text',
        text: turnContext.clarify.question,
        conversation_state: calendarClarificationConversationState(turnContext.clarify.candidates, { tool: 'turn_change', args: turnContext.clarify.changes ?? {} }, new Date()),
        semantic_intent: 'conversation.clarify',
        correlation_id: cid,
      },
    }
  }
  // A question the calendar can't answer (a drive time, the weather) goes on to layer 2, which can look it up.
  if (turnContext?.answer && !(hybridLayer2 && turnContext.answer.calendarSays === false)) {
    return {
      status: 200,
      payload: {
        type: 'text',
        text: turnContext.answer.text,
        // What the answer named, in order, so "the first one" or "that" next means it.
        conversation_state: answerState(turnContext.answer.mentioned, turnContext.answer.about) ?? incomingConversationState ?? null,
        semantic_intent: 'conversation.question',
        correlation_id: cid,
      },
    }
  }
  // "Yes, change it" in any words: the band or phone saves the card on screen, as a tap on Yes would
  // (before, the turn went on and came back as the same card again — heard 2026-09-27).
  if (turnResolution?.act === 'confirm_draft' && openDraft(context?.pendingAction as { tool: string; args: Record<string, unknown> } | undefined)) {
    return { status: 200, payload: { type: 'text', text: '', confirms_draft: true, semantic_intent: 'conversation.confirm_draft', conversation_state: incomingConversationState ?? null, correlation_id: cid } }
  }
  if (turnContext?.cancelledDraft) {
    return {
      status: 200,
      payload: {
        type: 'text',
        text: turnContext.cancelledDraft.tool === 'create_event' ? 'Okay — I won’t add it.' : 'Okay — I’ll leave it as it is.',
        closes_draft: true,
        semantic_intent: 'conversation.cancel_draft',
        correlation_id: cid,
      },
    }
  }
  if (experienceMode === 'talk_plan') {
    const talkPlanConfigResult = await sb
      .from('settings')
      .select('value')
      .eq('key', 'assistant_talk_plan_config')
      .maybeSingle()
    const talkPlanEnabled = (talkPlanConfigResult.data?.value as { enabled?: boolean } | null)?.enabled === true
    if (!talkPlanEnabled) {
      return {
        status: 200,
        payload: {
          type: 'error',
          code: 'talk_plan_unavailable',
          message: 'Talk & Plan is currently disabled. Turn it on in AI Settings after checking model access.',
          correlation_id: cid,
        },
      }
    }
    if (talkPlanIntentGate?.decision === 'confirm_intent') {
      return {
        status: 200,
        payload: {
          type: 'tool_action',
          tool: 'confirm_talk_plan_action_intent',
          args: {
            action_kind: talkPlanIntentGate.actionKind,
            original_request: latestUserText,
          },
          display_text: `Are you asking Casa to create or change a ${talkPlanIntentGate.actionKind}?`,
          correlation_id: cid,
        },
      }
    }
  }
  if (talkPlanCommandLane && reminderClarification) {
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
  if (talkPlanCommandLane && isBareCalendarAddRequest(latestUserText)) {
    const requestTotalMs = Date.now() - requestStartMs
    appendServerTrace('server_ai_assistant_bare_add_fast_path', latestUserText ?? 'add', {
      request_ms: requestTotalMs,
      llm_calls: 0,
    })
    return {
      status: 200,
      payload: {
        type: 'text',
        text: 'What would you like to add, and for when?',
        // `now` (the shared request-timestamp const) isn't declared until later
        // in this scope -- this fast path runs before that point, so it uses
        // its own Date() rather than hitting a temporal-dead-zone ReferenceError.
        conversation_state: calendarDateNeededConversationState({}, new Date()),
        correlation_id: cid,
        telemetry: { llm_calls: 0, request_total_ms: requestTotalMs, context_load_ms: 0 },
      },
    }
  }
  if (talkPlanCommandLane && bugReportRequest.kind === 'clarify') {
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
  if (talkPlanCommandLane && bugReportRequest.kind === 'create') {
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

  // The hybrid (P3.17, Jake 2026-09-26): every turn the rules above don't take goes to version D —
  // Gemini with the family's data in context, the old path's lookups as tools, photos, recipes and
  // groceries — instead of the old path. A turn D can't finish (time-out, empty, a change failing a
  // hard check) still carries on below: the safety net, kept for a week of automatic bug reports
  // (until 2026-10-04), then deleted with the old path.
  // Every surface (the Wall, the phone, and the classic app's drawer — P3.17, Jake chose "after a week
  // of reports"); planning mode (Talk & Plan) isn't used (0 turns in 30 days) and retires with the old path.
  // The person telling Casa the last answer missed ("that's not what I said", or asking again).
  const flub = flubSignal(Array.isArray(messages) ? messages as Array<{ role: string; content: string }> : [])
  if (flub) autoBugReport(flub, String(latestUserText ?? '').slice(0, 200))
  // No old path behind D any more (retired 2026-10-05, Jake: "yes" to the Oct 4 plan — the safety net stepped in 14
  // times in a week and never once rescued a turn, and not at all after Oct 3). When D can't answer, it says so.
  const answered = await runFullAi(buildDisplayText)
  return { ...answered, payload: { ...answered.payload, layer: 'hybrid' } }

  // How a card reads ("Add … on …"), for D's cards.
  function buildDisplayText(name: string, args: Record<string, unknown>): string {
    // `context`, not the later `utcOffset` const: this is called before that line runs.
    const utcOffsetForDisplay = (context?.utcOffset as string | undefined) ?? '-04:00'
    if (name === 'create_event') {
      const who = Array.isArray(args.members) && args.members.length ? ` · for ${(args.members as string[]).join(', ')}` : ''
      const drives = typeof args.driver_name === 'string' && args.driver_name ? ` · ${args.driver_name} drives` : ''
      return `Create: **${args.title}** · ${humanWhen(args.start, args.end, utcOffsetForDisplay, { allDay: args.all_day === true })}${who}${drives}`
    }
    if (name === 'add_to_coming_up') return `Add to Coming up: **${String(args.title ?? '')}** · ${String(args.step ?? '')} · ${Number(args.notice_days)} day${Number(args.notice_days) === 1 ? '' : 's'} ahead`
    if (name === 'add_coming_up_rule') return args.off === true
      ? `Coming up rule: **never flag "${String(args.match ?? '')}"**`
      : `Coming up rule: **every "${String(args.match ?? '')}"**${args.step ? ` · ${String(args.step)}` : ''}${args.notice_days != null ? ` · ${Number(args.notice_days)} days ahead` : ''}`
    if (name === 'change_coming_up_item') return `Coming up: **${String(args.title ?? '')}** · ${args.action === 'done' ? 'done' : args.action === 'not_needed' ? 'not needed' : 'snooze a week'}`
    if (name === 'add_todo' || name === 'plan_project') {
      const day = (d: unknown) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)
        ? new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })
        : null
      if (name === 'add_todo') return `Add to your to-dos: **${String(args.title ?? '')}**${day(args.due) ? ` · by ${day(args.due)}` : ''}`
      const steps = Array.isArray(args.steps) ? args.steps as Array<{ title?: string; minutes?: number | null; cost_cents?: number | null }> : []
      const size = (st: { minutes?: number | null; cost_cents?: number | null }) => [st.minutes ? (st.minutes < 60 ? `${st.minutes} min` : `${Math.round(st.minutes / 60)} hr`) : null, st.cost_cents ? `$${Math.round(st.cost_cents / 100)}` : null].filter(Boolean).join(', ')
      return [
        `New project: **${String(args.title ?? '')}**${day(args.aim_date) ? ` · aim ${day(args.aim_date)}` : ''} · ${steps.length} steps`,
        ...steps.map((st, i) => `${i + 1}. ${String(st.title ?? '')}${size(st) ? ` (${size(st)})` : ''}`),
        ...(args.from_event_id ? ['Grows from the one already on your list.'] : []),
      ].join('\n')
    }
    if (name === 'add_prep_item') return `Add to **${String(args.event_title ?? 'the event')}** · get & pack: ${String(args.label ?? '')}`
    if (name === 'save_address') return `Save **${String(args.name ?? 'their')}**’s address: ${String(args.address ?? '')}`
    if (name === 'keep_me_posted') return `Keep you posted on emails from or about **${String(args.about ?? '')}**: a line for each in “Anything from email?”, never skipped`
    if (name === 'add_gift_idea') return `Save a gift idea for **${String(args.for_name ?? 'someone')}**: ${String(args.idea ?? '')}`
    if (name === 'create_recipe') {
      const ingredients = Array.isArray(args.ingredients) ? args.ingredients.length : 0
      const steps = Array.isArray(args.steps) ? args.steps.length : 0
      return `Save recipe: **${String(args.name ?? 'Untitled recipe')}** · ${ingredients} ingredient${ingredients === 1 ? '' : 's'} · ${steps} step${steps === 1 ? '' : 's'}`
    }
    if (name === 'update_event') {
      // Build a human-readable single-line summary of what will change
      const parts: string[] = []
      if (args.title !== undefined) parts.push(`title → "${String(args.title)}"`)
      if (args.start !== undefined) parts.push(`time → ${humanWhen(args.start, args.end, utcOffsetForDisplay, { allDay: args.all_day === true })}`)
      if (args.all_day !== undefined) parts.push(args.all_day ? 'all-day' : 'timed')
      if (args.location !== undefined || args.address !== undefined) parts.push(`location → "${placeOnCard([args.location, args.address].filter(Boolean).join(', '))}"`)
      if (args.driver_name !== undefined) parts.push(`driver → ${String(args.driver_name || 'none')}`)
      if (args.driver_leg1 !== undefined || args.driver_leg2 !== undefined) {
        parts.push(`drivers → dropoff: ${String(args.driver_leg1 ?? '—')}, pickup: ${String(args.driver_leg2 ?? '—')}`)
      }
      if (args.travel_behavior !== undefined) parts.push(`logistics → ${String(args.travel_behavior)}`)
      if (args.primary_attendee !== undefined) parts.push(`for → ${String(args.primary_attendee)}`)
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
  }

  const run = async (): Promise<{ status: number; payload: Record<string, unknown> }> => {
    let out = await runPipeline()
    // A question stays a question: it's never answered with a card to change something.
    const proposesChange = (out.payload.type === 'tool_action' && WRITE_TOOLS.has(String(out.payload.tool))) || out.payload.type === 'tool_action_batch'
    // …except one found in the mail (Oct 5: "did anything come in from …?" found the meeting and its card was swapped
    // for a calendar answer): there the card is the point.
    if (turnResolution?.isQuestion && proposesChange && !aboutMail(latestUserText)) {
      appendServerTrace('server_ai_assistant_question_kept', String(out.payload.tool ?? out.payload.type), { tool: out.payload.tool ?? null })
      const answered = await answerFromCalendar(sb, turnResolution.standalone ?? latestUserText ?? '', turnContext?.referents ?? [], context, cid, drawerThinkingBudget ?? 0)
        .catch(() => ({ text: 'I couldn’t find that just now.', mentioned: [] as TurnReferent[] }))
      const text = answered.text
      out = { status: 200, payload: { type: 'text', text, conversation_state: answerState(answered.mentioned, null) ?? incomingConversationState ?? null, semantic_intent: 'conversation.question_kept', correlation_id: cid } }
    }
    // The turn also dropped the open card ("never mind — what time is …?"): close it with the answer.
    if (turnResolution?.closesDraft && !out.payload.closes_draft && out.payload.type !== 'tool_action') out.payload.closes_draft = true
    // The one day the words were about (any day): the wall opens it, or offers to — whoever answered.
    if (out.payload.type === 'text' && !out.payload.aside && !out.payload.show_day && turnResolution?.day) out.payload.show_day = { date: turnResolution.day.date, open: turnResolution.day.open }
    if (turnResolution) {
      out.payload.turn_context = {
        act: turnResolution.act,
        closes_draft: turnResolution.closesDraft,
        standalone: turnResolution.standalone,
        is_question: turnResolution.isQuestion,
        event_id: turnResolution.eventId,
        day: turnResolution.day ?? null,
        directions_to: turnResolution.directionsTo ?? null,
        address_for: turnResolution.addressFor ?? null,
        prep: turnResolution.prep ?? null,
        keep_posted: turnResolution.keepPosted ?? null,
        search: turnResolution.search ?? null,
        ms: turnContext?.ms ?? null,
        rewritten: turnContext?.originalText !== turnResolution.standalone,
      }
    }
    return out
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
      emitStatus = (text) => { try { controller.enqueue(sse('status', { text })) } catch { /* closed */ } }
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
        emitStatus = () => {}
        try { controller.close() } catch { /* already closed */ }
      }
    },
  })
  return new Response(stream, {
    headers: { ...CORS, 'content-type': 'text/event-stream', 'cache-control': 'no-cache', 'connection': 'keep-alive' },
  })
})
