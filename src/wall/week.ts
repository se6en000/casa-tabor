import { formatWallClock } from './clock.ts'
import { shownSegments, shownTrips } from './score.ts'
import type { DayPlan, WallMember } from './engine/types.ts'
import { packingGroups, type WallChecklistItem } from './packing.ts'

// The week strip (P3.9): one cell per day, today first. Each cell answers "is
// that day busy, for whom, and how early" at a glance; tapping it shows the day.

export interface WeekDay {
  date: Date
  key: string
  /** "Today", "Tomorrow", then "Sun", "Mon"… */
  weekday: string
  dayNumber: number
  isToday: boolean
  /** Who has something that day, in lane order. */
  memberIds: string[]
  /** Who is away on a trip that day: their dot is a tiny plane in their colour (Jake's note on canvas 19a). */
  awayIds: string[]
  /** Of those, who is away by car (a tiny car instead of the plane). */
  drivingIds: string[]
  /** "First out 7:50", or "Nothing planned". */
  firstOut: string
  decisionCount: number
  /** Prep for that day's events not yet checked off ("3 to do"). */
  toDo: number
  /** Today's tile in the evening (canvas 27c): what's left tonight, said in place of the morning's first out. */
  leftTonight?: number
}

const dayKey = (date: Date) => date.toDateString()

/** When a calendar item is over on this day (the end of its last block on the Score). */
function lastEnd(plan: DayPlan, sourceId: string): number {
  let end = 0
  for (const segments of plan.lanes.values()) for (const s of segments) if (s.sourceId === sourceId) end = Math.max(end, s.end.getTime())
  return end
}

/**
 * `hideRoutines`: the tiles follow "Hide routines" (Jake, 2026-10-01: "with routines hidden I expect there to be fewer
 * dots in the tiles") — a dot only for someone with something besides school, work and the regular runs, and the
 * first trip that's left.
 */
export function weekDays(week: DayPlan[], members: WallMember[], decisions: Array<{ date: Date }>, now: Date, checklist: WallChecklistItem[] = [], options: { hideRoutines?: boolean } = {}): WeekDay[] {
  const hide = options.hideRoutines === true
  return week.map((plan) => {
    const firstLeave = shownTrips(plan.trips, hide)
      .map((trip) => trip.leaveAt)
      .filter((leave): leave is Date => Boolean(leave))
      .sort((a, b) => a.getTime() - b.getTime())[0]
    const memberIds = members
      .filter((m) => plan.activeMemberIds.has(m.id) && (!hide || shownSegments(plan.lanes.get(m.id) ?? [], plan.trips, true).length > 0))
      .map((m) => m.id)
    const isToday = dayKey(plan.date) === dayKey(now)
    const next = new Date(now)
    next.setDate(now.getDate() + 1)
    const isTomorrow = dayKey(plan.date) === dayKey(next)
    return {
      date: plan.date,
      key: dayKey(plan.date),
      weekday: isToday ? 'Today' : isTomorrow ? 'Tomorrow' : plan.date.toLocaleDateString('en-US', { weekday: 'short' }),
      dayNumber: plan.date.getDate(),
      isToday,
      memberIds: [...new Set([...memberIds, ...members.filter((m) => plan.travel?.some((t) => t.memberId === m.id)).map((m) => m.id)])],
      awayIds: [...new Set((plan.travel ?? []).map((t) => t.memberId))],
      drivingIds: [...new Set((plan.travel ?? []).filter((t) => t.mode === 'drive').map((t) => t.memberId))],
      firstOut: firstLeave ? `First out ${formatWallClock(firstLeave).time}` : memberIds.length ? 'No trips' : 'Nothing planned',
      decisionCount: decisions.filter((d) => dayKey(d.date) === dayKey(plan.date)).length,
      toDo: packingGroups(plan, checklist).groups
        // Today, only what hasn't happened yet: prep for this morning's errand is moot at 8 PM.
        .filter((g) => !isToday || lastEnd(plan, g.eventId) > now.getTime())
        .flatMap((g) => g.items).filter((i) => !i.checked).length,
    }
  })
}
