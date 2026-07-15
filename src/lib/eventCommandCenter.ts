// ── Event Command Center: derivation logic (Phase 1, read-only) ──────────────
//
// Pure functions that turn a calendar event + its attendees + a single live
// travel ETA into the "block engine" view model described in the Event Command
// Center design handoff. Everything here is DERIVED, never stored: the mode,
// the legs, the pattern label, the two-driver flag, and the "your time" line
// are recomputed on every render.
//
// Phase 1 scope: legs are read-only. Drivers are best-effort derived from the
// event's parent attendees; per-leg reassignment and the "someone waits" toggle
// arrive in Phase 2.

import type { EventWithDetails } from '../hooks/useCalendarEvents'
import type { FamilyMember } from '../types'
import type { TravelEtaResult } from '../hooks/useTravelEta'

export type EventMode = 'appointment' | 'pickup' | 'hosted' | 'trip'
export type EventPlanKind = 'travel' | 'at_home' | 'coverage' | 'remote' | 'details'

export type LegKind = 'drop' | 'pickup' | 'depart' | 'return' | 'stay' | 'host'

export interface DerivedPerson {
  id: string
  name: string
  initial: string
  color: string
  role?: string
}

export interface DerivedLeg {
  kind: LegKind
  title: string
  detail: string | null
  driver?: DerivedPerson | null
  /** stay legs only — is a parent waiting on site */
  waits?: boolean
  /** live traffic delta (minutes) for driving legs, if known */
  trafficDeltaMin?: number | null
  /** true when drive figures are still estimates (address unverified) */
  estimate?: boolean
}

export interface TrafficPill {
  tone: 'clear' | 'light' | 'heavy'
  label: string
}

export interface PlanModel {
  mode: EventMode
  kind: EventPlanKind
  pattern: string
  twoDrivers: boolean
  yourTime: string | null
  legs: DerivedLeg[]
  /** navy header summary line, e.g. "Leave 10:02 · back ~10:47" */
  headline: string | null
}

const FALLBACK_COLOR = 'var(--color-casa-muted)'

// ── Person helpers ───────────────────────────────────────────────────────────

export function toDerivedPerson(fm: Pick<FamilyMember, 'id' | 'name' | 'color_hex' | 'role'> | null | undefined): DerivedPerson | null {
  if (!fm) return null
  return {
    id: fm.id,
    name: fm.name,
    initial: fm.name?.[0]?.toUpperCase() ?? '?',
    color: fm.color_hex ?? FALLBACK_COLOR,
    role: fm.role,
  }
}

export function eventAttendees(event: EventWithDetails): DerivedPerson[] {
  const sorted = [...(event.members ?? [])].sort((a, b) =>
    a.role === 'primary' ? -1 : b.role === 'primary' ? 1 : 0,
  )
  return sorted
    .map((m) => toDerivedPerson(m.family_member))
    .filter((p): p is DerivedPerson => p !== null)
}

/** Accent color for the eyebrow dot + map pin — the primary attendee's color. */
export function eventAccentColor(event: EventWithDetails): string {
  const primary = event.members?.find((m) => m.role === 'primary') ?? event.members?.[0]
  return primary?.family_member?.color_hex ?? FALLBACK_COLOR
}

/**
 * Best-effort driver for Phase 1: first parent attendee, else any household
 * parent, else the primary attendee. Not editable yet (Phase 2).
 */
