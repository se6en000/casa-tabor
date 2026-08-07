/**
 * Live lateness display for missed-reminder prep items.
 *
 * Bug this fixes: `useReminderNeedsYouActions.ts` used to compute "Nm late"
 * once, at insertion time, and bake it directly into the stored
 * `prep_items.description` string. That number never updated again — after a
 * snooze, or simply the passage of real time, the card kept showing the
 * original "(10m late)" forever, long after the item was actually hours or
 * days late. This module recomputes lateness live, from the item's stable
 * `event_date`, every time it's displayed.
 */

const MINUTE_MS = 60 * 1000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS

/** Formats how late a missed reminder is right now, e.g. "10m late", "3h late", "2d late". */
export function formatMissedReminderLateness(eventStart: Date | string, now: Date): string {
  const startMs = typeof eventStart === 'string' ? new Date(eventStart).getTime() : eventStart.getTime()
  const lateMs = Math.max(0, now.getTime() - startMs)

  // Floor (not round) so a 3.9h-late item reads "3h late", not a
  // rounded-up "4h late" that overstates how late it actually is.
  if (lateMs < HOUR_MS) return `${Math.floor(lateMs / MINUTE_MS)}m late`
  if (lateMs < DAY_MS) return `${Math.floor(lateMs / HOUR_MS)}h late`
  return `${Math.floor(lateMs / DAY_MS)}d late`
}

// Matches both the old frozen-at-creation form ("Missed reminder (10m late): ")
// and the new stable form ("Missed reminder: ") so either can be re-derived live.
const MISSED_REMINDER_PREFIX = /^Missed reminder(?:\s*\([^)]*\))?:\s*/i

/**
 * Returns the text a prep item should display right now. For a missed
 * reminder with a known event_date, this recomputes "Missed reminder (Nx
 * late): {title}" live instead of trusting whatever lateness was frozen into
 * the stored description at creation time. Every other prep item is returned
 * unchanged.
 */
export function getPrepItemDisplayDescription(
  description: string,
  sourceType: string | null | undefined,
  eventDate: string | null | undefined,
  now: Date,
): string {
  if (sourceType !== 'reminder_missed' || !eventDate) return description

  const title = description.replace(MISSED_REMINDER_PREFIX, '')
  const lateness = formatMissedReminderLateness(eventDate, now)
  return `Missed reminder (${lateness}): ${title}`
}

/**
 * Stored description for a reminder-derived prep item. Deliberately stable
 * for missed reminders — no "(Nm late)" frozen at creation time, since that
 * number never got recomputed after insertion (see getPrepItemDisplayDescription,
 * which derives the live version at display time from event_date instead).
 */
export function buildReminderPrepDescription(title: string, sourceType: 'reminder_manual' | 'reminder_missed'): string {
  if (sourceType === 'reminder_manual') {
    return `Moved from calendar reminder: ${title}`
  }
  return `Missed reminder: ${title}`
}
