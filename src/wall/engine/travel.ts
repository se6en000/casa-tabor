import type { WallEvent, WallMember } from './types'

// Travel (canvas row 19, design doc "Casa: Travel design"): flights in the calendar become one trip per traveller —
// when they leave the house, when they're home, and the days in between. Jake, 2026-10-01: "whats important to the
// family is when am I leaving … and getting home … and some indicator on how long this trip is for."

/** How someone travels, set once on their page (family_members.travel_prefs); a trip can change it. */
export interface TravelPrefs {
  /** Time at the airport before the flight. */
  airportMinutes?: number
  /** Getting off the plane and out of the airport. */
  deplaneMinutes?: number
  /** Getting to the airport and back: an Uber, someone drives, or their own car parked there. */
  way?: TravelWay
}
export type TravelWay = 'uber' | 'someone' | 'drive_park'

/** What the trip sheet (canvas 19d) changed for one trip, kept by its key. */
export interface TravelSettings {
  airportMinutes?: number
  deplaneMinutes?: number
  wayOut?: TravelWay
  wayHome?: TravelWay
  /** "Someone drives" / "someone picks up": who. */
  driverOutId?: string | null
  driverHomeId?: string | null
}

export interface FlightLeg {
  eventId: string
  number: string | null
  from: string
  to: string
  departAt: Date
  landAt: Date
}

export interface TravelTrip {
  id: string
  /** What its settings are kept under: the flight out (or the flight home when that's all there is). */
  key: string
  memberIds: string[]
  city: string
  /** The all-day event that names the trip ("JRT Trip Dallas"), if there is one: shown as the trip, not on its own. */
  tripEventId: string | null
  /** Where they're staying, from the trip's all-day event. */
  hotel: string | null
  outbound: FlightLeg | null
  inbound: FlightLeg | null
  /** The way there (kept as `way` too). */
  way: TravelWay
  wayOut: TravelWay
  /** The way home: the way there unless the sheet said otherwise (drive & park comes home in the car). */
  wayHome: TravelWay
  driverOutId: string | null
  driverHomeId: string | null
  /** "Your car is at DJT": parked at one airport, landing at another. */
  carWarning: string | null
  airportMinutes: number
  deplaneMinutes: number
  /** null when there's no outbound flight (only a way home known). */
  leaveHomeAt: Date | null
  atAirportAt: Date | null
  driveOutMinutes: number
  offPlaneAt: Date | null
  /** null until a flight home is known. */
  homeAt: Date | null
  driveHomeMinutes: number
}

export type TripPhase = 'leaving' | 'away' | 'returning' | 'day'

export interface TripDay {
  trip: TravelTrip
  phase: TripPhase
  /** 1-based: "day 1 of 2". */
  dayIndex: number
  dayCount: number
}

const MINUTE = 60_000
/** The airports the family flies from, and the drive from home. DJT is Palm Beach International's newer code. */
export const HOME_AIRPORTS: Record<string, { name: string; driveMinutes: number }> = {
  PBI: { name: 'PBI', driveMinutes: 15 },
  DJT: { name: 'DJT', driveMinutes: 15 },
  FLL: { name: 'FLL', driveMinutes: 50 },
  MIA: { name: 'MIA', driveMinutes: 80 },
}
const CITY_BY_AIRPORT: Record<string, string> = {
  DFW: 'Dallas', DAL: 'Dallas', ATL: 'Atlanta', BOS: 'Boston', LGA: 'New York', JFK: 'New York', EWR: 'Newark',
  ORD: 'Chicago', MDW: 'Chicago', LAX: 'Los Angeles', SFO: 'San Francisco', DCA: 'Washington', IAD: 'Washington',
  MCO: 'Orlando', TPA: 'Tampa', CLT: 'Charlotte', DEN: 'Denver', AUS: 'Austin', IAH: 'Houston', HOU: 'Houston',
  SEA: 'Seattle', PHX: 'Phoenix', LAS: 'Las Vegas', MSP: 'Minneapolis', DTW: 'Detroit', PHL: 'Philadelphia',
  BNA: 'Nashville', RDU: 'Raleigh', SAN: 'San Diego', SLC: 'Salt Lake City',
}
const DEFAULT_DEPLANE_MIN = 30
/** A return flight this long after the outbound still belongs to the same trip. */
const MAX_TRIP_DAYS = 30

