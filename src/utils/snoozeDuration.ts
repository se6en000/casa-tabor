/**
 * Snooze duration picker logic, shared across prep items, conflicts, and
 * missed reminders. Snooze previously had exactly one hardcoded behavior per
 * surface (prep items and conflicts always jumped to "tomorrow 6am", missed
 * reminders always +1 hour) with no way to pick how long — this gives every
 * snooze surface the same set of choices and the same underlying math.
 */

export type SnoozeDuration = '15m' | '1h' | '3h' | 'tomorrow'

export const SNOOZE_DURATIONS: SnoozeDuration[] = ['15m', '1h', '3h', 'tomorrow']

const MINUTE_MS = 60 * 1000
const HOUR_MS = 60 * MINUTE_MS

/** Computes the `snoozed_until` timestamp for a given duration, relative to `now`. */
export function computeSnoozeUntil(duration: SnoozeDuration, now: Date): Date {
  switch (duration) {
    case '15m':
      return new Date(now.getTime() + 15 * MINUTE_MS)
    case '1h':
      return new Date(now.getTime() + HOUR_MS)
    case '3h':
      return new Date(now.getTime() + 3 * HOUR_MS)
    case 'tomorrow': {
      const next = new Date(now)
      next.setDate(next.getDate() + 1)
      next.setHours(6, 0, 0, 0)
      return next
    }
  }
}

const LABELS: Record<SnoozeDuration, string> = {
  '15m': '15 minutes',
  '1h': '1 hour',
  '3h': '3 hours',
  tomorrow: 'Tomorrow morning',
}

export function snoozeDurationLabel(duration: SnoozeDuration): string {
  return LABELS[duration]
}

/**
 * Renders "Snoozed 3× · 2h ago" style history on a card once it resurfaces,
 * so repeat-snoozing an item is visible on sight instead of invisible. Prior
 * behavior: snoozing was a black box — the card vanished and later
 * reappeared with zero trace that it had ever been snoozed, let alone how
 * many times.
 */
export function formatSnoozeHistoryLabel(
  snoozeCount: number | null | undefined,
  lastSnoozedAt: string | null | undefined,
  now: Date,
): string | null {
  if (!snoozeCount || snoozeCount < 1 || !lastSnoozedAt) return null

  const elapsedMs = Math.max(0, now.getTime() - new Date(lastSnoozedAt).getTime())
  let ago: string
  if (elapsedMs < HOUR_MS) ago = `${Math.max(1, Math.floor(elapsedMs / MINUTE_MS))}m ago`
  else if (elapsedMs < 24 * HOUR_MS) ago = `${Math.floor(elapsedMs / HOUR_MS)}h ago`
  else ago = `${Math.floor(elapsedMs / (24 * HOUR_MS))}d ago`

  const countLabel = snoozeCount === 1 ? 'Snoozed once' : `Snoozed ${snoozeCount}×`
  return `${countLabel} · ${ago}`
}
