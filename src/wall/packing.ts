import { clockTime } from './header.ts'
import type { DayPlan } from './engine/types'

// "Pack tonight": the checklist items of the day's own events (outings and timed
// activities) — only event-bound prep, never a general to-do list.

export interface WallChecklistItem {
  id: string
  event_id: string
  label: string
  checked: boolean
  sort_order: number
}

export interface PackingGroup {
  eventId: string
  /** "Softball · 12:30" */
  heading: string
  items: WallChecklistItem[]
}

interface EventMoment {
  id: string
  title: string
  at: Date
}

function dayEvents(plan: DayPlan): EventMoment[] {
  const byId = new Map<string, EventMoment>()
  for (const trip of plan.trips) {
    if (trip.source === 'event') byId.set(trip.sourceId, { id: trip.sourceId, title: trip.title, at: trip.arriveAt })
  }
  const routineIds = new Set(plan.trips.filter((t) => t.source === 'routine').map((t) => t.sourceId))
  for (const segments of plan.lanes.values()) {
    for (const s of segments) {
      if (s.kind !== 'activity' || byId.has(s.sourceId) || routineIds.has(s.sourceId)) continue
      byId.set(s.sourceId, { id: s.sourceId, title: s.label, at: s.start })
    }
  }
  return [...byId.values()].sort((a, b) => a.at.getTime() - b.at.getTime() || a.title.localeCompare(b.title))
}

/** The events whose checklists belong on the wall for this day, in time order. */
export function packingEventIds(plan: DayPlan): string[] {
  return dayEvents(plan).map((e) => e.id)
}

export function packingGroups(plan: DayPlan, items: WallChecklistItem[]): { groups: PackingGroup[]; packed: number; total: number } {
  const groups: PackingGroup[] = []
  for (const event of dayEvents(plan)) {
    const own = items.filter((i) => i.event_id === event.id).sort((a, b) => a.sort_order - b.sort_order)
    if (own.length === 0) continue
    groups.push({ eventId: event.id, heading: `${event.title.split(':')[0].trim()} · ${clockTime(event.at)}`, items: own })
  }
  const all = groups.flatMap((g) => g.items)
  return { groups, packed: all.filter((i) => i.checked).length, total: all.length }
}

export interface FittedPackingGroup extends PackingGroup {
  /** How many of this event's items are already packed. */
  packed: number
  /** Whether the "N packed" line fits (things still to pack come first). */
  showPacked: boolean
}

/**
 * What fits in `lines` rows under the evening Score: each event's heading, the things
 * still to pack, and one "N packed" line for what's done. Whatever doesn't fit is
 * counted (only things still to pack), never dropped silently.
 */
export function fitPacking(groups: PackingGroup[], lines: number): { groups: FittedPackingGroup[]; hidden: number } {
  let left = lines
  let hidden = 0
  const fitted: FittedPackingGroup[] = []
  for (const group of groups) {
    const open = group.items.filter((i) => !i.checked)
    const packed = group.items.length - open.length
    if (left < 2) {
      hidden += open.length
      continue
    }
    // Things still to pack take the lines first; the "N packed" line only if one is left.
    const items = open.slice(0, left - 1)
    hidden += open.length - items.length
    const showPacked = packed > 0 && left - 1 - items.length > 0
    left -= 1 + items.length + (showPacked ? 1 : 0)
    fitted.push({ ...group, items, packed, showPacked })
  }
  return { groups: fitted, hidden }
}
