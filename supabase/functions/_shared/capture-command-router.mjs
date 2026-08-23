/**
 * capture-command-router.mjs
 * 
 * Unified command and voice directive router for Casa Tabor:
 * 1. Active Feedback Loop & Rule Synthesis:
 *    - Parses spoken directives ("tennis updates are informational", "always track bakery receipts as logistics",
 *      "only alert on field trip waivers", "stop extracting flyers from jiffy.com", "untrain rule for X")
 *    - Synthesizes structured capture rule directives for household_capture_rules.
 * 2. Assistant Quick Actions:
 *    - Creates reminders, grocery items, and calendar events with temporal evidence.
 * 3. Ingestion Rule Matching & Precedence:
 *    - Evaluates inbound emails against active capture rules with deterministic precedence:
 *      sender > domain > subject > phrase.
 */

import {
  explicitReminderSubject,
  extractReminderMember,
  isExplicitReminderRequest,
  reminderCreateClarification,
  resolveExplicitReminderDaypartRange,
  resolveStructuredReminderDueBy,
} from './assistant-reminder-intent.mjs'
import { resolveDeterministicEventMutation } from './deterministic-event-mutation.mjs'
import { extractUserTemporalEvidence } from './assistant-temporal-evidence.mjs'

// =========================================================================
// SECTION 1: VOICE DIRECTIVE & RULE SYNTHESIS GRAMMAR
// =========================================================================

const ARCHETYPE_MAP = {
  informational: 'estate_knowledge',
  info: 'estate_knowledge',
  knowledge: 'estate_knowledge',
  'estate knowledge': 'estate_knowledge',
  newsletter: 'estate_knowledge',
  newsletters: 'estate_knowledge',
  logistics: 'logistics_parcels',
  parcel: 'logistics_parcels',
  parcels: 'logistics_parcels',
  packages: 'logistics_parcels',
  delivery: 'logistics_parcels',
  receipts: 'logistics_parcels',
  orders: 'logistics_parcels',
  action: 'executive_actions',
  actions: 'executive_actions',
  'executive action': 'executive_actions',
  tasks: 'executive_actions',
  waiver: 'executive_actions',
  waivers: 'executive_actions',
  bills: 'executive_actions',
  invoices: 'executive_actions',
  appointment: 'temporal_appointments',
  appointments: 'temporal_appointments',
  calendar: 'temporal_appointments',
  schedule: 'temporal_appointments',
  update: 'lifecycle_updates',
  updates: 'lifecycle_updates',
  lifecycle: 'lifecycle_updates',
  promotional: 'promotional_noise',
  promo: 'promotional_noise',
  marketing: 'promotional_noise',
  spam: 'promotional_noise',
  noise: 'promotional_noise',
}

const SUPPRESS_VERBS = /\b(?:stop\s+extracting|stop\s+tracking|ignore|don't\s+extract|dont\s+extract|do\s+not\s+extract|don't\s+create\s+actions|never\s+alert|suppress|mute)\b/i
const ELEVATE_VERBS = /\b(?:only\s+alert\s+on|always\s+alert\s+on|elevate|prioritize|always\s+require\s+approval\s+for|require\s+action\s+for)\b/i
const UNTRAIN_VERBS = /\b(?:untrain|forget\s+(?:the\s+)?rule|delete\s+(?:the\s+)?rule|remove\s+(?:the\s+)?rule|undo\s+(?:the\s+)?rule|clear\s+(?:the\s+)?rule)\b/i

/**
 * Determines if text input represents an active feedback rule directive
 */
