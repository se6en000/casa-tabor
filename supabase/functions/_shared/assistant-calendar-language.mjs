import { normalizeAssistantLanguage } from './assistant-language-normalization.mjs'

const CALENDAR_NOUNS = /\b(calendar|schedule|agenda|events?|appointments?|meetings?|plans?)\b/i
const TEMPORAL_WORDS = /\b(today|tomorrow|tonight|morning|afternoon|evening|night|week|weekend|month|sunday|monday|tuesday|wednesday|thursday|friday|saturday|next|later|after|january|february|march|april|may|june|july|august|september|october|november|december)\b/i
const ACTIVE_REFERENCE = /\b(it|that|this|there|the event|the appointment|the party)\b/i

const LIST_OPENERS = [
  "what's on", 'what is on', 'what do i have', 'what do we have',
  "what's going on", 'what is going on', "what's happening",
  'what is happening', 'what are we doing', 'what have i got', 'what have we got',
  'anything happening', 'anything planned', 'anything scheduled', 'show me',
  'tell me', 'give me', 'run through', 'walk me through', 'catch me up on',
  'lay out', 'fill me in on',
]
const CALENDAR_OBJECTS = ['my calendar', 'the calendar', 'my schedule', 'the schedule', 'my agenda', 'the agenda']
const DAY_SCOPES = [
  'today', 'tomorrow', 'tomorrow morning', 'tomorrow afternoon', 'tonight',
  'monday', 'tuesday morning', 'wednesday afternoon', 'thursday evening',
  'friday', 'this week', 'this weekend', 'next week', 'this month', 'next month',
]
const MONTHS = Object.freeze({
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
})

export const CALENDAR_INTENTS = Object.freeze([
  'calendar.list',
  'calendar.next',
  'calendar.count',
  'calendar.destinations',
  'calendar.availability',
  'event.select',
  'event.location',
  'event.address',
  'event.time',
  'event.duration',
  'event.attendees',
  'event.preparation',
  'event.travel',
  'event.create',
  'event.move',
  'event.edit',
  'event.delete',
])

export const CALENDAR_UTTERANCE_CORPUS = Object.freeze([
  ...LIST_OPENERS.flatMap((opener) => DAY_SCOPES.map((scope) => ({
    text: `${opener} ${CALENDAR_OBJECTS[0]} ${scope}`,
    intent: 'calendar.list',
  }))),
  ...CALENDAR_OBJECTS.flatMap((object) => DAY_SCOPES.map((scope) => ({
    text: `show me ${object} ${scope}`,
    intent: 'calendar.list',
  }))),
  ...DAY_SCOPES.flatMap((scope) => [
    { text: `how is ${scope} looking`, intent: 'calendar.list' },
    { text: `how does ${scope} look`, intent: 'calendar.list' },
    { text: `anything going on ${scope}`, intent: 'calendar.list' },
  ]),
  ...DAY_SCOPES.map((scope) => ({ text: `how many appointments do we have ${scope}`, intent: 'calendar.count' })),
  ...DAY_SCOPES.map((scope) => ({ text: `are we free ${scope}`, intent: 'calendar.availability' })),
  ...DAY_SCOPES.map((scope) => ({ text: `where do I need to go ${scope}`, intent: 'calendar.destinations' })),
  ...DAY_SCOPES.map((scope) => ({ text: `what places am I going ${scope}`, intent: 'calendar.destinations' })),
  ...['what is next', "what's next", 'what do I have next', 'what is coming up', 'anything after this'].map((text) => ({
    text,
    intent: 'calendar.next',
  })),
  ...['where is it', "what's the location", 'which venue is that', 'where do we need to go'].map((text) => ({
    text,
    intent: 'event.location',
    requiresActiveEvent: true,
  })),
  ...["what's the address", 'show me the address', 'what address do I use'].map((text) => ({
    text,
    intent: 'event.address',
    requiresActiveEvent: true,
  })),
  ...['when is it', 'what time does it start', 'when does it end'].map((text) => ({
    text,
    intent: 'event.time',
    requiresActiveEvent: true,
  })),
  ...['how long is the event', 'how long does it last', 'how long is the party'].map((text) => ({
    text,
    intent: 'event.duration',
    requiresActiveEvent: true,
  })),
  ...['who is going', "who's coming", 'who is attached to it'].map((text) => ({
    text,
    intent: 'event.attendees',
    requiresActiveEvent: true,
  })),
  ...['what should we bring', 'prep me for it', 'what do we need to prepare'].map((text) => ({
    text,
    intent: 'event.preparation',
    requiresActiveEvent: true,
  })),
  ...['how long is the drive', 'how long to get there', 'when should we leave', 'what is the travel time'].map((text) => ({
    text,
    intent: 'event.travel',
    requiresActiveEvent: true,
  })),
  { text: 'find details for the birthday event', intent: 'event.select' },
  { text: 'create a calendar event tomorrow', intent: 'event.create' },
  { text: 'move the appointment to friday', intent: 'event.move' },
  { text: 'add Owen to the calendar event', intent: 'event.edit' },
  { text: 'delete the calendar event', intent: 'event.delete' },
])

