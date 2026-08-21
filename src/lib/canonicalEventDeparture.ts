/**
 * Casa Tabor - Canonical Event Departure & Transit Intelligence
 * Single source of truth for departure times, drive durations, and buffer cushions across all widgets and sidecars.
 */

import { format, parseISO } from 'date-fns'
import type { EventWithDetails } from '../hooks/useCalendarEvents'
import { isEventAtHome } from './driverConflictEngine.ts'

export interface CanonicalDepartureInfo {
  isDriving: boolean
  isAtHome: boolean
  departureDate: Date | null
  arrivalDate: Date | null
  driveMinutes: number
  bufferMinutes: number
  distanceMiles: number
  routeSummary: string | null
  formattedLeaveBy: string | null
  formattedArriveBy: string | null
  countdownMinutes: number | null
  countdownText: string | null
  assignedDriver: string
  venueName: string
  venueAddress: string
}

/**
 * Returns estimated drive minutes based on standardized venue destinations.
 */
export function estimateVenueDriveMinutes(venueName = '', address = ''): number {
  const text = `${venueName} ${address}`.toLowerCase()
  if (text.includes('home') || text.includes('3209 washington') || text.includes('washington road')) {
    return 0
  }
  if (text.includes('bak') || text.includes('echo lake')) {
    return 20
  }
  if (text.includes('palm beach public') || text.includes('cocoanut') || text.includes('pbp')) {
    return 10
  }
  if (text.includes('phipps') || text.includes('soccer')) {
    return 12
  }
  if (text.includes('great lawn') || text.includes('pompano')) {
    return 35
  }
  if (text.includes('cox science') || text.includes('aquarium')) {
    return 10
  }
  return 15
}

/**
 * Returns estimated distance in miles based on standardized venue destinations.
 */
export function estimateVenueDistanceMiles(venueName = '', address = ''): number {
  const text = `${venueName} ${address}`.toLowerCase()
  if (text.includes('home') || text.includes('3209 washington')) return 0
  if (text.includes('bak') || text.includes('echo lake')) return 8.0
  if (text.includes('palm beach public') || text.includes('cocoanut')) return 3.8
  return 5.0
}

/**
 * Evaluates an event and derives its true, canonical departure time, travel metrics, and formatting.
 */
export function resolveCanonicalDeparture(
  evt: EventWithDetails | null | undefined,
  options?: {
    now?: Date
    defaultBufferMinutes?: number
  },
): CanonicalDepartureInfo {
  const now = options?.now || new Date()
  const defaultBuffer = options?.defaultBufferMinutes ?? 0

  const emptyResult: CanonicalDepartureInfo = {
    isDriving: false,
    isAtHome: false,
    departureDate: null,
    arrivalDate: null,
    driveMinutes: 0,
    bufferMinutes: 0,
    distanceMiles: 0,
    routeSummary: null,
    formattedLeaveBy: null,
    formattedArriveBy: null,
    countdownMinutes: null,
    countdownText: null,
    assignedDriver: 'Family',
    venueName: '',
    venueAddress: '',
  }

  if (!evt || evt.all_day) {
    return emptyResult
  }

  const venueName = evt.location_name || ''
  const venueAddress = evt.address || ''

  // 1. Check if event is at home
  if (isEventAtHome(evt)) {
    let arrivalDate: Date | null = null
    try {
      arrivalDate = parseISO(evt.start_time)
    } catch {
      arrivalDate = null
    }

    return {
      ...emptyResult,
      isAtHome: true,
      arrivalDate,
      venueName: venueName || 'Home',
      venueAddress,
      formattedArriveBy: arrivalDate ? format(arrivalDate, 'h:mm a') : null,
    }
  }

  // 2. Check if explicitly marked No Ride
  if ((evt.plan_override as any)?.mode_override === 'none') {
    return {
      ...emptyResult,
      venueName,
      venueAddress,
      formattedLeaveBy: 'No Ride Needed',
    }
  }

  // 3. Resolve drive time & distance
  const estimatedDrive = estimateVenueDriveMinutes(venueName, venueAddress)
  const estimatedDist = estimateVenueDistanceMiles(venueName, venueAddress)

  // Use realistic venue estimate for known schools or enrichment
  const driveMinutes = (evt.enrichment?.drive_time_mins && evt.enrichment.drive_time_mins > 0)
    ? (venueName.toLowerCase().includes('bak') && evt.enrichment.drive_time_mins < 18
        ? estimatedDrive
        : evt.enrichment.drive_time_mins)
    : estimatedDrive

  const distanceMiles = estimatedDist

  // 4. Resolve arrival & departure dates
  let arrivalDate: Date
  try {
    arrivalDate = parseISO(evt.start_time)
  } catch {
    arrivalDate = new Date()
  }

  const totalPreMinutes = driveMinutes + defaultBuffer
  const departureDate = new Date(arrivalDate.getTime() - totalPreMinutes * 60_000)

  const diffMins = Math.round((departureDate.getTime() - now.getTime()) / (1000 * 60))
  const countdownText = diffMins > 0 ? `Leave in ${diffMins}m` : 'Depart Now'

  // Resolve assigned driver name
  const assignedDriver =
    evt.plan_override?.transportation_plan?.legs?.[0]?.driverName ||
    evt.members?.find((m) => m.role === 'driver')?.family_member?.name ||
    evt.members?.find((m) => m.family_member?.role === 'parent')?.family_member?.name ||
    'Jake'

  return {
    isDriving: driveMinutes > 0,
    isAtHome: false,
    departureDate,
    arrivalDate,
    driveMinutes,
    bufferMinutes: defaultBuffer,
    distanceMiles,
    routeSummary: `${driveMinutes} min drive`,
    formattedLeaveBy: format(departureDate, 'h:mm a'),
    formattedArriveBy: format(arrivalDate, 'h:mm a'),
    countdownMinutes: diffMins,
    countdownText,
    assignedDriver,
    venueName,
    venueAddress,
  }
}