function deriveDriver(event: EventWithDetails, household: FamilyMember[]): DerivedPerson | null {
  const canDrive = (member: Pick<FamilyMember, 'role' | 'can_drive'> | null | undefined): boolean => {
    if (!member) return false
    if (member.role === 'child') return false
    return member.can_drive ?? (member.role === 'parent' || member.role === 'caregiver')
  }

  const attendees = event.members ?? []
  const parentAttendee = attendees.find((m) => {
    const role = m.family_member?.role
    return (role === 'parent' || role === 'caregiver') && canDrive(m.family_member)
  })
  if (parentAttendee) return toDerivedPerson(parentAttendee.family_member)

  const householdParent = household.find((m) => (m.role === 'parent' || m.role === 'caregiver') && canDrive(m))
  if (householdParent) return toDerivedPerson(householdParent)

  const primary = attendees.find((m) => m.role === 'primary' && canDrive(m.family_member))
    ?? attendees.find((m) => canDrive(m.family_member))
    ?? attendees[0]
  return toDerivedPerson(primary?.family_member)
}

// ── Mode inference ───────────────────────────────────────────────────────────

const PICKUP_KEYWORDS = /\b(pick[\s-]?up|pickup|dismissal|carpool|drop[\s-]?off|car line|carline)\b/i
const PICKUP_INTENT_KEYWORDS = /\b(pick[\s-]?up|pickup|collect|dismissal|car line|carline)\b/i
const DROPOFF_INTENT_KEYWORDS = /\b(drop[\s-]?off|dropoff|hand[\s-]?off|deliver)\b/i
const TRIP_KEYWORDS = /\b(trip|outing|camp|scalloping|excursion|road trip|day trip|festival|fair|beach|park day)\b/i
const HOSTED_KEYWORDS = /\b(sitter|babysitter|nanny|plumber|delivery|repair|technician|cleaner|handyman|contractor|at home|home visit)\b/i
const COVERAGE_KEYWORDS = /\b(sitter|babysitter|nanny|caregiver|childcare|watching|watch(?:es)?|caring for)\b/i
const LOCATION_ONLY_KEYWORDS = /\b(sleep[\s-]?over|overnight stay|field trip|team bus)\b/i
const REMOTE_KEYWORDS = /\b(zoom|google meet|microsoft teams|facetime|video call|virtual|online|remote|phone call)\b/i
const HOSTED_CATEGORIES = new Set(['home_maintenance'])
const TRIP_CATEGORIES = new Set(['travel', 'holiday'])

function eventDurationHours(event: EventWithDetails): number {
  if (!event.start_time || !event.end_time) return 0
  const start = new Date(event.start_time).getTime()
  const end = new Date(event.end_time).getTime()
  if (Number.isNaN(start) || Number.isNaN(end)) return 0
  return Math.max(0, (end - start) / 3_600_000)
}

/** Does the event happen at home / have no travel destination? */
function isAtHome(event: EventWithDetails, homeName?: string | null): boolean {
  const hasDestination = Boolean(event.address || event.location_name)
  if (!hasDestination) return true
  const loc = (event.location_name ?? '').toLowerCase()
  if (loc.includes('home')) return true
  if (homeName && loc.includes(homeName.toLowerCase())) return true
  return false
}

export function inferEventMode(event: EventWithDetails, opts?: { homeName?: string | null }): EventMode {
  const title = event.title ?? ''
  const category = event.enrichment?.category ?? ''
  const durationH = eventDurationHours(event)

  // 1. Hosted — no destination or clearly at-home location.
  if (isAtHome(event, opts?.homeName)) return 'hosted'
  if (HOSTED_CATEGORIES.has(category) || HOSTED_KEYWORDS.test(title)) return 'hosted'

  // 2. Trip — long duration, trip categories, all-day, or trip keywords.
  if (event.all_day) return 'trip'
  if (durationH >= 4) return 'trip'
  if (TRIP_CATEGORIES.has(category)) return 'trip'
  if (TRIP_KEYWORDS.test(title)) return 'trip'

  // 3. Pickup — collect/drop a person.
  if (PICKUP_KEYWORDS.test(title)) return 'pickup'

  // 4. Default — a there-and-back appointment event.
  return 'appointment'
}

