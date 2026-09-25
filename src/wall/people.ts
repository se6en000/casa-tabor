import { clockTime } from './header.ts'
import type { DayPlan, Trip, WallMember } from './engine/types'

// "Who drives" (board 03g): the people who can drive, each marked free or busy
// for the whole trip, from the wall's own plan of the day.

export interface DriverChoice {
  memberId: string
  name: string
  /** "free", or "busy until 10:00 · Kelly's Birthday" */
  note: string
}

const MINUTE = 60_000

/** The time a trip keeps its driver busy: leaving home to getting back. */
export function tripWindow(trip: Trip): { from: number; to: number } {
  return {
    from: (trip.leaveAt ?? trip.arriveAt).getTime(),
    to: (trip.homeAt ?? new Date(trip.arriveAt.getTime() + 60 * MINUTE)).getTime(),
  }
}

/** The first thing in someone's lane overlapping the window, ignoring the given calendar items. */
export function firstClash(plan: DayPlan, memberId: string, window: { from: number; to: number }, ignoreSourceIds: string[]) {
  return (plan.lanes.get(memberId) ?? [])
    .filter((s) => !ignoreSourceIds.includes(s.sourceId) && s.start.getTime() < window.to && s.end.getTime() > window.from)
    .sort((a, b) => a.start.getTime() - b.start.getTime())[0] ?? null
}

export function driverChoices(plan: DayPlan, members: WallMember[], trip: Trip, eventId: string, ignoreSourceIds: string[] = [eventId]): DriverChoice[] {
  const window = tripWindow(trip)
  return [...members]
    .filter((m) => m.can_drive)
    .sort((a, b) => (a.sort_order ?? 999) - (b.sort_order ?? 999) || a.name.localeCompare(b.name))
    .map((m) => {
      const clash = firstClash(plan, m.id, window, ignoreSourceIds)
      return { memberId: m.id, name: m.name, note: clash ? `busy until ${clockTime(clash.end)} · ${clash.label}` : 'free' }
    })
}
