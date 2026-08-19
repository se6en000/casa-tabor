import {
  explicitReminderSubject,
  isExplicitReminderRequest,
  reminderCreateClarification,
  resolveExplicitReminderDaypartRange,
  resolveStructuredReminderDueBy,
} from './assistant-reminder-intent.mjs'
import { resolveDeterministicEventMutation } from './deterministic-event-mutation.mjs'
import { extractUserTemporalEvidence } from './assistant-temporal-evidence.mjs'

const DAY_HINT = /\b(?:today|tomorrow|sunday|monday|tuesday|wednesday|thursday|friday|saturday|\d{4}-\d{2}-\d{2})\b/i
const TIME_HINT = /\b(?:at|from)\s+\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)\b/i
const GROCERY_LIST_HINT = /\b(?:shopping|grocery)\s+list\b/i
const EVENT_PREFIX = /^(?:create|add|schedule|book)\b/i
const EVENT_NOUN = /\b(?:event|calendar|appointment|appt|reservation|dinner|lunch|breakfast|practice|meeting|trip|party)\b/i

export function resolveCaptureCommand(text, options = {}) {
  const input = String(text ?? '').replace(/\s+/g, ' ').trim()
  if (!input) {
    return {
      status: 'unsupported',
      message: 'Quick Actions can create events, reminders, and grocery items right now.',
    }
  }

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

function resolveGroceryCommand(input) {
  const stripped = input
    .replace(/^(?:please\s+)?add\s+/i, '')
    .replace(/\s+to\s+(?:the\s+)?(?:shopping|grocery)\s+list\b.*$/i, '')
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
  const clarification = reminderCreateClarification(input)
  if (clarification) {
    return {
      status: 'needs_clarification',
      clarification_question: clarification,
    }
  }

  const subject = explicitReminderSubject(input)
  if (!subject) {
    return {
      status: 'needs_clarification',
      clarification_question: 'What should I remind you about?',
    }
  }

  const locationSplit = splitTrailingLocation(subject)
  const reminderRange =
    resolveStructuredReminderDueBy(input, { utcOffset: options.utcOffset }) ??
    resolveExplicitReminderDaypartRange(input, {
      currentDate: (options.now instanceof Date ? options.now : new Date()).toISOString(),
      utcOffset: options.utcOffset,
    }) ??
    resolveAbsoluteRange(input, options)

  if (!reminderRange) {
    return {
      status: 'needs_clarification',
      clarification_question: 'When should I remind you?',
    }
  }

  const temporalProvenance = captureTemporalProvenance(input, reminderRange, options)
  if (temporalProvenance.resolutionKind === 'relative') {
    return {
      status: 'needs_clarification',
      clarification_question: `I resolved ${relativeDateLabel(input)} as ${formatExactDate(temporalProvenance.rangeStart)}. Please repeat the reminder with that exact date to confirm.`,
    }
  }

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
      members: [],
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
    const temporalProvenance = extractUserTemporalEvidence({
      id: 'capture-command',
      role: 'user',
      content: input,
    }, options)
    if (!temporalProvenance) {
      return {
        status: 'needs_clarification',
        clarification_question: 'What date should I create that event for?',
      }
    }
    if (temporalProvenance.resolutionKind === 'relative') {
      return {
        status: 'needs_clarification',
        clarification_question: `I resolved ${relativeDateLabel(input)} as ${formatExactDate(temporalProvenance.rangeStart)}. Please repeat the request with that exact date to confirm.`,
      }
    }
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

  if (EVENT_PREFIX.test(input) && TIME_HINT.test(input) && !DAY_HINT.test(input)) {
    return {
      status: 'needs_clarification',
      clarification_question: 'What date should I create that event for?',
    }
  }

  return {
    status: 'unsupported',
    message: 'Quick Actions can create events, reminders, and grocery items right now.',
  }
}

function relativeDateLabel(input) {
  return String(input).match(/\b(?:this\s+(?:morning|afternoon|evening)|tonight|(?:this\s+|next\s+)?(?:today|tomorrow|weekend|sunday|monday|tuesday|wednesday|thursday|friday|saturday))\b/i)?.[0] ?? 'that date'
}

function formatExactDate(value) {
  const [year, month, day] = String(value).split('-').map(Number)
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, day)))
}

function captureTemporalProvenance(input, range, options) {
  const direct = extractUserTemporalEvidence({
    id: 'capture-command',
    role: 'user',
    content: input,
  }, options)
  if (direct) return direct
  const start = ensureOffsetIso(range.start, options.utcOffset)
  const localDate = String(start).slice(0, 10)
  return {
    sourceMessageId: 'capture-command',
    sourceText: input,
    rangeStart: localDate,
    rangeEnd: localDate,
    resolutionKind: 'relative',
    requiresExactDateConfirmation: true,
  }
}

function looksLikeGroceryCommand(input) {
  if (/\b(?:reminder|reminders|to do|todo|task|calendar|meeting|appt|appointment)\b/i.test(input)) return false
  if (!/^(?:please\s+)?add\b/i.test(input)) return false
  if (GROCERY_LIST_HINT.test(input)) return true
  return !looksLikeEventCommand(input) && !DAY_HINT.test(input) && !TIME_HINT.test(input)
}

function looksLikeEventCommand(input) {
  return EVENT_PREFIX.test(input) && !GROCERY_LIST_HINT.test(input) && (EVENT_NOUN.test(input) || DAY_HINT.test(input) || TIME_HINT.test(input))
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
    .replace(/\s+(?:today|tomorrow|tonight)\b/gi, '')
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
  const startMs = Date.UTC(
    targetDate.year,
    targetDate.month,
    targetDate.day,
    requestedTime.hour,
    requestedTime.minute,
  ) - offsetMinutes * 60000
  if (!Number.isFinite(startMs)) return null
  return {
    start: formatAtOffset(startMs, options.utcOffset, offsetMinutes),
    end: formatAtOffset(startMs + 15 * 60000, options.utcOffset, offsetMinutes),
  }
}

function resolveTargetDate(input, now, offsetMinutes) {
  const nowLocal = localParts(now, offsetMinutes)
  if (/\btoday\b/i.test(input)) {
    return { year: nowLocal.year, month: nowLocal.month, day: nowLocal.day }
  }
  if (/\btomorrow\b/i.test(input)) {
    const tomorrow = new Date(Date.UTC(nowLocal.year, nowLocal.month, nowLocal.day) + 86400000)
    return { year: tomorrow.getUTCFullYear(), month: tomorrow.getUTCMonth(), day: tomorrow.getUTCDate() }
  }
  const weekday = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
    .find((day) => new RegExp(`\\b${day}\\b`, 'i').test(input))
  if (!weekday) return null
  const todayUtcDay = Date.UTC(nowLocal.year, nowLocal.month, nowLocal.day)
  let daysAhead = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'].indexOf(weekday) - nowLocal.weekday
  if (daysAhead <= 0) daysAhead += 7
  const target = new Date(todayUtcDay + daysAhead * 86400000)
  return { year: target.getUTCFullYear(), month: target.getUTCMonth(), day: target.getUTCDate() }
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
  }
}
