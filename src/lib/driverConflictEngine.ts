/**
 * Casa Tabor - Driver-Aware Conflict & Transit Engine
 * Evaluates schedule overlaps, transit requirements, and buffer cushions strictly per driver.
 */

import { parseISO } from 'date-fns'
import type { EventWithDetails } from '../hooks/useCalendarEvents'
import type { FamilyMember } from '../types'

export const DEFAULT_TRANSIT_TIME_MINUTES = 15
export const MIN_SAFE_BUFFER_MINUTES = 15

export interface DriverCommitment {
  eventId: string
  title: string
  driverId: string
  driverName: string
  driverColor: string
  driverAvatar: string
  startMin: number
  endMin: number
  startTimeStr: string
  endTimeStr: string
  driveTimeMin: number
  locationName: string
  rawEvent: EventWithDetails
}

export interface DriverConflictItem {
  type: 'OVERLAP' | 'TIGHT_TRANSIT'
  severity: 'CRITICAL' | 'WARNING'
  driverId: string
  driverName: string
  driverColor: string
  eventA: DriverCommitment
  eventB: DriverCommitment
  deficitMin?: number
  bufferMin?: number
  message: string
}

export interface DriverScheduleAnalysis {
  hasConflict: boolean
  hasCriticalConflict: boolean
  conflicts: DriverConflictItem[]
  driverSummaries: Array<{
    driverId: string
    driverName: string
    driverColor: string
    commitmentsCount: number
    commitments: DriverCommitment[]
  }>
}

/**
 * Extracts minutes from midnight from an ISO date string or Date object.
 */
export function getMinutesFromMidnight(dateOrIso: string | Date): number {
  try {
    const d = typeof dateOrIso === 'string' ? parseISO(dateOrIso) : dateOrIso
    return d.getHours() * 60 + d.getMinutes()
  } catch {
    return 0
  }
}

/**
 * Canonical driver resolution for any event across Casa Tabor.
 * Checks transportation plan overrides, driver overrides, event_members roles,
 * attendee capabilities, and default parent drivers.
 */
export function resolveEventDriver(
  evt: EventWithDetails | null | undefined,
  familyMembers: FamilyMember[] = [],
): { id: string | null; name: string } {
  if (!evt) return { id: null, name: 'Jake' }

  // 1. Check transportation plan override (Leg 1 / active driving leg)
  const planLegs = evt.plan_override?.transportation_plan?.legs
  if (Array.isArray(planLegs) && planLegs.length > 0) {
    const activeLeg = planLegs.find((l) => l.driverName && l.driverName.trim())
    if (activeLeg?.driverName) {
      const match = familyMembers.find(
        (m) =>
          m.name.toLowerCase() === activeLeg.driverName.toLowerCase() ||
          m.full_name?.toLowerCase() === activeLeg.driverName.toLowerCase(),
      )
      return { id: match?.id ?? null, name: activeLeg.driverName }
    }
  }

  // 2. Check driver_overrides in plan_override
  const overrideId = evt.plan_override?.driver_overrides?.[0] ?? evt.plan_override?.driver_overrides?.['0']
  if (overrideId) {
    const match = familyMembers.find((m) => m.id === overrideId)
    if (match) return { id: match.id, name: match.name }
  }

  // 3. Check event_members with role 'driver'
  const driverMember = evt.members?.find((m) => m.role === 'driver')?.family_member
  if (driverMember?.name) {
    return { id: driverMember.id, name: driverMember.name }
  }

  // 4. Check primary attendee or first member if they are a parent or can drive
  const primaryMember = evt.members?.find((m) => m.role === 'primary')?.family_member
  if (primaryMember?.name && (primaryMember.can_drive || primaryMember.role === 'parent')) {
    return { id: primaryMember.id, name: primaryMember.name }
  }

  const anyDriverMember = evt.members?.find((m) => m.family_member?.can_drive && m.family_member?.role === 'parent')?.family_member
  if (anyDriverMember?.name) {
    return { id: anyDriverMember.id, name: anyDriverMember.name }
  }

  // 5. Default household parent driver
  const parentDriver = familyMembers.find((m) => m.role === 'parent' && m.can_drive)
  return { id: parentDriver?.id ?? null, name: parentDriver?.name || 'Jake' }
}

