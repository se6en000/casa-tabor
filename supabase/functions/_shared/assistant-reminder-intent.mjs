const ONES = new Map([
  ['one', 1], ['two', 2], ['three', 3], ['four', 4], ['five', 5],
  ['six', 6], ['seven', 7], ['eight', 8], ['nine', 9], ['ten', 10],
  ['eleven', 11], ['twelve', 12], ['thirteen', 13], ['fourteen', 14],
  ['fifteen', 15], ['sixteen', 16], ['seventeen', 17], ['eighteen', 18],
  ['nineteen', 19],
])
const TENS = new Map([
  ['twenty', 20], ['thirty', 30], ['forty', 40], ['fifty', 50],
])
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
const MONTHS = new Map([
  ['january', 0], ['jan', 0], ['february', 1], ['feb', 1], ['march', 2], ['mar', 2],
  ['april', 3], ['apr', 3], ['may', 4], ['june', 5], ['jun', 5], ['july', 6], ['jul', 6],
  ['august', 7], ['aug', 7], ['september', 8], ['sep', 8], ['sept', 8],
  ['october', 9], ['oct', 9], ['november', 10], ['nov', 10], ['december', 11], ['dec', 11],
])
const DAYPARTS = [
  { pattern: /\b(?:(?:this|tomorrow|the|in the|at|around|by)\s+late morning|late morning(?=\s+to\b|[.!?]*$))/i, label: 'late morning', minute: 11 * 60, endMinute: 12 * 60 },
  { pattern: /\b(?:(?:this|tomorrow|the|in the|at|around|by)\s+early morning|early morning(?=\s+to\b|[.!?]*$)|breakfast time|at breakfast)\b/i, label: 'morning', minute: 8 * 60, endMinute: 12 * 60 },
  { pattern: /\b(?:(?:this|tomorrow|the|in the|at|around|by)\s+morning|morning(?=\s+to\b|[.!?]*$))/i, label: 'morning', minute: 9 * 60, endMinute: 12 * 60 },
  { pattern: /\b(?:at lunch|around lunch|by lunch|for lunch|lunch time|lunchtime|around noon|at noon|noon(?=\s+to\b|[.!?]*$)|midday)\b/i, label: 'lunch', minute: 12 * 60, endMinute: 14 * 60 },
  { pattern: /\b(?:(?:this|tomorrow|the|in the|at|around|by)\s+late afternoon|late afternoon(?=\s+to\b|[.!?]*$))/i, label: 'late afternoon', minute: 16 * 60 + 30, endMinute: 18 * 60 },
  { pattern: /\b(?:(?:this|tomorrow|the|in the|at|around|by)\s+early afternoon|early afternoon(?=\s+to\b|[.!?]*$))/i, label: 'early afternoon', minute: 13 * 60, endMinute: 18 * 60 },
  { pattern: /\b(?:(?:this|tomorrow|the|in the|at|around|by)\s+afternoon|afternoon(?=\s+to\b|[.!?]*$))/i, label: 'afternoon', minute: 15 * 60, endMinute: 18 * 60 },
  { pattern: /\b(?:(?:this|tomorrow|the|in the|at|around|by)\s+early evening|early evening(?=\s+to\b|[.!?]*$)|after work)\b/i, label: 'early evening', minute: 17 * 60 + 30, endMinute: 21 * 60 },
  { pattern: /\b(?:(?:this|tomorrow|the|in the|at|around|by)\s+evening|evening(?=\s+to\b|[.!?]*$)|dinner time|at dinner)\b/i, label: 'evening', minute: 18 * 60, endMinute: 21 * 60 },
  { pattern: /\b(?:tonight|bedtime|at night|around nightfall|(?:this|tomorrow|the|in the|at|around|by)\s+late evening|late evening(?=\s+to\b|[.!?]*$))\b/i, label: 'tonight', minute: 20 * 60, endMinute: 23 * 60 },
]
const REMINDER_CLARIFICATION_PROMPTS = new Set([
  'Sure — what should I remind you about, and when?',
  'What should I remind you about?',
  'When should I remind you?',
])

