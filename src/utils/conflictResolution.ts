// Pure logic for Phase 2 conflict inline actions (Needs You feed). No React/DOM
// dependency so it's directly unit-testable without a component harness.
import type { Conflict } from '../types'

/** Given a conflict and the event id the user chose to keep, returns the id of the
 * *other* event — the one that lost the conflict and needs to be reschedule/canceled.
 * Returns null if the kept id doesn't match either side, or if there's no second
 * event to reschedule (event_b_id is null). */
export function pickConflictLoserEventId(
  conflict: Pick<Conflict, 'event_a_id' | 'event_b_id'>,
  keptEventId: string,
): string | null {
  if (!conflict.event_b_id) return null
  if (keptEventId === conflict.event_a_id) return conflict.event_b_id
  if (keptEventId === conflict.event_b_id) return conflict.event_a_id
  return null
}

/** Conflict-sourced Needs You items already show an AlertTriangle as their source
 * badge icon ("Scheduling conflict") — the generic priority chip must not render
 * its own AlertTriangle on top of that, or the card shows the same warning icon
 * twice (the bug seen in production after Phase 1 shipped). */
export function shouldSuppressPriorityChipIcon(item: { source_type?: string | null }): boolean {
  return item.source_type === 'conflict'
}
