import type { EventWithDetails } from '../hooks/useCalendarEvents'

export const HOLIDAY_COLOR = '#B91C1C'  // festive red
export const REMINDER_COLOR = '#D97706' // amber

const EMOJI_MAP: Record<string, string> = {
  "new year's day":            '🎆',
  "martin luther king jr. day": '✊',
  "presidents' day":           '🏛️',
  "memorial day":              '🪖',
  "juneteenth":                '✊',
  "independence day":          '🎇',
  "labor day":                 '🛠️',
  "columbus day":              '⛵',
  "veterans day":              '🎖️',
  "thanksgiving day":          '🦃',
  "christmas day":             '🎄',
}

export function isHoliday(event: Pick<EventWithDetails, 'google_calendar_id'>): boolean {
  return event.google_calendar_id === 'us_holidays'
}

export function isReminder(event: Pick<EventWithDetails, 'event_type'>): boolean {
  return event.event_type === 'reminder'
}

export function isAllDayReminder(event: Pick<EventWithDetails, 'event_type' | 'start_time'>): boolean {
  if (!isReminder(event)) return false
  // Use local time — midnight UTC looks like T00:00:00 in the string but is 8 PM EDT,
  // so we must parse and check the browser-local hour, not the raw string.
  const d = new Date(event.start_time)
  return d.getHours() === 0 && d.getMinutes() === 0
}

export function isTimedReminder(event: Pick<EventWithDetails, 'event_type' | 'start_time'>): boolean {
  return isReminder(event) && !isAllDayReminder(event)
}

export function holidayEmoji(title: string): string {
  return EMOJI_MAP[title.toLowerCase()] ?? '🏛️'
}

export function holidayLabel(title: string): string {
  return `${holidayEmoji(title)} ${title}`
}