export function isExplicitReminderRequest(text) {
  const value = String(text ?? '').replace(/\s+/g, ' ').trim()
  if (!value) return false
  return (
    /^(?:please\s+)?remind\b/i.test(value) ||
    /^(?:please\s+)?(?:a\s+)?reminder\b/i.test(value) ||
    /\bremind\s+(?:me|us|him|her|them)\b/i.test(value) ||
    /\b(?:set|create|add|make|schedule)\s+(?:(?:me|us)\s+)?(?:a\s+)?reminder\b/i.test(value) ||
    /\b(?:give|send)\s+(?:me|us)\s+(?:a\s+)?reminder\b/i.test(value) ||
    /\b(?:alert|notify|nudge)\s+(?:me|us)\b/i.test(value) ||
    /\b(?:i|we)\s+(?:need|want|would like|have)\s+to\s+(?:be\s+reminded|remember)\b/i.test(value) ||
    /\b(?:i|we)(?:'ve| have)?\s+got(?:ta|\s+to)\s+remember\b/i.test(value) ||
    /\b(?:i|we)\s+(?:need|want|would like)\s+(?:a\s+)?reminder\b/i.test(value) ||
    /\bdon'?t\s+let\s+(?:me|us)\s+forget\b/i.test(value) ||
    /\bmake\s+sure\s+(?:i|we)\s+(?:remember|don'?t\s+forget)\b/i.test(value) ||
    /\b(?:can|could|will|would)\s+you\s+(?:please\s+)?remind\s+(?:me|us)\b/i.test(value) ||
    /\breminder\s+(?:for|to)\b/i.test(value) ||
    /^(?:please\s+)?remember\s+to\b/i.test(value)
  )
}

export function hasReminderLanguage(text) {
  return /\b(?:remind|reminded|reminding|reminder|reminders)\b/i.test(String(text ?? ''))
}

export function explicitReminderCreateRequestForMessages(messages) {
  const normalizedMessages = Array.isArray(messages) ? messages : []
  const latestUserIndex = normalizedMessages.findLastIndex((message) =>
    message?.role === 'user' && typeof message.content === 'string'
  )
  if (latestUserIndex < 0) return null

  const latestUserText = normalizedMessages[latestUserIndex].content
  if (isExplicitReminderRequest(latestUserText)) return latestUserText

  const priorAssistant = normalizedMessages
    .slice(0, latestUserIndex)
    .findLast((message) => message?.role === 'assistant' && typeof message.content === 'string')
  if (!REMINDER_CLARIFICATION_PROMPTS.has(priorAssistant?.content?.trim())) return null

  const reminderStartIndex = normalizedMessages
    .slice(0, latestUserIndex)
    .findLastIndex((message) =>
      message?.role === 'user' &&
      typeof message.content === 'string' &&
      isExplicitReminderRequest(message.content)
    )
  if (reminderStartIndex < 0) return null

  const userParts = normalizedMessages
    .slice(reminderStartIndex, latestUserIndex + 1)
    .flatMap((message) =>
      message?.role === 'user' && typeof message.content === 'string'
        ? [message.content.trim()]
        : []
    )
    .filter(Boolean)
  if (priorAssistant.content.trim() === 'What should I remind you about?' && userParts.length > 1) {
    userParts[userParts.length - 1] = `to ${userParts.at(-1)}`
  }
  return userParts.join(' ')
}

export function reminderCreateClarification(text) {
  if (!isExplicitReminderRequest(text)) return null
  const value = String(text ?? '').replace(/\s+/g, ' ').trim()
  const hasTiming = reminderHasTiming(value)
  const hasSubject = reminderHasSubject(value)
  if (hasTiming && hasSubject) return null
  if (!hasTiming && !hasSubject) return 'Sure — what should I remind you about, and when?'
  return hasSubject ? 'When should I remind you?' : 'What should I remind you about?'
}

export function explicitReminderSubject(text) {
  if (!isExplicitReminderRequest(text)) return null
  const value = String(text ?? '').replace(/\s+/g, ' ').trim()
  const clauses = [...value.matchAll(/\b(?:to|about|that)\s+([^.!?]+?)(?=$|[.!?])/gi)]
  const subject = clauses
    .map((match) => stripTrailingReminderTiming(match[1]))
    .findLast((candidate) =>
      candidate.length >= 2 && !/^(?:be\s+)?reminded\b|^remember\b/i.test(candidate)
    )
  if (subject) return capitalizeReminderSubject(subject)

  const reminderFor = value.match(/\breminder\s+for\s+([^.!?]+?)(?=$|[.!?])/i)?.[1]?.trim() ?? ''
  if (reminderFor.length >= 2 && !reminderHasTiming(reminderFor)) {
    return capitalizeReminderSubject(reminderFor)
  }
  return null
}

export function hardenExplicitReminderTurn(turn, text, options = {}) {
  if (!turn || typeof turn !== 'object') return turn
  if (isExplicitReminderCompletion(text)) return { ...turn, action: 'complete' }
  if (!isExplicitReminder(text)) return turn
  if (!['create', 'revise'].includes(turn.action)) return turn

  const patch = turn.patch && typeof turn.patch === 'object' ? { ...turn.patch } : {}
  patch.event_type = 'reminder'

  const relativeMinutes = parseRelativeMinutes(text)
  if (relativeMinutes) {
    patch.relative_minutes = relativeMinutes
    delete patch.duration_minutes
  }
  const daypartRange = resolveExplicitReminderDaypartRange(text, options)
  if (daypartRange) {
    patch.date_reference = daypartRange.dateReference.kind === 'relative_days'
      ? {
          kind: 'relative_days',
          offset_days: daypartRange.dateReference.offsetDays,
        }
      : daypartRange.dateReference
    patch.time = daypartRange.time
    patch.duration_minutes = 30
    delete patch.all_day
  }
  if (patch.date_reference && !patch.time && !relativeMinutes) patch.all_day = true

  return { ...turn, patch }
}

export function resolveExplicitReminderDaypartRange(text, options = {}) {
  if (!isExplicitReminderRequest(text)) return null
  const daypart = findReminderDaypart(text)
  if (!daypart) return null

  const currentMs = Date.parse(String(options.currentDate ?? ''))
  const offset = parseUtcOffset(options.utcOffset)
  if (!Number.isFinite(currentMs) || !offset) return null

  const localNow = new Date(currentMs + offset.minutes * 60000)
  const baseDate = new Date(Date.UTC(
    localNow.getUTCFullYear(),
    localNow.getUTCMonth(),
    localNow.getUTCDate(),
    12,
  ))
  const resolvedDate = resolveReminderDate(text, baseDate)
  if (!resolvedDate) return null

  let targetDate = resolvedDate.date
  let targetMinute = daypart.minute
  const targetDayKey = formatLocalDate(targetDate)
  const todayKey = formatLocalDate(baseDate)
  if (targetDayKey === todayKey) {
    const nowMinute = localNow.getUTCHours() * 60 + localNow.getUTCMinutes()
    if (targetMinute <= nowMinute) {
      const nextQuarterHour = Math.ceil((nowMinute + 10) / 15) * 15
      if (nextQuarterHour < daypart.endMinute) {
        targetMinute = nextQuarterHour
      } else {
        targetDate = addLocalDays(targetDate, 1)
        targetMinute = daypart.minute
      }
    }
  }

  const hour = Math.floor(targetMinute / 60)
  const minute = targetMinute % 60
  const startMs = Date.UTC(
    targetDate.getUTCFullYear(),
    targetDate.getUTCMonth(),
    targetDate.getUTCDate(),
    hour,
    minute,
  ) - offset.minutes * 60000
  if (startMs <= currentMs) return null

  const dateReference = dateReferenceFor(targetDate, baseDate, resolvedDate.reference)
  return {
    label: daypart.label,
    dateReference,
    time: {
      hour: hour % 12 || 12,
      minute,
      period: hour >= 12 ? 'pm' : 'am',
    },
    start: formatAtOffset(startMs, offset.text, offset.minutes),
    end: formatAtOffset(startMs + 30 * 60000, offset.text, offset.minutes),
  }
}

export function fallbackExplicitRelativeReminderTurn(text) {
  if (!isExplicitReminder(text)) return null
  const relativeMinutes = parseRelativeMinutes(text)
  if (!relativeMinutes) return null
  const title = String(text ?? '').match(/\bto\s+(.+?)[.!?]*$/i)?.[1]?.trim()
  if (!title) return null
  return {
    version: 'calendar-semantic-turn-v1',
    action: 'create',
    patch: {
      title,
      event_type: 'reminder',
      relative_minutes: relativeMinutes,
    },
  }
}

export function isExplicitReminderCompletion(text) {
  const value = String(text ?? '')
  return /\b(?:mark|check)\b.*\breminder\b.*\b(?:done|complete|off)\b|\bcomplete\b.*\breminder\b/i.test(value)
}

export function isReminderCompletionFollowUp(text, conversationState) {
  if (!isCompletionLanguage(text)) return false
  if (conversationState?.activeEntityType === 'event') {
    return conversationState.eventType === 'reminder'
  }
  if (conversationState?.activeEntityType !== 'calendar_clarification') return false
  const candidates = Array.isArray(conversationState.candidateEvents)
    ? conversationState.candidateEvents
    : []
  return candidates.length > 0 &&
    candidates.every((candidate) => candidate?.eventType === 'reminder')
}

export function explicitReminderSearchOverride(text) {
  const value = String(text ?? '').toLowerCase()
  if (
    !/\breminders?\b/.test(value) ||
    !/\b(?:any|are|find|give|have|list|look|search|show|tell|what|where|which)\b/.test(value) ||
    isExplicitReminder(value) ||
    isExplicitReminderCompletion(value)
  ) return null

  const ignored = new Set([
    'a', 'active', 'an', 'any', 'are', 'calendar', 'can', 'could', 'current',
    'currently', 'do', 'event', 'events', 'find', 'for', 'give', 'have', 'i',
    'incomplete', 'is', 'list', 'look', 'me', 'my', 'now', 'on', 'open',
    'our', 'outstanding', 'pending', 'please', 'reminder', 'reminders', 'right',
    'search', 'show', 'tell', 'the', 'what', 'where', 'which', 'you',
  ])
  const temporal = new Set([
    'today', 'tomorrow', 'yesterday', 'sunday', 'monday', 'tuesday',
    'wednesday', 'thursday', 'friday', 'saturday', 'week', 'month', 'year',
  ])
  const words = value.replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean)
  const hasTemporalReference = words.some((word) => temporal.has(word)) ||
    /\b(?:next|this|last)\s+(?:week|month|year|sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/.test(value) ||
    /\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b/.test(value)
  const query = words.filter((word) => !ignored.has(word) && !temporal.has(word)).join(' ')
  return {
    event_type: 'reminder',
    query: query || undefined,
    clear_range: !hasTemporalReference,
  }
}

export function explicitReminderSearchForMessages(messages) {
  const userTexts = (Array.isArray(messages) ? messages : []).flatMap((message) =>
    message?.role === 'user' && typeof message.content === 'string'
      ? [message.content]
      : []
  )
  const latest = userTexts.at(-1)
  const isCorrection =
    /^\s*(?:(?:these|those|they)\s+(?:are|were)|i\s+(?:mean|meant))\s+(?:the\s+)?reminders?\s*[.!?]*\s*$/i.test(String(latest ?? ''))
  if (isCorrection) return explicitReminderSearchOverride(userTexts.at(-2))

  return explicitReminderSearchOverride(latest)
}

const isExplicitReminder = isExplicitReminderRequest

function isCompletionLanguage(text) {
  const value = String(text ?? '')
  return /\b(?:mark|check)\b.*\b(?:done|complete|completed|off)\b|\b(?:complete|finish)\b.*|\b(?:is|are)\s+(?:done|complete|completed)\b/i.test(value)
}

function reminderHasTiming(text) {
  return (
    Boolean(findReminderDaypart(text)) ||
    /\b(?:today|tomorrow|midnight)\b/i.test(text) ||
    /\b(?:sun(?:day)?|mon(?:day)?|tue(?:sday)?|wed(?:nesday)?|thu(?:rsday)?|fri(?:day)?|sat(?:urday)?)\b/i.test(text) ||
    /\b(?:this|next)\s+(?:week|month|weekend|sun(?:day)?|mon(?:day)?|tue(?:sday)?|wed(?:nesday)?|thu(?:rsday)?|fri(?:day)?|sat(?:urday)?)\b/i.test(text) ||
    /\b(?:at|around|by|before|after)\s+\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)?\b/i.test(text) ||
    /\bin\s+(?:\d+|[a-z]+(?:[\s-]+[a-z]+)?)\s+(?:minutes?|hours?|days?|weeks?)\b/i.test(text) ||
    /\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b/.test(text) ||
    /\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2}\b/i.test(text)
  )
}

