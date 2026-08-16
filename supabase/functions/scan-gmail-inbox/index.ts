/**
 * scan-gmail-inbox  v3 — Casa Ingest & Learn Engine
 *
 * For each family member with gmail_scan_enabled:
 *   1. Fetch new inbox messages (incremental via historyId) + fetch messages labeled 'Casa'
 *   2. Match & inject learned capture rules (household_capture_rules) into prompt context
 *   3. Compound Decomposer: Extract ALL calendar events and ALL action items (forms, payment, rsvp, deadline, etc.)
 *   4. new_event / compound events → fuzzy-dedup against existing events → create multiple events if present
 *   5. update_event → patch existing event; surface conflict notification if times changed significantly
 *   6. travel_detail → hand off to scan-travel-emails pipeline inline
 *   7. If message was user-labeled 'Casa' → auto-train by creating/updating learned capture rule for sender domain
 *   8. Latest-email-wins for trips (compare source_email_received_at)
 */

import { createClient } from 'npm:@supabase/supabase-js@2'
import { resolveBackgroundLlmConfig } from '../_shared/background-llm-model.mjs'
import { createTrackedProviderFetch } from '../_shared/provider-call-ledger.mjs'
import { canonicalContentFingerprint, canonicalEmailKey, normalizeInternetMessageId } from '../_shared/gmail-canonical-email.mjs'
import { classifyFamilyEvidenceCandidate, redactFamilyEvidenceText } from '../_shared/family-email-evidence.mjs'
import { extractGmailMessageContent } from '../_shared/gmail-message-content.mjs'
import {
  filterImmediateFamilyMembers,
  isSharedFamilyInbox,
  resolveImmediateFamilyMember,
} from '../_shared/immediate-family-scope.mjs'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const providerFetch = createTrackedProviderFetch({
  functionName: 'scan-gmail-inbox',
  capability: 'gmail-scan',
  trafficClass: 'background',
})

const TRAVEL_SENDER_DOMAINS = [
  'mycwt.com', 'carlsonwagonlit.com', 'concur.com', 'egencia.com',
  'aa.com', 'delta.com', 'united.com', 'southwest.com', 'jetblue.com',
  'spirit.com', 'alaskaair.com', 'hawaiianairlines.com', 'flyfrontier.com',
  'marriott.com', 'hilton.com', 'ihg.com', 'hyatt.com', 'wyndham.com',
  'booking.com', 'expedia.com', 'tripit.com',
]
const TRAVEL_KEYWORDS = /itinerary|e-ticket|eticket|boarding pass|flight confirmation|booking confirmation|reservation confirmed|hotel confirmation|your flight|trip receipt|travel itinerary|airline confirmation|ticket number|record locator|e-ticket and trip/i

// Keywords that suggest calendar relevance
const CALENDAR_KEYWORDS = /appointment|appt|booking|reservation|confirm|invite|invitation|reminder|rsvp|meeting|schedule|event|registration|playdate|dentist|doctor|physician|clinic|hospital|therapy|checkup|concert|show|performance|game|match|tournament|practice|party|birthday|celebration|dinner|lunch|brunch|flight|hotel|check-in|checkout|school|class|lesson|camp|workshop|conference|orientation|pickup|pick-up|drop-off|drop off|parent-teacher|parent teacher|field trip|volunteer|carpool|open house|spirit day|spirit week|pto|pta|picture day|school pictures?|book fair|curriculum night|back to school|meet the teacher/i

// Keywords that suggest a family todo/action worth surfacing
const ACTION_KEYWORDS = /permission slip|consent form|waiver|paperwork|due date|deadline|invoice|payment due|payment reminder|pay by|pay \$|please pay|amount due|balance due|account balance|schoolcash|school cash|agenda sale|purchase an agenda|autopay|auto-pay|auto pay|past due|overdue|final notice|bill is ready|your bill|billing statement|statement is ready|statement (is )?ready|tuition|fee is due|late fee|rsvp|respond by|register by|register your ride|registration deadline|submit by|application|summer assignments|renew by|renewal|membership expir|subscription|expires (on|soon)|expiring soon|card expiring|order confirmation|shipping confirmation|shipped|out for delivery|delivered|track(ing)? (your |this )?(package|order|shipment)|delivery confirmation|return by|return window|refund|please complete|complete (the )?attached|complete this form|complete any forms|fill out|yellow folder|sign and return|signature required|action required|response required|please sign|approval needed|verify your|update your payment|please review and (sign|complete|submit)|pto|pta|spirit day|spirit week|dress up day|picture day|school pictures?|book fair|field day|open house|curriculum night|back to school|meet the teacher|early dismissal|half day|no school|teacher planning|teacher workday|early release|late start|school newsletter|class party|room parent|teacher appreciation|volunteers? needed|volunteer sign up|sign-up genius|signupgenius|bring to school|wear your|wear spirit|school shirt|uniform day|spirit wear|pto meeting|school event/i

// ── Learned Capture Rules Interface ──────────────────────────────

export interface HouseholdCaptureRule {
  id?: string
  pattern_type: 'domain' | 'sender' | 'subject'
  pattern_value: string
  rule_directive: string
  origin?: 'user_label' | 'manual_teach' | 'learned_feedback'
  confidence?: number
  active?: boolean
}

async function fetchHouseholdCaptureRules(sb: ReturnType<typeof createClient>): Promise<HouseholdCaptureRule[]> {
  try {
    const { data, error } = await sb.from('household_capture_rules').select('*').eq('active', true)
    if (!error && Array.isArray(data)) return data
  } catch {}
  try {
    const { data: setting } = await sb.from('settings').select('value').eq('key', 'household_capture_rules').maybeSingle()
    if (setting?.value && Array.isArray(setting.value)) return setting.value
  } catch {}
  return []
}

async function persistLearnedCaptureRule(
  sb: ReturnType<typeof createClient>,
  rule: HouseholdCaptureRule,
): Promise<void> {
  const normVal = rule.pattern_value.toLowerCase().trim()
  try {
    const { error } = await sb.from('household_capture_rules').upsert({
      pattern_type: rule.pattern_type,
      pattern_value: normVal,
      rule_directive: rule.rule_directive,
      origin: rule.origin ?? 'user_label',
      confidence: rule.confidence ?? 1.0,
      active: true,
      last_matched_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'pattern_type,pattern_value' })
    if (!error) return
  } catch {}

  // Fallback to settings table
  try {
    const { data: setting } = await sb.from('settings').select('value').eq('key', 'household_capture_rules').maybeSingle()
    const current: HouseholdCaptureRule[] = Array.isArray(setting?.value) ? setting.value : []
    const existingIdx = current.findIndex(r => r.pattern_type === rule.pattern_type && r.pattern_value.toLowerCase() === normVal)
    if (existingIdx >= 0) {
      current[existingIdx] = { ...current[existingIdx], ...rule }
    } else {
      current.push(rule)
    }
    await sb.from('settings').upsert({ key: 'household_capture_rules', value: current })
  } catch {}
}

