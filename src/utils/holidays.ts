import type { EventWithDetails } from '../hooks/useCalendarEvents'

export const HOLIDAY_COLOR = 'var(--color-casa-error)'
export const REMINDER_COLOR = 'var(--color-casa-warning)'

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

export function isAllDayReminder(event: Pick<EventWithDetails, 'event_type' | 'start_time' | 'all_day'>): boolean {
  if (!isReminder(event)) return false
  if (event.all_day) return true
  if (!event.start_time) return true
  if (!event.start_time.includes('T')) return true
  const timeMatch = /T(\d{2}):(\d{2})/.exec(event.start_time)
  if (timeMatch && timeMatch[1] === '00' && timeMatch[2] === '00') return true
  const d = new Date(event.start_time)
  return !Number.isNaN(d.getTime()) && d.getHours() === 0 && d.getMinutes() === 0
}

export function isTimedReminder(event: Pick<EventWithDetails, 'event_type' | 'start_time' | 'all_day'>): boolean {
  return isReminder(event) && !isAllDayReminder(event)
}

export function holidayEmoji(title: string): string {
  return EMOJI_MAP[title.toLowerCase()] ?? '🏛️'
}

export function holidayLabel(title: string): string {
  return `${holidayEmoji(title)} ${title}`
}