function findReminderDaypart(text) {
  return DAYPARTS.find((candidate) => candidate.pattern.test(String(text ?? ''))) ?? null
}

function reminderHasSubject(text) {
  return explicitReminderSubject(text) !== null
}

function capitalizeReminderSubject(value) {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

function stripTrailingReminderTiming(value) {
  return String(value ?? '')
    .replace(
      /\s+(?:(?:today|tomorrow|tonight)(?:\s+(?:morning|afternoon|evening|night))?|(?:this|in the)\s+(?:early\s+|late\s+)?(?:morning|afternoon|evening|night)|(?:at|around)\s+(?:lunch(?:\s*time)?|lunchtime|noon|midday|breakfast(?:\s*time)?|dinner(?:\s*time)?|bedtime|after work))\s*$/i,
      '',
    )
    .trim()
}

function parseRelativeMinutes(text) {
  const match = String(text ?? '').match(
    /\bin\s+(\d+|[a-z]+(?:[\s-]+[a-z]+)?)\s+(minutes?|hours?)\b/i,
  )
  if (!match) return null
  const amount = parseSpokenInteger(match[1])
  if (!amount) return null
  const minutes = amount * (/^hour/i.test(match[2]) ? 60 : 1)
  return minutes <= 366 * 24 * 60 ? minutes : null
}

function parseSpokenInteger(value) {
  const normalized = String(value).trim().toLowerCase().replace(/-/g, ' ')
  if (/^\d+$/.test(normalized)) {
    const number = Number(normalized)
    return Number.isSafeInteger(number) && number > 0 ? number : null
  }
  if (ONES.has(normalized)) return ONES.get(normalized)
  const [tens, ones] = normalized.split(/\s+/)
  if (!TENS.has(tens)) return null
  if (!ones) return TENS.get(tens)
  return ONES.has(ones) && ONES.get(ones) < 10 ? TENS.get(tens) + ONES.get(ones) : null
}

function parseUtcOffset(value) {
  const match = String(value ?? '').match(/^([+-])(\d{2}):(\d{2})$/)
  if (!match) return null
  const minutes = Number(match[2]) * 60 + Number(match[3])
  if (minutes > 14 * 60 || Number(match[3]) > 59) return null
  return {
    text: `${match[1]}${match[2]}:${match[3]}`,
    minutes: match[1] === '-' ? -minutes : minutes,
  }
}

function resolveReminderDate(text, baseDate) {
  const value = String(text ?? '').toLowerCase()
  if (/\bday after tomorrow\b/.test(value)) {
    return { date: addLocalDays(baseDate, 2), reference: { kind: 'day_after_tomorrow' } }
  }
  if (/\btomorrow\b/.test(value)) {
    return { date: addLocalDays(baseDate, 1), reference: { kind: 'tomorrow' } }
  }

  const spokenNumber = '(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty(?:[ -](?:one|two|three|four|five|six|seven|eight|nine))?|thirty(?:[ -](?:one|two|three|four|five|six|seven|eight|nine))?|forty(?:[ -](?:one|two|three|four|five|six|seven|eight|nine))?|fifty(?:[ -](?:one|two|three|four|five|six|seven|eight|nine))?)'
  const relative = value.match(new RegExp(`\\b(?:in\\s+)?(\\d+|${spokenNumber})\\s+(days?|weeks?)\\s+(?:from now|from today)\\b`)) ??
    value.match(new RegExp(`\\bin\\s+(\\d+|${spokenNumber})\\s+(days?|weeks?)\\b`))
  const amount = relative ? parseSpokenInteger(relative[1]) : null
  if (relative && amount) {
    const days = amount * (/^week/.test(relative[2]) ? 7 : 1)
    return {
      date: addLocalDays(baseDate, days),
      reference: { kind: 'relative_days', offsetDays: days },
    }
  }
  if (/\b(?:a|one)\s+week\s+from\s+(?:now|today)\b|\bnext week\b/.test(value)) {
    return {
      date: addLocalDays(baseDate, 7),
      reference: { kind: 'relative_days', offsetDays: 7 },
    }
  }

  const weekdayMatch = value.match(/\b(?:(next|this)\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/)
  if (weekdayMatch) {
    const weekday = WEEKDAYS.indexOf(weekdayMatch[2])
    let days = (weekday - baseDate.getUTCDay() + 7) % 7
    if (days === 0) days = 7
    return {
      date: addLocalDays(baseDate, days),
      reference: { kind: 'weekday', weekday: weekdayMatch[2] },
    }
  }

  const numericDate = value.match(/\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/)
  if (numericDate) {
    const year = normalizeYear(numericDate[3], baseDate.getUTCFullYear())
    const date = futureCalendarDate(year, Number(numericDate[1]) - 1, Number(numericDate[2]), baseDate, !numericDate[3])
    return date ? { date, reference: absoluteDateReference(date, Boolean(numericDate[3])) } : null
  }

  const monthDate = value.match(/\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})(?:,?\s+(\d{4}))?\b/)
  if (monthDate) {
    const month = MONTHS.get(monthDate[1])
    const year = normalizeYear(monthDate[3], baseDate.getUTCFullYear())
    const date = Number.isInteger(month)
      ? futureCalendarDate(year, month, Number(monthDate[2]), baseDate, !monthDate[3])
      : null
    return date ? { date, reference: absoluteDateReference(date, Boolean(monthDate[3])) } : null
  }

  return { date: new Date(baseDate), reference: { kind: 'today' } }
}

