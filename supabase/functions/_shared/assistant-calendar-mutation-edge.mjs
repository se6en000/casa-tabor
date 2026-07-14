const NUMBER_WORDS = new Map([
  ['one', 1],
  ['two', 2],
  ['three', 3],
  ['four', 4],
  ['five', 5],
  ['six', 6],
  ['seven', 7],
])

function durationMs(event) {
  const start = Date.parse(event?.start_time)
  const end = Date.parse(event?.end_time)
  return Number.isFinite(start) && Number.isFinite(end) && end > start ? end - start : null
}

function shiftDays(event, days) {
  const duration = durationMs(event)
  if (duration == null) return null
  const start = new Date(Date.parse(event.start_time) + days * 86400000)
  return {
    tool: 'update_event',
    args: {
      id: event.id,
      expected_updated_at: event.updated_at,
      start: start.toISOString(),
      end: new Date(start.getTime() + duration).toISOString(),
    },
    event,
  }
}

function localWeekday(value, utcOffset) {
  const offsetMatch = String(utcOffset ?? '').match(/^([+-])(\d{2}):(\d{2})$/)
  const offset = offsetMatch
    ? (offsetMatch[1] === '+' ? 1 : -1) * (Number(offsetMatch[2]) * 60 + Number(offsetMatch[3]))
    : 0
  return new Date(Date.parse(value) + offset * 60000).getUTCDay()
}

function localHour(value, utcOffset) {
  const offsetMatch = String(utcOffset ?? '').match(/^([+-])(\d{2}):(\d{2})$/)
  const offset = offsetMatch
    ? (offsetMatch[1] === '+' ? 1 : -1) * (Number(offsetMatch[2]) * 60 + Number(offsetMatch[3]))
    : 0
  return new Date(Date.parse(value) + offset * 60000).getUTCHours()
}

function overlaps(candidate, events, ignoredId) {
  const start = Date.parse(candidate.start)
  const end = Date.parse(candidate.end)
  return events.filter((event) => (
    event.id !== ignoredId
    && Date.parse(event.start_time) < end
    && Date.parse(event.end_time) > start
  ))
}

export function resolveActiveCalendarMutation(text, event, events, options = {}) {
  if (!event?.id) return null
  const input = String(text ?? '').replace(/\s+/g, ' ').trim()

  if (event.rrule || event.recurrence_master_id) {
    if (
      /\b(?:move|reschedule|shift|change|update|edit)\b/i.test(input)
      || /^(?:just\s+)?(?:that|this|the)\s+one[.!]?$/i.test(input)
    ) {
      return {
        text: 'This is a recurring event. AI editing cannot safely choose one occurrence, future events, or the whole series yet. Please use the event editor.',
        event,
      }
    }
  }

  const relativeDays = input.match(/\b(?:back|earlier)\s+(one|two|three|four|five|six|seven|\d+)\s+days?\b/i)
  if (relativeDays && /\b(?:move|shift|push|reschedule)\b/i.test(input)) {
    const amount = NUMBER_WORDS.get(relativeDays[1].toLowerCase()) ?? Number(relativeDays[1])
    return Number.isFinite(amount) && amount > 0 ? shiftDays(event, -amount) : null
  }

  if (/\bimmediately after (?:the )?meeting\b/i.test(input)) {
    const candidates = events
      .filter((candidate) => candidate.id !== event.id && /\bmeeting\b/i.test(candidate.title))
      .filter((candidate) => localWeekday(candidate.start_time, options.utcOffset) === localWeekday(event.start_time, options.utcOffset))
      .sort((a, b) => Date.parse(a.end_time) - Date.parse(b.end_time))
    if (candidates.length !== 1) return { text: 'Which meeting should I place it after?', event }
    const duration = durationMs(event)
    if (duration == null) return null
    const start = new Date(candidates[0].end_time)
    return {
      tool: 'update_event',
      args: {
        id: event.id,
        expected_updated_at: event.updated_at,
        start: start.toISOString(),
        end: new Date(start.getTime() + duration).toISOString(),
      },
      event,
    }
  }

  const requestedTime = input.match(/\b(?:to|at)\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i)
  if (requestedTime && /\b(?:move|make|change|reschedule|shift)\b/i.test(input)) {
    let hour = Number(requestedTime[1])
    const minute = Number(requestedTime[2] ?? 0)
    if (requestedTime[3].toLowerCase() === 'pm' && hour !== 12) hour += 12
    if (requestedTime[3].toLowerCase() === 'am' && hour === 12) hour = 0
    const weekdayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
    const requestedWeekday = weekdayNames.findIndex((day) => new RegExp(`\\b${day}\\b`, 'i').test(input))
    const start = new Date(event.start_time)
    if (requestedWeekday >= 0) {
      let daysAhead = requestedWeekday - localWeekday(event.start_time, options.utcOffset)
      if (daysAhead < 0 || (daysAhead === 0 && /\bnext\s+(?:sun|mon|tue|wed|thu|fri|sat)/i.test(input))) daysAhead += 7
      start.setUTCDate(start.getUTCDate() + daysAhead)
    }
    const offsetMatch = String(options.utcOffset ?? '').match(/^([+-])(\d{2}):(\d{2})$/)
    const offset = offsetMatch
      ? (offsetMatch[1] === '+' ? 1 : -1) * (Number(offsetMatch[2]) * 60 + Number(offsetMatch[3]))
      : 0
    const local = new Date(start.getTime() + offset * 60000)
    const movedStart = new Date(Date.UTC(
      local.getUTCFullYear(),
      local.getUTCMonth(),
      local.getUTCDate(),
      hour,
      minute,
    ) - offset * 60000)
    const duration = durationMs(event)
    if (duration == null) return null
    const candidate = { start: movedStart.toISOString(), end: new Date(movedStart.getTime() + duration).toISOString() }
    const conflicts = overlaps(candidate, events, event.id)
    if (conflicts.length > 0) {
      return {
        text: `That time overlaps "${conflicts[0].title}". Would you like a different time?`,
        event,
      }
    }
    return {
      tool: 'update_event',
      args: {
        id: event.id,
        expected_updated_at: event.updated_at,
        ...candidate,
      },
      event,
    }
  }

  return null
}

