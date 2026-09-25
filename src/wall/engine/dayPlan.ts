import type { FamilyRoutine } from '../../lib/familyRoutines'
import { applyTimeToDate, formatDisplayVenueName, getEstimatedDriveMinutes } from '../../lib/familyRoutines.ts'
import { isEventAtHome } from '../../lib/driverConflictEngine.ts'
import type {
  DayGap,
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
}

const MINUTE = 60_000
const SHARED_ARRIVAL_WINDOW_MIN = 30
/** A calendar event this close to a routine run, at the same school, is a synced copy of it. */
const ROUTINE_MIRROR_WINDOW_MIN = 15
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
  const allDay: DayPlan['allDay'] = []
  const nameOf = (id: string) => members.find((m) => m.id === id)?.name ?? 'Someone'

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
    const sourceId = routine.id ?? `routine:${routine.memberId}`
    const driveMinutes = getEstimatedDriveMinutes(routine.venueName, routine.venueAddress)
    addSegment(routine.memberId, {
      kind: 'at_place',
      start: day.start,
      end: day.end,
      label: formatDisplayVenueName(routine.venueName, routine.shortVenueName),
      placeStatus: 'away',
      sourceId,
    })
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
    const driverId = handedOff ? tripState.drivers[tripId] : run.driverId
    const names = run.travelerIds.map(nameOf).join(' & ')
    const title = `${run.kind === 'dropoff' ? 'Drop off' : 'Pick up'} ${names}`
    const departed = departedAt(tripId)
    const leaveAt = departed && departed < run.arriveAt ? departed : addMinutes(run.arriveAt, -run.driveMinutes)
    const homeAt = addMinutes(run.arriveAt, run.driveMinutes)
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
    }
    trips.push(trip)
    if (driverId) {
      addSegment(driverId, { kind: 'drive', start: leaveAt, end: homeAt, label: title, placeStatus: 'away', sourceId: run.sourceId, tripId: trip.id, driverId })
    } else {
      gaps.push({ kind: 'no_driver', sourceId: run.sourceId, title, at: leaveAt })
    }
    for (const travelerId of run.travelerIds) {
      const [start, end] = run.kind === 'dropoff' ? [leaveAt, run.arriveAt] : [run.arriveAt, homeAt]
      addSegment(travelerId, { kind: 'drive', start, end, label: title, placeStatus: 'away', sourceId: run.sourceId, tripId: trip.id, driverId })
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

    const refs = (event.members ?? [])
      .map((m) => ({ id: m.family_member_id ?? m.family_member?.id ?? null, role: m.role ?? null }))
      .filter((m): m is { id: string; role: string | null } => Boolean(m.id))
    const participants = refs.filter((m) => m.role !== 'driver').map((m) => m.id)
    const primaries = refs.filter((m) => m.role === 'primary').map((m) => m.id)
    const owners = primaries.length > 0 ? primaries : participants

    if (event.all_day) {
      allDay.push({ sourceId: event.id, title: event.title, memberIds: participants })
      continue
    }

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
    const travelerIds = driverSource === 'self' && driverId ? [driverId] : participants

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

  for (const segments of lanes.values()) segments.sort((a, b) => a.start.getTime() - b.start.getTime())
  trips.sort((a, b) => (a.leaveAt ?? a.arriveAt).getTime() - (b.leaveAt ?? b.arriveAt).getTime())

  const activeMemberIds = new Set<string>()
  for (const [id, segments] of lanes) if (segments.length > 0) activeMemberIds.add(id)
  for (const t of trips) {
    if (t.driverId) activeMemberIds.add(t.driverId)
    t.travelerIds.forEach((id) => activeMemberIds.add(id))
  }

  return { date, lanes, trips, activeMemberIds, unplaced, allDay, gaps, sharedDestinations }
}