export function isCaptureRuleDirective(text) {
  const input = String(text ?? '').trim()
  if (!input) return false

  // Quick exclusion: Do not hijack explicit assistant quick action prefixes
  if (/^(?:add\s+.+\s+to\s+(?:the\s+)?(?:shopping|grocery|food)?\s*list|remind\s+me|create\s+dinner|schedule\s+meeting)/i.test(input)) {
    return false
  }

  if (UNTRAIN_VERBS.test(input)) return true
  if (SUPPRESS_VERBS.test(input)) return true
  if (ELEVATE_VERBS.test(input)) return true

  // Pattern: "tennis updates are informational" / "always track bakery receipts as logistics"
  if (/\b(?:are|is)\s+(?:informational|info|knowledge|estate\s+knowledge|newsletters?|logistics|parcels?|packages?|delivery|receipts?|orders?|executive\s+actions?|actions?|tasks?|waivers?|bills?|invoices?|appointments?|calendar|schedule|updates?|lifecycle|promotional|promo|marketing|spam|noise)\b/i.test(input)) {
    return true
  }
  if (/\b(?:track|route|mark|treat)\s+.+\s+(?:as|to|into)\s+(?:informational|info|knowledge|estate\s+knowledge|newsletters?|logistics|parcels?|packages?|delivery|receipts?|orders?|executive\s+actions?|actions?|tasks?|waivers?|bills?|invoices?|appointments?|calendar|schedule|updates?|lifecycle|promotional|promo|marketing|spam|noise)\b/i.test(input)) {
    return true
  }

  return false
}

/**
 * Parses natural language voice directive into structured capture rule
 */
export function parseVoiceDirective(text, options = {}) {
  const raw = String(text ?? '').trim()
  const input = raw.replace(/\s+/g, ' ')

  // 1. Untrain / Forget Directives
  if (UNTRAIN_VERBS.test(input)) {
    const pattern = input
      .replace(UNTRAIN_VERBS, '')
      .replace(/^\s*(?:the\s+)?rule\s+(?:for|about|on|from)\s+/i, '')
      .replace(/\s*(?:for|about|on|from)\s+/i, ' ')
      .trim()

    const patternType = detectPatternType(pattern)
    return {
      pattern_type: patternType,
      pattern_value: cleanPatternValue(pattern),
      rule_directive: 'user_untrain',
      origin: 'user_untrain',
      voice_transcript: raw,
      confidence: 1.0,
      active: false,
      summary: `Untrain rule for "${cleanPatternValue(pattern)}"`,
    }
  }

  // 2. Suppression Directives ("stop extracting flyers from jiffy.com", "ignore promotions from X")
  if (SUPPRESS_VERBS.test(input)) {
    let pattern = input
      .replace(SUPPRESS_VERBS, '')
      .replace(/\s*(?:(?:weekly|daily|monthly|promotional|all|the)\s+)?(?:flyers?|emails?|newsletters?|promotions?|messages?)\s+(?:from|about|of)\s+/i, ' ')
      .replace(/\s*(?:from|about|on)\s+/i, ' ')
      .trim()

    const patternType = detectPatternType(pattern)
    return {
      pattern_type: patternType,
      pattern_value: cleanPatternValue(pattern),
      rule_directive: 'suppress',
      default_archetype: 'promotional_noise',
      origin: 'voice_directive',
      voice_transcript: raw,
      confidence: 0.95,
      feedback_count: 1,
      active: true,
      summary: `Suppress all action items from "${cleanPatternValue(pattern)}"`,
    }
  }

  // 3. Elevation Directives ("only alert on field trip waivers", "always alert on bills")
  if (ELEVATE_VERBS.test(input)) {
    let pattern = input
      .replace(ELEVATE_VERBS, '')
      .replace(/\s*(?:emails?|messages?|from)\s+/i, ' ')
      .trim()

    const patternType = detectPatternType(pattern)
    return {
      pattern_type: patternType,
      pattern_value: cleanPatternValue(pattern),
      rule_directive: 'elevate_action',
      default_archetype: 'executive_actions',
      origin: 'voice_directive',
      voice_transcript: raw,
      confidence: 0.95,
      feedback_count: 1,
      active: true,
      summary: `Elevate "${cleanPatternValue(pattern)}" to Executive Action Queue`,
    }
  }

  // 4. Route Archetype Directives ("tennis updates are informational", "track bakery receipts as logistics")
  // Regex A: "<pattern> are/is <target>"
  const isMatch = input.match(/^(.+?)\s+(?:are|is)\s+(?:considered\s+|treated\s+as\s+)?(.+)$/i)
  if (isMatch) {
    const patternRaw = isMatch[1].trim()
    const targetRaw = isMatch[2].trim().toLowerCase().replace(/[.!]+$/, '')
    const archetype = ARCHETYPE_MAP[targetRaw] || 'estate_knowledge'

    return {
      pattern_type: detectPatternType(patternRaw),
      pattern_value: cleanPatternValue(patternRaw),
      rule_directive: 'route_archetype',
      default_archetype: archetype,
      origin: 'voice_directive',
      voice_transcript: raw,
      confidence: 0.95,
      feedback_count: 1,
      active: true,
      summary: `Route "${cleanPatternValue(patternRaw)}" to ${formatArchetypeTitle(archetype)}`,
    }
  }

  // Regex B: "(always)? track/route/mark <pattern> as/to <target>"
  const routeMatch = input.match(/^(?:always\s+)?(?:track|route|mark|treat)\s+(.+?)\s+(?:as|to|into)\s+(.+)$/i)
  if (routeMatch) {
    const patternRaw = routeMatch[1].trim()
    const targetRaw = routeMatch[2].trim().toLowerCase().replace(/[.!]+$/, '')
    const archetype = ARCHETYPE_MAP[targetRaw] || 'logistics_parcels'

    return {
      pattern_type: detectPatternType(patternRaw),
      pattern_value: cleanPatternValue(patternRaw),
      rule_directive: 'route_archetype',
      default_archetype: archetype,
      origin: 'voice_directive',
      voice_transcript: raw,
      confidence: 0.95,
      feedback_count: 1,
      active: true,
      summary: `Route "${cleanPatternValue(patternRaw)}" to ${formatArchetypeTitle(archetype)}`,
    }
  }

  return null
}

