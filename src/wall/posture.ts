import { clockTime, placeName, rainChance, type NextMoveView } from './header.ts'
import { selectNextMove } from './engine/nextMove.ts'
import type { DayPlan } from './engine/types'

// Which face the wall shows, and the few sentences the calm and evening faces say.
//   launch  — the full Score: the morning rush, or a departure within minutes.
//   calm    — the rest of the day: big clock, whereabouts, a miniature of the day.
//   evening — 7 PM to 6 AM, dark: tomorrow's plan.

export type Posture = 'launch' | 'calm' | 'evening'

const EVENING_START_HOUR = 19
const NIGHT_END_HOUR = 6
/** Launch this many minutes before a departure. */
const LAUNCH_LEAD_MIN = 5
/** Departures before this hour make up the morning rush. */
const MORNING_RUSH_END_HOUR = 9

export function selectPosture(plan: DayPlan | null, now: Date): Posture {
  const hour = now.getHours()
  if (hour >= EVENING_START_HOUR || hour < NIGHT_END_HOUR) return 'evening'
  if (!plan) return 'launch'

  const morningEnd = new Date(now)
  morningEnd.setHours(MORNING_RUSH_END_HOUR, 0, 0, 0)
  const morningRuns = plan.trips.filter((trip) => trip.leaveAt && trip.leaveAt < morningEnd)
  const rushOver = Math.max(0, ...morningRuns.map((trip) => trip.arriveAt.getTime()))
  if (now.getTime() < rushOver) return 'launch'

  const move = selectNextMove(plan, now)
  if (move?.status === 'upcoming' && move.minutesUntilLeave != null && move.minutesUntilLeave <= LAUNCH_LEAD_MIN) return 'launch'
  return 'calm'
}

/** In the evening the wall shows tomorrow; after midnight, the day that has just begun. */
export function eveningFocus(now: Date): { day: 'today' | 'tomorrow'; label: string } {
  if (now.getHours() < NIGHT_END_HOUR) {
    const yesterday = new Date(now)
    yesterday.setDate(yesterday.getDate() - 1)
    return { day: 'today', label: `Late ${yesterday.toLocaleDateString('en-US', { weekday: 'long' })} night` }
  }
  return { day: 'tomorrow', label: `${now.toLocaleDateString('en-US', { weekday: 'long' })} evening` }
}

export function calmHeadline(plan: DayPlan | null, now: Date): string {
  if (!plan) return ''
  const needsDriver = plan.trips
    .filter((trip) => !trip.driverId && trip.arriveAt > now)
    .sort((a, b) => a.arriveAt.getTime() - b.arriveAt.getTime())[0]
  if (needsDriver) return `${needsDriver.title.split(':')[0].trim()} at ${clockTime(needsDriver.arriveAt)} still needs a driver.`
  const move = selectNextMove(plan, now)
  if (!move) return 'Nothing else on the road today.'
  if (move.status === 'en_route') return 'Someone is on the road.'
  return move.leaveAt ? `A quiet stretch until ${clockTime(move.leaveAt)}.` : 'A quiet stretch.'
}

export function calmNextLine(view: NextMoveView | null): string | null {
  if (!view) return null
  const parts = [view.leaveTime, view.title, view.summary]
  if (view.ring) parts.push(`in ${view.ring.value} ${view.ring.unit.toLowerCase()}`)
  return parts.filter(Boolean).join(' · ')
}

/** "Overcast, 86° at 12:30 · Ferrin Park Field 1" for the day's first outing with a stored forecast. */
export function forecastLine(plan: DayPlan | null): string | null {
  const trip = plan?.trips
    .filter((t) => t.weather)
    .sort((a, b) => a.arriveAt.getTime() - b.arriveAt.getTime())[0]
  if (!trip?.weather) return null
  const parts = trip.weather.split(',').map((p) => p.trim())
  const temp = parts.find((p) => /\d+\s*°/.test(p))?.replace(/°\s*F/i, '°')
  const sky = [parts[0], temp].filter(Boolean).join(', ')
  const rain = rainChance(trip.weather) ?? 0
  return `${sky} at ${clockTime(trip.arriveAt)} · ${placeName(trip)}${rain >= 40 ? ` · ${rain}% chance of rain` : ''}`
}

const shortTitle = (title: string) => title.split(':')[0].trim()

/** What the family should settle ahead of time: trips with no driver, and trips one car could share. */
export function decisions(plan: DayPlan | null, now: Date): string[] {
  if (!plan) return []
  const items: Array<{ at: number; text: string }> = []
  for (const trip of plan.trips) {
    if (trip.driverId || trip.arriveAt <= now) continue
    items.push({ at: trip.arriveAt.getTime(), text: `${shortTitle(trip.title)} at ${clockTime(trip.arriveAt)} needs a driver.` })
  }
  for (const shared of plan.sharedDestinations) {
    if (shared.arriveAt <= now) continue
    const titles = shared.tripIds
      .map((id) => plan.trips.find((t) => t.id === id))
      .filter((t): t is NonNullable<typeof t> => Boolean(t))
      .map((t) => shortTitle(t.title))
      .sort()
    const place = plan.trips.find((t) => t.id === shared.tripIds[0])
    items.push({
      at: shared.arriveAt.getTime(),
      text: `${titles.join(' and ')} are both at ${place ? placeName(place) : shared.destination} at ${clockTime(shared.arriveAt)} — one car could do both.`,
    })
  }
  return items.sort((a, b) => a.at - b.at).map((item) => item.text)
}
