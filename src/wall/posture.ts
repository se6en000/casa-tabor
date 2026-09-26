import { clockTime, placeName, rainChance, type NextMoveView } from './header.ts'
import { selectNextMove } from './engine/nextMove.ts'
import type { DayPlan } from './engine/types'
import { packingGroups, type WallChecklistItem } from './packing.ts'

// Which face the wall shows, and the few sentences the calm and evening faces say.
//   launch  — the full Score: the morning rush, someone out on a trip, or a departure within 2 hours.
//   calm    — nothing on the road for a while: big clock, whereabouts, a miniature of the day.
//   evening — 7 PM to 6 AM, dark: tomorrow's plan.
// (Approved with the navigation board, 2026-09-25. A touch on calm wakes the full day; see WallView.)

export type Posture = 'launch' | 'calm' | 'evening'

const EVENING_START_HOUR = 19
const NIGHT_END_HOUR = 6
/** The full day this many minutes before a departure. */
const LAUNCH_LEAD_MIN = 120
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

  // Someone out on a trip (between leaving and being home again).
  const t = now.getTime()
  if (plan.trips.some((trip) => trip.leaveAt && trip.leaveAt.getTime() <= t && (trip.homeAt ?? trip.arriveAt).getTime() > t)) return 'launch'

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


/** Tomorrow speaks up from 1 PM, while the stores are open (the evening then shows tomorrow itself). */
const TOMORROW_LINE_FROM_HOUR = 13

const listed = (words: string[]) => (words.length <= 1 ? words.join('') : `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`)

/**
 * One line about tomorrow for the full day and calm faces: the first thing with prep
 * still to do, how much more there is, any questions, and when the day starts.
 * Null outside the afternoon, or when tomorrow needs nothing.
 */
export function tomorrowLine(tomorrow: DayPlan | null, checklist: WallChecklistItem[], decisionCount: number, now: Date): string | null {
  const hour = now.getHours()
  if (!tomorrow || hour < TOMORROW_LINE_FROM_HOUR || hour >= EVENING_START_HOUR) return null
  const groups = packingGroups(tomorrow, checklist).groups
    .map((g) => ({ title: g.heading.split(' · ')[0], open: g.items.filter((i) => !i.checked) }))
    .filter((g) => g.open.length > 0)
  if (groups.length === 0 && decisionCount === 0) return null
  const parts: string[] = []
  if (groups.length > 0) {
    parts.push(`${groups[0].title}: ${listed(groups[0].open.map((i) => i.label))} still to do`)
    const more = groups.slice(1).reduce((n, g) => n + g.open.length, 0)
    if (more > 0) parts.push(`${more} more`)
  }
  if (decisionCount > 0) parts.push(`${decisionCount} to decide`)
  const first = tomorrow.trips.map((t) => t.leaveAt).filter((d): d is Date => Boolean(d)).sort((a, b) => a.getTime() - b.getTime())[0]
  if (first) parts.push(`first out ${clockTime(first)}`)
  return parts.join(' · ')
}
