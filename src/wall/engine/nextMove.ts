import type { DayPlan, Trip } from './types'

/** Departures this close together are shown as one move. */
const SIMULTANEOUS_WINDOW_MIN = 5

export interface NextMove {
  /** 'en_route': someone has left and not arrived yet. */
  status: 'upcoming' | 'en_route'
  trips: Trip[]
  leaveAt: Date | null
  /** Minutes until the first departure (0 when en route; null if the leave time is unknown). */
  minutesUntilLeave: number | null
}

const departure = (t: Trip) => (t.leaveAt ?? t.arriveAt).getTime()

/**
 * The one thing someone must do next: the earliest trip still ahead, or the
 * trip currently on the road. Only trips count; a timed item with no place
 * (or at home) is never a departure.
 */
export function selectNextMove(plan: DayPlan, now: Date): NextMove | null {
  const t = now.getTime()

  const enRoute = plan.trips
    .filter((trip) => trip.leaveAt && trip.leaveAt.getTime() <= t && trip.arriveAt.getTime() > t)
    .sort((a, b) => a.arriveAt.getTime() - b.arriveAt.getTime())
  const upcoming = plan.trips.filter((trip) => departure(trip) > t).sort((a, b) => departure(a) - departure(b))

  // Someone on the road is the move, unless another departure is due before they arrive.
  if (enRoute.length > 0 && !(upcoming.length > 0 && departure(upcoming[0]) <= enRoute[0].arriveAt.getTime())) {
    return { status: 'en_route', trips: enRoute, leaveAt: enRoute[0].leaveAt, minutesUntilLeave: 0 }
  }
  if (upcoming.length === 0) return null
  const first = departure(upcoming[0])
  const together = upcoming.filter((trip) => departure(trip) - first <= SIMULTANEOUS_WINDOW_MIN * 60_000)
  return {
    status: 'upcoming',
    trips: together,
    leaveAt: upcoming[0].leaveAt,
    minutesUntilLeave: upcoming[0].leaveAt ? Math.round((first - t) / 60_000) : null,
  }
}
