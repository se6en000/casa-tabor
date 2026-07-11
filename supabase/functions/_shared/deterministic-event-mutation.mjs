const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
const STOP_WORDS = new Set(['the', 'an', 'a', 'event', 'appointment', 'apt', 'calendar', 'please'])

function normalize(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function parseOffsetMinutes(offset) {
  const match = String(offset ?? '').match(/^([+-])(\d{2}):(\d{2})$/)
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

function extractDateHint(text) {
  const lower = String(text).toLowerCase()
  if (/\btoday\b/.test(lower)) return 'today'
  if (/\btomorrow\b/.test(lower)) return 'tomorrow'
  return WEEKDAYS.find((day) => new RegExp(`\\b${day}\\b`, 'i').test(lower)) ?? null
}

function matchesDateHint(event, hint, now, offsetMinutes) {
  if (!hint) return true
  const eventParts = localParts(new Date(event.start_time), offsetMinutes)
  const nowParts = localParts(now, offsetMinutes)
  const eventDay = Date.UTC(eventParts.year, eventParts.month, eventParts.day)
  const nowDay = Date.UTC(nowParts.year, nowParts.month, nowParts.day)
  if (hint === 'today') return eventDay === nowDay
  if (hint === 'tomorrow') return eventDay === nowDay + 86400000
  const targetWeekday = WEEKDAYS.indexOf(hint)
  let daysAhead = targetWeekday - nowParts.weekday
  if (daysAhead <= 0) daysAhead += 7
  return eventDay === nowDay + daysAhead * 86400000
}

function titleTokens(value) {
  return normalize(value)
    .split(' ')
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token))
}

function matchingEvents(events, titleQuery, dateHint, now, offsetMinutes) {
  const queryTokens = titleTokens(titleQuery)
  if (queryTokens.length < 2) return []
  return events.filter((event) => {
    if (!matchesDateHint(event, dateHint, now, offsetMinutes)) return false
    const eventTitle = normalize(event.title)
    return queryTokens.every((token) => eventTitle.includes(token))
  })
}

function parseRequestedTime(text) {
  const matches = [...String(text).matchAll(/\b(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)\b/gi)]
  const match = matches.at(-1)
  if (!match) return null
  let hour = Number(match[1])
  const minute = Number(match[2] ?? 0)
  const meridiem = match[3].toLowerCase().startsWith('p') ? 'pm' : 'am'
  if (hour < 1 || hour > 12 || minute > 59) return null
  if (meridiem === 'pm' && hour !== 12) hour += 12
  if (meridiem === 'am' && hour === 12) hour = 0
  return { hour, minute }
}

function movedIso(eventStart, requestedTime, offsetMinutes) {
  const local = localParts(new Date(eventStart), offsetMinutes)
  return new Date(Date.UTC(
    local.year,
    local.month,
    local.day,
    requestedTime.hour,
    requestedTime.minute,
  ) - offsetMinutes * 60000).toISOString()
}

function createStartIso(text, requestedTime, now, offsetMinutes) {
  const localNow = localParts(now, offsetMinutes)
  const isoDate = String(text).match(/\b(20\d{2})-(\d{2})-(\d{2})\b/)
  let year = localNow.year
  let month = localNow.month
  let day = localNow.day

  if (isoDate) {
    year = Number(isoDate[1])
    month = Number(isoDate[2]) - 1
    day = Number(isoDate[3])
  } else {
    const hint = extractDateHint(text)
    if (!hint) return null
    const currentDay = Date.UTC(year, month, day)
    let daysAhead = hint === 'today' ? 0 : hint === 'tomorrow' ? 1 : WEEKDAYS.indexOf(hint) - localNow.weekday
    if (daysAhead < 0) daysAhead += 7
    const targetDay = new Date(currentDay + daysAhead * 86400000)
    year = targetDay.getUTCFullYear()
    month = targetDay.getUTCMonth()
    day = targetDay.getUTCDate()
  }

  let start = new Date(Date.UTC(year, month, day, requestedTime.hour, requestedTime.minute) - offsetMinutes * 60000)
  if (!isoDate && start.getTime() <= now.getTime()) {
    start = new Date(start.getTime() + 7 * 86400000)
  }
  return start.toISOString()
}

