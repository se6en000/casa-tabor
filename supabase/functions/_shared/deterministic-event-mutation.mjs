const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
const MONTHS = new Map([
  ['january', 0], ['jan', 0], ['february', 1], ['feb', 1], ['march', 2], ['mar', 2],
  ['april', 3], ['apr', 3], ['may', 4], ['june', 5], ['jun', 5], ['july', 6], ['jul', 6],
  ['august', 7], ['aug', 7], ['september', 8], ['sep', 8], ['sept', 8],
  ['october', 9], ['oct', 9], ['november', 10], ['nov', 10], ['december', 11], ['dec', 11],
])
const MONTH_REGEX = /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b/i
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
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
  }
}

function extractDateHint(text) {
  const lower = String(text).toLowerCase()
  if (/\btoday\b/.test(lower)) return 'today'
  if (/\btomorrow\b/.test(lower)) return 'tomorrow'
  const monthMatch = lower.match(/\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?(?:\s*,?\s*(\d{4}))?\b/)
  if (monthMatch) {
    return `month:${monthMatch[1]}:${monthMatch[2]}${monthMatch[3] ? `:${monthMatch[3]}` : ''}`
  }
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
  if (hint.startsWith('month:')) {
    const [, mStr, dStr, yStr] = hint.split(':')
    const m = MONTHS.get(mStr.toLowerCase())
    const d = Number(dStr)
    const y = yStr ? Number(yStr) : nowParts.year
    return eventParts.month === m && eventParts.day === d && (!yStr || eventParts.year === y)
  }
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
  const normalizedExactQuery = normalize(titleQuery)
  const exactMatches = events.filter((event) =>
    matchesDateHint(event, dateHint, now, offsetMinutes) &&
    normalize(event.title) === normalizedExactQuery
  )
  if (exactMatches.length > 0) return exactMatches
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
  const monthDate = String(text).match(/\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?(?:\s*,?\s*(\d{4}))?\b/i)
  let year = localNow.year
  let month = localNow.month
  let day = localNow.day

  const hint = extractDateHint(text)
  if (isoDate) {
    year = Number(isoDate[1])
    month = Number(isoDate[2]) - 1
    day = Number(isoDate[3])
  } else if (monthDate) {
    month = MONTHS.get(monthDate[1].toLowerCase()) ?? localNow.month
    day = Number(monthDate[2])
    year = monthDate[3] ? Number(monthDate[3]) : localNow.year
    if (!monthDate[3]) {
      const tentativeMs = Date.UTC(year, month, day, requestedTime.hour, requestedTime.minute) - offsetMinutes * 60000
      if (tentativeMs < now.getTime() - 12 * 3600000) {
        year += 1
      }
    }
  } else {
    const effectiveHint = hint ?? 'today'
    const currentDay = Date.UTC(year, month, day)
    let daysAhead = effectiveHint === 'today' ? 0 : effectiveHint === 'tomorrow' ? 1 : WEEKDAYS.indexOf(effectiveHint) - localNow.weekday
    if (daysAhead < 0) daysAhead += 7
    const targetDay = new Date(currentDay + daysAhead * 86400000)
    year = targetDay.getUTCFullYear()
    month = targetDay.getUTCMonth()
    day = targetDay.getUTCDate()
  }

  let start = new Date(Date.UTC(year, month, day, requestedTime.hour, requestedTime.minute) - offsetMinutes * 60000)
  if (!isoDate && !monthDate && start.getTime() <= now.getTime()) {
    const daysToAdd = (!hint || hint === 'today') ? 1 : 7
    start = new Date(start.getTime() + daysToAdd * 86400000)
  }
  return start.toISOString()
}

