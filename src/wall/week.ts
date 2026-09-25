import { formatWallClock } from './clock.ts'
import type { DayPlan, WallMember } from './engine/types.ts'

// The week strip (P3.9): one cell per day, today first. Each cell answers "is
// that day busy, for whom, and how early" at a glance; tapping it shows the day.

export interface WeekDay {
  date: Date
  key: string
  /** "Today", then "Sat", "Sun"… */
  weekday: string
  dayNumber: number
  isToday: boolean
  /** Who has something that day, in lane order. */
  memberIds: string[]
  /** "First out 7:50", or "Nothing planned". */
  firstOut: string
  decisionCount: number
}

const dayKey = (date: Date) => date.toDateString()

export function weekDays(week: DayPlan[], members: WallMember[], decisions: Array<{ date: Date }>, now: Date): WeekDay[] {
  return week.map((plan) => {
    const firstLeave = plan.trips
      .map((trip) => trip.leaveAt)
      .filter((leave): leave is Date => Boolean(leave))
      .sort((a, b) => a.getTime() - b.getTime())[0]
    const memberIds = members.filter((m) => plan.activeMemberIds.has(m.id)).map((m) => m.id)
    const isToday = dayKey(plan.date) === dayKey(now)
    return {
      date: plan.date,
      key: dayKey(plan.date),
      weekday: isToday ? 'Today' : plan.date.toLocaleDateString('en-US', { weekday: 'short' }),
      dayNumber: plan.date.getDate(),
      isToday,
      memberIds,
      firstOut: firstLeave ? `First out ${formatWallClock(firstLeave).time}` : memberIds.length ? 'No trips' : 'Nothing planned',
      decisionCount: decisions.filter((d) => dayKey(d.date) === dayKey(plan.date)).length,
    }
  })
}
