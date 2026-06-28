import { addDays, differenceInCalendarDays, isSameDay, startOfDay } from 'date-fns'
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