export function inferEventPlanKind(
  event: EventWithDetails,
  mode: EventMode,
  opts?: { homeName?: string | null },
): EventPlanKind {
  const title = event.title ?? ''
  const location = event.location_name ?? ''
  const address = event.address ?? ''
  const searchable = `${title} ${location} ${address}`
  if (REMOTE_KEYWORDS.test(searchable) || /https?:\/\//i.test(searchable)) return 'remote'
  if (COVERAGE_KEYWORDS.test(title)) return 'coverage'
  if (LOCATION_ONLY_KEYWORDS.test(title)) return 'details'
  if (isAtHome(event, opts?.homeName)) {
    const explicitlyAtHome = /\b(at home|home visit)\b/i.test(`${title} ${location}`)
    const hostedAtHome = HOSTED_CATEGORIES.has(event.enrichment?.category ?? '') || HOSTED_KEYWORDS.test(title)
    return explicitlyAtHome || hostedAtHome ? 'at_home' : 'details'
  }
  return mode === 'hosted' ? 'at_home' : 'travel'
}

function inferSingleStopIntent(title: string): 'pickup' | 'dropoff' | 'mixed' {
  const hasPickup = PICKUP_INTENT_KEYWORDS.test(title)
  const hasDropoff = DROPOFF_INTENT_KEYWORDS.test(title)
  if (hasPickup && hasDropoff) return 'mixed'
  if (hasDropoff) return 'dropoff'
  return 'pickup'
}

export function deriveSingleStopPattern(legTitle: string | null | undefined): 'Pickup only' | 'Drop-off only' | 'Pickup / Drop-off' {
  const normalized = legTitle?.toLowerCase() ?? ''
  const hasPickup = normalized.includes('pick up') || normalized.includes('pickup')
  const hasDropoff = normalized.includes('drop off') || normalized.includes('drop-off')
  if (hasPickup && hasDropoff) return 'Pickup / Drop-off'
  if (hasDropoff) return 'Drop-off only'
  return 'Pickup only'
}

// ── Traffic ──────────────────────────────────────────────────────────────────

export function trafficPill(deltaMin: number | null | undefined): TrafficPill | null {
  if (deltaMin == null || Number.isNaN(deltaMin)) return null
  if (deltaMin <= 0) return { tone: 'clear', label: 'traffic clear' }
  if (deltaMin <= 6) return { tone: 'light', label: `+${deltaMin} min traffic` }
  return { tone: 'heavy', label: `+${deltaMin} min · heavy` }
}

// ── Time formatting ──────────────────────────────────────────────────────────

function fmtTime(iso: string | null | undefined): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

function fmtTimeFromDate(date: Date | null | undefined): string | null {
  if (!date) return null
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

function addMinutesToIso(iso: string | null | undefined, minutes: number | null | undefined): string | null {
  if (!iso || minutes == null || Number.isNaN(minutes)) return null
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  return fmtTimeFromDate(new Date(date.getTime() + minutes * 60_000))
}

function driveDetail(eta: TravelEtaResult | null | undefined, prefix: string): string {
  if (!eta?.found) return prefix
  const parts: string[] = []
  const drive = eta.drive_time_mins ?? eta.base_drive_time_mins
  if (drive) parts.push(`${Math.round(drive)} min`)
  if (eta.distance_miles) parts.push(`${eta.distance_miles.toFixed(1)} mi`)
  return parts.length ? `${prefix} · ${parts.join(' · ')}` : prefix
}

function returnHomeDetail(
  eventEndIso: string | null | undefined,
  eta: TravelEtaResult | null | undefined,
  fallbackLabel: string,
  allDay?: boolean,
): string {
  if (allDay) return fallbackLabel
  const leaveAt = fmtTime(eventEndIso)
  const driveMins = eta?.found ? eta.drive_time_mins ?? eta.base_drive_time_mins ?? null : null
  const arriveHome = addMinutesToIso(eventEndIso, driveMins)
  const parts: string[] = []
  if (leaveAt) parts.push(`Leave at ${leaveAt}`)
  else parts.push(fallbackLabel)
  if (arriveHome) parts.push(`arrive home ~${arriveHome}`)
  if (driveMins != null) parts.push(`${Math.round(driveMins)} min`)
  return parts.join(' · ')
}

// ── Leg + pattern derivation ─────────────────────────────────────────────────

export interface DeriveOpts {
  household: FamilyMember[]
  eta?: TravelEtaResult | null
  verified?: boolean
  homeName?: string | null
}

export function deriveLegs(event: EventWithDetails, mode: EventMode, opts: DeriveOpts): DerivedLeg[] {
  const driver = deriveDriver(event, opts.household)
  const eta = opts.eta
  const estimate = opts.verified === false
  const trafficDelta = eta?.found ? eta.traffic_delay_mins ?? null : null
  const allDay = Boolean(event.all_day)
  const leaveBy = allDay ? null : (fmtTime(eta?.leave_by) ?? fmtTime(event.start_time))
  const startTime = allDay ? 'All day' : fmtTime(event.start_time)
  const endTime = allDay ? null : fmtTime(event.end_time)

  switch (mode) {
    case 'hosted': {
      const pointPerson = eventAttendees(event).find((p) => p.role !== 'parent') ?? null
      return [
        {
          kind: 'host',
          title: `Hand off${pointPerson ? ` to ${pointPerson.name}` : ''}`,
          detail: startTime ? `${startTime} · at home` : 'at home',
          driver,
        },
        {
          kind: 'host',
          title: `${driver?.name ?? 'Point person'} covers`,
          detail: startTime && endTime ? `${startTime}–${endTime}` : null,
          driver: pointPerson ?? driver,
        },
      ]
    }

    case 'pickup': {
      const singleStopIntent = inferSingleStopIntent(event.title ?? '')
      const pickupTitle =
        singleStopIntent === 'dropoff'
          ? 'Drop off'
          : singleStopIntent === 'mixed'
            ? 'Drop off / pick up'
            : 'Pick up'
      
      // Build detail: show "Leave home X · arrive appointment Y" for clarity
      let pickupDetailPrefix: string
      if (singleStopIntent === 'dropoff') {
        // Drop-off: emphasize the deadline
        pickupDetailPrefix = startTime ? `Drop off by ${startTime}` : 'Drop-off'
      } else if (singleStopIntent === 'mixed') {
        // Mixed: show travel window
        pickupDetailPrefix = startTime 
          ? (leaveBy && leaveBy !== startTime ? `Leave ${leaveBy} · arrive ${startTime}` : `Arrive ${startTime}`)
          : 'Pickup / drop-off'
      } else {
        // Single pickup: show travel window
        pickupDetailPrefix = startTime
          ? (leaveBy && leaveBy !== startTime ? `Leave home ${leaveBy} · pick up ${startTime}` : `Arrive at ${startTime}`)
          : 'Pickup'
      }
      
      return [
        {
          kind: 'pickup',
          title: pickupTitle,
          detail: driveDetail(eta, pickupDetailPrefix),
          driver,
          trafficDeltaMin: trafficDelta,
          estimate,
        },
      ]
    }

    case 'trip': {
      return [
        {
          kind: 'depart',
          title: 'Depart',
          detail: driveDetail(eta, leaveBy ? `Leave home by ${leaveBy}` : 'Depart'),
          driver,
          trafficDeltaMin: trafficDelta,
          estimate,
        },
        {
          kind: 'stay',
          title: 'On the way / on site',
          detail: startTime && endTime ? `${startTime}–${endTime}` : 'whole crew',
          driver: null,
        },
        {
          kind: 'return',
          title: 'Head home',
          detail: returnHomeDetail(event.end_time, eta, endTime ? `Leave at ${endTime}` : 'Return home', allDay),
          driver,
        },
      ]
    }

    case 'appointment':
    default: {
      const stayTitle = `${driver?.name ?? 'Driver'} waits on site`
      return [
        {
          kind: 'drop',
          title: 'Drive there',
          detail: driveDetail(eta, leaveBy ? `Leave home ${leaveBy}` : 'Drive there'),
          driver,
          trafficDeltaMin: trafficDelta,
          estimate,
        },
        {
          kind: 'stay',
          title: stayTitle,
          detail: startTime && endTime
            ? `${startTime}–${endTime}`
            : null,
          driver,
          waits: true,
        },
        {
          kind: 'pickup',
          title: 'Drive home',
          detail: returnHomeDetail(event.end_time, eta, endTime ? `Leave at ${endTime}` : 'Return home', allDay),
          driver,
          estimate,
        },
      ]
    }
  }
}

export function derivePlan(event: EventWithDetails, mode: EventMode, opts: DeriveOpts): PlanModel {
  const kind = inferEventPlanKind(event, mode, opts)
  if (kind !== 'travel') {
    const startTime = event.all_day ? 'All day' : fmtTime(event.start_time)
    const endTime = event.all_day ? null : fmtTime(event.end_time)
    const timeWindow = startTime && endTime ? `${startTime}–${endTime}` : startTime
    const context =
      kind === 'at_home' ? 'at home'
      : kind === 'coverage' ? (event.location_name || event.address ? 'care coverage' : 'at-home coverage')
      : kind === 'remote' ? 'remote'
      : 'no travel needed'
    const pattern =
      kind === 'at_home' ? 'At home'
      : kind === 'coverage' ? 'Coverage'
      : kind === 'remote' ? 'Remote'
      : 'Event details'
    return {
      mode,
      kind,
      pattern,
      twoDrivers: false,
      yourTime: null,
      legs: [],
      headline: [timeWindow, context].filter(Boolean).join(' · '),
    }
  }
  const legs = deriveLegs(event, mode, opts)
  const dropLeg = legs.find((l) => l.kind === 'drop' || l.kind === 'depart')
  const pickLeg = legs.find((l) => l.kind === 'pickup' || l.kind === 'return')
  const stayLeg = legs.find((l) => l.kind === 'stay')
  const waits = stayLeg?.waits ?? false

  const dropDriver = dropLeg?.driver?.name
  const pickDriver = pickLeg?.driver?.name

  let pattern = 'Plan'
  let twoDrivers = false

  if (mode === 'hosted') {
    pattern = 'At home'
  } else if (mode === 'trip') {
    pattern = 'Day trip'
    twoDrivers = Boolean(dropDriver && pickDriver && dropDriver !== pickDriver)
  } else if (dropLeg && pickLeg) {
    if (waits) pattern = 'Stay & wait'
    else if (dropDriver && pickDriver && dropDriver === pickDriver) pattern = 'Drop & return'
    else if (dropDriver && pickDriver) { pattern = 'Drop & pickup'; twoDrivers = true }
    else pattern = 'Drop & return'
  } else if (pickLeg) {
    pattern = deriveSingleStopPattern(pickLeg.title)
  } else if (dropLeg) {
    pattern = 'Drop & go'
  }

  const yourTime = deriveYourTime(pattern, {
    driver: dropDriver ?? pickDriver ?? null,
    dropDriver: dropDriver ?? null,
    pickDriver: pickDriver ?? null,
    stayLeg,
  })

  const eta = opts.eta
  const leaveBy = event.all_day ? null : (fmtTime(eta?.leave_by) ?? fmtTime(event.start_time))
  const returnHomeAt = event.all_day
    ? null
    : addMinutesToIso(event.end_time, eta?.found ? eta.drive_time_mins ?? eta.base_drive_time_mins ?? null : null)
  const headline = deriveHeadline(mode, legs, { leaveBy, returnHomeAt, isSingleStop: !dropLeg && Boolean(pickLeg) })

  return { mode, kind, pattern, twoDrivers, yourTime, legs, headline }
}

function deriveYourTime(
  pattern: string,
  ctx: {
    driver: string | null
    dropDriver: string | null
    pickDriver: string | null
    stayLeg?: DerivedLeg
  },
): string | null {
  const d = ctx.driver ?? 'The driver'
  switch (pattern) {
    case 'Stay & wait':
      return `${d} is committed the full visit.`
    case 'Drop & return':
      return `Same driver both ways — ${d} is free in between.`
    case 'Drop & pickup':
      return `Split between ${ctx.dropDriver ?? 'one'} & ${ctx.pickDriver ?? 'another'} — nobody's stuck the whole time.`
    case 'Pickup only':
      return `One quick pickup by ${d}.`
    case 'Drop-off only':
      return `One quick drop-off by ${d}.`
    case 'Pickup / Drop-off':
      return `Quick pickup/drop-off run by ${d}.`
    case 'At home':
      return `No driving. ${d} is free once the point person takes over.`
    case 'Day trip':
      return `${d} drives both ways — pack for the day.`
    default:
      return null
  }
}

function deriveHeadline(
  mode: EventMode,
  legs: DerivedLeg[],
  ctx?: { leaveBy?: string | null; returnHomeAt?: string | null; isSingleStop?: boolean }
): string | null {
  if (mode === 'hosted') {
    const host = legs.find((l) => l.kind === 'host')
    return host?.detail ?? null
  }

  const dropLeg = legs.find((l) => l.kind === 'drop' || l.kind === 'depart')
  const pickLeg = legs.find((l) => l.kind === 'pickup' || l.kind === 'return')
  const dropTime = extractTime(dropLeg?.detail)
  const pickTime = extractTime(pickLeg?.detail)

  // Both drop and pickup: emphasize "leave by" for clarity (departure deadline drives urgency)
  if (dropTime && pickTime) {
    if (ctx?.returnHomeAt) return `Leave by ${dropTime} · back home ~${ctx.returnHomeAt}`
    return `Leave by ${dropTime} · back ~${pickTime}`
  }

  // Drop/depart only: "leave by" (this is the calculated departure time)
  if (dropTime) return `Leave by ${dropTime}`

  // Single-stop pickup/return: use calculated leaveBy, not appointment time
  if (pickTime && ctx?.isSingleStop && ctx?.leaveBy) {
    const singleStopPattern = deriveSingleStopPattern(pickLeg?.title)
    if (ctx.returnHomeAt) {
      if (singleStopPattern === 'Drop-off only') return `Leave by ${ctx.leaveBy} · arrive home ~${ctx.returnHomeAt}`
      if (singleStopPattern === 'Pickup / Drop-off') return `Leave by ${ctx.leaveBy} · arrive home ~${ctx.returnHomeAt}`
      return `Leave by ${ctx.leaveBy} · arrive home ~${ctx.returnHomeAt}`
    }
    
    // Show "Leave by X · drop off at Y" for clarity on both times
    if (singleStopPattern === 'Drop-off only') return `Leave by ${ctx.leaveBy} · drop off ~${pickTime}`
    if (singleStopPattern === 'Pickup / Drop-off') return `Leave by ${ctx.leaveBy} · arrive ~${pickTime}`
    return `Leave by ${ctx.leaveBy} · pick up ~${pickTime}`
  }

  // Fallback if no leaveBy context (shouldn't normally happen)
  if (pickTime) {
    const singleStopPattern = deriveSingleStopPattern(pickLeg?.title)
    if (singleStopPattern === 'Drop-off only') return `Drop off by ${pickTime}`
    if (singleStopPattern === 'Pickup / Drop-off') return `Pickup / drop-off ${pickTime}`
    return `Pick up at ${pickTime}`
  }

  return null
}

function extractTime(detail: string | null | undefined): string | null {
  if (!detail) return null
  const m = detail.match(/(\d{1,2}:\d{2}\s?(?:AM|PM))/i)
  return m ? m[1].replace(/\s+/g, ' ') : null
}