export function resolveDeterministicEventMutation(text, events, options = {}) {
  const input = String(text ?? '').replace(/\s+/g, ' ').trim()
  const now = options.now instanceof Date ? options.now : new Date()
  const offsetMinutes = parseOffsetMinutes(options.utcOffset)
  const dateHint = extractDateHint(input)

  const createPrefix = /^(?:create|add|book|schedule)\s+(?:an?\s+)?(?:calendar\s+)?(?:event|appointment|apt|reminder)\b/i
  if (createPrefix.test(input)) {
    const requestedTime = parseRequestedTime(input)
    const titleMatch = input.match(/\b(?:called|named)\s+(.+?)(?=\s+(?:on\s+)?(?:20\d{2}-\d{2}-\d{2}|today|tomorrow|sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b|\s+at\s+\d|$)/i)
    const title = titleMatch?.[1]?.trim()
    const start = requestedTime ? createStartIso(input, requestedTime, now, offsetMinutes) : null
    if (title && title.length >= 3 && start) {
      const durationMatch = input.match(/\bfor\s+(\d{1,3})\s*(minutes?|mins?|hours?|hrs?)\b/i)
      const durationMinutes = durationMatch
        ? Number(durationMatch[1]) * (/hour|hr/i.test(durationMatch[2]) ? 60 : 1)
        : 60
      if (durationMinutes >= 5 && durationMinutes <= 240) {
        const familyNames = Array.isArray(options.familyNames) ? options.familyNames : []
        const members = familyNames.filter((name) =>
          new RegExp(`\\b${String(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(input)
        )
        return {
          tool: 'create_event',
          args: {
            title,
            start,
            end: new Date(Date.parse(start) + durationMinutes * 60000).toISOString(),
            members,
            event_type: /\breminder\b/i.test(input) ? 'reminder' : 'event',
          },
          event: null,
        }
      }
    }
  }

  const findThenMove = input.match(/^find\s+(.+?)(?:\s+on\s+(?:today|tomorrow|sunday|monday|tuesday|wednesday|thursday|friday|saturday))?\s+and\s+(?:move|reschedule|shift|push)\s+(?:it\s+)?to\s+\d/i)
  const directMove = input.match(/^(?:move|reschedule|shift|push)\s+(.+?)(?:\s+on\s+(?:today|tomorrow|sunday|monday|tuesday|wednesday|thursday|friday|saturday))?\s+to\s+\d/i)
  const moveTitle = findThenMove?.[1] ?? directMove?.[1]
  if (moveTitle) {
    const requestedTime = parseRequestedTime(input)
    if (!requestedTime) return null
    const candidates = matchingEvents(events, moveTitle, dateHint, now, offsetMinutes)
    if (candidates.length !== 1) return null
    const event = candidates[0]
    const startMs = Date.parse(event.start_time)
    const endMs = Date.parse(event.end_time)
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return null
    const start = movedIso(event.start_time, requestedTime, offsetMinutes)
    const end = new Date(Date.parse(start) + (endMs - startMs)).toISOString()
    return {
      tool: 'update_event',
      args: {
        id: event.id,
        expected_updated_at: event.updated_at,
        start,
        end,
      },
      event,
    }
  }

  const deleteMatch = input.match(/^(?:delete|cancel|remove)\s+(?:the\s+)?(.+?)(?:\s+on\s+(?:today|tomorrow|sunday|monday|tuesday|wednesday|thursday|friday|saturday))?\.?$/i)
  if (deleteMatch && !/\b(all|every|both)\b/i.test(input)) {
    const candidates = matchingEvents(events, deleteMatch[1], dateHint, now, offsetMinutes)
    if (candidates.length !== 1) return null
    const event = candidates[0]
    return {
      tool: 'delete_event',
      args: { id: event.id, title: event.title },
      event,
    }
  }

  return null
}