function detectPatternType(pattern) {
  const p = String(pattern).toLowerCase().trim()
  if (p.includes('@')) return 'sender'
  if (/\.(?:com|org|net|edu|gov|io|co|us)\b/i.test(p)) return 'domain'
  if (p.split(/\s+/).length > 1) return 'phrase'
  return 'subject'
}

function cleanPatternValue(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/^["'“”‘’«»]+|["'“”‘’«»]+$/g, '')
    .replace(/[.!?]+$/, '')
    .trim()
}

function formatArchetypeTitle(archetype) {
  const titles = {
    logistics_parcels: 'Logistics & Parcels',
    executive_actions: 'Executive Action Tasks',
    temporal_appointments: 'Temporal Appointments',
    lifecycle_updates: 'Lifecycle State Updates',
    estate_knowledge: 'Estate Context & Knowledge',
    promotional_noise: 'Promotional Noise',
  }
  return titles[archetype] || archetype
}

// =========================================================================
// SECTION 2: SYNTHESIZE CLIENT FEEDBACK & FAST DISMISSALS
// =========================================================================

/**
 * Synthesizes capture rule from client interactions (kiosk fast dismissal, category adjustment, thumbs up/down)
 */
export function synthesizeFeedbackRule({
  item = {},
  action = 'fast_dismissal',
  newArchetype = null,
  voiceTranscript = null,
  confidence = 0.9,
} = {}) {
  const domain = item.domain || (item.from_email ? extractDomain(item.from_email) : null)
  const sender = item.sender || item.from_email
  const subject = item.subject || item.event_title || item.title

  let pattern_type = 'domain'
  let pattern_value = domain || sender || subject || 'unknown'

  if (!domain && sender) {
    pattern_type = 'sender'
    pattern_value = sender
  } else if (!domain && !sender && subject) {
    pattern_type = 'phrase'
    pattern_value = subject
  }

  if (action === 'fast_dismissal') {
    return {
      pattern_type,
      pattern_value: cleanPatternValue(pattern_value),
      rule_directive: 'suppress',
      default_archetype: 'promotional_noise',
      origin: 'fast_dismissal',
      voice_transcript: voiceTranscript,
      confidence,
      feedback_count: 1,
      active: true,
    }
  }

  if (action === 'category_adjustment' && newArchetype) {
    return {
      pattern_type,
      pattern_value: cleanPatternValue(pattern_value),
      rule_directive: 'route_archetype',
      default_archetype: newArchetype,
      origin: 'manual_teach',
      voice_transcript: voiceTranscript,
      confidence: 1.0,
      feedback_count: 1,
      active: true,
    }
  }

  return {
    pattern_type,
    pattern_value: cleanPatternValue(pattern_value),
    rule_directive: 'route_archetype',
    default_archetype: newArchetype || 'estate_knowledge',
    origin: 'learned_feedback',
    voice_transcript: voiceTranscript,
    confidence,
    feedback_count: 1,
    active: true,
  }
}

function extractDomain(email) {
  const match = String(email).match(/@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/)
  return match ? match[1].toLowerCase() : null
}

// =========================================================================
// SECTION 3: RULE MATCHING & PRECEDENCE ENGINE
// =========================================================================

/**
 * Matches candidate email against active rules using deterministic precedence:
 * sender (score 4) > domain (score 3) > subject (score 2) > phrase (score 1)
 */
export function matchCaptureRules(rules = [], candidate = {}) {
  if (!Array.isArray(rules) || rules.length === 0) return []

  const fromLower = String(candidate.from || candidate.sender || candidate.from_email || '').toLowerCase()
  const subjLower = String(candidate.subject || candidate.title || candidate.event_title || '').toLowerCase()
  const bodyLower = String(candidate.body || candidate.snippet || candidate.description || '').toLowerCase()

  const matches = []

  for (const rule of rules) {
    if (rule.active === false) continue
    const val = String(rule.pattern_value ?? '').toLowerCase().trim()
    if (!val) continue

    let matched = false
    let precedence = 0

    if (rule.pattern_type === 'sender') {
      if (fromLower.includes(val)) {
        matched = true
        precedence = 4
      }
    } else if (rule.pattern_type === 'domain') {
      if (fromLower.includes(`@${val}`) || fromLower.includes(val)) {
        matched = true
        precedence = 3
      }
    } else if (rule.pattern_type === 'subject') {
      if (subjLower.includes(val)) {
        matched = true
        precedence = 2
      }
    } else if (rule.pattern_type === 'phrase') {
      if (subjLower.includes(val) || bodyLower.includes(val)) {
        matched = true
        precedence = 1
      }
    }

    if (matched) {
      matches.push({ rule, precedence })
    }
  }

  // Sort by highest precedence first, then highest confidence
  return matches
    .sort((a, b) => {
      if (b.precedence !== a.precedence) return b.precedence - a.precedence
      return (b.rule.confidence ?? 1.0) - (a.rule.confidence ?? 1.0)
    })
    .map((m) => m.rule)
}

/**
 * Applies matched capture rules to modify classification and agency levels
 */
export function applyCaptureRules(candidate = {}, rules = []) {
  const matchedRules = matchCaptureRules(rules, candidate)
  if (matchedRules.length === 0) {
    return { candidate, appliedRule: null, modified: false }
  }

  const primaryRule = matchedRules[0]
  const updated = { ...candidate }

  if (primaryRule.rule_directive === 'suppress') {
    updated.intent = 'skip'
    updated.skip_reason = `Suppressed by learned rule (${primaryRule.pattern_type}: ${primaryRule.pattern_value})`
    updated.agency_level = 0
    updated.archetype = 'promotional_noise'
  } else if (primaryRule.rule_directive === 'route_archetype' && primaryRule.default_archetype) {
    updated.archetype = primaryRule.default_archetype
    if (
      primaryRule.default_archetype === 'estate_knowledge' ||
      primaryRule.default_archetype === 'promotional_noise' ||
      primaryRule.default_archetype === 'logistics_parcels'
    ) {
      updated.agency_level = 0
    }
  } else if (primaryRule.rule_directive === 'elevate_action') {
    updated.archetype = 'executive_actions'
    updated.agency_level = 2
  }

  if (primaryRule.category_routing && typeof primaryRule.category_routing === 'object') {
    updated.category_routing = primaryRule.category_routing
  }

  return {
    candidate: updated,
    appliedRule: primaryRule,
    modified: true,
  }
}

// =========================================================================
// SECTION 4: UNIFIED COMMAND ENTRYPOINT (PRESERVING QUICK ACTIONS)
// =========================================================================

const DAY_HINT = /\b(?:today|tomorrow|sunday|monday|tuesday|wednesday|thursday|friday|saturday|jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?|\d{4}-\d{2}-\d{2})\b/i
const TIME_HINT = /\b(?:at|from)\s+\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)\b/i
const GROCERY_LIST_HINT = /\b(?:shopping|shopp+ing|grocery|groceries|food)\s+(?:list|items?)\b|\b(?:on|to)\s+(?:the\s+)?(?:shopping|shopp+ing|grocery|groceries|food)\s+list\b/i
const EVENT_PREFIX = /^(?:create|add|schedule|book)\b/i
const EVENT_NOUN = /\b(?:event|calendar|appointment|appt|reservation|dinner|lunch|breakfast|practice|meeting|trip|party|tour|doctor|dr\b|dentist)\b/i

