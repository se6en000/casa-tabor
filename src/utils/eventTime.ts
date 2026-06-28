import { addDays, differenceInCalendarDays, format, isSameDay, startOfDay } from 'date-fns'
import type { EventWithDetails } from '../hooks/useCalendarEvents'

function asDate(value: string): Date {
  return new Date(value)
}

export function eventOverlapsRange(event: Pick<EventWithDetails, 'start_time' | 'end_time'>, rangeStart: Date, rangeEndExclusive: Date): boolean {
  const start = asDate(event.start_time)
  const end = asDate(event.end_time)
  return start < rangeEndExclusive && end > rangeStart
}

export function eventOverlapsDay(event: Pick<EventWithDetails, 'start_time' | 'end_time'>, day: Date): boolean {
  const dayStart = startOfDay(day)
  const dayEndExclusive = addDays(dayStart, 1)
  return eventOverlapsRange(event, dayStart, dayEndExclusive)
}

export function isEventMultiDay(event: Pick<EventWithDetails, 'start_time' | 'end_time'>): boolean {
  return !isSameDay(asDate(event.start_time), asDate(event.end_time))
}

export function getEventDisplayEnd(event: Pick<EventWithDetails, 'end_time'>): Date {
  const end = asDate(event.end_time)
  return new Date(end.getTime() - 1)
}

export function getEventSpanDayCount(event: Pick<EventWithDetails, 'start_time' | 'end_time'>): number {
  const start = startOfDay(asDate(event.start_time))
  const displayEndDay = startOfDay(getEventDisplayEnd(event))
  return Math.max(1, differenceInCalendarDays(displayEndDay, start) + 1)
}

export function getMultiDayBoundaryLabel(
  event: Pick<EventWithDetails, 'start_time' | 'end_time' | 'all_day'>,
  day: Date,
): string | null {
  if (!isEventMultiDay(event)) return null

  const start = asDate(event.start_time)
  const end = asDate(event.end_time)
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
