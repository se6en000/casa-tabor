import type { FamilyRoutine } from '../../lib/familyRoutines'
import { applyTimeToDate, formatDisplayVenueName, getEstimatedDriveMinutes } from '../../lib/familyRoutines.ts'
import { isEventAtHome } from '../../lib/driverConflictEngine.ts'
import { buildTrips, tripDay, type TravelPrefs, type TravelSettings, type TravelTrip } from './travel.ts'
import type {
  DayGap,
  DayTravel,
  DayPlan,
  LaneSegment,
  PlaceStatus,
  SharedDestination,
  Trip,
  WallEvent,
  WallMember,
  WallPlanLeg,
} from './types'

export interface DayOff {
  id?: string
  member_id: string
  override_type: string
  start_at: string
  end_at: string
}

export interface BuildDayPlanInput {
  date: Date
  members: WallMember[]
  routines: FamilyRoutine[]
  events: WallEvent[]
  dayOffs?: DayOff[]
  /** The family's home address (settings); an event there counts as at home. */
  homeAddress?: string | null
  /** Decisions made on the wall for this day: hand-offs of routine runs, and "Leaving now". */
  tripState?: { drivers: Record<string, string | null>; departed: Record<string, string> }
  /** The family's trips away (travel.ts), built once from all events so a day knows the flight back on another. */
  travel?: TravelTrip[]
  /** Each person's travel settings (family_members.travel_prefs), when `travel` is built here from `events`. */
  travelPrefs?: Record<string, TravelPrefs>
  /** The trip sheets' choices (settings `wall_travel`), when `travel` is built here. */
  travelSettings?: Record<string, TravelSettings>
}

const durationWords = (minutes: number) => (minutes % 60 === 0 ? `${minutes / 60} hr` : minutes > 60 ? `${Math.floor(minutes / 60)} hr ${minutes % 60}` : `${minutes} min`)
const WAY_WORD = { uber: 'Uber', drive_park: 'Drive', someone: 'Ride' } as const
const ownCar = (way: 'uber' | 'someone' | 'drive_park') => way !== 'someone'

const MINUTE = 60_000
const SHARED_ARRIVAL_WINDOW_MIN = 30
/** A calendar event this close to a routine run, at the same school, is a synced copy of it. */
const ROUTINE_MIRROR_WINDOW_MIN = 15
// A trip that starts this long before a pickup can still be chained onto it (it would just start late).
const CHAIN_EARLY_MIN = 15
/** A stored departure more than this long before arrival (or after it) is treated as bad data. */
const MAX_PLAUSIBLE_LEAD_MIN = 6 * 60

const addMinutes = (d: Date, minutes: number) => new Date(d.getTime() + minutes * MINUTE)

function dayBounds(date: Date): { start: Date; end: Date } {
  const start = new Date(date)
  start.setHours(0, 0, 0, 0)
  const end = new Date(start)
  end.setDate(end.getDate() + 1)
  return { start, end }
}