export function resolveDeterministicEventMutation(text, events, options = {}) {
  const input = String(text ?? '').replace(/\s+/g, ' ').trim()
  const now = options.now instanceof Date ? options.now : new Date()
  const offsetMinutes = parseOffsetMinutes(options.utcOffset)
  const dateHint = extractDateHint(input)
  const quotedTitle = input.match(/["“](.+?)["”]/)?.[1]?.trim() ?? null

  const createPrefix = /^(?:create|add|book|schedule)\b/i
  const naturalEventPattern = /^(?:create|add|book|schedule)\s+(?:an?\s+)?(.+?)(?=\s+(?:for|on\s+)?(?:20\d{2}-\d{2}-\d{2}|today|tomorrow|sunday|monday|tuesday|wednesday|thursday|friday|saturday|jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b|\s+at\s+\d)/i
  const standAlonePattern = /^(.+?)\s+(?:for|on\s+)?(?:20\d{2}-\d{2}-\d{2}|today|tomorrow|sunday|monday|tuesday|wednesday|thursday|friday|saturday|jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+.*at\s+\d/i

  if (createPrefix.test(input) || (standAlonePattern.test(input) && /\b(?:event|appointment|appt|apt|reservation|dinner|lunch|breakfast|practice|meeting|party|tour|doctor|dr\b|dentist)\b/i.test(input))) {
    const namedTitle = input.match(/\b(?:called|named)\s+(.+?)(?=\s+(?:for|on\s+)?(?:20\d{2}-\d{2}-\d{2}|today|tomorrow|sunday|monday|tuesday|wednesday|thursday|friday|saturday|jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b|\s+at\s+\d|$)/i)?.[1]
    const naturalTitleMatch = input.match(naturalEventPattern)
    const naturalTitle = naturalTitleMatch?.[1]?.replace(/^(?:calendar\s+)?(?:event|appointment|apt|reminder)\s+(?:called|named)\s+/i, '')
    const fallbackTitle = !naturalTitle && standAlonePattern.test(input) ? input.match(standAlonePattern)?.[1] : null
    const candidateTitle = (namedTitle ?? naturalTitle ?? fallbackTitle)?.replace(/\s+(?:for|on)\s*$/i, '')?.trim()
    const title = candidateTitle && !/^(?:calendar\s+)?(?:event|appointment|apt|reminder)$/i.test(candidateTitle)
      ? candidateTitle
      : null
    const timeRange = input.match(/\bfrom\s+(\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?))\s+until\s+(\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?))(?:\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday))?/i)
    if (title && timeRange) {
      const requestedStart = parseRequestedTime(timeRange[1])
      const requestedEnd = parseRequestedTime(timeRange[2])
      const startText = input.slice(0, input.indexOf(timeRange[0])) + ` at ${timeRange[1]}`
      const start = requestedStart ? createStartIso(startText, requestedStart, now, offsetMinutes) : null
      if (start && requestedEnd) {
        const startLocal = new Date(Date.parse(start) + offsetMinutes * 60000)
        let end = new Date(Date.UTC(
          startLocal.getUTCFullYear(),
          startLocal.getUTCMonth(),
          startLocal.getUTCDate(),
          requestedEnd.hour,
          requestedEnd.minute,
        ) - offsetMinutes * 60000)
        if (end.getTime() <= Date.parse(start)) end = new Date(end.getTime() + 86400000)
        return {
          tool: 'create_event',
          args: {
            title,
            start,
            end: end.toISOString(),
            members: [],
            event_type: 'event',
          },
          event: null,
        }
      }
    }
    const requestedTime = parseRequestedTime(input)
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

  const selectiveClear = input.match(/^clear\s+(?:my\s+)?calendar\s+(today|tomorrow|sunday|monday|tuesday|wednesday|thursday|friday|saturday)\s+except\s+(.+?)[.!]?$/i)
  if (selectiveClear) {
    const scopedEvents = events.filter((event) => matchesDateHint(event, selectiveClear[1].toLowerCase(), now, offsetMinutes))
    const preservedTokens = titleTokens(selectiveClear[2])
    const ids = scopedEvents
      .filter((event) => !preservedTokens.every((token) => normalize(event.title).includes(token)))
      .map((event) => event.id)
      .filter(Boolean)
    if (ids.length > 0 && ids.length < scopedEvents.length) {
      return {
        tool: 'delete_events_by_title',
        args: {
          ids,
          title_query: `${selectiveClear[1]} except ${selectiveClear[2].trim()}`,
          count: ids.length,
        },
        event: null,
      }
    }
  }

  const findThenMove = input.match(/^find\s+(.+?)(?:\s+on\s+(?:today|tomorrow|sunday|monday|tuesday|wednesday|thursday|friday|saturday))?\s+and\s+(?:move|reschedule|shift|push)\s+(?:it\s+)?to\s+\d/i)
  const directMove = input.match(/^(?:move|reschedule|shift|push)\s+(.+?)(?:\s+on\s+(?:today|tomorrow|sunday|monday|tuesday|wednesday|thursday|friday|saturday))?\s+to\s+(?:(?:today|tomorrow|sunday|monday|tuesday|wednesday|thursday|friday|saturday)\s+)?(?:at\s+)?\d/i)
  const moveTitle = findThenMove?.[1] ?? directMove?.[1] ?? (/^(?:move|reschedule|shift|push)\b/i.test(input) ? quotedTitle : null)
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

  if (quotedTitle && /^(?:delete|cancel|remove)\b/i.test(input) && !/\b(all|every|both)\b/i.test(input)) {
    const exactQuotedCandidates = matchingEvents(events, quotedTitle, dateHint, now, offsetMinutes)
    if (exactQuotedCandidates.length === 1) {
      const event = exactQuotedCandidates[0]
      return {
        tool: 'delete_event',
        args: { id: event.id, title: event.title },
        event,
      }
    }
  }

  const deleteMatch = input.match(/^(?:delete|cancel|remove)\s+(?:the\s+)?(.+?)(?:\s+on\s+(?:today|tomorrow|sunday|monday|tuesday|wednesday|thursday|friday|saturday))?(?:\s+from\s+my\s+calendar)?\.?$/i)
  if ((deleteMatch || (quotedTitle && /^(?:delete|cancel|remove)\b/i.test(input))) && !/\b(all|every|both)\b/i.test(input)) {
    const deleteTitle = quotedTitle ?? deleteMatch?.[1]
    const candidates = matchingEvents(events, deleteTitle, dateHint, now, offsetMinutes)
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