export function resolveCaptureCommand(text, options = {}) {
  const input = String(text ?? '').replace(/\s+/g, ' ').trim()
  if (!input) {
    return {
      status: 'unsupported',
      message: 'Quick Actions can create events, reminders, and grocery items right now.',
    }
  }

  // 1. Evaluate Capture Rule Directives & Spoken Ingestion Feedback FIRST
  if (isCaptureRuleDirective(input)) {
    const parsed = parseVoiceDirective(input, options)
    if (parsed) {
      return {
        status: 'execute',
        tool: 'upsert_capture_rule',
        args: parsed,
        summary: parsed.summary,
      }
    }
  }

  // 2. Existing Quick Action Handlers
  if (isExplicitReminderRequest(input)) {
    return resolveReminderCommand(input, options)
  }

  if (looksLikeGroceryCommand(input)) {
    return resolveGroceryCommand(input)
  }

  if (looksLikeEventCommand(input)) {
    return resolveEventCommand(input, options)
  }

  return {
    status: 'unsupported',
    message: 'Quick Actions can create events, reminders, and grocery items right now.',
  }
}

// ── Quick Action Helpers (Preserved 100% Intact) ───────────────────

function resolveGroceryCommand(input) {
  const stripped = input
    .replace(/^(?:please\s+)?(?:add|put|buy|need)\s+/i, '')
    .replace(/\s+(?:to|on)\s+(?:the\s+)?(?:shopping|shopp+ing|grocery|groceries|food)\s+list\b.*$/i, '')
    .replace(/\s+(?:to|on)\s+(?:the\s+)?list\b.*$/i, '')
    .trim()
  const items = splitRequestedItems(stripped)
  if (items.length === 0) {
    return {
      status: 'needs_clarification',
      clarification_question: 'What should I add to the shopping list?',
    }
  }
  return {
    status: 'execute',
    tool: 'add_grocery_items',
    args: {
      items: items.map((item) => ({
        ...(item.quantity ? { quantity: item.quantity } : {}),
        name: item.name,
        category: 'other',
      })),
    },
  }
}

