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
  if (!turn || typeof turn !== 'object' || !isExplicitReminder(text)) return turn
  if (!['create', 'revise'].includes(turn.action)) return turn

  const patch = turn.patch && typeof turn.patch === 'object' ? { ...turn.patch } : {}
  patch.event_type = 'reminder'

  const relativeMinutes = parseRelativeMinutes(text)
  if (relativeMinutes) patch.relative_minutes = relativeMinutes
  if (patch.date_reference && !patch.time && !relativeMinutes) patch.all_day = true

  return { ...turn, patch }
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
