import { addDays, differenceInCalendarDays, format, isSameDay, startOfDay } from 'date-fns'
import { toZonedTime, fromZonedTime } from 'date-fns-tz'
import type { EventWithDetails } from '../hooks/useCalendarEvents'

export const HOUSEHOLD_TIMEZONE = 'America/New_York'

type EventTimeLike = Pick<EventWithDetails, 'start_time' | 'end_time'> & { all_day?: boolean }

function asDate(value: string): Date {
  if (!value) return new Date()
  return toZonedTime(value, HOUSEHOLD_TIMEZONE)
}

export function serializeToZonedIso(date: Date): string {
  return fromZonedTime(date, HOUSEHOLD_TIMEZONE).toISOString()
}

export function parseDatePortionAsLocal(value: string): Date {
  if (!value) return new Date()
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value)
  if (!m) return toZonedTime(value, HOUSEHOLD_TIMEZONE)
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 0, 0, 0, 0)
}

function looksLikeMidnightOrExclusiveTimestamp(value: string): boolean {
  if (!value) return false
  if (value.includes('23:59')) return false
  const timeMatch = /T(\d{2}):(\d{2})(?::(\d{2}))?/.exec(value)
  if (!timeMatch) return false
  const hh = timeMatch[1]
  const mm = timeMatch[2]
  return (hh === '00' && mm === '00') || (hh === '12' && mm === '00') || (hh === '04' && mm === '00') || (hh === '05' && mm === '00')
}

export function getEventStartDate(event: EventTimeLike): Date {
  if (!event.all_day) return asDate(event.start_time)
  return parseDatePortionAsLocal(event.start_time)
}

export function getEventEndDate(event: EventTimeLike): Date {
  if (!event.all_day) {
    if (!event.end_time) return asDate(event.start_time)
    return asDate(event.end_time)
  }

  const startLocal = getEventStartDate(event)
  if (!event.end_time) {
    return new Date(startLocal.getFullYear(), startLocal.getMonth(), startLocal.getDate(), 23, 59, 59, 999)
  }

  const endDayParsed = parseDatePortionAsLocal(event.end_time)
  if (Number.isNaN(endDayParsed.getTime())) {
    return new Date(startLocal.getFullYear(), startLocal.getMonth(), startLocal.getDate(), 23, 59, 59, 999)
  }

  const diffCalendarDays = differenceInCalendarDays(endDayParsed, startLocal)
  if (diffCalendarDays <= 0) {
    return new Date(startLocal.getFullYear(), startLocal.getMonth(), startLocal.getDate(), 23, 59, 59, 999)
  }

  const isExclusiveBoundary = looksLikeMidnightOrExclusiveTimestamp(event.end_time)
  if (isExclusiveBoundary) {
    const inclusiveEndDay = addDays(endDayParsed, -1)
    const safeEndDay = inclusiveEndDay < startLocal ? startLocal : inclusiveEndDay
    return new Date(safeEndDay.getFullYear(), safeEndDay.getMonth(), safeEndDay.getDate(), 23, 59, 59, 999)
  }

  return new Date(endDayParsed.getFullYear(), endDayParsed.getMonth(), endDayParsed.getDate(), 23, 59, 59, 999)
}


export function eventOverlapsRange(event: EventTimeLike, rangeStart: Date, rangeEndExclusive: Date): boolean {
  const start = getEventStartDate(event)
  const end = getEventEndDate(event)
  return start < rangeEndExclusive && end >= rangeStart
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
  return getEventEndDate(event)
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

// Compact "Due:" stamp embedded in AI draft prompts, e.g. "2026-08-05 11:32 AM ET".
// Deliberately terse (vs. a spelled-out "Wednesday, August 5, 2026 at..." string)
// so it reads cleanly in the chat bubble AND so the server can deterministically
// regex-parse the exact year/month/day/time instead of asking the LLM to do its
// own date arithmetic (which was misresolving weekday names to the wrong week).
// This relies on the same local-timezone Date parsing already used for on-screen
// display (assumes the app runs in America/New_York, as it does today).
export function formatDueByForAiPrompt(value: string | null | undefined): string {
  if (!value) return 'unknown'
  return `${format(new Date(value), 'yyyy-MM-dd h:mm a')} ET`
}

// Builds the prompt sent to the AI drawer when drafting an event/reminder from
// a prep/action item. Kept short and structured (Title/Due/optional context)
// rather than a long natural-language paragraph, per user request to drop
// unnecessary words while keeping everything the assistant needs.
export function buildAiDraftPrompt(params: {
  kind: 'event' | 'reminder'
  title: string
  dueBy: string | null | undefined
  details?: string | null
  source?: string | null
  bodyContext?: string | null
}): string {
  const { kind, title, dueBy, details, source, bodyContext } = params
  const lead = kind === 'reminder'
    ? 'Create a reminder draft for me to confirm.'
    : 'Create a calendar event draft for me to confirm.'
  const lines = [lead, '', `Title: ${title}`]
  const trimmedDetails = details?.trim()
  if (trimmedDetails && trimmedDetails !== title.trim()) {
    lines.push(`Details: ${trimmedDetails}`)
  }
  lines.push(`Due: ${formatDueByForAiPrompt(dueBy)}`)
  if (source) lines.push(`Source: ${source}`)
  if (bodyContext) lines.push(`Context:\n${bodyContext}`)
  return lines.join('\n')
}

/**
 * Format minutes into a compact human-friendly string (e.g. 109m -> "1h 49m", 60m -> "1h", 25m -> "25m").
 */
export function formatDurationHuman(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined) return ''
  const clamped = Math.max(0, Math.round(minutes))
  const hours = Math.floor(clamped / 60)
  const mins = clamped % 60
  if (hours === 0) return `${mins}m`
  if (mins === 0) return `${hours}h`
  return `${hours}h ${mins}m`
}

/**
 * Format minutes into an uppercase tracked string (e.g. 109m -> "1H 49M", 45m -> "45 MIN", 60m -> "1 HR").
 */
export function formatDurationLong(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined) return ''
  const clamped = Math.max(0, Math.round(minutes))
  const hours = Math.floor(clamped / 60)
  const mins = clamped % 60
  if (hours === 0) return `${mins} MIN`
  if (mins === 0) return `${hours} HR`
  return `${hours}H ${mins}M`
}