function resolveReminderCommand(input, options) {
  const subject = explicitReminderSubject(input)
  if (!subject) {
    return {
      status: 'needs_clarification',
      clarification_question: 'What should I remind you about?',
    }
  }

  const reminderMember = extractReminderMember(input, options.familyNames)
  const locationSplit = splitTrailingLocation(subject)
  const reminderRange =
    resolveStructuredReminderDueBy(input, { utcOffset: options.utcOffset }) ??
    resolveExplicitReminderDaypartRange(input, {
      currentDate: (options.now instanceof Date ? options.now : new Date()).toISOString(),
      utcOffset: options.utcOffset,
    }) ??
    resolveAbsoluteRange(input, options) ??
    resolveDefaultReminderRange(input, options)

  if (!reminderRange) {
    return {
      status: 'needs_clarification',
      clarification_question: 'When should I remind you?',
    }
  }

  const temporalProvenance = captureTemporalProvenance(input, reminderRange, options)

  return {
    status: 'execute',
    tool: 'create_event',
    args: {
      title: locationSplit.title,
      start: reminderRange.start,
      end: reminderRange.end,
      event_type: 'reminder',
      temporal_provenance: temporalProvenance,
      ...(locationSplit.location ? { location: locationSplit.location } : {}),
      members: reminderMember ? [reminderMember] : [],
    },
  }
}