function localDateKey(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function findMember(members: WallMember[], id?: string | null, name?: string | null): WallMember | null {
  if (id) {
    const byId = members.find((m) => m.id === id)
    if (byId) return byId
  }
  const wanted = name?.trim().toLowerCase()
  if (!wanted) return null
  return members.find((m) => m.name.toLowerCase() === wanted || m.full_name?.toLowerCase() === wanted) ?? null
}

function isDayOff(memberId: string, date: Date, dayOffs: DayOff[]): boolean {
  const key = localDateKey(date)
  return dayOffs.some((ex) => {
    if (ex.member_id !== memberId || ex.override_type !== 'day_off') return false
    const from = localDateKey(new Date(ex.start_at))
    const to = localDateKey(new Date(ex.end_at))
    return key >= from && key <= to
  })
}

interface RoutineDay {
  start: Date
  end: Date
  dropoff: { id: string | null; name: string }
  pickup: { id: string | null; name: string }
}

/** The routine's hours and drivers on this date, or null if it doesn't run. */
function routineForDay(routine: FamilyRoutine, date: Date): RoutineDay | null {
  if (!routine.enabled) return null
  const key = localDateKey(date)
  if (routine.startDate && key < routine.startDate) return null
  if (routine.endDate && key > routine.endDate) return null
  const dayOfWeek = date.getDay()
  if (!routine.daysOfWeek.includes(dayOfWeek)) return null
  const override = routine.dayOverrides?.find((o) => o.dayOfWeek === dayOfWeek && o.enabled !== false)
  return {
    start: applyTimeToDate(date, override?.startLocal || routine.startLocal),
    end: applyTimeToDate(date, override?.endLocal || routine.endLocal),
    dropoff: {
      id: override?.dropoffDriverId || routine.dropoffDriverId || null,
      name: override?.dropoffDriverName || routine.dropoffDriverName,
    },
    pickup: {
      id: override?.pickupDriverId || routine.pickupDriverId || null,
      name: override?.pickupDriverName || routine.pickupDriverName,
    },
  }
}

function legTime(leg: WallPlanLeg, fallback: Date): Date {
  if (/^\d{1,2}:\d{2}$/.test(leg.time)) return applyTimeToDate(fallback, leg.time)
  const parsed = new Date(leg.time)
  return Number.isNaN(parsed.getTime()) ? fallback : parsed
}

function classifyPlace(event: WallEvent, homeAddress: string | null | undefined): PlaceStatus {
  const legs = event.plan_override?.transportation_plan?.legs
  if (Array.isArray(legs) && legs.length === 0) return 'home'
  if (event.plan_override?.mode_override === 'none') return 'home'
  const location = (event.location_name ?? '').trim()
  const address = (event.address ?? '').trim()
  if (!location && !address) return Array.isArray(legs) && legs.length > 0 ? 'away' : 'unknown'
  const homeLine = homeAddress?.split(',')[0]?.trim().toLowerCase()
  if (homeLine && address.toLowerCase().includes(homeLine)) return 'home'
  // isEventAtHome reads the same fields EventWithDetails carries.
  return isEventAtHome(event as unknown as Parameters<typeof isEventAtHome>[0]) ? 'home' : 'away'
}

function normalizePlace(name: string): string {
  return name.toLowerCase().replace(/\s+/g, ' ').split(',')[0].trim()
}

/** "11921 okeechobee blvd" from any part of a place or address that starts with a house number. */
function streetLine(...texts: Array<string | null | undefined>): string | null {
  for (const text of texts) {
    for (const part of (text ?? '').split(',')) {
      const line = part.toLowerCase().replace(/[.#]/g, '').replace(/\s+/g, ' ').trim()
      if (/^\d+\s+\S+/.test(line)) return line
    }
  }
  return null
}

export function buildDayPlan(input: BuildDayPlanInput): DayPlan {
  const { date, members, routines, events, dayOffs = [], homeAddress = null, tripState = { drivers: {}, departed: {} } } = input
  const departedAt = (tripId: string) => (tripState.departed[tripId] ? new Date(tripState.departed[tripId]) : null)
  const { start: dayStart, end: dayEnd } = dayBounds(date)

  const lanes = new Map<string, LaneSegment[]>(members.map((m) => [m.id, []]))
  const addSegment = (memberId: string, segment: LaneSegment) => {
    if (!lanes.has(memberId)) lanes.set(memberId, [])
    lanes.get(memberId)!.push(segment)
  }
  const trips: Trip[] = []
  const gaps: DayGap[] = []
  const unplaced: DayPlan['unplaced'] = []
  const nobody: DayPlan['nobody'] = []
  const allDay: DayPlan['allDay'] = []
  const nameOf = (id: string) => members.find((m) => m.id === id)?.name ?? 'Someone'

  // Trips away (canvas 19): who is gone, from leaving the house to being home again.
  const travelTrips = input.travel ?? buildTrips(events, members, input.travelPrefs ?? {}, input.travelSettings ?? {})
  const travelDays = travelTrips.flatMap((t) => tripDay(t, date) ?? [])
  const travelEventIds = new Set(travelTrips.flatMap((t) => [t.outbound?.eventId, t.inbound?.eventId, t.tripEventId, ...t.legEventIds].filter((id): id is string => Boolean(id))))
  const awayWindows = travelDays.flatMap(({ trip }) => trip.memberIds.map((memberId) => ({
    memberId, city: trip.city,
    start: trip.leaveHomeAt ?? dayStart,
    end: trip.homeAt ?? dayEnd,
  })))
  const awayDuring = (memberId: string | null, start: Date, end: Date) =>
    memberId ? awayWindows.find((w) => w.memberId === memberId && w.start < end && w.end > start) ?? null : null

  // School and other routines: time at the place, plus shared drop-off/pickup runs.
  interface Run {
    kind: 'dropoff' | 'pickup'
    arriveAt: Date
    venueName: string
    venueAddress: string | null
    driveMinutes: number
    driverId: string | null
    travelerIds: string[]
    sourceId: string
  }
  const runs = new Map<string, Run>()
  for (const routine of routines) {
    const day = routineForDay(routine, date)
    if (!day || isDayOff(routine.memberId, date, dayOffs)) continue
    // The main routine keeps its older id (hand-offs and decisions are saved against it); others add their key.
    const sourceId = routine.id ?? (routine.key && routine.key !== 'main' ? `routine:${routine.memberId}:${routine.key}` : `routine:${routine.memberId}`)
    const driveMinutes = getEstimatedDriveMinutes(routine.venueName, routine.venueAddress)
    const work = routine.routineType === 'work'
    // Away on a trip: no school or work while gone (the part of the day before they leave stays).
    const gone = awayDuring(routine.memberId, day.start, day.end)
    if (gone && gone.start <= day.start) continue
    if (gone) day.end = new Date(Math.min(day.end.getTime(), gone.start.getTime()))
    addSegment(routine.memberId, {
      kind: 'at_place',
      start: day.start,
      end: day.end,
      label: formatDisplayVenueName(routine.venueName, routine.shortVenueName) || routine.title,
      // Work with no place recorded may well be at home; it's still their busy time.
      placeStatus: work && !routine.venueAddress ? 'home' : 'away',
      sourceId,
      fromRoutine: true,
      work,
    })
    // Work is where they are, not a drop-off and pickup.
    if (work) continue
    for (const kind of ['dropoff', 'pickup'] as const) {
      const arriveAt = kind === 'dropoff' ? day.start : day.end
      const driver = kind === 'dropoff' ? day.dropoff : day.pickup
      // Routines name drivers by id, by name, or both; group siblings by the resolved person.
      const driverId = findMember(members, driver.id, driver.name)?.id ?? null
      const key = [kind, normalizePlace(routine.venueName), arriveAt.getTime(), driverId ?? driver.name.toLowerCase()].join('|')
      const run = runs.get(key)
      if (run) run.travelerIds.push(routine.memberId)
      else runs.set(key, {
        kind, arriveAt, driveMinutes, sourceId, driverId,
        venueName: routine.venueName,
        venueAddress: routine.venueAddress || null,
        travelerIds: [routine.memberId],
      })
    }
  }
  for (const run of runs.values()) {
    const tripId = `routine:${run.kind}:${normalizePlace(run.venueName)}:${run.arriveAt.getTime()}`
    // A hand-off made on the wall for today replaces the routine's driver.
    const handedOff = Object.prototype.hasOwnProperty.call(tripState.drivers, tripId)
    const names = run.travelerIds.map(nameOf).join(' & ')
    const title = `${run.kind === 'dropoff' ? 'Drop off' : 'Pick up'} ${names}`
    const departed = departedAt(tripId)
    const leaveAt = departed && departed < run.arriveAt ? departed : addMinutes(run.arriveAt, -run.driveMinutes)
    const homeAt = addMinutes(run.arriveAt, run.driveMinutes)
    // The usual driver is away on a trip: nobody yet, and the question says why (a hand-off made today still wins).
    // (A hand-off made today still wins, and the run stays marked as the away driver's, so the trip lists it as covered.)
    const usualAway = awayDuring(run.driverId, leaveAt, homeAt)
    const driverId = handedOff ? tripState.drivers[tripId] : usualAway ? null : run.driverId
    const trip: Trip = {
      id: tripId,
      kind: run.kind,
      sourceId: run.sourceId,
      source: 'routine',
      title,
      travelerIds: run.travelerIds,
      driverId,
      driverSource: handedOff ? (driverId ? 'handoff' : null) : driverId ? 'routine' : null,
      departedAt: departed,
      destination: { name: run.venueName, address: run.venueAddress },
      leaveAt,
      arriveAt: run.arriveAt,
      homeAt,
      driveMinutes: run.driveMinutes,
      ...(usualAway ? { usualDriverAway: { memberId: usualAway.memberId, city: usualAway.city } } : {}),
    }
    trips.push(trip)
    if (driverId) {
      addSegment(driverId, { kind: 'drive', start: leaveAt, end: homeAt, label: title, placeStatus: 'away', sourceId: run.sourceId, tripId: trip.id, driverId, fromRoutine: true })
    } else {
      gaps.push({ kind: 'no_driver', sourceId: run.sourceId, title, at: leaveAt, ...(usualAway && !handedOff ? { away: { memberId: usualAway.memberId, city: usualAway.city } } : {}) })
    }
    for (const travelerId of run.travelerIds) {
      const [start, end] = run.kind === 'dropoff' ? [leaveAt, run.arriveAt] : [run.arriveAt, homeAt]
      addSegment(travelerId, { kind: 'drive', start, end, label: title, placeStatus: 'away', sourceId: run.sourceId, tripId: trip.id, driverId, fromRoutine: true })
    }
  }

  // Routine exception days are also synced to Google and come back as calendar
  // events; the routine (with its day override) is the source of truth.
  const isRoutineMirror = (event: WallEvent, start: Date) => {
    const place = normalizePlace(event.location_name || event.address || '')
    if (!place) return false
    return [...runs.values()].some((run) => {
      const venue = normalizePlace(run.venueName)
      return (place === venue || place.includes(venue) || venue.includes(place))
        && Math.abs(start.getTime() - run.arriveAt.getTime()) <= ROUTINE_MIRROR_WINDOW_MIN * MINUTE
    })
  }

  // Calendar events.
  for (const event of events) {
    const start = new Date(event.start_time)
    const end = new Date(event.end_time)
    if (!(start < dayEnd && end > dayStart)) continue
    if (event.status === 'cancelled') continue
    if (isRoutineMirror(event, start)) continue
    // A flight or a trip's all-day event is drawn as the trip (below), not as an outing of its own.
    if (travelEventIds.has(event.id)) continue

    const refs = (event.members ?? [])
      .map((m) => ({ id: m.family_member_id ?? m.family_member?.id ?? null, role: m.role ?? null }))
      .filter((m): m is { id: string; role: string | null } => Boolean(m.id))
    const participants = [...new Set(refs.filter((m) => m.role !== 'driver').map((m) => m.id))]
    const primaries = refs.filter((m) => m.role === 'primary').map((m) => m.id)
    // A reminder belongs to whoever does it ("Pick up Photobook for Liv" is Jake's job);
    // an event belongs to everyone in it ("Jaida watching Owen and Emme" is both kids').
    const owners = event.event_type === 'reminder' && primaries.length > 0 ? primaries : participants

    if (event.all_day) {
      allDay.push({ sourceId: event.id, title: event.title, memberIds: participants })
      continue
    }
    // Nobody on it at all: no lane to draw it on, so it goes on the "No one yet" row (board 08a).
    if (refs.length === 0) nobody.push({ sourceId: event.id, title: event.title, start, end })

    const placeStatus = classifyPlace(event, homeAddress)
    if (placeStatus !== 'away') {
      for (const id of owners) {
        addSegment(id, { kind: 'activity', start, end, label: event.title, placeStatus, sourceId: event.id })
      }
      if (placeStatus === 'unknown') unplaced.push({ sourceId: event.id, title: event.title, at: start, memberIds: owners })
      continue
    }

    const legs = event.plan_override?.transportation_plan?.legs ?? []
    let driverId: string | null = null
    let driverSource: Trip['driverSource'] = null
    const planLeg = legs.find((l) => l.driverId || l.driverName?.trim())
    const planDriver = planLeg ? findMember(members, planLeg.driverId, planLeg.driverName) : null
    const roleDriver = refs.find((m) => m.role === 'driver')
    const canDrive = (id: string) => Boolean(members.find((m) => m.id === id)?.can_drive)
    if (planDriver) {
      driverId = planDriver.id
      driverSource = 'plan'
    } else if (roleDriver) {
      driverId = roleDriver.id
      driverSource = 'event_member'
    } else if (primaries.length === 1 && canDrive(primaries[0])) {
      driverId = primaries[0]
      driverSource = 'self'
    } else if (primaries.length === 0 && participants.length > 0 && participants.every(canDrive)) {
      driverId = participants[0]
      driverSource = 'self'
    }
    // Everyone going travels; a self-driver is one of them, so a parent driving
    // takes the kids along (who drives is decided above and doesn't change here).
    const travelerIds = participants

    const driveMinutes = event.enrichment?.drive_time_mins ?? null
    const appointment = legs.find((l) => l.purpose === 'appointment' && l.timing === 'arrive_by')
    const arriveAt = appointment ? legTime(appointment, start) : start
    // Enrichment departure times are AI-written and sometimes have the wrong date
    // or would arrive late; trust one only if it fits the hours just before arrival.
    const stored = event.enrichment?.departure_time ? new Date(event.enrichment.departure_time) : null
    const lead = stored ? (arriveAt.getTime() - stored.getTime()) / MINUTE : NaN
    const arrivesOnTime = stored != null && (driveMinutes == null || stored.getTime() + driveMinutes * MINUTE <= arriveAt.getTime())
    const departure = stored && lead >= 0 && lead <= MAX_PLAUSIBLE_LEAD_MIN && arrivesOnTime ? stored : null
    const departed = departedAt(`event:${event.id}`)
    const planned = departure ?? (driveMinutes != null ? addMinutes(arriveAt, -driveMinutes) : null)
    const leaveAt = departed && departed < arriveAt ? departed : planned
    const returnLeg = legs.find((l) => l.purpose === 'return')
    const returnAt = returnLeg ? legTime(returnLeg, end) : end
    const homeAt = driveMinutes != null ? addMinutes(returnAt, driveMinutes) : null

    const trip: Trip = {
      id: `event:${event.id}`,
      kind: 'outing',
      sourceId: event.id,
      source: 'event',
      title: event.title,
      travelerIds,
      driverId,
      driverSource,
      destination: { name: (event.location_name || event.address || '').trim(), address: event.address },
      leaveAt,
      arriveAt,
      homeAt,
      driveMinutes,
      weather: event.enrichment?.weather_at_event ?? null,
      departedAt: departed,
    }
    trips.push(trip)

    const onTheRoad = (id: string) => {
      if (leaveAt) addSegment(id, { kind: 'drive', start: leaveAt, end: arriveAt, label: event.title, placeStatus: 'away', sourceId: event.id, tripId: trip.id, driverId })
      if (homeAt) addSegment(id, { kind: 'drive', start: returnAt, end: homeAt, label: event.title, placeStatus: 'away', sourceId: event.id, tripId: trip.id, driverId })
    }
    for (const id of travelerIds) {
      addSegment(id, { kind: 'activity', start, end, label: event.title, placeStatus: 'away', sourceId: event.id })
      onTheRoad(id)
    }
    if (driverId && !travelerIds.includes(driverId)) onTheRoad(driverId)

    if (!driverId) gaps.push({ kind: 'no_driver', sourceId: event.id, title: event.title, at: leaveAt ?? arriveAt })
    if (participants.length === 0) gaps.push({ kind: 'no_person', sourceId: event.id, title: event.title, at: arriveAt })
  }

  // Trips away: the ride, the airport, the flight and the time away on each traveller's lane (canvas 19a–c).
  const travel: DayTravel[] = []
  for (const { trip, phase, dayIndex, dayCount } of travelDays) {
    const travellers = trip.memberIds
    const who = travellers.map(nameOf).join(' & ')
    const selfDriver = travellers.find((id) => members.find((m) => m.id === id)?.can_drive) ?? travellers[0] ?? null
    // To a minute before midnight: midnight itself reads as the start of the timeline, not its end.
    const clip = (d: Date) => new Date(Math.min(Math.max(d.getTime(), dayStart.getTime()), dayEnd.getTime() - MINUTE))
    const addFor = (ids: string[], travelPart: NonNullable<LaneSegment['travel']>, kind: LaneSegment['kind'], start: Date, end: Date, label: string, sourceId: string, extra: Partial<LaneSegment> = {}) => {
      const [s0, e0] = [clip(start), clip(end)]
      if (e0 <= s0) return
      for (const id of ids) addSegment(id, { kind, start: s0, end: e0, label, placeStatus: 'away', sourceId, travel: travelPart, ...extra })
    }
    const add = (travelPart: NonNullable<LaneSegment['travel']>, kind: LaneSegment['kind'], start: Date, end: Date, label: string, sourceId: string, extra: Partial<LaneSegment> = {}) =>
      addFor(travellers, travelPart, kind, start, end, label, sourceId, extra)
    const flightOf = (leg: NonNullable<TravelTrip['outbound']>) => ({ number: leg.number, from: leg.from, to: leg.to, departAt: leg.departAt, landAt: leg.landAt })
    const leaving = phase === 'leaving' || phase === 'day'
    const returning = phase === 'returning' || phase === 'day'
    const out = trip.outbound
    const back = trip.inbound
    // A trip by car (Jake: "driving for a work trip is good too"): the long drive out and back, no airport.
    if (trip.mode === 'drive') {
      if (leaving && out) {
        const ride: Trip = {
          id: `${trip.id}:out`, kind: 'outing', sourceId: out.eventId, source: 'event', title: `${who} to ${trip.city}`,
          travelerIds: travellers, driverId: selfDriver, driverSource: selfDriver ? 'self' : null,
          destination: { name: trip.city, address: null },
          leaveAt: out.departAt, arriveAt: out.landAt, homeAt: null, driveMinutes: Math.round((out.landAt.getTime() - out.departAt.getTime()) / MINUTE),
          departedAt: departedAt(`${trip.id}:out`),
          travel: { direction: 'out', way: 'drive_park', city: trip.city, mode: 'drive', flight: flightOf(out) },
        }
        trips.push(ride)
        add('drive', 'drive', out.departAt, out.landAt, `Drive to ${trip.city}`, out.eventId, { tripId: ride.id, driverId: selfDriver })
      }
      add('away', 'at_place', leaving && out ? out.landAt : dayStart, returning && back ? back.departAt : dayEnd, `Away · ${trip.city}`, trip.tripEventId ?? trip.id)
      if (returning && back) {
        const ride: Trip = {
          id: `${trip.id}:home`, kind: 'outing', sourceId: back.eventId, source: 'event', title: `${who} home from ${trip.city}`,
          travelerIds: travellers, driverId: selfDriver, driverSource: selfDriver ? 'self' : null,
          destination: { name: 'Home', address: null },
          leaveAt: back.departAt, arriveAt: back.landAt, homeAt: back.landAt, driveMinutes: Math.round((back.landAt.getTime() - back.departAt.getTime()) / MINUTE),
          travel: { direction: 'home', way: 'drive_park', city: trip.city, mode: 'drive', flight: flightOf(back) },
        }
        trips.push(ride)
        add('drive', 'drive', back.departAt, back.landAt, 'Drive home', back.eventId, { tripId: ride.id, driverId: selfDriver })
      }
    } else if (leaving && out && trip.leaveHomeAt && trip.atAirportAt) {
      // Their own way (Uber, their car) or someone driving them — who comes home again afterwards.
      const driver = ownCar(trip.wayOut) ? selfDriver : trip.driverOutId
      const driverBack = !ownCar(trip.wayOut) && driver ? new Date(trip.atAirportAt.getTime() + trip.driveOutMinutes * MINUTE) : null
      const ride: Trip = {
        id: `${trip.id}:out`, kind: 'outing', sourceId: out.eventId, source: 'event', title: `${who} to ${out.from}`,
        travelerIds: travellers, driverId: driver, driverSource: driver ? (ownCar(trip.wayOut) ? 'self' : 'plan') : null,
        destination: { name: `${out.from} airport`, address: null },
        leaveAt: trip.leaveHomeAt, arriveAt: trip.atAirportAt, homeAt: driverBack, driveMinutes: trip.driveOutMinutes,
        departedAt: departedAt(`${trip.id}:out`),
        travel: { direction: 'out', way: trip.wayOut, city: trip.city, mode: 'fly', flight: flightOf(out) },
      }
      trips.push(ride)
      const label = ownCar(trip.wayOut) ? `${WAY_WORD[trip.wayOut]} to ${out.from}` : `Drive ${who} to ${out.from}`
      add('drive', 'drive', trip.leaveHomeAt, trip.atAirportAt, label, out.eventId, { tripId: ride.id, driverId: driver })
      if (driver && !travellers.includes(driver)) addFor([driver], 'drive', 'drive', trip.leaveHomeAt, driverBack ?? trip.atAirportAt, label, out.eventId, { tripId: ride.id, driverId: driver })
      if (!driver) gaps.push({ kind: 'no_driver', sourceId: out.eventId, title: label, at: trip.leaveHomeAt })
      add('wait', 'at_place', trip.atAirportAt, out.departAt, `At ${out.from} · ${durationWords(trip.airportMinutes)}`, out.eventId)
      add('flight', 'activity', out.departAt, out.landAt, `${out.number ?? 'Flight'} → ${out.to}`, out.eventId)
    }
    if (trip.mode === 'fly') {
      add('away', 'at_place', leaving && out ? out.landAt : dayStart, returning && back ? back.departAt : dayEnd, `Away · ${trip.city}`, trip.tripEventId ?? trip.id)
    }
    if (trip.mode === 'fly' && returning && back && trip.offPlaneAt && trip.homeAt) {
      add('flight', 'activity', back.departAt, back.landAt, `${back.number ?? 'Flight'} → ${back.to}`, back.eventId)
      add('wait', 'at_place', back.landAt, trip.offPlaneAt, 'Off the plane', back.eventId)
      const driver = ownCar(trip.wayHome) ? selfDriver : trip.driverHomeId
      // Someone picking up leaves home to be there as they come out.
      const pickupLeaves = new Date(trip.offPlaneAt.getTime() - trip.driveHomeMinutes * MINUTE)
      const ride: Trip = {
        id: `${trip.id}:home`, kind: ownCar(trip.wayHome) ? 'outing' : 'pickup', sourceId: back.eventId, source: 'event',
        title: ownCar(trip.wayHome) ? `${who} home from ${back.to}` : `Pick up ${who} at ${back.to}`,
        travelerIds: travellers, driverId: driver, driverSource: driver ? (ownCar(trip.wayHome) ? 'self' : 'plan') : null,
        destination: { name: ownCar(trip.wayHome) ? 'Home' : `${back.to} airport`, address: null },
        leaveAt: ownCar(trip.wayHome) ? trip.offPlaneAt : pickupLeaves,
        arriveAt: ownCar(trip.wayHome) ? trip.homeAt : trip.offPlaneAt,
        homeAt: trip.homeAt, driveMinutes: trip.driveHomeMinutes,
        travel: { direction: 'home', way: trip.wayHome, city: trip.city, mode: 'fly', flight: flightOf(back) },
      }
      trips.push(ride)
      const label = ownCar(trip.wayHome) ? `${WAY_WORD[trip.wayHome]} home` : `Pick up ${who} at ${back.to}`
      add('drive', 'drive', trip.offPlaneAt, trip.homeAt, label, back.eventId, { tripId: ride.id, driverId: driver })
      if (driver && !travellers.includes(driver)) addFor([driver], 'drive', 'drive', pickupLeaves, trip.homeAt, label, back.eventId, { tripId: ride.id, driverId: driver })
      if (!driver) gaps.push({ kind: 'no_driver', sourceId: back.eventId, title: label, at: pickupLeaves })
    }
    allDay.push({ sourceId: trip.tripEventId ?? trip.id, title: `${who} in ${trip.city}`, memberIds: travellers, trip: { city: trip.city, dayIndex, dayCount, mode: trip.mode } })
    for (const memberId of travellers) {
      travel.push({ memberId, tripId: trip.id, city: trip.city, phase, mode: trip.mode, dayIndex, dayCount, leaveHomeAt: trip.leaveHomeAt, homeAt: trip.homeAt, trip })
    }
  }

  // A pickup that goes straight on to the next place is one trip (school → CityPlace):
  // same driver, a picked-up child is going there, and that trip would otherwise have
  // to leave home before the pickup is back. The drive from school is estimated with
  // the drive from home (the only drive time known for that place).
  for (const pickup of trips.filter((t) => t.kind === 'pickup' && t.driverId && t.homeAt)) {
    const next = trips.find((o) =>
      o.source === 'event' && !o.chainedFrom && !o.departedAt && o.driverId === pickup.driverId && o.leaveAt
      && o.travelerIds.some((id) => pickup.travelerIds.includes(id))
      && o.leaveAt < pickup.homeAt!
      && o.arriveAt.getTime() >= pickup.arriveAt.getTime() - CHAIN_EARLY_MIN * MINUTE)
    if (!next) continue
    const drive = next.driveMinutes ?? pickup.driveMinutes ?? 0
    const arrive = new Date(Math.max(next.arriveAt.getTime(), addMinutes(pickup.arriveAt, drive).getTime()))
    const onwardPlace = (next.destination.name || 'the next place').split(',')[0].trim()
    const label = `${pickup.title} → ${onwardPlace}`
    const goingOn = pickup.travelerIds.filter((id) => next.travelerIds.includes(id))
    for (const [memberId, segments] of lanes) {
      const own = memberId === pickup.driverId || goingOn.includes(memberId)
      if (!own) continue
      // The drive home from the pickup now runs on to the next place...
      for (const s of segments) {
        if (s.tripId === pickup.id && s.end.getTime() === pickup.homeAt!.getTime()) {
          s.end = arrive
          s.label = label
        }
      }
      // ...so the separate drive there from home goes.
      lanes.set(memberId, segments.filter((s) => !(s.tripId === next.id && s.end.getTime() === next.arriveAt.getTime())))
    }
    const lateBy = Math.round((arrive.getTime() - next.arriveAt.getTime()) / MINUTE)
    next.leaveAt = pickup.arriveAt
    next.chainedFrom = pickup.id
    if (lateBy > 0) next.arrivesLateBy = lateBy
    pickup.continuesTo = next.id
    pickup.onward = { place: onwardPlace, lateBy: Math.max(0, lateBy) }
    pickup.homeAt = addMinutes(arrive, drive)
  }

  // Separate outings to the same place at about the same time: one car could do both.
  const sharedDestinations: SharedDestination[] = []
  const outings = trips.filter((t) => t.source === 'event' && t.destination.name)
  const street = (t: Trip) => streetLine(t.destination.address, t.destination.name)
  const samePlace = (a: Trip, b: Trip) =>
    normalizePlace(a.destination.name) === normalizePlace(b.destination.name) || (street(a) != null && street(a) === street(b))
  const grouped = new Set<string>()
  for (const t of outings) {
    if (grouped.has(t.id)) continue
    const group = outings.filter((o) =>
      samePlace(o, t)
      && Math.abs(o.arriveAt.getTime() - t.arriveAt.getTime()) <= SHARED_ARRIVAL_WINDOW_MIN * MINUTE)
    if (group.length > 1) {
      group.forEach((g) => grouped.add(g.id))
      sharedDestinations.push({ tripIds: group.map((g) => g.id), destination: t.destination.name, arriveAt: t.arriveAt })
    }
  }

  // Work hours give way to the person's own drives at either end (dropping a child off on the way in).
  for (const [memberId, segments] of lanes) {
    const drives = segments.filter((s) => s.kind === 'drive' && s.driverId === memberId)
    for (const work of segments.filter((s) => s.work)) {
      // A drive across either end, or within the hour of it, moves that end; one in the middle is drawn over it.
      for (const drive of drives) {
        if (drive.end <= work.start || drive.start >= work.end) continue
        if (drive.start.getTime() - work.start.getTime() <= 60 * MINUTE) work.start = new Date(Math.max(work.start.getTime(), drive.end.getTime()))
        else if (work.end.getTime() - drive.end.getTime() <= 60 * MINUTE) work.end = new Date(Math.min(work.end.getTime(), drive.start.getTime()))
      }
    }
    lanes.set(memberId, segments.filter((s) => !s.work || s.end > s.start))
  }
  for (const segments of lanes.values()) segments.sort((a, b) => a.start.getTime() - b.start.getTime())
  trips.sort((a, b) => (a.leaveAt ?? a.arriveAt).getTime() - (b.leaveAt ?? b.arriveAt).getTime())

  const activeMemberIds = new Set<string>()
  for (const [id, segments] of lanes) if (segments.length > 0) activeMemberIds.add(id)
  for (const t of trips) {
    if (t.driverId) activeMemberIds.add(t.driverId)
    t.travelerIds.forEach((id) => activeMemberIds.add(id))
  }

  return { date, lanes, trips, activeMemberIds, unplaced, nobody, allDay, gaps, sharedDestinations, travel }
}