function normalizeYear(value, fallback) {
  if (!value) return fallback
  const year = Number(value)
  return year < 100 ? 2000 + year : year
}

function futureCalendarDate(year, month, day, baseDate, rollYear) {
  let date = new Date(Date.UTC(year, month, day, 12))
  if (date.getUTCMonth() !== month || date.getUTCDate() !== day) return null
  if (rollYear && formatLocalDate(date) < formatLocalDate(baseDate)) {
    date = new Date(Date.UTC(year + 1, month, day, 12))
  }
  return formatLocalDate(date) < formatLocalDate(baseDate) ? null : date
}

function absoluteDateReference(date, includeYear) {
  return {
    kind: 'absolute',
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
    ...(includeYear ? { year: date.getUTCFullYear() } : {}),
  }
}

function dateReferenceFor(targetDate, baseDate, originalReference) {
  const dayDifference = Math.round((targetDate.getTime() - baseDate.getTime()) / 86400000)
  if (dayDifference === 0) return { kind: 'today' }
  if (dayDifference === 1) return { kind: 'tomorrow' }
  if (originalReference?.kind === 'absolute' || originalReference?.kind === 'weekday') {
    return originalReference
  }
  return { kind: 'relative_days', offsetDays: dayDifference }
}

function addLocalDays(date, days) {
  const result = new Date(date)
  result.setUTCDate(result.getUTCDate() + days)
  return result
}

function formatLocalDate(date) {
  return date.toISOString().slice(0, 10)
}

function formatAtOffset(timestamp, offsetText, offsetMinutes) {
  return `${new Date(timestamp + offsetMinutes * 60000).toISOString().slice(0, 19)}${offsetText}`
}