function normalize(value) {
  return normalizeAssistantLanguage(value)
}

function isValidDateParts(month, day, year = 2000) {
  if (month < 1 || month > 12 || day < 1) return false
  return day <= new Date(Date.UTC(year, month, 0)).getUTCDate()
}

function parseClockHour(hourText, minuteText, meridiem) {
  const hour = Number(hourText)
  const minute = Number(minuteText ?? 0)
  if (hour < 1 || hour > 12 || minute < 0 || minute > 59) return null
  return {
    hour: (hour % 12) + (meridiem === 'pm' ? 12 : 0),
    minute,
  }
}

function requestedMoveTime(input) {
  const clock = input.match(/\b(?:at|to)\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/)
  return clock ? parseClockHour(clock[1], clock[2], clock[3]) : null
}

function temporalScope(input) {
  const dayPart = input.match(/\b(morning|afternoon|evening|night)\b/)?.[1] ??
    (/\bafter lunch\b/.test(input) ? 'afternoon' : null)
  const clock = input.match(/\bat\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/)
  const time = clock ? parseClockHour(clock[1], clock[2], clock[3]) : null
  const clockRange = input.match(/\b(?:from|between)\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)\s+(?:to|through|and|-)\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/)
  const timeRange = clockRange
    ? {
        start: parseClockHour(clockRange[1], clockRange[2], clockRange[3]),
        end: parseClockHour(clockRange[4], clockRange[5], clockRange[6]),
      }
    : null
  const withTime = (scope) => ({
    ...scope,
    ...(dayPart ? { dayPart } : {}),
    ...(time ? { time } : {}),
    ...(timeRange?.start && timeRange?.end ? { timeRange } : {}),
  })

  if (/\bday after tomorrow\b/.test(input)) return withTime({ kind: 'relative_day', daysAhead: 2 })
  const nextDays = input.match(/\bnext\s+(\d{1,2})\s+days?\b/)
  if (nextDays) return { kind: 'next_days', count: Math.min(Math.max(Number(nextDays[1]), 1), 31) }
  if (/\bnext week\b/.test(input)) return { kind: 'next_week' }
  if (/\b(?:this )?weekend\b/.test(input)) return { kind: 'weekend' }
  if (/\bthis week\b|\bfor the week\b/.test(input)) return { kind: 'week' }
  if (/\bnext month\b/.test(input)) return { kind: 'next_month' }
  if (/\bthis month\b/.test(input)) return { kind: 'month' }

  const monthNames = Object.keys(MONTHS).join('|')
  const namedDateRange = input.match(new RegExp(`\\b(?:from\\s+|between\\s+)?(${monthNames})\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:\\s*,?\\s*(\\d{4}))?\\s+(?:to|through|thru|and|-)\\s+(?:(${monthNames})\\s+)?(\\d{1,2})(?:st|nd|rd|th)?(?:\\s*,?\\s*(\\d{4}))?\\b`))
  if (namedDateRange) {
    const start = {
      month: MONTHS[namedDateRange[1]],
      day: Number(namedDateRange[2]),
      ...(namedDateRange[3] ? { year: Number(namedDateRange[3]) } : {}),
    }
    const end = {
      month: MONTHS[namedDateRange[4] ?? namedDateRange[1]],
      day: Number(namedDateRange[5]),
      ...(namedDateRange[6] ? { year: Number(namedDateRange[6]) } : {}),
    }
    if (!isValidDateParts(start.month, start.day, start.year) || !isValidDateParts(end.month, end.day, end.year)) return null
    return { kind: 'date_range', start, end }
  }
  const numericDateRange = input.match(/\b(?:from\s+|between\s+)?(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?\s*(?:to|through|thru|and|-)\s*(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?\b/)
  if (numericDateRange) {
    const normalizeYear = (value) => value ? Number(value.length === 2 ? `20${value}` : value) : undefined
    const start = { month: Number(numericDateRange[1]), day: Number(numericDateRange[2]), ...(numericDateRange[3] ? { year: normalizeYear(numericDateRange[3]) } : {}) }
    const end = { month: Number(numericDateRange[4]), day: Number(numericDateRange[5]), ...(numericDateRange[6] ? { year: normalizeYear(numericDateRange[6]) } : {}) }
    if (!isValidDateParts(start.month, start.day, start.year) || !isValidDateParts(end.month, end.day, end.year)) return null
    return { kind: 'date_range', start, end }
  }
  const namedDate = input.match(new RegExp(`\\b(${monthNames})\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:\\s*,?\\s*(\\d{4}))?\\b`))
  if (namedDate) {
    const month = MONTHS[namedDate[1]]
    const day = Number(namedDate[2])
    const year = namedDate[3] ? Number(namedDate[3]) : undefined
    if (!isValidDateParts(month, day, year)) return null
    return withTime({
      kind: 'date',
      month,
      day,
      ...(year ? { year } : {}),
    })
  }
  const numericDate = input.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?\b/)
  if (numericDate) {
    const month = Number(numericDate[1])
    const day = Number(numericDate[2])
    const parsedYear = numericDate[3]
      ? Number(numericDate[3].length === 2 ? `20${numericDate[3]}` : numericDate[3])
      : null
    if (!isValidDateParts(month, day, parsedYear ?? undefined)) return null
    return withTime({
      kind: 'date',
      month,
      day,
      ...(parsedYear ? { year: parsedYear } : {}),
    })
  }
  const namedMonth = input.match(new RegExp(`\\b(${monthNames})\\b`))?.[1]
  if (namedMonth) return { kind: 'named_month', month: MONTHS[namedMonth] }

  if (/\btonight\b/.test(input)) return { kind: 'tonight' }
  if (/\btomorrow\b/.test(input)) return withTime({ kind: 'tomorrow' })
  if (/\btoday\b/.test(input)) return withTime({ kind: 'today' })
  const weekdayRange = input.match(/\b(?:(this|next)\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\s+(?:to|through|thru|-)\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/)
  if (weekdayRange) {
    return {
      kind: 'weekday_range',
      startWeekday: weekdayRange[2],
      endWeekday: weekdayRange[3],
      ...(weekdayRange[1] ? { modifier: weekdayRange[1] } : {}),
    }
  }
  const weekdayMatch = input.match(/\b(?:(this|next)\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/)
  if (weekdayMatch) {
    return withTime({
      kind: 'weekday',
      weekday: weekdayMatch[2],
      ...(weekdayMatch[1] ? { modifier: weekdayMatch[1] } : {}),
    })
  }
  if (dayPart || time) return withTime({ kind: 'today' })
  return null
}

function frame(intent, confidence, slots = {}, requiresActiveEvent = false) {
  return {
    domain: 'calendar',
    intent,
    confidence,
    source: 'calendar_language_contract',
    requiresActiveEvent,
    slots,
  }
}

export function parseCalendarLanguage(text, options = {}) {
  const input = normalize(text)
  if (!input) return null
  const activeEvent = options.activeEntityType === 'event' || options.focusedEvent === true
  const scope = temporalScope(input)
  const naturalScheduleCreate = /^schedule\s+.+\b(?:today|tomorrow|sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b.*\b(?:around|at)?\s*(?:\d{1,2}(?::\d{2})?|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)(?:\s*(?:am|pm))?\b/.test(input)
  const scopedNamedCreate = Boolean(
    scope &&
    /\b(add|create|book|schedule)\b/.test(input) &&
    /\b(event|appointment|meeting|reminder|practice|party|dinner|trip|vacation)\b/.test(input)
  )
  const attendeeUpdate = /\badd\s+[\w'-]+(?:\s+too|\s+to\s+(?:the\s+)?(?:calendar\s+)?(?:event|appointment|meeting|dinner|party|practice))\b/.test(input)
  const activeEditLanguage = activeEvent &&
    /\b(set|put|adjust|make|rename|call|include|exclude|extend|shorten)\b/.test(input)
  const mutationLanguage = /\b(add|create|book|move|reschedule|shift|push|change|update|edit|delete|remove|cancel)\b/.test(input) ||
    /\bschedule\s+(?:an?\s+)?(?:event|appointment|meeting|reminder)\b/.test(input) ||
    naturalScheduleCreate ||
    activeEditLanguage
  const namedTemporalMove = Boolean(
    scope && /\b(move|reschedule|shift|push)\b/.test(input)
  )

  if (mutationLanguage && (activeEvent || naturalScheduleCreate || scopedNamedCreate || namedTemporalMove || CALENDAR_NOUNS.test(input))) {
    if (/\b(delete|remove|cancel)\b/.test(input)) return frame('event.delete', 0.98, { temporalScope: scope })
    if (/\b(move|reschedule|shift|push)\b/.test(input)) {
      return frame('event.move', 0.98, {
        temporalScope: scope,
        requestedTime: requestedMoveTime(input),
      })
    }
    if (attendeeUpdate) return frame('event.edit', 0.99, { temporalScope: scope })
    if (/\b(add|create|book|schedule)\b/.test(input)) return frame('event.create', 0.96, { temporalScope: scope })
    if (activeEvent && (/\b(change|update|edit)\b/.test(input) || activeEditLanguage)) {
      return frame('event.edit', 0.94, { temporalScope: scope }, true)
    }
  }

  const listFollowUpLanguage = /\b(?:is that the only thing|anything else|what else|that(?:'s| is) it|is that all|nothing else)\b/.test(input) ||
    /\b(?:is(?:n't| not) there|there(?:'s| is) no)\b.+\b(?:too|also|as well)\b/.test(input) ||
    /\bare you sure\b.*\b(?:nothing|anything|everything)\b/.test(input) ||
    /\b(?:didn't|did not) mention\b|\b(?:missed|left out|omitted)\b/.test(input)
  const listLanguage = /\b(?:what(?:'s| is) (?:on|going on|happening|planned|scheduled)|what (?:are we doing|do (?:i|we) (?:have|got(?: going on)?)|have (?:i|we) got)|show me|tell me|give me|run through|walk me through|catch me up on|lay out|fill me in on|rundown|anything (?:on|happening|going on|planned|scheduled))\b/.test(input) ||
    /\bwhat (?:events?|appointments?|meetings?|plans?) (?:are )?(?:on|happening|going on|planned|scheduled)\b/.test(input) ||
    /\bwhat(?:'s| is)\s+(?:the\s+)?rest of\b.*\blook(?:ing)? like\b/.test(input) ||
    Boolean(scope && /^(?:how|what) about\b/.test(input)) ||
    /\b(?:how (?:is|does)|what does)\b.*\b(?:look|looking)\b/.test(input) ||
    listFollowUpLanguage
  if ((CALENDAR_NOUNS.test(input) || scope || listFollowUpLanguage) && listLanguage && !mutationLanguage) {
    return frame('calendar.list', 0.96, { temporalScope: scope })
  }

  if (activeEvent) {
    if (/\b(?:drive|travel|traffic|route|eta|get there|leave)\b/.test(input) || /\bhow long\b.*\b(?:get|drive|travel)\b/.test(input)) {
      return frame('event.travel', 0.99, {}, true)
    }
    if (/^\s*how long (?:will|does|would) it(?: take)?\s*$/.test(input)) {
      return frame('event.travel', 0.72, { ambiguousDuration: true }, true)
    }
    if (/\baddress\b/.test(input)) return frame('event.address', 0.99, {}, true)
    if (/\b(where|location|venue)\b/.test(input) || (ACTIVE_REFERENCE.test(input) && /\bgo\b/.test(input))) {
      return frame('event.location', 0.98, {}, true)
    }
    if (/\bhow long\b|\b(?:last|duration)\b/.test(input)) return frame('event.duration', 0.96, {}, true)
    if (/\b(?:what time|when|start|end)\b/.test(input)) return frame('event.time', 0.97, {}, true)
    if (/\b(?:who|attend|coming|going|members?)\b/.test(input)) return frame('event.attendees', 0.96, {}, true)
    if (/\b(?:bring|prepare|prep|details?|tell me about|need for)\b/.test(input)) {
      return frame('event.preparation', 0.95, {}, true)
    }
  }

  if (!scope && /\b(?:what(?:'s| is)|what do (?:i|we) have|anything)\b.*\b(?:next|coming up|after this)\b|^\s*next\s+(?:event|appointment)?\s*$/.test(input)) {
    return frame('calendar.next', 0.97, { temporalScope: scope })
  }
  if (/\bhow many\b.*(?:events?|appointments?|meetings?|things?|plans?)\b/.test(input)) {
    return frame('calendar.count', 0.98, { temporalScope: scope })
  }
  if (/\b(?:am i|are we|is everyone)\s+(?:free|busy)\b|\bany (?:conflicts?|overlaps?)\b/.test(input)) {
    return frame('calendar.availability', 0.97, { temporalScope: scope })
  }
  if (scope && /\bwhere\b.*\b(?:need to|have to|should|am i|are we)\s+go\b|\bwhat (?:places?|locations?|addresses?)\b.*\b(?:going|visiting|have)\b/.test(input)) {
    return frame('calendar.destinations', 0.98, { temporalScope: scope })
  }
  if (/\b(?:prepare|prep|find|look up|talk about|details? (?:for|on|about))\b/.test(input) && CALENDAR_NOUNS.test(input)) {
    return frame('event.select', 0.9, { temporalScope: scope })
  }
  return null
}

export function inheritCalendarReadScope(frameValue, previousFrame) {
  const inheritableIntents = new Set([
    'calendar.list',
    'calendar.count',
    'calendar.destinations',
    'calendar.availability',
  ])
  if (
    !frameValue ||
    !inheritableIntents.has(frameValue.intent) ||
    frameValue.slots?.temporalScope ||
    !previousFrame?.slots?.temporalScope
  ) {
    return frameValue
  }
  return {
    ...frameValue,
    slots: {
      ...frameValue.slots,
      temporalScope: previousFrame.slots.temporalScope,
    },
  }
}

export function isCalendarLikeLanguage(text) {
  const input = normalize(text)
  return CALENDAR_NOUNS.test(input) || (TEMPORAL_WORDS.test(input) && /\b(?:have|doing|going on|free|busy|next)\b/.test(input))
}