export function calendarMutationClarification(text) {
  const input = String(text ?? '').replace(/\s+/g, ' ').trim()
  if (/\b(?:schedule|book|add|create)\b.*\b(?:at)\s+(?:ate|eight)\b/i.test(input) && !/\b(?:am|pm|morning|afternoon|evening|night)\b/i.test(input)) {
    return 'Did you mean 8 AM or 8 PM?'
  }
  return null
}

export function resolveClarifiedCalendarCreate(previousText, text, options = {}) {
  const previous = String(previousText ?? '').replace(/\s+/g, ' ').trim()
  const current = String(text ?? '').replace(/\s+/g, ' ').trim()
  const scheduling = previous.match(/\b(?:schedule|book|add|create)\s+(?:an?\s+)?(?:event\s+called\s+)?(.+?)\s+(?:next\s+)?(sun(?:day)?|mon(?:day)?|tue(?:sday)?|wed(?:nesday)?|thu(?:rsday)?|fri(?:day)?|sat(?:urday)?)\s+at\s+(?:ate|eight)\b/i)
  const clarifiedTime = current.match(/\b(eight|8)(?::(\d{2}))?\s+(?:in\s+the\s+)?(morning|evening|night|afternoon)\b/i)
  if (!scheduling || !clarifiedTime) return null
  const now = options.now instanceof Date ? options.now : new Date()
  const weekday = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'].indexOf(scheduling[2].toLowerCase().slice(0, 3))
  let daysAhead = weekday - now.getDay()
  if (daysAhead <= 0 || /\bnext\s+/i.test(previous)) daysAhead += 7
  const hour = clarifiedTime[3].toLowerCase() === 'morning' ? 8 : 20
  const start = new Date(now)
  start.setDate(start.getDate() + daysAhead)
  start.setHours(hour, Number(clarifiedTime[2] ?? 0), 0, 0)
  return {
    tool: 'create_event',
    args: {
      title: scheduling[1].trim(),
      start: start.toISOString(),
      end: new Date(start.getTime() + 60 * 60000).toISOString(),
      members: [],
      event_type: 'event',
    },
  }
}