function resolveEventCommand(input, options) {
  const mutation = resolveDeterministicEventMutation(input, [], {
    now: options.now,
    utcOffset: options.utcOffset,
    familyNames: options.familyNames,
  })
  if (mutation?.tool === 'create_event' && mutation.args) {
    const location = parseEventLocation(input)
    const temporalProvenance = captureTemporalProvenance(input, { start: mutation.args.start, end: mutation.args.end }, options)
    return {
      status: 'execute',
      tool: 'create_event',
      args: {
        ...mutation.args,
        start: ensureOffsetIso(mutation.args.start, options.utcOffset),
        end: ensureOffsetIso(mutation.args.end, options.utcOffset),
        temporal_provenance: temporalProvenance,
        ...(location ? { location } : {}),
      },
    }
  }

  if (hasSingleMissingEventTime(input)) {
    return {
      status: 'needs_clarification',
      clarification_question: 'What time should I create that event for?',
    }
  }

  return {
    status: 'unsupported',
    message: 'Quick Actions can create events, reminders, and grocery items right now.',
  }
}

function captureTemporalProvenance(input, range, options) {
  const start = ensureOffsetIso(range?.start, options.utcOffset)
  const end = ensureOffsetIso(range?.end, options.utcOffset)
  const localStartDate = typeof start === 'string' ? start.slice(0, 10) : ''
  const localEndDate = typeof end === 'string' ? end.slice(0, 10) : localStartDate
  if (localStartDate) {
    return {
      sourceMessageId: 'capture-command',
      sourceText: input,
      rangeStart: localStartDate,
      rangeEnd: localEndDate,
      resolutionKind: 'relative',
      requiresExactDateConfirmation: false,
    }
  }
  const direct = extractUserTemporalEvidence({
    id: 'capture-command',
    role: 'user',
    content: input,
  }, options)
  if (direct) {
    return {
      ...direct,
      requiresExactDateConfirmation: false,
    }
  }
  return null
}

function looksLikeGroceryCommand(input) {
  if (/\b(?:reminder|reminders|to do|todo|task|calendar|meeting|appt|appointment)\b/i.test(input)) return false
  if (!/^(?:please\s+)?add\b/i.test(input)) return false
  if (GROCERY_LIST_HINT.test(input)) return true
  return !looksLikeEventCommand(input) && !DAY_HINT.test(input) && !TIME_HINT.test(input)
}

function looksLikeEventCommand(input) {
  if (GROCERY_LIST_HINT.test(input)) return false
  if (EVENT_PREFIX.test(input) && (EVENT_NOUN.test(input) || DAY_HINT.test(input) || TIME_HINT.test(input))) {
    return true
  }
  return EVENT_NOUN.test(input) && (DAY_HINT.test(input) || TIME_HINT.test(input))
}

function splitRequestedItems(text) {
  return String(text ?? '')
    .split(/\s*,\s*|\s+and\s+/i)
    .map((part) => parseRequestedItem(part))
    .filter(Boolean)
}

function parseRequestedItem(value) {
  const cleaned = String(value ?? '')
    .trim()
    .replace(/^(?:and\s+)/i, '')
    .replace(/^[,.\s]+|[,.\s]+$/g, '')
  if (!cleaned) return null
  const match = cleaned.match(/^(\d+(?:\.\d+)?)\s+(.+)$/)
  if (match) {
    return {
      quantity: match[1],
      name: match[2].trim().toLowerCase(),
    }
  }
  return { name: cleaned.toLowerCase() }
}

function splitTrailingLocation(subject) {
  const match = String(subject).match(/^(.+?)\s+at\s+(.+)$/i)
  if (!match) return { title: stripReminderTiming(subject), location: null }
  if (/^\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)$/i.test(match[2].trim()) || /^(?:noon|midnight|lunch|dinner)$/i.test(match[2].trim())) {
    return { title: stripReminderTiming(subject), location: null }
  }
  return {
    title: stripReminderTiming(match[1].trim()),
    location: match[2].trim(),
  }
}