const addMinutes = (d: Date, minutes: number) => new Date(d.getTime() + minutes * MINUTE)
const dayStartOf = (d: Date) => {
  const s = new Date(d)
  s.setHours(0, 0, 0, 0)
  return s
}
const daysBetween = (a: Date, b: Date) => Math.round((dayStartOf(b).getTime() - dayStartOf(a).getTime()) / (24 * 60 * MINUTE))

/** "Flight 1419 DJT→DFW", "AA 2640 DFW -> PBI", "(DJT to DFW)": the flight number (if any) and the airports. */
export function parseFlight(event: Pick<WallEvent, 'title'>): { number: string | null; from: string; to: string } | null {
  const title = event.title ?? ''
  const route = /\b([A-Z]{3})\s*(?:→|->|–|—|to|-)\s*([A-Z]{3})\b/.exec(title)
  if (!route) return null
  const flighty = /\bflight\b/i.test(title) || /\b[A-Z0-9]{2}\s?\d{1,4}\b/.test(title.slice(0, route.index))
  if (!flighty) return null
  const number = /\bflight\s*#?\s*([A-Z0-9]{2}\s?\d{1,4}|\d{1,4})\b/i.exec(title)?.[1] ?? /\b([A-Z]{2}\s?\d{1,4})\b/.exec(title.slice(0, route.index))?.[1] ?? null
  return { number, from: route[1], to: route[2] }
}

function memberIdsOf(event: WallEvent): string[] {
  return [...new Set((event.members ?? [])
    .filter((m) => m.role !== 'driver')
    .map((m) => m.family_member_id ?? m.family_member?.id ?? null)
    .filter((id): id is string => Boolean(id)))]
}

function prefsFor(member: WallMember | undefined, prefs: Record<string, TravelPrefs>): Required<TravelPrefs> {
  const stored = member?.travel_prefs
  const own: TravelPrefs = (member ? prefs[member.id] : undefined) ?? {
    airportMinutes: stored?.airport_minutes ?? undefined,
    deplaneMinutes: stored?.deplane_minutes ?? undefined,
    way: stored?.way ?? undefined,
  }
  const child = member?.role === 'child'
  return {
    airportMinutes: own.airportMinutes ?? (child ? 120 : 90),
    deplaneMinutes: own.deplaneMinutes ?? DEFAULT_DEPLANE_MIN,
    way: own.way ?? 'uber',
  }
}

