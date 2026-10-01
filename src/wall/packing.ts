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
  /** On today's face: the event is already under way (its list stays, but it's the first to give up its place). */
  started?: boolean
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

/** `from`: on today's face, now; the events that have started are marked so (their lists stay, to see what wasn't ticked). */
export function packingGroups(plan: DayPlan, items: WallChecklistItem[], options: { from?: Date } = {}): { groups: PackingGroup[]; packed: number; total: number } {
  const groups: PackingGroup[] = []
  for (const event of dayEvents(plan)) {
    const own = items.filter((i) => i.event_id === event.id).sort((a, b) => a.sort_order - b.sort_order)
    if (own.length === 0) continue
    groups.push({ eventId: event.id, heading: `${event.title.split(':')[0].trim()} · ${clockTime(event.at)}`, items: own, ...(options.from && event.at.getTime() < options.from.getTime() ? { started: true } : {}) })
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

/**
 * The same, in `columns` columns of `lines` rows (the day-ahead layout). An event moves
 * whole to the next column rather than splitting; one too long for any column starts a
 * column and is cut there. Whatever doesn't fit is counted.
 */
export function fitPackingColumns(groups: PackingGroup[], lines: number, columns: number): { columns: FittedPackingGroup[][]; hidden: number } {
  const need = (g: PackingGroup) => {
    const open = g.items.filter((i) => !i.checked).length
    return 1 + open + (open < g.items.length ? 1 : 0)
  }
  let hidden = 0
  // More events than columns: the ones already under way step aside first (counted), the latest-started last.
  let shown = groups
  for (let extra = groups.length - columns; extra > 0; extra--) {
    const i = shown.findIndex((g) => g.started)
    if (i < 0) break
    hidden += shown[i].items.filter((item) => !item.checked).length
    shown = shown.filter((_, j) => j !== i)
  }
  const cols: FittedPackingGroup[][] = [[]]
  let left = lines
  for (const [k, group] of shown.entries()) {
    // Each event its own column while there are columns enough for the rest; stacked only when there aren't.
    const roomForEach = shown.length - k <= columns - cols.length
    if ((need(group) > left || roomForEach) && cols[cols.length - 1].length > 0 && cols.length < columns) {
      cols.push([])
      left = lines
    }
    const fit = fitPacking([group], left)
    hidden += fit.hidden
    if (fit.groups.length === 0) continue
    const [g] = fit.groups
    cols[cols.length - 1].push(g)
    left -= 1 + g.items.length + (g.showPacked ? 1 : 0)
  }
  return { columns: cols, hidden }
}