/**
 * Evaluates driver commitments across events for a specific day and detects collisions.
 */
export function analyzeDriverSchedule(
  events: EventWithDetails[],
  familyMembers: FamilyMember[] = [],
): DriverScheduleAnalysis {
  const memberMap = new Map(familyMembers.map((m) => [m.id.toLowerCase(), m]))
  const nameToMember = new Map(familyMembers.map((m) => [m.name.toLowerCase(), m]))

  const driverCommitments = new Map<string, DriverCommitment[]>()

  events.forEach((evt) => {
    if (evt.all_day) return

    const { id: resolvedDriverId, name: effectiveDriverName } = resolveEventDriver(evt, familyMembers)
    if (!effectiveDriverName) return

    const normalizedDriverId =
      resolvedDriverId?.toLowerCase() ||
      nameToMember.get(effectiveDriverName.toLowerCase())?.id.toLowerCase() ||
      effectiveDriverName.toLowerCase()
    const resolvedMember =
      memberMap.get(normalizedDriverId) ||
      nameToMember.get(effectiveDriverName.toLowerCase()) ||
      null

    const startMin = getMinutesFromMidnight(evt.start_time)
    let endMin = getMinutesFromMidnight(evt.end_time)

    if (endMin <= startMin) {
      endMin = startMin + 45
    }

    const driveTimeMin = evt.enrichment?.drive_time_mins || DEFAULT_TRANSIT_TIME_MINUTES

    const commitment: DriverCommitment = {
      eventId: evt.id,
      title: evt.title,
      driverId: normalizedDriverId,
      driverName: resolvedMember?.name || effectiveDriverName || 'Driver',
      driverColor: resolvedMember?.color_hex || 'var(--color-casa-navy)',
      driverAvatar: resolvedMember?.name?.[0]?.toUpperCase() || 'D',
      startMin,
      endMin,
      startTimeStr: evt.start_time,
      endTimeStr: evt.end_time,
      driveTimeMin,
      locationName: evt.location_name || evt.address || 'Local',
      rawEvent: evt,
    }

    if (!driverCommitments.has(normalizedDriverId)) {
      driverCommitments.set(normalizedDriverId, [])
    }
    driverCommitments.get(normalizedDriverId)!.push(commitment)
  })

  const conflicts: DriverConflictItem[] = []
  const driverSummaries: DriverScheduleAnalysis['driverSummaries'] = []

  driverCommitments.forEach((commitments, driverId) => {
    // Sort chronologically
    commitments.sort((a, b) => a.startMin - b.startMin)

    const driverName = commitments[0].driverName
    const driverColor = commitments[0].driverColor

    for (let i = 0; i < commitments.length - 1; i++) {
      const current = commitments[i]
      const next = commitments[i + 1]

      const gapMin = next.startMin - current.endMin
      const neededTransit = next.driveTimeMin || DEFAULT_TRANSIT_TIME_MINUTES
      const bufferMin = gapMin - neededTransit

      if (bufferMin < 0) {
        conflicts.push({
          type: 'OVERLAP',
          severity: 'CRITICAL',
          driverId,
          driverName,
          driverColor,
          eventA: current,
          eventB: next,
          deficitMin: Math.abs(bufferMin),
          message: `${driverName} has a direct conflict: "${current.title}" ends while "${next.title}" requires departure with ~${neededTransit}m drive.`,
        })
      } else if (bufferMin < MIN_SAFE_BUFFER_MINUTES) {
        conflicts.push({
          type: 'TIGHT_TRANSIT',
          severity: 'WARNING',
          driverId,
          driverName,
          driverColor,
          eventA: current,
          eventB: next,
          bufferMin,
          message: `Tight transit for ${driverName}: Only ${bufferMin}m cushion between "${current.title}" and "${next.title}".`,
        })
      }
    }

    driverSummaries.push({
      driverId,
      driverName,
      driverColor,
      commitmentsCount: commitments.length,
      commitments,
    })
  })

  return {
    hasConflict: conflicts.length > 0,
    hasCriticalConflict: conflicts.some((c) => c.severity === 'CRITICAL'),
    conflicts,
    driverSummaries,
  }
}
