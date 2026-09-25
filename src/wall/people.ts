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

export function driverChoices(plan: DayPlan, members: WallMember[], trip: Trip, eventId: string): DriverChoice[] {
  const from = (trip.leaveAt ?? trip.arriveAt).getTime()
  const to = (trip.homeAt ?? new Date(trip.arriveAt.getTime() + 60 * MINUTE)).getTime()
  return [...members]
    .filter((m) => m.can_drive)
    .sort((a, b) => (a.sort_order ?? 999) - (b.sort_order ?? 999) || a.name.localeCompare(b.name))
    .map((m) => {
      const clash = (plan.lanes.get(m.id) ?? [])
        .filter((s) => s.sourceId !== eventId && s.start.getTime() < to && s.end.getTime() > from)
        .sort((a, b) => a.start.getTime() - b.start.getTime())[0]
      return { memberId: m.id, name: m.name, note: clash ? `busy until ${clockTime(clash.end)} · ${clash.label}` : 'free' }
    })
}
