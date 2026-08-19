import type { PrepItem } from '../types'
import {
  detectSuggestedEvent,
  detectSuggestedActionBundle,
  type SuggestedEventPlan,
} from './actionInspectionSynthesis.ts'

const SYNONYM_MAP: Record<string, string> = {
  // Math & testing
  mathematics: 'math',
  maths: 'math',
  'i-ready': 'iready',
  i_ready: 'iready',
  iready: 'iready',
  diagnostic: 'diagnostic',
  diagnostics: 'diagnostic',
  test: 'diagnostic',
  testing: 'diagnostic',
  exam: 'diagnostic',
  examination: 'diagnostic',
  assessment: 'diagnostic',
  assessments: 'diagnostic',

  // Photography / School Days
  picture: 'picture',
  pictures: 'picture',
  photo: 'picture',
  photos: 'picture',
  portrait: 'picture',
  portraits: 'picture',
  photographs: 'picture',

  // Medical
  checkup: 'checkup',
  'check-up': 'checkup',
  physical: 'checkup',
  pediatric: 'pediatric',
  pediatrics: 'pediatric',
  pediatrician: 'pediatric',
  doctor: 'dr',
  'dr.': 'dr',
  dr: 'dr',

  // School Specific
  bak: 'bak',
  msoa: 'bak',
  orchestra: 'strings',
  strings: 'strings',
  beethoven: 'strings',
  spirit: 'spirit',
  pto: 'spirit',
  pta: 'spirit',
}

const STOP_WORDS = new Set([
  'the',
  'a',
  'an',
  'at',
  'in',
  'on',
  'for',
  'of',
  'to',
  'and',
  'or',
  'is',
  'are',
  'first',
  'annual',
  'fall',
  'spring',
  'day',
  'students',
  'class',
  'grade',
  'school',
  'suggested',
  'appointment',
])

/**
 * Normalizes title text into a set of canonical stemmed tokens.
 */
export function normalizeEventTokens(text: string): Set<string> {
  if (!text) return new Set()

  let clean = text
    .toLowerCase()
    .replace(/suggested appointment:\s*/i, '')
    .replace(/\bi[-_ ]ready\b/g, 'iready')
    .replace(/\bdr\.?\b/g, 'dr')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  const words = clean.split(/\s+/).filter((w) => w.length > 0)
  const tokens = new Set<string>()

  for (const word of words) {
    const canonical = SYNONYM_MAP[word] || word
    if (!STOP_WORDS.has(canonical) && (canonical.length > 1 || canonical === 'dr')) {
      tokens.add(canonical)
    }
  }

  return tokens
}

/**
 * Evaluates whether two event titles refer to the same event using token overlap
 * and substring similarity.
 */
export function isFuzzyEventTitleMatch(candidateTitle: string, existingTitle: string): boolean {
  if (!candidateTitle || !existingTitle) return false

  const cleanCandidate = candidateTitle.toLowerCase().trim()
  const cleanExisting = existingTitle.toLowerCase().trim()

  // 1. Exact string match or direct substring containment
  if (cleanCandidate === cleanExisting) return true
  if (cleanExisting.includes(cleanCandidate) || cleanCandidate.includes(cleanExisting)) {
    // Ensure containment isn't just a 1-letter match
    const shorterLen = Math.min(cleanCandidate.length, cleanExisting.length)
    if (shorterLen >= 4) return true
  }

  // 2. Token overlap analysis
  const candidateTokens = normalizeEventTokens(candidateTitle)
  const existingTokens = normalizeEventTokens(existingTitle)

  if (candidateTokens.size === 0 || existingTokens.size === 0) return false

  let intersectionCount = 0
  for (const token of candidateTokens) {
    if (existingTokens.has(token)) {
      intersectionCount++
    }
  }

  // If all candidate tokens are present in existing event, or vice versa
  if (intersectionCount === candidateTokens.size || intersectionCount === existingTokens.size) {
    return true
  }

  // If at least 2 strong tokens match (e.g. ['iready', 'math'] or ['bak', 'picture'])
  if (intersectionCount >= 2) {
    return true
  }

  // Jaccard similarity threshold for longer titles
  const unionCount = new Set([...candidateTokens, ...existingTokens]).size
  const jaccard = unionCount > 0 ? intersectionCount / unionCount : 0
  return jaccard >= 0.5
}

function extractDateKey(dateStr?: string | null): string | null {
  if (!dateStr) return null
  return dateStr.slice(0, 10) // 'YYYY-MM-DD'
}

/**
 * Searches a list of calendar events to find if the suggested plan is already scheduled on that date.
 */
export function findMatchingCalendarEvent<T extends { title?: string | null; start_time?: string | null }>(
  plan: SuggestedEventPlan,
  calendarEvents: T[]
): T | null {
  if (!plan || !plan.date || !Array.isArray(calendarEvents)) return null

  const targetDateKey = plan.date // 'YYYY-MM-DD'

  for (const event of calendarEvents) {
    const eventDateKey = extractDateKey(event.start_time)
    if (!eventDateKey || eventDateKey !== targetDateKey) {
      continue
    }

    if (isFuzzyEventTitleMatch(plan.title, event.title || '')) {
      return event
    }
  }

  return null
}

/**
 * Inspects a prep item and returns true if its suggested calendar event is already scheduled.
 */
export function isItemAlreadyScheduled(
  item: PrepItem,
  calendarEvents: Array<{ title?: string | null; start_time?: string | null }>
): boolean {
  if (!item || !Array.isArray(calendarEvents) || calendarEvents.length === 0) return false

  // 1. Check compound action bundle
  const bundle = detectSuggestedActionBundle(item)
  if (bundle) {
    const eventAction = bundle.actions.find((a) => a.type === 'event')
    if (eventAction && eventAction.date) {
      const match = findMatchingCalendarEvent(
        {
          title: eventAction.title,
          date: eventAction.date,
          displayDate: eventAction.displayDate,
          allDay: Boolean(eventAction.allDay),
        },
        calendarEvents
      )
      if (match) return true
    }
  }

  // 2. Check individual suggested event plan
  const plan = detectSuggestedEvent(item)
  if (plan && plan.date) {
    const match = findMatchingCalendarEvent(plan, calendarEvents)
    if (match) return true
  }

  // 3. Check explicit event_date or due_by on prep item
  const rawDate = extractDateKey(item.event_date || item.due_by)
  const rawTitle = item.event_title || item.description
  if (rawDate && rawTitle) {
    const match = findMatchingCalendarEvent(
      {
        title: rawTitle,
        date: rawDate,
        displayDate: rawDate,
        allDay: true,
      },
      calendarEvents
    )
    if (match) return true
  }

  return false
}
