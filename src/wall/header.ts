import { formatDisplayVenueName } from '../lib/familyRoutines.ts'
import { formatWallClock } from './clock.ts'
import type { NextMove } from './engine/nextMove'
import type { DayPlan, Trip, WallMember } from './engine/types'

// What the header says: the one Next Move instruction (with its countdown ring)
// and the weather, phrased around a plan when it matters. Pure, so it's tested
// without rendering.

/** Within this many minutes of leaving, the move turns rust (the only urgency color). */
const URGENT_MIN = 15
/** Below this the ring counts minutes; above it, hours. */
const MINUTES_LIMIT = 90
/** The ring shows the last hour before leaving. */
const RING_SPAN_MIN = 60
/** A forecast rain chance at or above this is worth mentioning. */
const RAIN_WORTH_MENTIONING = 40

export interface NextMoveView {
  eyebrow: string
  urgent: boolean
  /** Who drives; null when nobody is assigned. */
  driverId: string | null
  initial: string
  title: string
  detail: string
  /** Another departure at about the same time. */
  also: string | null
  /** null when the leave time is unknown (no drive time). */
  ring: { value: string; unit: string; fraction: number } | null
}

const clockTime = (d: Date) => formatWallClock(d).time

function placeName(trip: Trip): string {
  return formatDisplayVenueName(trip.destination.name.split(',')[0].trim()) || 'somewhere'
}

function whoGoes(trip: Trip, nameOf: (id: string | null) => string | null): string {
  if (trip.driverId) return nameOf(trip.driverId) ?? 'Someone'
  const travelers = trip.travelerIds.map(nameOf).filter(Boolean)
  // Nobody attached at all: name the event itself ("Baseball: Huskies @ …" → "Baseball").
  return travelers.length > 0 ? travelers.join(' & ') : trip.title.split(':')[0].trim()
}

function arrivalPhrase(trip: Trip): string {
  const time = clockTime(trip.arriveAt)
  if (trip.kind === 'dropoff') return `there by ${time}`
  if (trip.kind === 'pickup') return `pickup at ${time}`
  return `starts ${time}`
}

function countdown(minutes: number): { value: string; unit: string } {
  if (minutes < MINUTES_LIMIT) return { value: String(minutes), unit: 'MIN' }
  const hours = Math.round(minutes / 60)
  return { value: String(hours), unit: hours === 1 ? 'HR' : 'HRS' }
}

export function describeNextMove(move: NextMove | null, members: WallMember[], now: Date): NextMoveView | null {
  if (!move || move.trips.length === 0) return null
  const nameOf = (id: string | null) => members.find((m) => m.id === id)?.name ?? null
  const [trip, ...others] = move.trips
  const driverName = nameOf(trip.driverId)
  const detail = [trip.title, arrivalPhrase(trip), trip.driveMinutes != null ? `${trip.driveMinutes} min drive` : null]
    .filter(Boolean)
    .join(' · ')
  const base = {
    driverId: trip.driverId,
    initial: driverName?.charAt(0) ?? '?',
    title: `${whoGoes(trip, nameOf)} → ${placeName(trip)}`,
    detail,
    also: others.length > 0
      ? `Also leaving: ${others.map((o) => `${whoGoes(o, nameOf)} → ${placeName(o)}${o.leaveAt ? ` at ${clockTime(o.leaveAt)}` : ''}`).join('; ')}`
      : null,
  }

  if (move.status === 'en_route') {
    const left = Math.max(0, Math.round((trip.arriveAt.getTime() - now.getTime()) / 60_000))
    const drive = trip.driveMinutes && trip.driveMinutes > 0 ? trip.driveMinutes : left || 1
    return {
      ...base,
      eyebrow: `ON THE ROAD · ${arrivalPhrase(trip).toUpperCase()}`,
      urgent: false,
      ring: { ...countdown(left), fraction: Math.min(1, left / drive) },
    }
  }

  const minutes = move.minutesUntilLeave
  const lead = trip.driverId ? 'NEXT MOVE' : 'NEEDS A DRIVER'
  const when = move.leaveAt ? `LEAVE BY ${clockTime(move.leaveAt)}` : arrivalPhrase(trip).toUpperCase()
  return {
    ...base,
    eyebrow: `${lead} · ${when}`,
    urgent: minutes != null && minutes <= URGENT_MIN,
    ring: minutes == null ? null : { ...countdown(minutes), fraction: Math.min(1, minutes / RING_SPAN_MIN) },
  }
}

/** The rain chance in a stored forecast like "Overcast, 86°F, 40% rain chance". */
export function rainChance(forecast: string | null | undefined): number | null {
  const match = forecast?.match(/(\d{1,3})\s*%\s*(?:chance of )?rain/i)
  return match ? Number(match[1]) : null
}

/** "74° and clear", plus a warning when rain is likely during an outing still ahead today. */
export function weatherLine(
  current: { temp: number; condition: string } | null | undefined,
  plan: DayPlan | null,
  now: Date,
): string | null {
  const parts: string[] = []
  if (current && Number.isFinite(current.temp)) parts.push(`${Math.round(current.temp)}° and ${current.condition.toLowerCase()}`)
  const wet = plan?.trips
    .filter((trip) => trip.arriveAt > now && (rainChance(trip.weather) ?? 0) >= RAIN_WORTH_MENTIONING)
    .sort((a, b) => a.arriveAt.getTime() - b.arriveAt.getTime())[0]
  if (wet) parts.push(`${rainChance(wet.weather)}% chance of rain at ${clockTime(wet.arriveAt)}, ${placeName(wet)}`)
  return parts.length > 0 ? parts.join(' · ') : null
}
