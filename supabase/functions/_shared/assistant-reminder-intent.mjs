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

export function explicitReminderSearchOverride(text) {
  const value = String(text ?? '').toLowerCase()
  if (
    !/\breminders?\b/.test(value) ||
    !/\b(?:find|look|search|show|what|where|which)\b/.test(value) ||
    isExplicitReminder(value) ||
    isExplicitReminderCompletion(value)
  ) return null

  const ignored = new Set([
    'a', 'an', 'calendar', 'can', 'could', 'do', 'event', 'events', 'find',
    'for', 'i', 'is', 'look', 'me', 'my', 'on', 'please', 'reminder',
    'reminders', 'search', 'show', 'the', 'what', 'where', 'which', 'you',
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

function isExplicitReminder(text) {
  return /\bremind\s+me\b|\bset\s+(?:me\s+)?(?:a\s+)?reminder\b|\bcreate\s+(?:a\s+)?reminder\b/i.test(String(text ?? ''))
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