/** "JRT Trip Dallas" → "Dallas"; "Trip to Austin" → "Austin". */
function cityFromTitle(title: string): string | null {
  const m = /\btrip\b(?:\s+to)?\s+(.+)$/i.exec(title.trim())
  return m ? m[1].replace(/[^\p{L}\s.'-]/gu, '').trim() || null : null
}

/**
 * The family's trips: for each set of travellers, a flight out of a home airport paired with the next flight back
 * into one. `prefs`: each person's travel settings (family_members.travel_prefs).
 */
export function buildTrips(events: WallEvent[], members: WallMember[], prefs: Record<string, TravelPrefs> = {}, settings: Record<string, TravelSettings> = {}): TravelTrip[] {
  const legs = events
    .filter((e) => e.status !== 'cancelled' && !e.all_day)
    .flatMap((e) => {
      const f = parseFlight(e)
      return f ? [{ event: e, memberIds: memberIdsOf(e), leg: { eventId: e.id, number: f.number, from: f.from, to: f.to, departAt: new Date(e.start_time), landAt: new Date(e.end_time) } as FlightLeg }] : []
    })
    .sort((a, b) => a.leg.departAt.getTime() - b.leg.departAt.getTime())
  const isHome = (code: string) => code in HOME_AIRPORTS
  const used = new Set<string>()
  const trips: TravelTrip[] = []
  const tripEvents = events.filter((e) => e.all_day && /\btrip\b/i.test(e.title ?? ''))

  for (const o of legs) {
    if (used.has(o.leg.eventId) || !isHome(o.leg.from) || isHome(o.leg.to)) continue
    used.add(o.leg.eventId)
    const sameTravellers = (ids: string[]) => ids.length === o.memberIds.length && ids.every((id) => o.memberIds.includes(id))
    const back = legs.find((l) => !used.has(l.leg.eventId) && isHome(l.leg.to) && sameTravellers(l.memberIds)
      && l.leg.departAt > o.leg.landAt && daysBetween(o.leg.departAt, l.leg.departAt) <= MAX_TRIP_DAYS)
    if (back) used.add(back.leg.eventId)
    trips.push(assemble(o.leg, back?.leg ?? null, o.memberIds))
  }
  // A flight home with no flight out in the calendar (booked before Casa saw it): still a way home.
  for (const l of legs) {
    if (used.has(l.leg.eventId) || !isHome(l.leg.to) || isHome(l.leg.from)) continue
    used.add(l.leg.eventId)
    trips.push(assemble(null, l.leg, l.memberIds))
  }
  return trips

  function assemble(outbound: FlightLeg | null, inbound: FlightLeg | null, memberIds: string[]): TravelTrip {
    const key = outbound?.eventId ?? inbound!.eventId
    const set = settings[key] ?? {}
    const people = memberIds.map((id) => prefsFor(members.find((m) => m.id === id), prefs))
    const airportMinutes = set.airportMinutes ?? Math.max(...people.map((p) => p.airportMinutes), 0)
    const deplaneMinutes = set.deplaneMinutes ?? Math.max(...people.map((p) => p.deplaneMinutes), 0)
    const wayOut = set.wayOut ?? people[0]?.way ?? 'uber'
    const wayHome = set.wayHome ?? wayOut
    const driveOutMinutes = outbound ? HOME_AIRPORTS[outbound.from]?.driveMinutes ?? 30 : 0
    const driveHomeMinutes = inbound ? HOME_AIRPORTS[inbound.to]?.driveMinutes ?? 30 : 0
    const atAirportAt = outbound ? addMinutes(outbound.departAt, -airportMinutes) : null
    const offPlaneAt = inbound ? addMinutes(inbound.landAt, deplaneMinutes) : null
    const first = outbound?.departAt ?? inbound!.departAt
    const last = inbound?.landAt ?? outbound!.landAt
    const tripEvent = tripEvents.find((e) =>
      memberIdsOf(e).some((id) => memberIds.includes(id))
      && new Date(e.start_time) <= addMinutes(last, 24 * 60) && new Date(e.end_time) >= addMinutes(first, -24 * 60))
    const awayCode = outbound?.to ?? inbound!.from
    const parkedAt = wayOut === 'drive_park' && outbound ? outbound.from : null
    return {
      id: `travel:${outbound?.eventId ?? 'none'}:${inbound?.eventId ?? 'none'}`,
      key,
      memberIds,
      city: (tripEvent && cityFromTitle(tripEvent.title)) || CITY_BY_AIRPORT[awayCode] || awayCode,
      tripEventId: tripEvent?.id ?? null,
      hotel: tripEvent?.location_name?.trim() || null,
      outbound,
      inbound,
      way: wayOut,
      wayOut,
      wayHome,
      driverOutId: wayOut === 'someone' ? set.driverOutId ?? null : null,
      driverHomeId: wayHome === 'someone' ? set.driverHomeId ?? null : null,
      carWarning: parkedAt && inbound && wayHome === 'drive_park' && inbound.to !== parkedAt ? `Your car is at ${parkedAt}` : null,
      airportMinutes,
      deplaneMinutes,
      atAirportAt,
      leaveHomeAt: atAirportAt ? addMinutes(atAirportAt, -driveOutMinutes) : null,
      driveOutMinutes,
      offPlaneAt,
      homeAt: offPlaneAt ? addMinutes(offPlaneAt, driveHomeMinutes) : null,
      driveHomeMinutes,
    }
  }
}

/** The trip's part on this day, or null if the day is outside it. */
export function tripDay(trip: TravelTrip, date: Date): TripDay | null {
  const start = trip.leaveHomeAt ?? trip.inbound?.departAt ?? null
  const end = trip.homeAt ?? null
  if (!start) return null
  const day = dayStartOf(date)
  const first = dayStartOf(start)
  if (day < first) return null
  if (end && day > dayStartOf(end)) return null
  // Open-ended (no flight home yet): shown for the day it starts only.
  if (!end && day > first) return null
  const dayCount = end ? daysBetween(start, end) + 1 : 1
  const dayIndex = daysBetween(start, day) + 1
  const leaving = trip.leaveHomeAt != null && day.getTime() === first.getTime()
  const returning = end != null && day.getTime() === dayStartOf(end).getTime()
  const phase: TripPhase = leaving && returning ? 'day' : leaving ? 'leaving' : returning ? 'returning' : 'away'
  return { trip, phase, dayIndex, dayCount }
}