function filterMatchingCaptureRules(rules: HouseholdCaptureRule[], from: string, subject: string): HouseholdCaptureRule[] {
  const fromLower = from.toLowerCase()
  const subjLower = subject.toLowerCase()
  return rules.filter((r) => {
    if (!r.active && r.active !== undefined) return false
    const val = r.pattern_value.toLowerCase()
    if (r.pattern_type === 'domain') {
      return fromLower.includes(`@${val}`) || fromLower.includes(val)
    }
    if (r.pattern_type === 'sender') {
      return fromLower.includes(val)
    }
    if (r.pattern_type === 'subject') {
      return subjLower.includes(val)
    }
    return false
  })
}

// ── Gmail helpers ─────────────────────────────────────────────────

async function gmailFetch(path: string, token: string) {
  return fetch(`https://gmail.googleapis.com/gmail/v1${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
}

async function getUserLabeledMessages(accessToken: string, labelQuery = 'Casa'): Promise<{ id: string }[]> {
  try {
    const res = await gmailFetch(`/users/me/messages?q=label:${encodeURIComponent(labelQuery)}&maxResults=50`, accessToken)
    if (!res.ok) return []
    const data = await res.json()
    return data.messages ?? []
  } catch {
    return []
  }
}

async function getRecentMessages(
  accessToken: string,
  historyId: string | null,
  backfillSince?: string | null,
  backfillBefore?: string | null,
): Promise<{ messages: { id: string }[]; newHistoryId: string | null }> {
  if (backfillSince) {
    const after = Math.floor(new Date(backfillSince).getTime() / 1000)
    if (!Number.isFinite(after)) throw new Error('Invalid backfill_since timestamp')
    const before = backfillBefore ? Math.floor(new Date(backfillBefore).getTime() / 1000) : null
    if (before !== null && (!Number.isFinite(before) || before <= after)) {
      throw new Error('Invalid backfill_before timestamp')
    }
    const messages: { id: string }[] = []
    let pageToken = ''
    do {
      const page = pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''
      const beforeQuery = before !== null ? `+before:${before}` : ''
      const res = await gmailFetch(`/users/me/messages?labelIds=INBOX&q=after:${after}${beforeQuery}&maxResults=500${page}`, accessToken)
      if (!res.ok) throw new Error(`Could not list Gmail backfill messages: ${res.status}`)
      const data = await res.json()
      messages.push(...(data.messages ?? []))
      pageToken = data.nextPageToken ?? ''
    } while (pageToken)
    return { messages, newHistoryId: null }
  }
  if (historyId) {
    const res = await gmailFetch(`/users/me/history?startHistoryId=${historyId}&historyTypes=messageAdded&labelId=INBOX&maxResults=50`, accessToken)
    if (res.status === 404) return getRecentMessages(accessToken, null)
    if (!res.ok) return { messages: [], newHistoryId: null }
    const data = await res.json()
    const messages: { id: string }[] = []
    for (const h of (data.history ?? [])) {
      for (const m of (h.messagesAdded ?? [])) {
        if (m.message?.labelIds?.includes('INBOX')) messages.push({ id: m.message.id })
      }
    }
    return { messages, newHistoryId: data.historyId ?? historyId }
  } else {
    const after = Math.floor((Date.now() - 72 * 3600 * 1000) / 1000)
    const res = await gmailFetch(`/users/me/messages?labelIds=INBOX&q=after:${after}&maxResults=50`, accessToken)
    if (!res.ok) return { messages: [], newHistoryId: null }
    const data = await res.json()
    const profileRes = await gmailFetch('/users/me/profile', accessToken)
    const profile = profileRes.ok ? await profileRes.json() : {}
    return { messages: data.messages ?? [], newHistoryId: profile.historyId ?? null }
  }
}

async function getMessageDetails(msgId: string, accessToken: string) {
  const res = await gmailFetch(`/users/me/messages/${msgId}?format=full`, accessToken)
  if (!res.ok) return null
  const msg = await res.json()
  const headers: { name: string; value: string }[] = msg.payload?.headers ?? []
  const content = extractGmailMessageContent(msg.payload ?? {})
  const labelIds: string[] = msg.labelIds ?? []
  return {
    subject: headers.find(h => h.name.toLowerCase() === 'subject')?.value ?? '',
    from:    headers.find(h => h.name.toLowerCase() === 'from')?.value ?? '',
    date:    headers.find(h => h.name.toLowerCase() === 'date')?.value ?? '',
    internetMessageId: normalizeInternetMessageId(headers.find(h => h.name.toLowerCase() === 'message-id')?.value),
    threadId: typeof msg.threadId === 'string' ? msg.threadId : null,
    snippet: msg.snippet ?? '',
    body:    content.text,
    contentFormat: content.format,
    attachments: content.attachments,
    labelIds,
  }
}

// ── Token refresh ─────────────────────────────────────────────────

async function refreshToken(rt: string, clientId: string, clientSecret: string) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: rt, client_id: clientId, client_secret: clientSecret }),
  })
  if (!res.ok) return null
  return res.json() as Promise<{ access_token: string; expires_in: number }>
}

// ── LLM call ──────────────────────────────────────────────────────

type UsageAccumulator = {
  inputTokens: number
  outputTokens: number
}

function toNonNegativeInt(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.round(value) : 0
}

async function callLLM(
  llmConfig: { provider?: string; model?: string; api_key: string },
  prompt: string,
  usage?: UsageAccumulator,
): Promise<string> {
  const provider = llmConfig.provider ?? 'gemini'
  const model = provider === 'gemini' ? 'gemini-2.5-flash-lite' : (llmConfig.model ?? 'gpt-4o-mini')
  const apiKey = llmConfig.api_key
  if (provider === 'openai') {
    const res = await providerFetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }], response_format: { type: 'json_object' }, temperature: 0.1, max_tokens: 600 }),
    })
    if (!res.ok) throw new Error(`OpenAI ${res.status}`)
    const data = await res.json()
    return data.choices[0].message.content
  } else {
    const res = await providerFetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 600, temperature: 0.1, responseMimeType: 'application/json' },
      }),
    })
    if (!res.ok) throw new Error(`Gemini ${res.status}`)
    const data = await res.json()
    if (usage) {
      usage.inputTokens += toNonNegativeInt(data?.usageMetadata?.promptTokenCount)
      usage.outputTokens += toNonNegativeInt(data?.usageMetadata?.candidatesTokenCount)
    }
    return data.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
  }
}

// ── Intent classification & Compound Decomposer ───────────────────

export interface ExtractedEventItem {
  title: string
  start_datetime: string   // ISO8601 or YYYY-MM-DD
  end_datetime?: string
  all_day?: boolean
  location?: string
  description?: string
  assigned_member?: string  // family member name
}

export interface EmailIntent {
  intent: 'new_event' | 'update_event' | 'travel_detail' | 'skip'
  // Compound events array (for newsletters / multi-event messages)
  events?: ExtractedEventItem[]
  // Single event backward-compatibility fields
  title?: string
  start_datetime?: string
  end_datetime?: string
  all_day?: boolean
  location?: string
  description?: string
  assigned_member?: string
  // update_event fields
  updates_event_title?: string
  updates_event_date?: string
  change_summary?: string
  // skip field
  skip_reason?: string
  // family evidence
  family_evidence?: {
    relevant: boolean
    category?: 'school' | 'athletics' | 'appointment' | 'medical' | 'forms' | 'payment' | 'insurance' | 'utilities' | 'order_delivery' | 'other_family_service'
    summary?: string
    entity_names?: string[]
    effective_at?: string
    expires_at?: string
    privacy_class?: 'standard' | 'sensitive' | 'excluded'
    confidence?: number
  }
}

export interface InboxActionItem {
  type: 'forms' | 'payment' | 'rsvp' | 'deadline' | 'delivery' | 'renewal' | 'general'
  title: string
  description: string
  due_datetime?: string // ISO8601 or empty
  assigned_member?: string
  priority?: 1 | 2 | 3
  vendor?: string
  transaction_id?: string
  transaction_status?: string
}

async function classifyEmail(
  subject: string,
  from: string,
  date: string,
  body: string,
  familyMembers: { id: string; name: string; role: string }[],
  llmConfig: { provider?: string; model?: string; api_key: string },
  matchingRules: HouseholdCaptureRule[] = [],
  usage?: UsageAccumulator,
): Promise<EmailIntent | null> {
  const today = new Date().toISOString().slice(0, 10)
  const rulesBlock = matchingRules.length > 0
    ? `\nHOUSEHOLD LEARNED RULES FOR THIS SENDER:\n${matchingRules.map(r => `- [${r.pattern_type}: ${r.pattern_value}] ${r.rule_directive}`).join('\n')}\n`
    : ''

  const prompt = `You are the inbox classifier for a family calendar app. Today is ${today}.
Family members: ${familyMembers.map(m => `${m.name} (${m.role})`).join(', ')}
${rulesBlock}
Classify this email. Note: An email may contain ONE or MULTIPLE distinct family events/dates (for example: School Pictures, Grade 6 Open House, and Grades 7 & 8 Open House).

Primary intent:
- "new_event": Brand-new appointment, booking, school event, picture day, open house, meeting, game, tryout with specific dates/times. If multiple dates/events exist, return them ALL under "events".
- "update_event": An update, change, cancellation, or reminder for an EXISTING event.
- "travel_detail": Flight confirmation, hotel booking, trip itinerary, e-ticket.
- "skip": Purely promotional, marketing without scheduled dates, or routine receipt.

EMAIL:
Subject: ${subject}
From: ${from}
Date: ${date}
Body: ${body.slice(0, 3500)}

Reply ONLY with JSON:
{
  "intent": "new_event|update_event|travel_detail|skip",
  "events": [
    {
      "title": "short event title",
      "start_datetime": "ISO8601 with timezone offset or YYYY-MM-DD",
      "end_datetime": "ISO8601 with timezone offset or YYYY-MM-DD",
      "all_day": false,
      "location": "venue/address or empty",
      "description": "1-2 sentence summary",
      "assigned_member": "family member name most likely attending, or empty"
    }
  ],
  "title": "short event title (if single event)",
  "start_datetime": "ISO8601 or YYYY-MM-DD (if single event)",
  "end_datetime": "ISO8601 or YYYY-MM-DD",
  "all_day": false,
  "location": "venue/address or empty",
  "description": "1-2 sentence summary",
  "assigned_member": "family member name",
  "updates_event_title": "title of event being updated (update_event only)",
  "updates_event_date": "YYYY-MM-DD of event being updated (update_event only)",
  "change_summary": "what changed: e.g. 'time moved from 2pm to 3pm' (update_event only)",
  "skip_reason": "why skipping (skip only)",
  "family_evidence": {
    "relevant": false,
    "category": "school|athletics|appointment|medical|forms|payment|insurance|utilities|order_delivery|other_family_service",
    "summary": "concise source-backed operational facts only",
    "entity_names": ["people, schools, providers, teams, or services explicitly named"],
    "effective_at": "ISO8601 or empty",
    "expires_at": "ISO8601 or empty",
    "privacy_class": "standard|sensitive|excluded",
    "confidence": 0.0
  }
}`

  try {
    const raw = await callLLM(llmConfig, prompt, usage)
    return JSON.parse(raw.replace(/```json\n?|\n?```/g, '').trim()) as EmailIntent
  } catch { return null }
}

async function extractInboxActions(
  subject: string,
  from: string,
  date: string,
  body: string,
  familyMembers: { id: string; name: string; role: string }[],
  llmConfig: { provider?: string; model?: string; api_key: string },
  matchingRules: HouseholdCaptureRule[] = [],
  usage?: UsageAccumulator,
): Promise<InboxActionItem[]> {
  const today = new Date().toISOString().slice(0, 10)
  const rulesBlock = matchingRules.length > 0
    ? `\nHOUSEHOLD LEARNED RULES FOR THIS SENDER:\n${matchingRules.map(r => `- [${r.pattern_type}: ${r.pattern_value}] ${r.rule_directive}`).join('\n')}\n`
    : ''

  const prompt = `You extract actionable family inbox tasks. Today is ${today}.
Family members: ${familyMembers.map(m => `${m.name} (${m.role})`).join(', ')}
${rulesBlock}
Return ALL tasks that require family follow-up:
- forms (permission slips, waivers, bus transportation registrations like 'Register Your Ride', Student ID pickup, PTO forms, Adopt-A-Class)
- payment (bill, statement, tuition, dues, membership fees, school donations/supplies)
- rsvp (sports league registrations, fall registration, tryouts, confirmations)
- deadline (order deadlines, picture orders, submit/apply by date)
- delivery (package/order shipped, tracking)
- renewal (subscriptions, memberships)
- general (school dismissal adjustments, teacher notes requiring parent action)

When an email is a school newsletter or sports league announcement, extract each distinct form, fee, registration, or required supply item.

EMAIL:
Subject: ${subject}
From: ${from}
Date: ${date}
Body: ${body.slice(0, 3500)}

Respond ONLY JSON:
{
  "actions": [
    {
      "type": "forms|payment|rsvp|deadline|delivery|renewal|general",
      "title": "short title",
      "description": "what needs to be done and why",
      "due_datetime": "ISO8601 with timezone offset or empty",
      "assigned_member": "family member name or empty",
      "priority": 1,
      "vendor": "merchant or service name, or empty",
      "transaction_id": "exact transaction identifier, or empty",
      "transaction_status": "confirmed|payment|shipped|out_for_delivery|delivered|problem, or empty"
    }
  ]
}

If no actionable task exists, return {"actions":[]}.`

  try {
    const raw = await callLLM(llmConfig, prompt, usage)
    const parsed = JSON.parse(raw.replace(/```json\n?|\n?```/g, '').trim()) as { actions?: InboxActionItem[] }
    return (parsed.actions ?? []).filter(a => !!a?.description && !!a?.type)
  } catch {
    return []
  }
}

function normalizeTransactionKeyPart(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

function transactionDescriptor(action: InboxActionItem): string | null {
  const text = `${action.title ?? ''} ${action.description}`
  const descriptor = text.match(
    /(?:delivered:\s*|delivery of\s+)([a-z0-9][a-z0-9™+ .'-]{2,100}?\+\s*\d+\s*items?)/i,
  )?.[1]
  return descriptor ? normalizeTransactionKeyPart(descriptor) : null
}

function transactionIdentity(action: InboxActionItem, sourceRef: string) {
  const vendor = action.vendor?.trim()
  if (!vendor) return { threadKey: null, vendor: null, stage: null }
  const transactionId = action.transaction_id?.trim()
  const descriptor = transactionDescriptor(action)
  const vendorKey = normalizeTransactionKeyPart(vendor)
  const transactionKey = transactionId
    ? normalizeTransactionKeyPart(transactionId)
    : descriptor
      ? `items:${descriptor}`
      : `message:${sourceRef}`
  return {
    threadKey: `transaction:${vendorKey}:${transactionKey}`,
    vendor,
    stage: action.transaction_status?.trim() || null,
  }
}

function parseDueDateOrFallback(due: string | undefined, receivedAtIso: string, eventStartIso?: string | null): string {
  if (due) {
    const parsed = new Date(due)
    if (!isNaN(parsed.getTime())) return parsed.toISOString()
  }
  if (eventStartIso) {
    const parsedEvent = new Date(eventStartIso)
    if (!isNaN(parsedEvent.getTime())) return parsedEvent.toISOString()
  }
  return new Date(new Date(receivedAtIso).getTime() + 72 * 60 * 60 * 1000).toISOString()
}

function filterCurrentBackfillActions(actions: InboxActionItem[], now: Date): InboxActionItem[] {
  return actions.filter((action) => {
    if (!action.due_datetime) return false
    const due = new Date(action.due_datetime)
    return !isNaN(due.getTime()) && due.getTime() >= now.getTime()
  })
}

async function persistInboxActions(
  sb: ReturnType<typeof createClient>,
  sourceOwnerMemberId: string | null,
  messageId: string,
  subject: string,
  eventId: string | null,
  eventTitle: string | null,
  eventDate: string | null,
  receivedAtIso: string,
  actions: InboxActionItem[],
  familyMembers: { id: string; name: string; role: string }[],
  isUserLabeled = false,
  clusterId: string | null = null,
): Promise<number> {
  if (actions.length === 0) return 0
  const rows = actions.map((a) => {
    const owner = familyMembers.find((m) =>
      a.assigned_member && m.name.toLowerCase().includes(a.assigned_member.toLowerCase()),
    )
    const dueBy = parseDueDateOrFallback(a.due_datetime, receivedAtIso, eventDate)
    const title = a.title?.trim() || subject.slice(0, 80)
    const description = a.description.trim()
    const emoji = a.type === 'payment' ? '💳'
      : a.type === 'rsvp' ? '📩'
      : a.type === 'forms' ? '📝'
      : a.type === 'deadline' ? '⏰'
      : a.type === 'delivery' ? '📦'
      : a.type === 'renewal' ? '🔄'
      : '📌'
    const normalizedPriority: 1 | 2 | 3 = a.priority === 3 ? 3 : a.priority === 1 ? 1 : 2
    const sourceRef = `gmail:${sourceOwnerMemberId ?? 'household'}:${messageId}`
    const transaction = transactionIdentity(a, sourceRef)
    return {
      event_id: eventId,
      type: a.type,
      emoji,
      description,
      event_title: eventTitle ?? `${owner?.name ?? familyMembers.find((f) => f.id === sourceOwnerMemberId)?.name ?? 'Family'} · ${title}`,
      event_date: eventDate ?? dueBy,
      due_by: dueBy,
      priority: normalizedPriority,
      source_type: 'gmail',
      source_ref: sourceRef,
      source_pattern_key: `action:${a.type}`,
      source_confidence: isUserLabeled ? 1 : 0.9,
      attention_thread_key: transaction.threadKey,
      attention_vendor: transaction.vendor,
      attention_stage: transaction.stage,
      is_user_labeled: isUserLabeled,
      cluster_id: clusterId,
    }
  })
  try {
    const { data, error } = await sb.from('prep_items').insert(rows).select('id')
    if (!error) return data?.length ?? 0
  } catch {}

  // Fallback without new columns if table migration is pending
  const fallbackRows = rows.map(({ is_user_labeled: _u, cluster_id: _c, ...rest }) => rest)
  const { data, error } = await sb.from('prep_items').insert(fallbackRows).select('id')
  if (error) throw error
  return data?.length ?? 0
}

async function persistEmailKnowledgeClaims(
  sb: ReturnType<typeof createClient>,
  canonicalEmailId: string,
  familyMemberId: string,
  messageId: string,
  receivedAt: string,
  eventId: string | null = null,
): Promise<void> {
  const sourceRef = `gmail:${familyMemberId}:${messageId}`
  const { data: prepItems, error: prepItemsError } = await sb
    .from('prep_items')
    .select('id, type, description, event_title, due_by, priority')
    .eq('source_ref', sourceRef)
  if (prepItemsError) throw prepItemsError
  if (!prepItems || prepItems.length === 0) return

  const rows = prepItems.map((item) => ({
    claim_key: `gmail:${canonicalEmailId}:prep:${item.id}`,
    claim_type: 'commitment',
    status: 'active',
    requiredness: item.priority >= 2 ? 'required' : 'optional',
    privacy_class: 'standard',
    title: item.event_title || 'Family email action',
    summary: item.description,
    family_member_id: familyMemberId,
    event_id: eventId,
    prep_item_id: item.id,
    canonical_email_id: canonicalEmailId,
    effective_at: receivedAt,
    expires_at: item.due_by,
    confidence: 0.9,
    metadata: {
      source_type: 'gmail',
      action_type: item.type,
    },
  }))
  const { error } = await sb
    .from('family_knowledge_claims')
    .upsert(rows, { onConflict: 'claim_key' })
  if (error) throw error
}

async function persistFamilyEmailEvidence(
  sb: ReturnType<typeof createClient>,
  canonicalEmailId: string,
  details: {
    subject: string
    from: string
    body: string
    threadId: string | null
  },
  receivedAt: string,
  contentFingerprint: string,
  evidence: EmailIntent['family_evidence'],
  fallbackCategory: string | null,
): Promise<boolean> {
  const category = evidence?.category || fallbackCategory
  const privacyClass = evidence?.privacy_class ?? 'standard'
  if (
    !evidence?.relevant ||
    privacyClass !== 'standard' ||
    !category
  ) {
    return false
  }

  const receivedTime = new Date(receivedAt)
  const retentionDate = new Date(receivedTime)
  retentionDate.setUTCMonth(retentionDate.getUTCMonth() + 4)
  const requestedExpiry = evidence.expires_at ? new Date(evidence.expires_at) : null
  const expiresAt = requestedExpiry && !isNaN(requestedExpiry.getTime()) && requestedExpiry < retentionDate
    ? requestedExpiry
    : retentionDate
  const requestedEffective = evidence.effective_at ? new Date(evidence.effective_at) : null
  const effectiveAt = requestedEffective && !isNaN(requestedEffective.getTime())
    ? requestedEffective.toISOString()
    : receivedAt
  const safeBody = redactFamilyEvidenceText(details.body).slice(0, 12000)
  const safeSummary = redactFamilyEvidenceText(evidence.summary || details.subject).slice(0, 1200)
  const entityRefs = (evidence.entity_names ?? [])
    .map((name) => redactFamilyEvidenceText(name).slice(0, 120))
    .filter(Boolean)
    .slice(0, 20)

  const { error: documentError } = await sb
    .from('family_data_documents')
    .upsert({
      source_type: 'email',
      source_id: canonicalEmailId,
      title: redactFamilyEvidenceText(details.subject || 'Family email').slice(0, 300),
      redacted_text: `${safeSummary}\n\n${safeBody}`.trim(),
      category,
      entity_refs: entityRefs,
      occurred_at: receivedAt,
      effective_at: effectiveAt,
      expires_at: expiresAt.toISOString(),
      status: 'active',
      confidence: Number.isFinite(Number(evidence.confidence))
        ? Math.min(1, Math.max(0, Number(evidence.confidence)))
        : 0.8,
      privacy_class: 'standard',
      content_hash: contentFingerprint,
      metadata: {
        sender: redactFamilyEvidenceText(details.from).slice(0, 300),
        subject: redactFamilyEvidenceText(details.subject).slice(0, 300),
        received_at: receivedAt,
        gmail_thread_id: details.threadId,
      },
    }, { onConflict: 'source_type,source_id' })
  if (documentError) throw documentError

  const { error: queueError } = await sb
    .from('family_data_index_queue')
    .upsert({
      source_type: 'email',
      source_id: canonicalEmailId,
      operation: 'upsert',
      status: 'pending',
      attempts: 0,
      available_at: new Date().toISOString(),
      locked_at: null,
      locked_by: null,
      last_error: null,
    }, { onConflict: 'source_type,source_id' })
  if (queueError) throw queueError
  return true
}

// ── Fuzzy event dedup ─────────────────────────────────────────────

function titleSimilarity(a: string, b: string): number {
  const words = (s: string) => new Set(s.toLowerCase().replace(/[^a-z0-9 ]/g, '').split(/\s+/).filter(w => w.length > 2))
  const wa = words(a); const wb = words(b)
  if (wa.size === 0 || wb.size === 0) return 0
  let shared = 0
  for (const w of wa) if (wb.has(w)) shared++
  return shared / Math.max(wa.size, wb.size)
}

async function findMatchingEvent(
  sb: ReturnType<typeof createClient>,
  memberId: string,
  title: string,
  startDatetime: string,
  location: string,
): Promise<{ id: string; title: string; start_time: string; end_time: string; location_name: string | null } | null> {
  if (!startDatetime || startDatetime === 'unknown') return null
  const d = new Date(startDatetime)
  if (isNaN(d.getTime())) return null

  // Search ±2 days
  const lo = new Date(d); lo.setDate(d.getDate() - 2)
  const hi = new Date(d); hi.setDate(d.getDate() + 2)

  const { data: events } = await sb
    .from('event_members')
    .select('events!inner(id, title, start_time, end_time, location_name)')
    .eq('family_member_id', memberId)
    .gte('events.start_time', lo.toISOString())
    .lte('events.start_time', hi.toISOString())

  if (!events || events.length === 0) return null

  for (const row of events) {
    const ev = (row as { events: { id: string; title: string; start_time: string; end_time: string; location_name: string | null } }).events
    const sim = titleSimilarity(title, ev.title)
    const locMatch = location && ev.location_name && ev.location_name.toLowerCase().includes(location.toLowerCase().slice(0, 10))
    if (sim >= 0.5 || locMatch) return ev
  }
  return null
}

function minutesDiff(a: string, b: string): number {
  return Math.abs(new Date(a).getTime() - new Date(b).getTime()) / 60000
}

// ── Main handler ──────────────────────────────────────────────────

async function handleGmailScan(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })

  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const clientId     = Deno.env.get('GOOGLE_CLIENT_ID')!
  const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET')!

  const [llmRes, familyRes, learnedRules] = await Promise.all([
    sb.from('settings').select('value').eq('key', 'llm_config').single(),
    sb.from('family_members').select('id, name, role').order('sort_order'),
    fetchHouseholdCaptureRules(sb),
  ])
  const llm = resolveBackgroundLlmConfig(llmRes.data?.value) as {
    api_key?: string
    model?: string
    provider?: string
  }
  if (!llm?.api_key) {
    return new Response(JSON.stringify({ error: 'AI not configured' }), { status: 400, headers: { ...CORS, 'content-type': 'application/json' } })
  }
  const familyMembers = filterImmediateFamilyMembers((familyRes.data ?? []) as { id: string; name: string; role: string }[])
  if (familyMembers.length === 0) {
    return new Response(JSON.stringify({ error: 'No immediate family members configured for Gmail scan scope' }), {
      status: 400,
      headers: { ...CORS, 'content-type': 'application/json' },
    })
  }

  const body = await req.json().catch(() => ({}))
  const targetMemberId: string | null = body.family_member_id ?? null
  const backfillSince = typeof body.backfill_since === 'string' ? body.backfill_since : null
  const backfillBefore = typeof body.backfill_before === 'string' ? body.backfill_before : null
  const backfillActionsOnly = body.backfill_actions_only === true
  const backfillFamilyEvidenceOnly = body.backfill_family_evidence_only === true

  let query = sb.from('google_tokens')
    .select('family_member_id, google_email, refresh_token, access_token, expires_at, gmail_history_id')
    .eq('gmail_scan_enabled', true)
  if (targetMemberId) query = query.eq('family_member_id', targetMemberId)
  const { data: tokens } = await query

  const results: { member_id: string; scanned: number; created: number; updated: number; travel: number; skipped: number; conflicts: number; actions: number; evidence: number; error?: string }[] = []
  const llmUsage: UsageAccumulator = { inputTokens: 0, outputTokens: 0 }
  let indexedEvidenceTotal = 0

  for (const tok of (tokens ?? [])) {
    const memberId = tok.family_member_id
    const tokenBelongsToImmediateFamily = familyMembers.some((member) => member.id === memberId)
    const sharedInboxToken = isSharedFamilyInbox(tok.google_email)
    if (!tokenBelongsToImmediateFamily && !sharedInboxToken) continue
    const attemptedAt = new Date().toISOString()
    await sb.from('google_tokens').update({ gmail_last_scan_attempt_at: attemptedAt }).eq('family_member_id', memberId)

    try {
      let accessToken = tok.access_token

      // Refresh if needed
      if (!accessToken || !tok.expires_at || new Date(tok.expires_at) < new Date(Date.now() + 60_000)) {
        const refreshed = await refreshToken(tok.refresh_token, clientId, clientSecret)
        if (!refreshed) throw new Error('token refresh failed')
        accessToken = refreshed.access_token
        await sb.from('google_tokens').update({
          access_token: refreshed.access_token,
          expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
        }).eq('family_member_id', memberId)
      }

      // ── Dual-Pass: Recent Inbox + User-Labeled 'Casa' Messages ──
      const [recentResult, labeledMessages] = await Promise.all([
        getRecentMessages(accessToken, tok.gmail_history_id, backfillSince, backfillBefore),
        getUserLabeledMessages(accessToken, 'Casa'),
      ])
      const { messages, newHistoryId } = recentResult
      if (newHistoryId) {
        await sb.from('google_tokens').update({ gmail_history_id: newHistoryId }).eq('family_member_id', memberId)
      }

      // Merge messages; tag labeled ones
      const messageMap = new Map<string, { id: string; isUserLabeled: boolean }>()
      for (const m of labeledMessages) {
        messageMap.set(m.id, { id: m.id, isUserLabeled: true })
      }
      for (const m of messages) {
        if (!messageMap.has(m.id)) {
          messageMap.set(m.id, { id: m.id, isUserLabeled: false })
        }
      }
      const combinedMessages = Array.from(messageMap.values())

      let scanned = 0, created = 0, updated = 0, travel = 0, skipped = 0, conflicts = 0, actions = 0, evidence = 0

      for (const { id: msgId, isUserLabeled } of combinedMessages) {
        // Skip already-processed UNLESS this email was newly labeled 'Casa' by the user
        const { data: alreadyDone } = await sb.from('gmail_processed_messages')
          .select('id, is_user_labeled').eq('family_member_id', memberId).eq('gmail_message_id', msgId).maybeSingle()
        if (!isUserLabeled) {
          if (!backfillSince && alreadyDone) continue
        }

        const details = await getMessageDetails(msgId, accessToken)
        if (!details) continue
        scanned++

        const emailReceivedAt = details.date ? new Date(details.date).toISOString() : new Date().toISOString()
        const canonicalKey = await canonicalEmailKey({
          messageId: details.internetMessageId,
          from: details.from,
          subject: details.subject,
          receivedAt: emailReceivedAt,
          normalizedBody: details.body,
        })
        const contentFingerprint = await canonicalContentFingerprint(details.body)
        const { data: canonicalEmail, error: canonicalEmailError } = await sb
          .from('canonical_inbox_emails')
          .upsert({
            canonical_key: canonicalKey,
            gmail_thread_id: details.threadId,
            internet_message_id: details.internetMessageId,
            from_email: details.from,
            subject: details.subject,
            received_at: emailReceivedAt,
            content_fingerprint: contentFingerprint,
            content_format: details.contentFormat,
            attachment_count: details.attachments.length,
            last_seen_at: new Date().toISOString(),
          }, { onConflict: 'canonical_key' })
          .select('id')
          .single()
        if (canonicalEmailError || !canonicalEmail) {
          throw new Error(`Could not canonicalize Gmail message: ${canonicalEmailError?.message ?? 'missing canonical row'}`)
        }

        if (backfillFamilyEvidenceOnly) {
          const { data: existingFamilyDocument } = await sb
            .from('family_data_documents')
            .select('id')
            .eq('source_type', 'email')
            .eq('source_id', canonicalEmail.id)
            .maybeSingle()
          if (existingFamilyDocument) {
            await sb.from('gmail_processed_messages').upsert({
              family_member_id: memberId, gmail_message_id: msgId,
              canonical_email_id: canonicalEmail.id,
              subject: details.subject,
              email_subject: details.subject,
              from_email: details.from,
              received_at: emailReceivedAt,
              intent: 'skip',
              skipped_reason: 'backfill family evidence indexed',
              is_user_labeled: isUserLabeled,
            }, { onConflict: 'family_member_id,gmail_message_id' })
            skipped++
            continue
          }
        }

        const { data: existingCanonicalDelivery } = await sb
          .from('gmail_processed_messages')
          .select('id')
          .eq('canonical_email_id', canonicalEmail.id)
          .limit(1)
        if (existingCanonicalDelivery && existingCanonicalDelivery.length > 0 && !backfillFamilyEvidenceOnly && !isUserLabeled) {
          await sb.from('gmail_processed_messages').upsert({
            family_member_id: memberId, gmail_message_id: msgId,
            canonical_email_id: canonicalEmail.id,
            subject: details.subject,
            email_subject: details.subject,
            from_email: details.from,
            received_at: emailReceivedAt,
            intent: 'skip',
            skipped_reason: 'duplicate delivery of canonical inbox email',
            email_body: details.body.slice(0, 8000),
            is_user_labeled: isUserLabeled,
          }, { onConflict: 'family_member_id,gmail_message_id' })
          skipped++
          continue
        }

        const matchingRules = filterMatchingCaptureRules(learnedRules, details.from, details.subject)
        const searchText = `${details.subject}\n${details.snippet}\n${details.body}`
        const isTravel = TRAVEL_KEYWORDS.test(searchText) || TRAVEL_SENDER_DOMAINS.some(d => details.from.toLowerCase().includes(d))
        const isCalendar = CALENDAR_KEYWORDS.test(searchText) || matchingRules.length > 0
        const isActionCandidate = ACTION_KEYWORDS.test(searchText) || matchingRules.length > 0
        const familyEvidenceCandidate = classifyFamilyEvidenceCandidate({
          subject: details.subject,
          from: details.from,
          body: details.body,
        })

        // Labeled emails bypass negative skip filters completely
        if (!isUserLabeled && !isTravel && !isCalendar && !isActionCandidate && !familyEvidenceCandidate.eligible) {
          await sb.from('gmail_processed_messages').upsert({
            family_member_id: memberId, gmail_message_id: msgId,
            canonical_email_id: canonicalEmail.id,
            subject: details.subject, email_subject: details.subject,
            from_email: details.from,
            received_at: details.date ? new Date(details.date).toISOString() : null,
            intent: 'skip', skipped_reason: 'no keywords',
            is_user_labeled: false,
          }, { onConflict: 'family_member_id,gmail_message_id' })
          skipped++
          continue
        }

        // ── AI Compound Decomposer Execution ────────────────────────
        const [classified, extractedActions] = await Promise.all([
          classifyEmail(
            details.subject,
            details.from,
            details.date,
            redactFamilyEvidenceText(details.body),
            familyMembers,
            llm,
            matchingRules,
            llmUsage,
          ),
          (isActionCandidate || isUserLabeled) && !backfillFamilyEvidenceOnly
            ? extractInboxActions(details.subject, details.from, details.date, details.body, familyMembers, llm, matchingRules, llmUsage)
            : Promise.resolve([] as InboxActionItem[]),
        ])

        // ── Auto-Train from User-Labeled 'Casa' Emails ───────────────
        if (isUserLabeled) {
          const senderDomain = details.from.includes('@')
            ? details.from.split('@')[1].replace(/[>]/g, '').trim().toLowerCase()
            : ''
          if (senderDomain && !['gmail.com', 'yahoo.com', 'hotmail.com', 'icloud.com', 'outlook.com'].includes(senderDomain)) {
            await persistLearnedCaptureRule(sb, {
              pattern_type: 'domain',
              pattern_value: senderDomain,
              rule_directive: `Always scan emails from @${senderDomain} for calendar events, open houses, forms, deadlines, and parent/student action items.`,
              origin: 'user_label',
              confidence: 1.0,
            })
          } else if (details.from) {
            const cleanFrom = details.from.replace(/.*<([^>]+)>.*/, '$1').trim().toLowerCase()
            await persistLearnedCaptureRule(sb, {
              pattern_type: 'sender',
              pattern_value: cleanFrom,
              rule_directive: `Always capture actions and calendar events from ${cleanFrom}.`,
              origin: 'user_label',
              confidence: 1.0,
            })
          }
        }

        const resolvedTargetMember = resolveImmediateFamilyMember({
          members: familyMembers,
          preferredName: classified?.assigned_member ?? null,
          entityNames: extractedActions
            .map((action) => action.assigned_member)
            .filter((name): name is string => typeof name === 'string' && name.trim().length > 0),
          fallbackMemberId: tokenBelongsToImmediateFamily ? memberId : null,
        })
        const sourceOwnerMemberId = resolvedTargetMember?.id ?? null

        const indexedFamilyEvidence = familyEvidenceCandidate.eligible
          ? await persistFamilyEmailEvidence(
            sb,
            canonicalEmail.id,
            details,
            emailReceivedAt,
            contentFingerprint,
            classified?.family_evidence,
            familyEvidenceCandidate.category,
          )
          : false
        if (indexedFamilyEvidence) {
          evidence++
          indexedEvidenceTotal++
        }

        if (backfillFamilyEvidenceOnly) {
          await sb.from('gmail_processed_messages').upsert({
            family_member_id: memberId, gmail_message_id: msgId,
            canonical_email_id: canonicalEmail.id,
            subject: details.subject,
            email_subject: details.subject,
            from_email: details.from,
            received_at: emailReceivedAt,
            intent: 'skip',
            skipped_reason: indexedFamilyEvidence
              ? 'backfill family evidence indexed'
              : 'backfill family evidence excluded',
            is_user_labeled: isUserLabeled,
          }, { onConflict: 'family_member_id,gmail_message_id' })
          skipped++
          continue
        }

        const currentActions = backfillActionsOnly
          ? filterCurrentBackfillActions(extractedActions, new Date())
          : extractedActions

        const actionsFromEmail = await persistInboxActions(
          sb,
          sourceOwnerMemberId,
          msgId,
          details.subject,
          null,
          details.subject.slice(0, 80),
          null,
          emailReceivedAt,
          currentActions,
          familyMembers,
          isUserLabeled,
          canonicalEmail.id,
        )
        actions += actionsFromEmail
        if (actionsFromEmail > 0) {
          await persistEmailKnowledgeClaims(
            sb,
            canonicalEmail.id,
            memberId,
            msgId,
            emailReceivedAt,
          )
        }

        if (backfillActionsOnly) {
          await sb.from('gmail_processed_messages').upsert({
            family_member_id: memberId, gmail_message_id: msgId,
            canonical_email_id: canonicalEmail.id,
            subject: details.subject,
            email_subject: details.subject,
            from_email: details.from,
            received_at: emailReceivedAt,
            intent: 'skip',
            skipped_reason: actionsFromEmail > 0
              ? 'backfill action-only import'
              : 'backfill action-only import: no current explicit-due action',
            email_body: details.body.slice(0, 8000),
            is_user_labeled: isUserLabeled,
          }, { onConflict: 'family_member_id,gmail_message_id' })
          skipped++
          continue
        }

        // ── INTENT: travel_detail ──────────────────────────────────
        if (classified?.intent === 'travel_detail' || isTravel) {
          const travelMemberId = sourceOwnerMemberId
          if (!travelMemberId) {
            await sb.from('gmail_processed_messages').upsert({
              family_member_id: memberId, gmail_message_id: msgId,
              canonical_email_id: canonicalEmail.id,
              subject: details.subject, email_subject: details.subject,
              from_email: details.from, received_at: emailReceivedAt,
              intent: 'skip', skipped_reason: 'shared inbox travel email with no clear immediate family attribution',
              is_user_labeled: isUserLabeled,
            }, { onConflict: 'family_member_id,gmail_message_id' })
            skipped++
            continue
          }

          const { data: existingTrip } = await sb.from('trips')
            .select('id, source_email_received_at, gmail_message_ids')
            .eq('family_member_id', travelMemberId)
            .contains('gmail_message_ids', [msgId])
            .maybeSingle()

          if (existingTrip && existingTrip.source_email_received_at && new Date(emailReceivedAt) <= new Date(existingTrip.source_email_received_at)) {
            await sb.from('gmail_processed_messages').upsert({
              family_member_id: memberId, gmail_message_id: msgId,
              canonical_email_id: canonicalEmail.id,
              subject: details.subject, email_subject: details.subject,
              from_email: details.from, received_at: emailReceivedAt,
              intent: 'travel_detail', skipped_reason: 'older than existing trip record',
              is_user_labeled: isUserLabeled,
            }, { onConflict: 'family_member_id,gmail_message_id' })
            skipped++
            continue
          }

          const { data: matchEvt } = await sb
            .from('event_members')
            .select('events!inner(id, start_time)')
            .eq('family_member_id', travelMemberId)
            .limit(10)

          const travelEventId = matchEvt
            ? (matchEvt as { events: { id: string; start_time: string } }[])
                .map(r => r.events)
                .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
                .find(e => new Date(e.start_time) > new Date())?.id
            : undefined

          const travelRes = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/scan-travel-emails`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
              'content-type': 'application/json',
            },
            body: JSON.stringify({
              raw_text: details.body.slice(0, 20000),
              source_subject: details.subject,
              family_member_id: travelMemberId,
              event_id: travelEventId,
              existing_trip_id: existingTrip?.id,
            }),
          })
          const travelResult = travelRes.ok ? await travelRes.json() : null

          if (travelResult?.ok) {
            await sb.from('trips')
              .update({ source_email_received_at: emailReceivedAt })
              .eq('family_member_id', travelMemberId)
              .contains('gmail_message_ids', [msgId])
          }

          await sb.from('gmail_processed_messages').upsert({
            family_member_id: memberId, gmail_message_id: msgId,
            canonical_email_id: canonicalEmail.id,
            subject: details.subject, email_subject: details.subject,
            from_email: details.from, received_at: emailReceivedAt,
            intent: 'travel_detail',
            email_body: details.body.slice(0, 8000),
            is_user_labeled: isUserLabeled,
          }, { onConflict: 'family_member_id,gmail_message_id' })
          travel++
          continue
        }

        const isUnknown = (v?: string) => !v || v === 'unknown'

        // ── INTENT: update_event ───────────────────────────────────
        if (classified?.intent === 'update_event') {
          const searchTitle = classified.updates_event_title ?? classified.title ?? ''
          const searchDate  = classified.updates_event_date ?? classified.start_datetime ?? 'unknown'
          const assignedMember = resolveImmediateFamilyMember({
            members: familyMembers,
            preferredName: classified.assigned_member ?? null,
            entityNames: [classified.title, classified.location].filter((value): value is string => typeof value === 'string' && value.trim().length > 0),
            fallbackMemberId: sourceOwnerMemberId ?? (tokenBelongsToImmediateFamily ? memberId : null),
          }) ?? familyMembers[0]

          const matchedEvent = await findMatchingEvent(sb, assignedMember.id, searchTitle, searchDate, classified.location ?? '')
          const startTime = classified.start_datetime && !isUnknown(classified.start_datetime) ? new Date(classified.start_datetime) : null
          const endTime = classified.end_datetime && !isUnknown(classified.end_datetime) ? new Date(classified.end_datetime) : null

          if (matchedEvent && startTime) {
            const timeDiff = minutesDiff(matchedEvent.start_time, startTime.toISOString())
            const locationChanged = classified.location && matchedEvent.location_name &&
              !matchedEvent.location_name.toLowerCase().includes((classified.location ?? '').toLowerCase().slice(0, 8))

            if (timeDiff > 15 || locationChanged) {
              await sb.from('email_conflicts').insert({
                family_member_id: memberId,
                gmail_message_id: msgId,
                event_id: matchedEvent.id,
                conflict_type: timeDiff > 15 ? 'time_change' : 'location_change',
                field_name: timeDiff > 15 ? 'start_time' : 'location_name',
                old_value: timeDiff > 15 ? matchedEvent.start_time : matchedEvent.location_name,
                new_value: timeDiff > 15 ? startTime.toISOString() : classified.location,
                email_subject: details.subject,
                email_from: details.from,
              })
              conflicts++
            }

            const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
            if (startTime) patch.start_time = startTime.toISOString()
            if (endTime) patch.end_time = endTime.toISOString()
            if (classified.location) patch.location_name = classified.location
            if (classified.description) patch.description = classified.description
            await sb.from('events').update(patch).eq('id', matchedEvent.id)

            await sb.from('gmail_processed_messages').upsert({
              family_member_id: memberId, gmail_message_id: msgId,
              canonical_email_id: canonicalEmail.id,
              subject: details.subject, email_subject: details.subject,
              from_email: details.from, received_at: emailReceivedAt,
              intent: 'update_event', updated_event_id: matchedEvent.id,
              email_body: details.body.slice(0, 8000),
              is_user_labeled: isUserLabeled,
            }, { onConflict: 'family_member_id,gmail_message_id' })
            updated++
            continue
          }
        }

        // ── INTENT: new_event / Compound Multi-Event Creation ──────
        const eventsToProcess: ExtractedEventItem[] = (classified?.events && classified.events.length > 0)
          ? classified.events
          : (classified?.title && classified.start_datetime && !isUnknown(classified.start_datetime))
            ? [{
                title: classified.title,
                start_datetime: classified.start_datetime,
                end_datetime: classified.end_datetime,
                all_day: classified.all_day,
                location: classified.location,
                description: classified.description,
                assigned_member: classified.assigned_member,
              }]
            : []

        let createdCountForMessage = 0
        let lastCreatedEventId: string | null = null

        for (const evItem of eventsToProcess) {
          const evStartIso = isUnknown(evItem.start_datetime) ? null : evItem.start_datetime
          const evEndIso = isUnknown(evItem.end_datetime) ? null : evItem.end_datetime
          const evStartTime = evStartIso ? new Date(evStartIso) : null
          if (!evStartTime || isNaN(evStartTime.getTime())) continue

          const evEndTime = evEndIso ? new Date(evEndIso) : new Date(evStartTime.getTime() + (evItem.all_day ? 24 * 3600_000 : 3600_000))
          const evAssignedMember = resolveImmediateFamilyMember({
            members: familyMembers,
            preferredName: evItem.assigned_member ?? classified?.assigned_member ?? null,
            entityNames: [evItem.title, evItem.location].filter((v): v is string => typeof v === 'string' && v.trim().length > 0),
            fallbackMemberId: sourceOwnerMemberId ?? (tokenBelongsToImmediateFamily ? memberId : null),
          }) ?? familyMembers[0]

          const existingMatch = await findMatchingEvent(sb, evAssignedMember.id, evItem.title, evStartIso ?? '', evItem.location ?? '')
          if (existingMatch) continue

          const { data: newEvent } = await sb.from('events').insert({
            title: evItem.title || details.subject.slice(0, 60),
            description: evItem.description || `Imported from email: ${details.subject}`,
            start_time: evStartTime.toISOString(),
            end_time: evEndTime.toISOString(),
            all_day: evItem.all_day ?? false,
            location_name: evItem.location || null,
            source_member_id: evAssignedMember.id,
          }).select('id').single()

          if (newEvent) {
            lastCreatedEventId = newEvent.id
            await sb.from('event_members').insert({ event_id: newEvent.id, family_member_id: evAssignedMember.id, role: 'primary' })
            created++
            createdCountForMessage++

            // Dispatch Google Calendar creation & enrichment
            await sb.functions.invoke('create-google-event', {
              body: { event_id: newEvent.id },
            }).catch(() => {})

            sb.functions.invoke('enrich-event', {
              body: { event_id: newEvent.id },
            }).catch(() => {})
          }
        }

        // Record processed message state
        const skippedReason = (createdCountForMessage > 0 || actionsFromEmail > 0)
          ? null
          : (classified?.skip_reason ?? 'no events or actionable items found')

        await sb.from('gmail_processed_messages').upsert({
          family_member_id: memberId, gmail_message_id: msgId,
          canonical_email_id: canonicalEmail.id,
          subject: details.subject,
          email_subject: details.subject,
          from_email: details.from,
          received_at: emailReceivedAt,
          intent: (createdCountForMessage > 0 || classified?.intent === 'new_event') ? 'new_event' : (actionsFromEmail > 0 ? 'skip' : (classified?.intent ?? 'skip')),
          skipped_reason: skippedReason,
          created_event_id: lastCreatedEventId,
          email_body: details.body.slice(0, 8000),
          is_user_labeled: isUserLabeled,
          training_source: isUserLabeled ? 'gmail_label_casa' : null,
        }, { onConflict: 'family_member_id,gmail_message_id' })

        if (createdCountForMessage === 0 && actionsFromEmail === 0) {
          skipped++
        }
      }

      await sb.from('google_tokens').update({
        gmail_last_scan_success_at: new Date().toISOString(),
        gmail_last_scan_error: null,
      }).eq('family_member_id', memberId)
      results.push({ member_id: memberId, scanned, created, updated, travel, skipped, conflicts, actions, evidence })
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause)
      await sb.from('google_tokens').update({ gmail_last_scan_error: message }).eq('family_member_id', memberId)
      results.push({ member_id: memberId, scanned: 0, created: 0, updated: 0, travel: 0, skipped: 0, conflicts: 0, actions: 0, evidence: 0, error: message })
    }
  }

  if (indexedEvidenceTotal > 0) {
    const indexingPromise = sb.functions.invoke('index-family-data', {
      body: { batch_size: Math.min(50, indexedEvidenceTotal) },
    }).then(({ error }) => {
      if (error) console.error('[scan-gmail-inbox] family evidence worker failed:', error.message)
    }).catch((error) => {
      console.error('[scan-gmail-inbox] family evidence worker failed:', String(error))
    })
    const edgeRuntime = globalThis as unknown as {
      EdgeRuntime?: { waitUntil(promise: Promise<unknown>): void }
    }
    if (edgeRuntime.EdgeRuntime?.waitUntil) {
      edgeRuntime.EdgeRuntime.waitUntil(indexingPromise)
    } else {
      void indexingPromise
    }
  }

  if (llmUsage.inputTokens > 0 || llmUsage.outputTokens > 0) {
    const usageModel = llm.model ?? 'unknown'
    await sb.from('ai_usage_log').insert({
      function_name: 'scan-gmail-inbox',
      provider: llm.provider ?? 'gemini',
      model: usageModel,
      input_tokens: llmUsage.inputTokens,
      output_tokens: llmUsage.outputTokens,
      cached: false,
    }).then(() => {}).catch(() => {})
  }

  return new Response(JSON.stringify({ ok: true, results }), { headers: { ...CORS, 'content-type': 'application/json' } })
}

Deno.serve(async (req) => {
  try {
    return await handleGmailScan(req)
  } catch (cause) {
    const error = cause instanceof Error ? cause : new Error(String(cause))
    console.error('[scan-gmail-inbox] failed:', error.message)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...CORS, 'content-type': 'application/json' },
    })
  }
})
