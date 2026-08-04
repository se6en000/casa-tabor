import { addDays, differenceInCalendarDays, format, isSameDay, startOfDay } from 'date-fns'
import type { EventWithDetails } from '../hooks/useCalendarEvents'

type EventTimeLike = Pick<EventWithDetails, 'start_time' | 'end_time'> & { all_day?: boolean }

const DAY_MS = 24 * 60 * 60 * 1000

function asDate(value: string): Date {
  return new Date(value)
}

function parseDatePortionAsLocal(value: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value)
  if (!m) return new Date(value)
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 0, 0, 0, 0)
}

function looksLikeMidnightTimestamp(value: string): boolean {
  const timeMatch = /T(\d{2}):(\d{2})(?::(\d{2}))?/.exec(value)
  if (!timeMatch) return true
  const hh = timeMatch[1]
  const mm = timeMatch[2]
  const ss = timeMatch[3] ?? '00'
  return hh === '00' && mm === '00' && ss === '00'
}

export function getEventStartDate(event: EventTimeLike): Date {
  return event.all_day ? parseDatePortionAsLocal(event.start_time) : asDate(event.start_time)
}

export function getEventEndDate(event: EventTimeLike): Date {
  if (!event.all_day) return asDate(event.end_time)
  const endDayStart = parseDatePortionAsLocal(event.end_time)
  if (looksLikeMidnightTimestamp(event.end_time)) {
    return new Date(endDayStart.getTime() - 1)
  }
  return new Date(endDayStart.getTime() + DAY_MS - 1)
}

export function eventOverlapsRange(event: EventTimeLike, rangeStart: Date, rangeEndExclusive: Date): boolean {
  const start = getEventStartDate(event)
  const end = getEventEndDate(event)
  return start < rangeEndExclusive && end > rangeStart
}

export function eventOverlapsDay(event: EventTimeLike, day: Date): boolean {
  const dayStart = startOfDay(day)
  const dayEndExclusive = addDays(dayStart, 1)
  return eventOverlapsRange(event, dayStart, dayEndExclusive)
}

export function isEventMultiDay(event: EventTimeLike): boolean {
  return !isSameDay(getEventStartDate(event), getEventEndDate(event))
}

export function getEventDisplayStartDay(event: EventTimeLike): Date {
  return startOfDay(getEventStartDate(event))
}

export function getEventDisplayEnd(event: EventTimeLike): Date {
  if (event.all_day) return getEventEndDate(event)
  const end = getEventEndDate(event)
  return new Date(end.getTime() - 1)
}

export function getEventSpanDayCount(event: EventTimeLike): number {
  const start = startOfDay(getEventStartDate(event))
  const displayEndDay = startOfDay(getEventDisplayEnd(event))
  return Math.max(1, differenceInCalendarDays(displayEndDay, start) + 1)
}

export function withColorAlpha(color: string, alphaHex: string): string {
  if (/^#[0-9a-f]{6}$/i.test(color)) return `${color}${alphaHex}`
  if (/^#[0-9a-f]{3}$/i.test(color)) {
    const r = color[1]
    const g = color[2]
    const b = color[3]
    return `#${r}${r}${g}${g}${b}${b}${alphaHex}`
  }
  return color
}

export function getMultiDayBoundaryLabel(
  event: Pick<EventWithDetails, 'start_time' | 'end_time' | 'all_day'>,
  day: Date,
): string | null {
  if (!isEventMultiDay(event)) return null

  const start = getEventStartDate(event)
  const end = getEventEndDate(event)
  const displayEnd = getEventDisplayEnd(event)
  const onStartDay = isSameDay(day, start)
  const onEndDay = isSameDay(day, displayEnd)

  if (event.all_day) {
    if (onStartDay) return 'Starts · All day'
    if (onEndDay) return 'Ends · All day'
    return 'Continues · All day'
  }

  if (onStartDay) return `Starts ${format(start, 'h:mm a')}`
  if (onEndDay) return `Ends ${format(end, 'h:mm a')}`
  return 'Continues'
}

// Formats an ISO/UTC timestamp for embedding in AI chat prompt text, spelling
// out the date/time in Eastern Time explicitly (e.g. "Thursday, August 6,
// 2026 at 12:00 PM Eastern Time"). A raw ISO string like
// "2026-08-06T16:00:00.000Z" reads to the AI as a literal "16:00" — it has no
// way to know that's UTC and needs converting, so it gets used as-is and the
// resulting draft event/reminder lands ~4-5 hours off. This relies on the
// same local-timezone Date parsing already used for on-screen display
// (assumes the app runs in America/New_York, as it does today).
export function formatDueByForAiPrompt(value: string | null | undefined): string {
  if (!value) return 'unknown'
  return `${format(new Date(value), "EEEE, MMMM d, yyyy 'at' h:mm a")} Eastern Time`
}
