const DAY_MS = 24 * 60 * 60 * 1000

export function eventRangeForCalendar(event, utcOffset) {
  if (!event?.all_day) {
    const start = Date.parse(event?.start_time)
    const end = Date.parse(event?.end_time)
    return Number.isFinite(start) && Number.isFinite(end) ? { start, end } : null
  }

  const offset = offsetMinutes(utcOffset)
  const start = nominalLocalDayStart(event?.start_time, offset)
  const endDay = nominalLocalDayStart(event?.end_time, offset)
  if (!Number.isFinite(start) || !Number.isFinite(endDay)) return null
  const end = looksLikeMidnightTimestamp(event.end_time) ? endDay : endDay + DAY_MS
  return { start, end: Math.max(start + 1, end) }
}

export function eventOverlapsCalendarRange(event, range, utcOffset) {
  const eventRange = eventRangeForCalendar(event, utcOffset)
  return Boolean(
    eventRange &&
    Number.isFinite(range?.start) &&
    Number.isFinite(range?.end) &&
    eventRange.start < range.end &&
    eventRange.end > range.start
  )
}

export function compareCalendarEvents(a, b, utcOffset) {
  if (a?.all_day !== b?.all_day) return a?.all_day ? -1 : 1
  const aStart = eventRangeForCalendar(a, utcOffset)?.start ?? Number.POSITIVE_INFINITY
  const bStart = eventRangeForCalendar(b, utcOffset)?.start ?? Number.POSITIVE_INFINITY
  return aStart - bStart
}

function nominalLocalDayStart(value, offset) {
  const match = String(value ?? '').match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!match) return Number.NaN
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) - offset * 60000
}

function looksLikeMidnightTimestamp(value) {
  const match = String(value ?? '').match(/T(\d{2}):(\d{2})(?::(\d{2}))?/)
  if (!match) return true
  return match[1] === '00' && match[2] === '00' && (match[3] ?? '00') === '00'
}

function offsetMinutes(value) {
  const match = String(value ?? '').match(/^([+-])(\d{2}):(\d{2})$/)
  if (!match) return 0
  return (match[1] === '+' ? 1 : -1) * (Number(match[2]) * 60 + Number(match[3]))
}
