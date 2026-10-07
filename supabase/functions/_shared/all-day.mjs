// The days an all-day event covers (Jake, Oct 7: "the UTC time zone reminder thing where you almost had me wish my
// sister a happy birthday a day before she was actually born"). An all-day event has dates, not times. They are kept
// three ways — midnight UTC (Google's: Heather's birthday is 2026-10-08T00:00Z), the house's own midnight (04:00 or
// 05:00 UTC), or noon UTC — and in each the date written in UTC is the day meant. Read in local time, midnight UTC
// is 8 PM the evening before, so the birthday showed on the 7th. The last day is the end's UTC date less half a day
// (an exclusive midnight, an inclusive 23:59:59 and an exclusive local midnight all land on the right day), and never
// before the first. Pure; the wall's day and the assistant both read days through it.

const HALF_DAY = 12 * 3600e3

/** { first, last } as YYYY-MM-DD, the dates the event is on. */
export function allDayDates(startIso, endIso) {
  const start = Date.parse(startIso)
  if (!Number.isFinite(start)) return null
  const first = new Date(start).toISOString().slice(0, 10)
  const end = Date.parse(endIso)
  const lastGuess = Number.isFinite(end) ? new Date(end - HALF_DAY - 1).toISOString().slice(0, 10) : first
  return { first, last: lastGuess < first ? first : lastGuess }
}

/** Whether an all-day event is on a day (YYYY-MM-DD, the house's own date). */
export function allDayCovers(startIso, endIso, ymd) {
  const d = allDayDates(startIso, endIso)
  return Boolean(d && d.first <= ymd && ymd <= d.last)
}

const WORDS = (ymd, weekday) => new Date(`${ymd}T12:00:00Z`).toLocaleDateString('en-US', { weekday, month: 'short', day: 'numeric', timeZone: 'UTC' }).replace(',', '')

/** The event's days in words — "Thu Oct 8", "Thu Oct 8 – Sat Oct 10" — for anything that says when an all-day event is. */
export function allDayWords(startIso, endIso, weekday = 'short') {
  const d = allDayDates(startIso, endIso)
  if (!d) return ''
  return d.first === d.last ? WORDS(d.first, weekday) : `${WORDS(d.first, weekday)} – ${WORDS(d.last, weekday)}`
}