function stripReminderTiming(value) {
  return String(value ?? '')
    .replace(/\s+(?:on\s+)?(?:today|tomorrow|tonight|sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/gi, '')
    .replace(/\s+(?:this|in the)\s+(?:early\s+|late\s+)?(?:morning|afternoon|evening|night)\b/gi, '')
    .replace(/\s+(?:at|around)\s+(?:\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)|lunch(?:\s*time)?|lunchtime|noon|midday|breakfast(?:\s*time)?|dinner(?:\s*time)?|bedtime|after work)\b/gi, '')
    .trim()
}

function parseEventLocation(input) {
  const timeMatch = [...String(input).matchAll(/\b\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)\b/gi)].at(-1)
  if (!timeMatch || typeof timeMatch.index !== 'number') return null
  const tail = input.slice(timeMatch.index + timeMatch[0].length)
  const locationMatch = tail.match(/\s+(?:at|in)\s+(.+?)[.!?]*$/i)
  return locationMatch?.[1]?.trim() ?? null
}

function hasSingleMissingEventTime(input) {
  return EVENT_PREFIX.test(input) && DAY_HINT.test(input) && !TIME_HINT.test(input)
}

function resolveAbsoluteRange(input, options) {
  const requestedTime = parseExplicitTime(input)
  if (!requestedTime) return null
  const offsetMinutes = parseOffsetMinutes(options.utcOffset)
  const now = options.now instanceof Date ? options.now : new Date()
  const targetDate = resolveTargetDate(input, now, offsetMinutes)
  if (!targetDate) return null
  let startMs = Date.UTC(
    targetDate.year,
    targetDate.month,
    targetDate.day,
    requestedTime.hour,
    requestedTime.minute,
  ) - offsetMinutes * 60000
  if (!Number.isFinite(startMs)) return null
  const hasExplicitDate = /\b(?:today|tomorrow|sunday|monday|tuesday|wednesday|thursday|friday|saturday|\d{4}-\d{2}-\d{2})\b/i.test(input)
  if (!hasExplicitDate && startMs <= now.getTime()) {
    startMs += 86400000
  }
  return {
    start: formatAtOffset(startMs, options.utcOffset, offsetMinutes),
    end: formatAtOffset(startMs + 15 * 60000, options.utcOffset, offsetMinutes),
  }
}

function resolveDefaultReminderRange(input, options) {
  const offsetMinutes = parseOffsetMinutes(options.utcOffset)
  const now = options.now instanceof Date ? options.now : new Date()
  const nowLocal = localParts(now, offsetMinutes)
  const targetDate = resolveTargetDate(input, now, offsetMinutes)
  const nowMinute = nowLocal.hour * 60 + nowLocal.minute
  const isToday = targetDate.year === nowLocal.year && targetDate.month === nowLocal.month && targetDate.day === nowLocal.day

  let hour = 9
  let minute = 0
  if (isToday) {
    if (nowMinute >= 9 * 60) {
      const nextQuarterHour = Math.ceil((nowMinute + 10) / 15) * 15
      hour = Math.floor(nextQuarterHour / 60) % 24
      minute = nextQuarterHour % 60
    }
  }
  const startMs = Date.UTC(targetDate.year, targetDate.month, targetDate.day, hour, minute) - offsetMinutes * 60000
  if (!Number.isFinite(startMs)) return null
  return {
    start: formatAtOffset(startMs, options.utcOffset, offsetMinutes),
    end: formatAtOffset(startMs + 15 * 60000, options.utcOffset, offsetMinutes),
  }
}

const MONTHS_MAP = new Map([
  ['january', 0], ['jan', 0], ['february', 1], ['feb', 1], ['march', 2], ['mar', 2],
  ['april', 3], ['apr', 3], ['may', 4], ['june', 5], ['jun', 5], ['july', 6], ['jul', 6],
  ['august', 7], ['aug', 7], ['september', 8], ['sep', 8], ['sept', 8],
  ['october', 9], ['oct', 9], ['november', 10], ['nov', 10], ['december', 11], ['dec', 11],
])

