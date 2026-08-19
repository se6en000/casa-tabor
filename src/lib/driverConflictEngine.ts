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

    // Find assigned driver from members or enrichment
    const driverMemberObj = evt.members?.find((m) => m.role === 'driver')?.family_member
    let driverName = driverMemberObj?.name || (evt.enrichment as { driver_name?: string | null } | null)?.driver_name || null
    let driverId = driverMemberObj?.id || null

    if (!driverName && !driverId) {
      // Fallback: check if primary attendee is a parent driver
      const primaryAttendee = evt.members?.find((m) => m.role === 'primary')?.family_member || evt.members?.[0]?.family_member
      if (primaryAttendee && primaryAttendee.role === 'parent') {
        driverName = primaryAttendee.name
        driverId = primaryAttendee.id
      }
    }

    if (!driverName && !driverId) return

    const effectiveDriverName = driverName || 'Driver'
    const normalizedDriverId =
      driverId?.toLowerCase() ||
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
      driverName: resolvedMember?.name || driverName || 'Driver',
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
