import type { DayPlan, Trip, WallMember } from './engine/types'
import { clockTime, placeName } from './header.ts'
import { driverChoices, firstClash, tripWindow } from './people.ts'

// "Needs a decision" (P3.4): only what the wall can't settle on its own, each
// with two answers that save. At most three, soonest first. Answers reuse the
// hand-off writes; "keep"/"manage" answers are remembered so they aren't asked again.

const MAX_SHOWN = 3

export type DecisionAction =
  | { type: 'drive'; driverId: string; tripIds: string[] }
  | { type: 'pick'; tripIds: string[] }
  | { type: 'dismiss' }

export interface Decision {
  /** Stable, so a "keep" answer can be remembered. */
  key: string
  kind: 'one_car' | 'no_driver' | 'driver_busy'
  at: Date
  text: string
  detail?: string
  tripIds: string[]
  sourceIds: string[]
  answers: Array<{ label: string; action: DecisionAction }>
}

const shortTitle = (title: string) => title.split(':')[0].trim()

function doing(trip: Trip, nameOf: (id: string) => string): string {
  const who = trip.travelerIds.filter((id) => id !== trip.driverId).map(nameOf).join(' & ')
  if (trip.kind === 'pickup') return `picks up ${who}`
  if (trip.kind === 'dropoff') return `drops off ${who}`
  return `drives to ${placeName(trip)}`
}

export function decisionsFor(plan: DayPlan, members: WallMember[], now: Date, dismissed: ReadonlySet<string> = new Set()): Decision[] {
  const nameOf = (id: string) => members.find((m) => m.id === id)?.name ?? 'Someone'
  const upcoming = (t: Trip) => t.arriveAt > now
  const tripById = new Map(plan.trips.map((t) => [t.id, t]))
  const found: Decision[] = []
  const coveredByOneCar = new Set<string>()

  // Same place, same time, not already one car.
  for (const shared of plan.sharedDestinations) {
    const trips = shared.tripIds.map((id) => tripById.get(id)).filter((t): t is Trip => Boolean(t && upcoming(t)))
    if (trips.length < 2) continue
    const drivers = new Set(trips.map((t) => t.driverId))
    if (drivers.size === 1 && !drivers.has(null)) continue
    const tripIds = trips.map((t) => t.id).sort()
    const key = `one_car:${tripIds.join('+')}`
    if (dismissed.has(key)) continue
    trips.forEach((t) => coveredByOneCar.add(t.id))
    const sourceIds = trips.map((t) => t.sourceId)
    const window = { from: Math.min(...trips.map((t) => tripWindow(t).from)), to: Math.max(...trips.map((t) => tripWindow(t).to)) }
    const candidates = [...new Set(trips.map((t) => t.driverId).filter((id): id is string => Boolean(id)))]
      .concat(members.filter((m) => m.can_drive).map((m) => m.id))
    const driver = candidates.find((id) => members.find((m) => m.id === id)?.can_drive && !firstClash(plan, id, window, sourceIds)) ?? null
    const leaveBy = trips.map((t) => t.leaveAt).filter((d): d is Date => Boolean(d)).sort((a, b) => a.getTime() - b.getTime())[0]
    found.push({
      key,
      kind: 'one_car',
      at: shared.arriveAt,
      text: `${trips.map((t) => shortTitle(t.title)).sort().join(' and ')} are both at ${placeName(trips[0])} at ${clockTime(shared.arriveAt)}.`,
      ...(leaveBy ? { detail: `One car could take both, leaving by ${clockTime(leaveBy)}.` } : {}),
      tripIds,
      sourceIds,
      answers: [
        driver ? { label: `One trip · ${nameOf(driver)}`, action: { type: 'drive', driverId: driver, tripIds } } : { label: 'One trip · choose driver', action: { type: 'pick', tripIds } },
        { label: 'Keep two trips', action: { type: 'dismiss' } },
      ],
    })
  }

  for (const trip of plan.trips.filter(upcoming)) {
    if (!trip.driverId) {
      const key = `no_driver:${trip.id}`
      if (coveredByOneCar.has(trip.id) || dismissed.has(key)) continue
      const free = driverChoices(plan, members, trip, trip.sourceId).filter((c) => c.note === 'free').slice(0, 2)
      const answers: Decision['answers'] = free.map((c) => ({ label: c.name, action: { type: 'drive', driverId: c.memberId, tripIds: [trip.id] } }))
      if (answers.length < 2) answers.push({ label: 'Choose a driver', action: { type: 'pick', tripIds: [trip.id] } })
      found.push({ key, kind: 'no_driver', at: trip.arriveAt, text: `${shortTitle(trip.title)} at ${clockTime(trip.arriveAt)} needs a driver.`, tripIds: [trip.id], sourceIds: [trip.sourceId], answers: answers.slice(0, 2) })
      continue
    }
    // A driver with something else on at the same time (one car to one place isn't a clash).
    const key = `driver_busy:${trip.id}:${trip.driverId}`
    if (dismissed.has(key)) continue
    const sameCar = plan.sharedDestinations.filter((s) => s.tripIds.includes(trip.id)).flatMap((s) => s.tripIds)
      .map((id) => tripById.get(id)).filter((t): t is Trip => Boolean(t && t.driverId === trip.driverId)).map((t) => t.sourceId)
    const clash = firstClash(plan, trip.driverId, tripWindow(trip), [trip.sourceId, ...sameCar])
    if (!clash) continue
    const other = driverChoices(plan, members, trip, trip.sourceId).find((c) => c.note === 'free' && c.memberId !== trip.driverId)
    const driverName = nameOf(trip.driverId)
    found.push({
      key,
      kind: 'driver_busy',
      at: trip.arriveAt,
      text: `${driverName} ${doing(trip, nameOf)} at ${clockTime(trip.arriveAt)} but has ${clash.label} until ${clockTime(clash.end)}.`,
      tripIds: [trip.id],
      sourceIds: [trip.sourceId],
      answers: [
        other ? { label: `Hand off to ${other.name}`, action: { type: 'drive', driverId: other.memberId, tripIds: [trip.id] } } : { label: 'Choose a driver', action: { type: 'pick', tripIds: [trip.id] } },
        { label: `${driverName} will manage`, action: { type: 'dismiss' } },
      ],
    })
  }

  return found.sort((a, b) => a.at.getTime() - b.at.getTime()).slice(0, MAX_SHOWN)
}