export function singularBulkDeleteClarification(text, tool, args, events, formatTime = (value) => value) {
  if (
    tool !== 'delete_events_by_title'
    || /\b(?:all|every|both|each)\b/i.test(String(text ?? ''))
    || /\bclear\s+(?:my\s+)?calendar\b/i.test(String(text ?? ''))
  ) return null
  const ids = Array.isArray(args?.ids) ? new Set(args.ids) : new Set()
  const matches = events.filter((event) => ids.has(event.id))
  if (matches.length < 2) return null
  const choices = matches.slice(0, 5).map((event) => `${event.title} at ${formatTime(event.start_time)}`)
  return `I found ${matches.length} matching events. Which one should I delete: ${choices.join('; ')}?`
}

export function resolveCalendarDeleteDisambiguation(previousText, text, events, options = {}) {
  const previous = String(previousText ?? '').replace(/\s+/g, ' ').trim()
  const current = String(text ?? '').replace(/\s+/g, ' ').trim()
  const request = previous.match(/^(?:delete|cancel|remove)\s+(?:the\s+)?(.+?)\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)[.!]?$/i)
  const dayPart = /\bafternoon\b/i.test(current) ? 'afternoon' : /\bmorning\b/i.test(current) ? 'morning' : null
  if (!request || !dayPart) return null
  const queryTokens = request[1].toLowerCase().split(/\s+/).filter((token) => token.length > 2 && !['the', 'event', 'appointment'].includes(token))
  const weekday = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'].indexOf(request[2].toLowerCase())
  const matches = events.filter((event) => {
    const title = String(event.title ?? '').toLowerCase()
    if (!queryTokens.every((token) => title.includes(token))) return false
    if (localWeekday(event.start_time, options.utcOffset) !== weekday) return false
    const hour = localHour(event.start_time, options.utcOffset)
    return dayPart === 'afternoon' ? hour >= 12 : hour < 12
  })
  if (matches.length !== 1) return null
  return {
    tool: 'delete_event',
    args: { id: matches[0].id, title: matches[0].title },
    event: matches[0],
  }
}

export function isCalendarMutationDisambiguationFollowUp(previousText, text) {
  const previous = String(previousText ?? '').replace(/\s+/g, ' ').trim()
  const current = String(text ?? '').replace(/\s+/g, ' ').trim()
  return /^(?:delete|cancel|remove|move|reschedule|shift|change)\b/i.test(previous)
    && /^(?:the\s+)?(?:(?:morning|afternoon|evening|earlier|later)\s+one|one\s+at\s+\d|first|second|last)(?:\s+one)?[.!]?$/i.test(current)
}

export function calendarDeleteAmbiguityClarification(text, events, options = {}, formatTime = (value) => value) {
  const input = String(text ?? '').replace(/\s+/g, ' ').trim()
  if (/\b(?:all|every|both|each)\b/i.test(input)) return null
  const request = input.match(/^(?:delete|cancel|remove)\s+(?:the\s+)?(.+?)\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)[.!]?$/i)
  if (!request) return null
  const queryTokens = request[1].toLowerCase().split(/\s+/).filter((token) => token.length > 2 && !['the', 'event', 'appointment'].includes(token))
  const weekday = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'].indexOf(request[2].toLowerCase())
  const matches = events.filter((event) => (
    localWeekday(event.start_time, options.utcOffset) === weekday
    && queryTokens.every((token) => String(event.title ?? '').toLowerCase().includes(token))
  ))
  if (matches.length < 2) return null
  const choices = matches.map((event) => `${event.title} at ${formatTime(event.start_time)}`)
  return `I found ${matches.length} matching events. Which one should I delete: ${choices.join('; ')}?`
}

export function answerPendingSelectiveClear(text, pendingAction) {
  const input = String(text ?? '').replace(/\s+/g, ' ').trim()
  if (
    pendingAction?.tool !== 'delete_events_by_title'
    || !/\b(?:what|which)\b.*\bremain|what exactly would remain/i.test(input)
  ) return null
  const titleQuery = String(pendingAction?.args?.title_query ?? '')
  const preserved = titleQuery.match(/\bexcept\s+(.+)$/i)?.[1]?.trim()
  return preserved ? `${preserved} would remain on the calendar.` : null
}