function resolveTargetDate(input, now, offsetMinutes) {
  const nowLocal = localParts(now, offsetMinutes)
  if (/\btoday\b/i.test(input)) {
    return { year: nowLocal.year, month: nowLocal.month, day: nowLocal.day }
  }
  if (/\btomorrow\b/i.test(input)) {
    const tomorrow = new Date(Date.UTC(nowLocal.year, nowLocal.month, nowLocal.day) + 86400000)
    return { year: tomorrow.getUTCFullYear(), month: tomorrow.getUTCMonth(), day: tomorrow.getUTCDate() }
  }
  const monthMatch = String(input).match(/\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?(?:\s*,?\s*(\d{4}))?\b/i)
  if (monthMatch) {
    const month = MONTHS_MAP.get(monthMatch[1].toLowerCase()) ?? nowLocal.month
    const day = Number(monthMatch[2])
    let year = monthMatch[3] ? Number(monthMatch[3]) : nowLocal.year
    if (!monthMatch[3]) {
      const tentativeMs = Date.UTC(year, month, day, 12, 0) - offsetMinutes * 60000
      if (tentativeMs < now.getTime() - 12 * 3600000) {
        year += 1
      }
    }
    return { year, month, day }
  }
  const weekday = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
    .find((day) => new RegExp(`\\b${day}\\b`, 'i').test(input))
  if (weekday) {
    const todayUtcDay = Date.UTC(nowLocal.year, nowLocal.month, nowLocal.day)
    let daysAhead = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'].indexOf(weekday) - nowLocal.weekday
    if (daysAhead <= 0) daysAhead += 7
    const target = new Date(todayUtcDay + daysAhead * 86400000)
    return { year: target.getUTCFullYear(), month: target.getUTCMonth(), day: target.getUTCDate() }
  }
  return { year: nowLocal.year, month: nowLocal.month, day: nowLocal.day }
}

function parseExplicitTime(input) {
  const match = [...String(input).matchAll(/\b(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)\b/gi)].at(-1)
  if (!match) return null
  let hour = Number(match[1])
  const minute = Number(match[2] ?? 0)
  if (!Number.isFinite(hour) || !Number.isFinite(minute) || hour < 1 || hour > 12 || minute < 0 || minute > 59) return null
  const pm = match[3].toLowerCase().startsWith('p')
  if (pm && hour !== 12) hour += 12
  if (!pm && hour === 12) hour = 0
  return { hour, minute }
}

function ensureOffsetIso(value, utcOffset) {
  if (typeof value !== 'string' || !value) return value
  const offsetMinutes = parseOffsetMinutes(utcOffset)
  const ms = Date.parse(value)
  if (!Number.isFinite(ms)) return value
  return formatAtOffset(ms, utcOffset, offsetMinutes)
}

function formatAtOffset(ms, utcOffset, offsetMinutes = parseOffsetMinutes(utcOffset)) {
  const shifted = new Date(ms + offsetMinutes * 60000)
  const year = shifted.getUTCFullYear()
  const month = String(shifted.getUTCMonth() + 1).padStart(2, '0')
  const day = String(shifted.getUTCDate()).padStart(2, '0')
  const hour = String(shifted.getUTCHours()).padStart(2, '0')
  const minute = String(shifted.getUTCMinutes()).padStart(2, '0')
  const second = String(shifted.getUTCSeconds()).padStart(2, '0')
  return `${year}-${month}-${day}T${hour}:${minute}:${second}.000${utcOffset ?? '+00:00'}`
}

function parseOffsetMinutes(value) {
  const match = String(value ?? '').match(/^([+-])(\d{2}):(\d{2})$/)
  if (!match) return 0
  const minutes = Number(match[2]) * 60 + Number(match[3])
  return (match[1] === '+' ? 1 : -1) * minutes
}

function localParts(date, offsetMinutes) {
  const shifted = new Date(date.getTime() + offsetMinutes * 60000)
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth(),
    day: shifted.getUTCDate(),
    weekday: shifted.getUTCDay(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
  }
}
