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

export type EventMode = 'travel' | 'pickup' | 'hosted' | 'trip'

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
  pattern: string
  twoDrivers: boolean
  yourTime: string | null
  legs: DerivedLeg[]
  /** navy header summary line, e.g. "Leave 10:02 · back ~10:47" */
  headline: string | null
}

const FALLBACK_COLOR = '#8A8A8A'

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
  const attendees = event.members ?? []
  const parentAttendee = attendees.find((m) => m.family_member?.role === 'parent')
  if (parentAttendee) return toDerivedPerson(parentAttendee.family_member)

  const householdParent = household.find((m) => m.role === 'parent')
  if (householdParent) return toDerivedPerson(householdParent)

  const primary = attendees.find((m) => m.role === 'primary') ?? attendees[0]
  return toDerivedPerson(primary?.family_member)
}

// ── Mode inference ───────────────────────────────────────────────────────────

const PICKUP_KEYWORDS = /\b(pick[\s-]?up|pickup|dismissal|carpool|drop[\s-]?off|car line|carline)\b/i
const TRIP_KEYWORDS = /\b(trip|outing|camp|scalloping|excursion|road trip|day trip|festival|fair|beach|park day)\b/i
const HOSTED_KEYWORDS = /\b(sitter|babysitter|nanny|plumber|delivery|repair|technician|cleaner|handyman|contractor|at home|home visit)\b/i
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

  // 1. Hosted — at home / no location, or hosted-service keywords/category.
  if (HOSTED_CATEGORIES.has(category)) return 'hosted'
  if (HOSTED_KEYWORDS.test(title)) return 'hosted'
  if (!event.all_day && isAtHome(event, opts?.homeName)) return 'hosted'

  // 2. Trip — long duration, trip categories, all-day, or trip keywords.
  if (event.all_day) return 'trip'
  if (durationH >= 4) return 'trip'
  if (TRIP_CATEGORIES.has(category)) return 'trip'
  if (TRIP_KEYWORDS.test(title)) return 'trip'

  // 3. Pickup — collect/drop a person.
  if (PICKUP_KEYWORDS.test(title)) return 'pickup'

  // 4. Default — a there-and-back travel event.
  return 'travel'
}

/** Default "someone waits on site" for a travel event's stay leg. */
function defaultWaits(event: EventWithDetails): boolean {
  const category = event.enrichment?.category ?? ''
  // Medical/appointment → a parent typically waits. Drop-off activities/pets → not.
  if (category === 'medical' || category === 'appointment') return true
  if (category === 'sports' || category === 'school') return false
  return false
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

function driveDetail(eta: TravelEtaResult | null | undefined, prefix: string): string {
  if (!eta?.found) return prefix
  const parts: string[] = []
  const drive = eta.drive_time_mins ?? eta.base_drive_time_mins
  if (drive) parts.push(`${Math.round(drive)} min`)
  if (eta.distance_miles) parts.push(`${eta.distance_miles.toFixed(1)} mi`)
  return parts.length ? `${prefix} · ${parts.join(' · ')}` : prefix
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
  const leaveBy = fmtTime(eta?.leave_by) ?? fmtTime(event.start_time)
  const startTime = fmtTime(event.start_time)
  const endTime = fmtTime(event.end_time)

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
      return [
        {
          kind: 'pickup',
          title: 'Pick up',
          detail: driveDetail(eta, startTime ? `Arrive ${startTime}` : 'Pickup'),
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
          detail: driveDetail(eta, leaveBy ? `Leave home ${leaveBy}` : 'Depart'),
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
          detail: endTime ? `~${endTime}` : 'return',
          driver,
        },
      ]
    }

    case 'travel':
    default: {
      const waits = defaultWaits(event)
      const child = eventAttendees(event).find((p) => p.role !== 'parent') ?? null
      const stayTitle = waits
        ? `${driver?.name ?? 'Driver'} waits on site`
        : `${child?.name ?? 'Stays'} stays`
      return [
        {
          kind: 'drop',
          title: waits ? 'Drive there' : 'Drop off',
          detail: driveDetail(eta, leaveBy ? `Leave home ${leaveBy}` : 'Drive there'),
          driver,
          trafficDeltaMin: trafficDelta,
          estimate,
        },
        {
          kind: 'stay',
          title: stayTitle,
          detail: startTime && endTime
            ? `${startTime}–${endTime}${waits ? '' : ' · no parent needed'}`
            : null,
          driver: waits ? driver : null,
          waits,
        },
        {
          kind: 'pickup',
          title: waits ? 'Head home' : 'Pick up',
          detail: endTime ? `~${endTime}` : 'return',
          driver,
          estimate,
        },
      ]
    }
  }
}

export function derivePlan(event: EventWithDetails, mode: EventMode, opts: DeriveOpts): PlanModel {
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
    pattern = 'Pickup only'
  } else if (dropLeg) {
    pattern = 'Drop & go'
  }

  const yourTime = deriveYourTime(pattern, {
    driver: dropDriver ?? pickDriver ?? null,
    dropDriver: dropDriver ?? null,
    pickDriver: pickDriver ?? null,
    stayLeg,
  })

  const headline = deriveHeadline(mode, legs)

  return { mode, pattern, twoDrivers, yourTime, legs, headline }
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
    case 'At home':
      return `No driving. ${d} is free once the point person takes over.`
    case 'Day trip':
      return `${d} drives both ways — pack for the day.`
    default:
      return null
  }
}

function deriveHeadline(mode: EventMode, legs: DerivedLeg[]): string | null {
  if (mode === 'hosted') {
    const host = legs.find((l) => l.kind === 'host')
    return host?.detail ?? null
  }
  const dropLeg = legs.find((l) => l.kind === 'drop' || l.kind === 'depart')
  const pickLeg = legs.find((l) => l.kind === 'pickup' || l.kind === 'return')
  const dropTime = extractTime(dropLeg?.detail)
  const pickTime = extractTime(pickLeg?.detail)
  if (dropTime && pickTime) return `Leave ${dropTime} · back ~${pickTime}`
  if (dropTime) return `Leave ${dropTime}`
  if (pickTime) return `Pick up ${pickTime}`
  return null
}

function extractTime(detail: string | null | undefined): string | null {
  if (!detail) return null
  const m = detail.match(/(\d{1,2}:\d{2}\s?(?:AM|PM))/i)
  return m ? m[1].replace(/\s+/g, ' ') : null
}
