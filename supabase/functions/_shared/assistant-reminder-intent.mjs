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
const REMINDER_CLARIFICATION_PROMPTS = new Set([
  'Sure — what should I remind you about, and when?',
  'What should I remind you about?',
  'When should I remind you?',
])

export function isExplicitReminderRequest(text) {
  const value = String(text ?? '').replace(/\s+/g, ' ').trim()
  if (!value) return false
  return (
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
    .map((match) => match[1].trim())
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

export function hardenExplicitReminderTurn(turn, text) {
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
  if (patch.date_reference && !patch.time && !relativeMinutes) patch.all_day = true

  return { ...turn, patch }
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
    /\b(?:today|tomorrow|tonight|morning|afternoon|evening|night|noon|midnight)\b/i.test(text) ||
    /\b(?:sun(?:day)?|mon(?:day)?|tue(?:sday)?|wed(?:nesday)?|thu(?:rsday)?|fri(?:day)?|sat(?:urday)?)\b/i.test(text) ||
    /\b(?:this|next)\s+(?:week|month|weekend|sun(?:day)?|mon(?:day)?|tue(?:sday)?|wed(?:nesday)?|thu(?:rsday)?|fri(?:day)?|sat(?:urday)?)\b/i.test(text) ||
    /\b(?:at|around|by|before|after)\s+\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)?\b/i.test(text) ||
    /\bin\s+(?:\d+|[a-z]+(?:[\s-]+[a-z]+)?)\s+(?:minutes?|hours?|days?|weeks?)\b/i.test(text) ||
    /\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b/.test(text) ||
    /\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2}\b/i.test(text)
  )
}

function reminderHasSubject(text) {
  return explicitReminderSubject(text) !== null
}

function capitalizeReminderSubject(value) {
  return value.charAt(0).toUpperCase() + value.slice(1)
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
