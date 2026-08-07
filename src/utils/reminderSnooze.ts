/**
 * Pure math for reminder "snooze" (the timed-reminder timeline row on the
 * Home page) — extracted from useReminderNeedsYouActions so it's testable
 * under node --test, and so it can share the same duration-choice options
 * (15m/1h/3h/tomorrow) as prep items and conflicts instead of a single
 * hardcoded "+1 hour". Reminders don't have a snoozed_until column; this
 * mechanism works by directly shifting the underlying event's start/end
 * time forward — a deliberately different data model from prep_items and
 * conflicts, since a reminder *is* a calendar event with a real time.
 */
import { computeSnoozeUntil, type SnoozeDuration } from './snoozeDuration.ts'

const MINUTE_MS = 60 * 1000

export function computeReminderSnoozeWindow(
  startTime: string,
  endTime: string,
  duration: SnoozeDuration,
  now: Date,
): { start: string; end: string } {
  const startMs = new Date(startTime).getTime()
  const endMs = new Date(endTime).getTime()
  const durationMs = Math.max(5 * MINUTE_MS, endMs - startMs)

  // Anchor off whichever is later -- "now" or the reminder's original start --
  // so a reminder that's already hours/days overdue snoozes forward from the
  // present instead of computing a new time that's still in the past.
  const referenceMs = Math.max(now.getTime(), startMs)
  const newStart = computeSnoozeUntil(duration, new Date(referenceMs))
  const newEnd = new Date(newStart.getTime() + durationMs)

  return { start: newStart.toISOString(), end: newEnd.toISOString() }
}
