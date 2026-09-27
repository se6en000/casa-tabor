// Which Google items the calendar sync brings into Casa (sync-calendars).
// A full rescan keeps a short window around today. The change feed (sync token) has no window at
// all, and lists every copy of a repeating event — a yearly birthday arrived as 73 events through
// 2099 (2026-09-27). Copies further out than INSTANCE_HORIZON_DAYS are left to the series, which
// Casa materializes from the rule.

export const INITIAL_SYNC_PAST_DAYS = 7
export const INITIAL_SYNC_FUTURE_DAYS = 90
export const INSTANCE_HORIZON_DAYS = 400

const DAY_MS = 86400000

function bounds(ev) {
  const start = ev.start?.dateTime ?? ev.start?.date
  const end = ev.end?.dateTime ?? ev.end?.date
  if (!start || !end) return null
  return { start: new Date(start).getTime(), end: new Date(end).getTime() }
}

/** Whether a (not cancelled) Google item should be upserted into Casa. */
export function shouldImportGoogleItem(ev, now, isFullReconciliation) {
  const b = bounds(ev)
  if (!b) return false
  if (isFullReconciliation) {
    return b.end >= now - INITIAL_SYNC_PAST_DAYS * DAY_MS && b.start <= now + INITIAL_SYNC_FUTURE_DAYS * DAY_MS
  }
  if (typeof ev.recurringEventId === 'string' && b.start > now + INSTANCE_HORIZON_DAYS * DAY_MS) return false
  return true
}
