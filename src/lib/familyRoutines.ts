import { format, setHours, setMinutes, setSeconds, setMilliseconds } from 'date-fns'
import type { CalendarEvent, FamilyMember, MemberAvailabilityRule } from '../types'

export type RoutineSyncMode = 'none' | 'exceptions_only' | 'all'

export type TransportMode = 'driver' | 'school_bus' | 'carpool' | 'walking' | 'train_commute'

export interface RoutineLeg {
  id: string
  sequence: number // 1, 2, 3...
  time: string // e.g. "07:45", "15:00"
  label: string // e.g. "School Drop-off", "Karate / Activity Run", "Tri-Rail Pickup"
  driverMemberId?: string | null
  driverName: string // e.g. "Jake", "Kelly", "Giselle"
  passengerMemberIds: string[] // e.g. [Owen's ID, Emme's ID]
  passengerNames: string[] // e.g. ["Owen", "Emme"]
  originVenue?: string // e.g. "Home"
  destinationVenue: string // e.g. "Bak Middle School", "Tri-Rail Station"
  destinationAddress?: string
  transportMode: TransportMode
  busNumber?: string // e.g. "Bus #14"
  notes?: string
  enabled?: boolean
}

export interface OperationsGateConfig {
  enabled: boolean
  title: string
  checkWindowStart: string // e.g. "08:00"
  checkWindowEnd: string // e.g. "10:30"
  targetCutoff: string // e.g. "11:00" (Walmart afternoon delivery cutoff)
  linkPantryDinner: boolean
  notes?: string
}

export interface KellyEveningCommuteConfig {
  workplaceVenue: string // "Boca Raton Office"
  workEndLocal: string // "17:30"
  gymTimeLocal?: string // "18:30"
  expectedHomeStart: string // "20:00"
  expectedHomeEnd: string // "21:00"
}

export interface JakeEveningHouseholdConfig {
  dinnerPrepLocal: string // "17:30"
  dinnerTargetLocal: string // "18:30"
  householdWrapLocal: string // "20:00"
}

export interface HouseholdWeekdayRhythm {
  enabled: boolean
  daysOfWeek: number[] // [1, 2, 3, 4, 5]
  morningLaunch: {
    legs: RoutineLeg[]
  }
  operationsGate: OperationsGateConfig
  afternoonChain: {
    legs: RoutineLeg[]
    emmeDefaultMode: 'bus' | 'giselle_carpool'
  }
  eveningCommute: {
    kelly: KellyEveningCommuteConfig
    jake: JakeEveningHouseholdConfig
  }
  syncMode: RoutineSyncMode
  updatedAt?: string
}

export interface DailyOverrides {
  emmeTransportMode?: 'bus' | 'giselle_carpool'
  giselleOffToday?: boolean
  kellyEarlyHome?: boolean
  kellyWfh?: boolean
  customNotes?: string
}

export interface DayScheduleOverride {
  dayOfWeek: number // 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat, 0=Sun
  label?: string // e.g. "Early Strings", "Late Pickup", "Early Dismissal"
  startLocal?: string | null // e.g. "07:00"
  endLocal?: string | null // e.g. "15:15"
  dropoffDriverName?: string | null
  dropoffDriverId?: string | null
  pickupDriverName?: string | null
  pickupDriverId?: string | null
  enabled?: boolean
}

export interface FamilyRoutine {
  id?: string
  memberId: string
  title: string
  routineType?: 'school' | 'camp' | 'custom'
  venueName: string
  venueAddress: string
  daysOfWeek: number[] // 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat, 0=Sun
  startLocal: string // e.g. "08:00"
  endLocal: string // e.g. "14:00"
  dayOverrides?: DayScheduleOverride[]
  startDate?: string | null // e.g. "2026-08-10"
  endDate?: string | null // e.g. "2027-05-28"
  dropoffDriverName: string // e.g. "Jake"
  dropoffDriverId?: string | null
  pickupDriverName: string // e.g. "Kelly"
  pickupDriverId?: string | null
  syncMode?: RoutineSyncMode
  syncToGoogle?: boolean
  enabled: boolean
}

export interface AmbientRoutineStatus {
  isActive: boolean
  childName: string
  venueName: string
  endsAtFormatted: string
  text: string
}

export interface RoutinePayload {
  type: 'school_routine'
  routineType?: 'school' | 'camp' | 'custom'
  title: string
  venueName: string
  venueAddress: string
  dayOverrides?: DayScheduleOverride[]
  startDate?: string | null
  endDate?: string | null
  dropoffDriverName: string
  dropoffDriverId?: string | null
  pickupDriverName: string
  pickupDriverId?: string | null
  syncMode?: RoutineSyncMode
  syncToGoogle?: boolean
  enabled: boolean
}

export function createSchoolRoutine(
  memberId: string,
  memberName?: string,
  venueName?: string,
  venueAddress?: string,
): FamilyRoutine {
  const isOwen = memberName?.toLowerCase().includes('owen')
  const defaultVenue = venueName || (isOwen ? 'Palm Beach Public Elementary School' : 'Bak Middle School of the Arts')
  const defaultAddress = venueAddress || (isOwen ? '239 Cocoanut Row, Palm Beach, FL 33480' : '1725 Echo Lake Dr, West Palm Beach, FL')
  const defaultStart = isOwen ? '08:15' : '08:00'
  const defaultEnd = isOwen ? '15:00' : '15:30'

  return {
    memberId,
    title: 'School Routine',
    routineType: 'school',
    venueName: defaultVenue,
    venueAddress: defaultAddress,
    daysOfWeek: [1, 2, 3, 4, 5],
    startLocal: defaultStart,
    endLocal: defaultEnd,
    dropoffDriverName: 'Jake',
    pickupDriverName: 'Kelly',
    syncMode: 'exceptions_only',
    syncToGoogle: true,
    enabled: true,
  }
}

export function createCampRoutine(
  memberId: string,
  venueName = 'Summer Day Camp',
  venueAddress = '1200 Lake Pavilion Way, West Palm Beach, FL',
): FamilyRoutine {
  return {
    memberId,
    title: 'Summer Camp',
    routineType: 'camp',
    venueName,
    venueAddress,
    daysOfWeek: [1, 2, 3, 4, 5],
    startLocal: '09:00',
    endLocal: '16:00',
    dropoffDriverName: 'Jake',
    pickupDriverName: 'Kelly',
    syncMode: 'exceptions_only',
    syncToGoogle: true,
    enabled: true,
  }
}

/**
 * Checks if a specific date has a custom schedule override or deviation for this routine.
 */
/**
 * Checks if a specific date has a custom schedule override or deviation specifically for morning drop-off.
 */
export function isRoutineDropoffException(routine: FamilyRoutine, date: Date): boolean {
  const dayOfWeek = date.getDay()
  if (!routine.daysOfWeek.includes(dayOfWeek)) return false

  const override = routine.dayOverrides?.find(
    (o) => o.dayOfWeek === dayOfWeek && o.enabled !== false,
  )
  if (!override) return false

  const startDiffers = Boolean(override.startLocal && override.startLocal.slice(0, 5) !== routine.startLocal.slice(0, 5))
  const driverDiffers = Boolean(
    (override.dropoffDriverName && override.dropoffDriverName !== routine.dropoffDriverName) ||
    (override.dropoffDriverId && override.dropoffDriverId !== routine.dropoffDriverId)
  )

  if (startDiffers || driverDiffers) return true

  // If label exists and afternoon dismissal did NOT change, label applies to morning
  const endDiffers = Boolean(override.endLocal && override.endLocal.slice(0, 5) !== routine.endLocal.slice(0, 5))
  if (override.label && override.label.trim().length > 0 && !endDiffers) {
    return true
  }

  return false
}

/**
 * Checks if a specific date has a custom schedule override or deviation specifically for afternoon pickup.
 */
export function isRoutinePickupException(routine: FamilyRoutine, date: Date): boolean {
  const dayOfWeek = date.getDay()
  if (!routine.daysOfWeek.includes(dayOfWeek)) return false

  const override = routine.dayOverrides?.find(
    (o) => o.dayOfWeek === dayOfWeek && o.enabled !== false,
  )
  if (!override) return false

  const endDiffers = Boolean(override.endLocal && override.endLocal.slice(0, 5) !== routine.endLocal.slice(0, 5))
  const driverDiffers = Boolean(
    (override.pickupDriverName && override.pickupDriverName !== routine.pickupDriverName) ||
    (override.pickupDriverId && override.pickupDriverId !== routine.pickupDriverId)
  )

  if (endDiffers || driverDiffers) return true

  // If label exists and morning arrival did NOT change, label applies to afternoon
  const startDiffers = Boolean(override.startLocal && override.startLocal.slice(0, 5) !== routine.startLocal.slice(0, 5))
  if (override.label && override.label.trim().length > 0 && !startDiffers) {
    return true
  }

  return false
}

/**
 * Checks if a specific date has any custom schedule override or deviation for this routine.
 */
export function isRoutineExceptionForDate(routine: FamilyRoutine, date: Date): boolean {
  return isRoutineDropoffException(routine, date) || isRoutinePickupException(routine, date)
}

/**
 * Parses time string (e.g. "08:00") and applies it to a target date.
 */
export function applyTimeToDate(baseDate: Date, timeStr: string): Date {
  const [hoursStr, minutesStr] = timeStr.split(':')
  const hours = parseInt(hoursStr, 10) || 0
  const minutes = parseInt(minutesStr, 10) || 0

  let d = new Date(baseDate)
  d = setHours(d, hours)
  d = setMinutes(d, minutes)
  d = setSeconds(d, 0)
  d = setMilliseconds(d, 0)
  return d
}

export function formatChildNames(children: FamilyMember[]): string {
  const names = children.map((c) => c.name).filter(Boolean)
  if (names.length === 0) return 'Kids'
  if (names.length === 1) return names[0]
  if (names.length === 2) return `${names[0]} & ${names[1]}`
  return `${names.slice(0, -1).join(', ')} & ${names[names.length - 1]}`
}

export function getEstimatedDriveMinutes(venueName = '', address = ''): number {
  const text = `${venueName} ${address}`.toLowerCase()
  if (text.includes('palm beach public') || text.includes('cocoanut') || text.includes('pbp')) {
    return 10
  }
  if (text.includes('bak') || text.includes('echo lake')) {
    return 18
  }
  return 15
}

/**
 * Generates consolidated action events (Drop-off & Pick-up) grouping children
 * who share the same school/destination, arrival/dismissal window, and driver into a single multi-passenger event.
 */
export function generateConsolidatedRoutineActionEvents(options: {
  routines: FamilyRoutine[]
  members: FamilyMember[]
  date: Date
  homeAddress?: string
  filterBySyncMode?: boolean
  forExternalSync?: boolean
}): CalendarEvent[] {
  const {
    routines,
    members,
    date,
    homeAddress: _homeAddress = '3209 Washington Road, West Palm Beach, FL',
    filterBySyncMode = false,
    forExternalSync = false,
  } = options

  const shouldFilter = filterBySyncMode || forExternalSync
  const dateKey = format(date, 'yyyy-MM-dd')
  const dayOfWeek = date.getDay()

  const activeRoutines = routines.filter((routine) => {
    if (!routine.enabled) return false
    if (routine.startDate && dateKey < routine.startDate) return false
    if (routine.endDate && dateKey > routine.endDate) return false
    if (!routine.daysOfWeek.includes(dayOfWeek)) return false
    return true
  })

  if (activeRoutines.length === 0) return []

  const events: CalendarEvent[] = []

  // 1. Group Morning Drop-offs by (normalizedVenue + startLocal + dropoffDriverName + label)
  const dropoffGroups = new Map<string, {
    venueName: string
    venueAddress: string
    startLocal: string
    driverName: string
    driverId: string | null
    label: string | null
    children: FamilyMember[]
    routineIds: string[]
  }>()

  // 2. Group Afternoon Pick-ups by (normalizedVenue + endLocal + pickupDriverName + label)
  const pickupGroups = new Map<string, {
    venueName: string
    venueAddress: string
    endLocal: string
    driverName: string
    driverId: string | null
    label: string | null
    children: FamilyMember[]
    routineIds: string[]
  }>()

  for (const routine of activeRoutines) {
    const child = members.find((m) => m.id === routine.memberId)
    if (!child) continue

    const mode: RoutineSyncMode = routine.syncMode ?? (routine.syncToGoogle === false ? 'none' : 'exceptions_only')

    const includeDropoff = !shouldFilter || mode === 'all' || (mode === 'exceptions_only' && isRoutineDropoffException(routine, date))
    const includePickup = !shouldFilter || mode === 'all' || (mode === 'exceptions_only' && isRoutinePickupException(routine, date))

    if (!includeDropoff && !includePickup) {
      continue
    }

    const venueKey = routine.venueName.trim().toLowerCase()
    const dayOverride = routine.dayOverrides?.find(
      (o) => o.dayOfWeek === dayOfWeek && o.enabled !== false,
    )

    const effStartLocal = (dayOverride?.startLocal || routine.startLocal).slice(0, 5)
    const effEndLocal = (dayOverride?.endLocal || routine.endLocal).slice(0, 5)
    const effDropDriverName = dayOverride?.dropoffDriverName || routine.dropoffDriverName || 'Jake'
    const effDropDriverId = dayOverride?.dropoffDriverId !== undefined ? dayOverride.dropoffDriverId : (routine.dropoffDriverId || null)
    const effPickDriverName = dayOverride?.pickupDriverName || routine.pickupDriverName || 'Kelly'
    const effPickDriverId = dayOverride?.pickupDriverId !== undefined ? dayOverride.pickupDriverId : (routine.pickupDriverId || null)
    const overrideLabel = dayOverride?.label?.trim() || null

    // Morning Dropoff Grouping
    if (includeDropoff) {
      const dropKey = `${venueKey}|${effStartLocal}|${effDropDriverName}|${overrideLabel || ''}`
      if (!dropoffGroups.has(dropKey)) {
        dropoffGroups.set(dropKey, {
          venueName: routine.venueName,
          venueAddress: routine.venueAddress,
          startLocal: effStartLocal,
          driverName: effDropDriverName,
          driverId: effDropDriverId,
          label: overrideLabel,
          children: [child],
          routineIds: [routine.memberId],
        })
      } else {
        const g = dropoffGroups.get(dropKey)!
        if (!g.children.some((c) => c.id === child.id)) {
          g.children.push(child)
          g.routineIds.push(routine.memberId)
        }
      }
    }

    // Afternoon Pickup Grouping
    if (includePickup) {
      const pickKey = `${venueKey}|${effEndLocal}|${effPickDriverName}|${overrideLabel || ''}`
      if (!pickupGroups.has(pickKey)) {
        pickupGroups.set(pickKey, {
          venueName: routine.venueName,
          venueAddress: routine.venueAddress,
          endLocal: effEndLocal,
          driverName: effPickDriverName,
          driverId: effPickDriverId,
          label: overrideLabel,
          children: [child],
          routineIds: [routine.memberId],
        })
      } else {
        const g = pickupGroups.get(pickKey)!
        if (!g.children.some((c) => c.id === child.id)) {
          g.children.push(child)
          g.routineIds.push(routine.memberId)
        }
      }
    }
  }

  // Generate Consolidated Drop-off Events
  for (const group of dropoffGroups.values()) {
    const names = formatChildNames(group.children)
    const driveMinutes = getEstimatedDriveMinutes(group.venueName, group.venueAddress)
    const schoolStartTime = applyTimeToDate(date, group.startLocal)
    // Arrival window: 15 min window ending when school starts (e.g. 7:45 - 8:00 AM)
    const windowStartTime = new Date(schoolStartTime.getTime() - 15 * 60000)
    const departureTime = new Date(windowStartTime.getTime() - driveMinutes * 60000)

    const driverMember = members.find((m) => m.id === group.driverId || m.name === group.driverName)
    const eventId = `routine-drop-${group.routineIds.sort().join('-')}-${dateKey}`
    const labelTag = group.label ? ` · ${group.label}` : ''

    events.push({
      id: eventId,
      title: `Drop off ${names} @ ${group.venueName}${labelTag}`,
      description: `Morning school drop-off for ${names}.${group.label ? ` Note: ${group.label}.` : ''} Arrival window: ${format(windowStartTime, 'h:mm a')} – ${format(schoolStartTime, 'h:mm a')}.`,
      start_time: windowStartTime.toISOString(),
      end_time: schoolStartTime.toISOString(),
      all_day: false,
      event_type: 'event',
      location_name: group.venueName,
      address: group.venueAddress,
      lat: null,
      lng: null,
      google_event_id: null,
      google_calendar_id: null,
      source_member_id: driverMember?.id || group.driverId || null,
      status: 'confirmed',
      is_enriched: true,
      rrule: null,
      recurrence_master_id: null,
      record_kind: 'single',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      trip_id: null,
      leg_type: null,
      flight_number: null,
      confirmation_number: null,
      members: [
        ...(driverMember ? [{
          id: `mem-${eventId}-driver`,
          event_id: eventId,
          family_member_id: driverMember.id,
          role: 'driver',
          rsvp_status: 'accepted' as const,
          family_member: driverMember,
        }] : []),
        ...group.children.map((child) => ({
          id: `mem-${eventId}-${child.id}`,
          event_id: eventId,
          family_member_id: child.id,
          role: 'passenger',
          rsvp_status: 'accepted' as const,
          family_member: child,
        })),
      ],
      enrichment: {
        id: `enrich-${eventId}`,
        event_id: eventId,
        drive_time_mins: driveMinutes,
        departure_time: departureTime.toISOString(),
        route_summary: `${driveMinutes} min drive`,
        weather_at_event: null,
        weather_summary: null,
        what_to_bring: [],
        prep_notes: null,
        outfit_suggestion: null,
        parking_notes: null,
        dietary_notes: null,
        cost_estimate: null,
        contact_name: null,
        contact_phone: null,
        meal_impact: null,
        category: 'School',
        category_locked: true,
        confidence: 'high',
        enriched_by: 'family_routines',
        enriched_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    })
  }

  // Generate Consolidated Pick-up Events
  for (const group of pickupGroups.values()) {
    const names = formatChildNames(group.children)
    const driveMinutes = getEstimatedDriveMinutes(group.venueName, group.venueAddress)
    const schoolEndTime = applyTimeToDate(date, group.endLocal)
    // Pickup window: 15 min window (e.g. 2:00 - 2:15 PM)
    const windowEndTime = new Date(schoolEndTime.getTime() + 15 * 60000)
    const departureTime = new Date(schoolEndTime.getTime() - driveMinutes * 60000)

    const driverMember = members.find((m) => m.id === group.driverId || m.name === group.driverName)
    const eventId = `routine-pick-${group.routineIds.sort().join('-')}-${dateKey}`
    const labelTag = group.label ? ` · ${group.label}` : ''

    events.push({
      id: eventId,
      title: `Pick up ${names} @ ${group.venueName}${labelTag}`,
      description: `Afternoon school pickup for ${names}.${group.label ? ` Note: ${group.label}.` : ''} Dismissal at ${format(schoolEndTime, 'h:mm a')}.`,
      start_time: schoolEndTime.toISOString(),
      end_time: windowEndTime.toISOString(),
      all_day: false,
      event_type: 'event',
      location_name: group.venueName,
      address: group.venueAddress,
      lat: null,
      lng: null,
      google_event_id: null,
      google_calendar_id: null,
      source_member_id: driverMember?.id || group.driverId || null,
      status: 'confirmed',
      is_enriched: true,
      rrule: null,
      recurrence_master_id: null,
      record_kind: 'single',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      trip_id: null,
      leg_type: null,
      flight_number: null,
      confirmation_number: null,
      members: [
        ...(driverMember ? [{
          id: `mem-${eventId}-driver`,
          event_id: eventId,
          family_member_id: driverMember.id,
          role: 'driver',
          rsvp_status: 'accepted' as const,
          family_member: driverMember,
        }] : []),
        ...group.children.map((child) => ({
          id: `mem-${eventId}-${child.id}`,
          event_id: eventId,
          family_member_id: child.id,
          role: 'passenger',
          rsvp_status: 'accepted' as const,
          family_member: child,
        })),
      ],
      enrichment: {
        id: `enrich-${eventId}`,
        event_id: eventId,
        drive_time_mins: driveMinutes,
        departure_time: departureTime.toISOString(),
        route_summary: `${driveMinutes} min drive`,
        weather_at_event: null,
        weather_summary: null,
        what_to_bring: [],
        prep_notes: null,
        outfit_suggestion: null,
        parking_notes: null,
        dietary_notes: null,
        cost_estimate: null,
        contact_name: null,
        contact_phone: null,
        meal_impact: null,
        category: 'School',
        category_locked: true,
        confidence: 'high',
        enriched_by: 'family_routines',
        enriched_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    })
  }

  return events.sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
}

/**
 * Generates discrete action events (Drop-off & Pick-up) for a single routine on a specific date.
 */
export function generateRoutineActionEvents(options: {
  routine: FamilyRoutine
  child: FamilyMember
  date: Date
  homeAddress?: string
  driveMinutes?: number
  bufferMinutes?: number
  filterBySyncMode?: boolean
  forExternalSync?: boolean
}): CalendarEvent[] {
  const { routine, child, date, homeAddress, driveMinutes, bufferMinutes: _bufferMinutes, filterBySyncMode, forExternalSync } = options
  if (!routine.enabled) return []

  const events = generateConsolidatedRoutineActionEvents({
    routines: [routine],
    members: [child],
    date,
    homeAddress,
    filterBySyncMode,
    forExternalSync,
  })

  // If custom driveMinutes was explicitly passed, update enrichment accordingly
  if (driveMinutes !== undefined) {
    return events.map((ev) => {
      const departureTime = new Date(new Date(ev.start_time).getTime() - driveMinutes * 60000)
      return {
        ...ev,
        enrichment: ev.enrichment ? {
          ...ev.enrichment,
          drive_time_mins: driveMinutes,
          departure_time: departureTime.toISOString(),
          route_summary: `${driveMinutes} min drive`,
        } : null,
      }
    })
  }

  return events
}

/**
 * Derives ambient routine status for display on Kiosk and Home dashboard.
 * Active when current time is within school/routine hours.
 */
export function deriveAmbientRoutineStatus(
  routines: FamilyRoutine[],
  children: FamilyMember[],
  now: Date = new Date(),
): AmbientRoutineStatus[] {
  const dayOfWeek = now.getDay()
  const dateKey = format(now, 'yyyy-MM-dd')
  const activeStatuses: AmbientRoutineStatus[] = []

  for (const routine of routines) {
    if (!routine.enabled) continue
    if (routine.startDate && dateKey < routine.startDate) continue
    if (routine.endDate && dateKey > routine.endDate) continue
    if (!routine.daysOfWeek.includes(dayOfWeek)) continue

    const child = children.find((c) => c.id === routine.memberId)
    const childName = child?.name || 'Child'

    const dayOverride = routine.dayOverrides?.find(
      (o) => o.dayOfWeek === dayOfWeek && o.enabled !== false,
    )
    const effStartLocal = (dayOverride?.startLocal || routine.startLocal).slice(0, 5)
    const effEndLocal = (dayOverride?.endLocal || routine.endLocal).slice(0, 5)

    const schoolStartTime = applyTimeToDate(now, effStartLocal)
    const schoolEndTime = applyTimeToDate(now, effEndLocal)

    // Check if now is during school hours (inclusive of arrival to pickup)
    if (now >= schoolStartTime && now <= schoolEndTime) {
      const endsAtFormatted = format(schoolEndTime, 'h:mm a')
      activeStatuses.push({
        isActive: true,
        childName,
        venueName: routine.venueName,
        endsAtFormatted,
        text: `${childName}: At ${routine.venueName} until ${endsAtFormatted}`,
      })
    }
  }

  return activeStatuses
}

/**
 * Serializes a FamilyRoutine into member_availability_rules rows for persistence.
 */
export function serializeRoutineToAvailabilityRules(routine: FamilyRoutine): Array<Omit<MemberAvailabilityRule, 'id' | 'created_at' | 'updated_at'>> {
  const syncMode: RoutineSyncMode = routine.syncMode ?? (routine.syncToGoogle === false ? 'none' : 'exceptions_only')
  const payload: RoutinePayload = {
    type: 'school_routine',
    routineType: routine.routineType || 'school',
    title: routine.title,
    venueName: routine.venueName,
    venueAddress: routine.venueAddress,
    dayOverrides: routine.dayOverrides || [],
    startDate: routine.startDate || null,
    endDate: routine.endDate || null,
    dropoffDriverName: routine.dropoffDriverName,
    dropoffDriverId: routine.dropoffDriverId,
    pickupDriverName: routine.pickupDriverName,
    pickupDriverId: routine.pickupDriverId,
    syncMode,
    syncToGoogle: syncMode !== 'none',
    enabled: routine.enabled,
  }

  const reasonStr = JSON.stringify(payload)

  return routine.daysOfWeek.map((day) => {
    const override = routine.dayOverrides?.find((o) => o.dayOfWeek === day && o.enabled !== false)
    const startLocal = override?.startLocal || routine.startLocal
    const endLocal = override?.endLocal || routine.endLocal

    return {
      member_id: routine.memberId,
      day_of_week: day,
      start_local: startLocal,
      end_local: endLocal,
      availability_type: 'unavailable',
      reason: reasonStr,
      timezone: 'America/New_York',
    }
  })
}

/**
 * Deserializes member_availability_rules rows for a member into a FamilyRoutine (if found).
 */
export function deserializeRoutineFromAvailabilityRules(
  memberId: string,
  rules: MemberAvailabilityRule[],
): FamilyRoutine | null {
  const routineRules = rules.filter((r) => {
    if (r.member_id !== memberId) return false
    try {
      const parsed = JSON.parse(r.reason || '')
      return parsed.type === 'school_routine'
    } catch {
      return false
    }
  })

  if (routineRules.length === 0) return null

  const first = routineRules[0]
  let payload: RoutinePayload = {
    type: 'school_routine',
    routineType: 'school',
    title: 'School Routine',
    venueName: '',
    venueAddress: '',
    dropoffDriverName: 'Jake',
    pickupDriverName: 'Kelly',
    syncMode: 'exceptions_only',
    syncToGoogle: true,
    enabled: true,
  }

  try {
    payload = JSON.parse(first.reason || '{}')
  } catch {
    // fallback
  }

  const days = Array.from(new Set(routineRules.map((r) => r.day_of_week))).sort()

  const rawSyncMode = payload.syncMode
  let syncMode: RoutineSyncMode = 'exceptions_only'
  if (rawSyncMode === 'none' || rawSyncMode === 'exceptions_only' || rawSyncMode === 'all') {
    syncMode = rawSyncMode
  } else if (payload.syncToGoogle === false) {
    syncMode = 'none'
  } else {
    syncMode = 'exceptions_only'
  }

  return {
    memberId,
    title: payload.title || 'School Routine',
    routineType: payload.routineType || 'school',
    venueName: payload.venueName ?? '',
    venueAddress: payload.venueAddress ?? '',
    dayOverrides: payload.dayOverrides || [],
    startDate: payload.startDate || null,
    endDate: payload.endDate || null,
    daysOfWeek: days.length > 0 ? days : [1, 2, 3, 4, 5],
    startLocal: first.start_local.slice(0, 5),
    endLocal: first.end_local.slice(0, 5),
    dropoffDriverName: payload.dropoffDriverName || 'Jake',
    dropoffDriverId: payload.dropoffDriverId,
    pickupDriverName: payload.pickupDriverName || 'Kelly',
    pickupDriverId: payload.pickupDriverId,
    syncMode,
    syncToGoogle: syncMode !== 'none',
    enabled: payload.enabled ?? true,
  }
}

// ── Household Weekday Rhythm Architecture (Casa Tabor Baseline) ───────────

export const HOUSEHOLD_RHYTHM_RULE_REASON_TYPE = 'household_weekday_rhythm'
export const HOUSEHOLD_RHYTHM_LOCALSTORAGE_KEY = 'casa_tabor_household_weekday_rhythm_v1'
export const DAILY_OVERRIDES_STORAGE_PREFIX = 'casa_tabor_daily_override_'

/**
 * Constructs the canonical "Set-and-Forget" Casa Tabor weekday rhythm baseline.
 */
export function createDefaultCasaTaborRhythm(members: FamilyMember[] = []): HouseholdWeekdayRhythm {
  const jake = members.find((m) => m.name.toLowerCase().includes('jake'))
  const kelly = members.find((m) => m.name.toLowerCase().includes('kelly'))
  const giselle = members.find((m) => m.name.toLowerCase().includes('giselle'))
  const owen = members.find((m) => m.name.toLowerCase().includes('owen'))
  const emme = members.find((m) => m.name.toLowerCase().includes('emme'))
  const olivia = members.find((m) => m.name.toLowerCase().includes('olivia'))

  return {
    enabled: true,
    daysOfWeek: [1, 2, 3, 4, 5], // Monday through Friday
    morningLaunch: {
      legs: [
        {
          id: 'morning-leg-jake-school',
          sequence: 1,
          time: '07:45',
          label: 'School Drop-offs (Owen & Emme)',
          driverMemberId: jake?.id || null,
          driverName: jake?.name || 'Jake',
          passengerMemberIds: [owen?.id, emme?.id].filter(Boolean) as string[],
          passengerNames: ['Owen', 'Emme'],
          originVenue: 'Home (3209 Washington Rd)',
          destinationVenue: 'Bak Middle School / PB Public',
          destinationAddress: '1725 Echo Lake Dr, West Palm Beach, FL',
          transportMode: 'driver',
          notes: 'Drop-off window 7:45–8:15 AM before school start',
          enabled: true,
        },
        {
          id: 'morning-leg-kelly-trirail',
          sequence: 2,
          time: '08:00',
          label: 'Tri-Rail Station Drop-off (Olivia)',
          driverMemberId: kelly?.id || null,
          driverName: kelly?.name || 'Kelly',
          passengerMemberIds: [olivia?.id].filter(Boolean) as string[],
          passengerNames: ['Olivia'],
          originVenue: 'Home (3209 Washington Rd)',
          destinationVenue: 'West Palm Beach Tri-Rail Station',
          destinationAddress: '203 S Tamarind Ave, West Palm Beach, FL',
          transportMode: 'driver',
          notes: 'Kelly drops Olivia at train station then commutes south to Boca Raton office',
          enabled: true,
        },
      ],
    },
    operationsGate: {
      enabled: true,
      title: 'Dinner Ingredients & Walmart Cutoff Gate',
      checkWindowStart: '08:00',
      checkWindowEnd: '10:30',
      targetCutoff: '11:00',
      linkPantryDinner: true,
      notes: 'Morning prompt to verify dinner pantry items before Walmart afternoon delivery cutoff',
    },
    afternoonChain: {
      emmeDefaultMode: 'bus',
      legs: [
        {
          id: 'pm-leg-1-owen-pickup',
          sequence: 1,
          time: '15:00',
          label: 'Pick up Owen @ School',
          driverMemberId: giselle?.id || null,
          driverName: giselle?.name || 'Giselle',
          passengerMemberIds: [owen?.id].filter(Boolean) as string[],
          passengerNames: ['Owen'],
          originVenue: 'Bak Middle School / PB Public',
          destinationVenue: 'Bak Middle School / PB Public',
          transportMode: 'driver',
          notes: 'Dismissal at 3:00 PM',
          enabled: true,
        },
        {
          id: 'pm-leg-2-owen-activity',
          sequence: 2,
          time: '15:30',
          label: 'Drive Owen to Afternoon Activity',
          driverMemberId: giselle?.id || null,
          driverName: giselle?.name || 'Giselle',
          passengerMemberIds: [owen?.id].filter(Boolean) as string[],
          passengerNames: ['Owen'],
          originVenue: 'Bak Middle School',
          destinationVenue: 'Karate / Gymnastics / Strings Rehearsal',
          transportMode: 'driver',
          notes: 'Afternoon enrichment & training',
          enabled: true,
        },
        {
          id: 'pm-leg-3-emme-dismissal',
          sequence: 3,
          time: '15:35',
          label: 'Emme Arrival via School Bus #14',
          driverMemberId: null,
          driverName: 'School Bus #14',
          passengerMemberIds: [emme?.id].filter(Boolean) as string[],
          passengerNames: ['Emme'],
          destinationVenue: 'Home (3209 Washington Rd)',
          transportMode: 'school_bus',
          busNumber: 'Bus #14',
          notes: 'Default: Bus #14 home (~3:35 PM). 1-tap quick toggle to switch to Giselle Carpool.',
          enabled: true,
        },
        {
          id: 'pm-leg-4-olivia-trirail',
          sequence: 4,
          time: '16:15',
          label: 'Pick up Olivia @ Tri-Rail Train Station',
          driverMemberId: giselle?.id || null,
          driverName: giselle?.name || 'Giselle',
          passengerMemberIds: [olivia?.id].filter(Boolean) as string[],
          passengerNames: ['Olivia'],
          originVenue: 'Activity / En Route',
          destinationVenue: 'West Palm Beach Tri-Rail Station',
          transportMode: 'driver',
          notes: 'Train arrives ~4:15 PM',
          enabled: true,
        },
        {
          id: 'pm-leg-5-kids-home',
          sequence: 5,
          time: '17:00',
          label: 'Bring Olivia & Owen Home / Park',
          driverMemberId: giselle?.id || null,
          driverName: giselle?.name || 'Giselle',
          passengerMemberIds: [owen?.id, olivia?.id].filter(Boolean) as string[],
          passengerNames: ['Owen', 'Olivia'],
          destinationVenue: 'Home / Howard Park',
          transportMode: 'driver',
          notes: 'Park play or homework transition until 5:00 PM handoff',
          enabled: true,
        },
      ],
    },
    eveningCommute: {
      kelly: {
        workplaceVenue: 'Boca Raton Office',
        workEndLocal: '17:30',
        gymTimeLocal: '18:30',
        expectedHomeStart: '20:00',
        expectedHomeEnd: '21:00',
      },
      jake: {
        dinnerPrepLocal: '17:30',
        dinnerTargetLocal: '18:30',
        householdWrapLocal: '20:00',
      },
    },
    syncMode: 'exceptions_only',
    updatedAt: new Date().toISOString(),
  }
}

/**
 * Deserializes the household weekday rhythm from availability rules or local storage.
 */
export function deserializeHouseholdRhythm(
  rules: MemberAvailabilityRule[],
  members: FamilyMember[] = [],
): HouseholdWeekdayRhythm {
  const fallback = createDefaultCasaTaborRhythm(members)

  // 1. Try to find singleton household rule in availability rules
  const householdRule = rules.find((r) => {
    try {
      const parsed = JSON.parse(r.reason || '{}')
      return parsed.type === HOUSEHOLD_RHYTHM_RULE_REASON_TYPE
    } catch {
      return false
    }
  })

  if (householdRule) {
    try {
      const payload = JSON.parse(householdRule.reason || '{}')
      if (payload.rhythm) {
        return {
          ...fallback,
          ...payload.rhythm,
        }
      }
    } catch {}
  }

  // 2. Try localStorage cached copy
  try {
    const raw = localStorage.getItem(HOUSEHOLD_RHYTHM_LOCALSTORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      return {
        ...fallback,
        ...parsed,
      }
    }
  } catch {}

  return fallback
}

/**
 * Serializes the household weekday rhythm for database persistence in member_availability_rules.
 */
export function serializeHouseholdRhythmToRule(
  rhythm: HouseholdWeekdayRhythm,
  adminMemberId?: string | null,
): Omit<MemberAvailabilityRule, 'id' | 'created_at' | 'updated_at'> {
  const payload = {
    type: HOUSEHOLD_RHYTHM_RULE_REASON_TYPE,
    rhythm,
    version: 1,
    updatedAt: new Date().toISOString(),
  }

  return {
    member_id: adminMemberId || 'household_singleton',
    day_of_week: 1, // Anchor to Monday
    start_local: '07:30',
    end_local: '21:00',
    availability_type: 'available',
    reason: JSON.stringify(payload),
    timezone: 'America/New_York',
  }
}

/**
 * Retrieves daily 1-tap quick overrides for a given date (e.g. "2026-08-17").
 */
export function getDailyOverrides(dateKey: string): DailyOverrides {
  try {
    const raw = localStorage.getItem(`${DAILY_OVERRIDES_STORAGE_PREFIX}${dateKey}`)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

/**
 * Saves daily 1-tap quick overrides for a given date.
 */
export function saveDailyOverrides(dateKey: string, overrides: Partial<DailyOverrides>): void {
  try {
    const current = getDailyOverrides(dateKey)
    const updated = { ...current, ...overrides }
    localStorage.setItem(`${DAILY_OVERRIDES_STORAGE_PREFIX}${dateKey}`, JSON.stringify(updated))
  } catch {}
}

export type HandoffStage =
  | 'morning_launch'
  | 'ops_gate'
  | 'school_hours'
  | 'afternoon_relay'
  | 'dinner_prep'
  | 'kelly_commute'
  | 'rest'

export interface HandoffStageInfo {
  stage: HandoffStage
  title: string
  subtitle: string
  activeLeg: RoutineLeg | null
  nextLeg: RoutineLeg | null
  emmeMode: 'bus' | 'giselle_carpool'
  giselleActive: boolean
}

/**
 * Resolves current handoff stage and active flow information based on current time and daily overrides.
 */
export function resolveTodayHandoffStage(
  rhythm: HouseholdWeekdayRhythm,
  now: Date = new Date(),
): HandoffStageInfo {
  const dateKey = format(now, 'yyyy-MM-dd')
  const overrides = getDailyOverrides(dateKey)
  const currentHour = now.getHours()
  const currentMinute = now.getMinutes()
  const decimal = currentHour + currentMinute / 60

  const emmeMode = overrides.emmeTransportMode || rhythm.afternoonChain.emmeDefaultMode
  const giselleActive = !overrides.giselleOffToday

  if (decimal >= 7.0 && decimal < 8.75) {
    const leg = rhythm.morningLaunch.legs.find((l) => l.enabled) || null
    return {
      stage: 'morning_launch',
      title: 'Morning Launch in Progress',
      subtitle: 'Jake: Owen & Emme school drop-offs · Kelly: Olivia Tri-Rail & Boca commute',
      activeLeg: leg,
      nextLeg: rhythm.morningLaunch.legs[1] || null,
      emmeMode,
      giselleActive,
    }
  }

  if (decimal >= 8.75 && decimal < 10.75) {
    return {
      stage: 'ops_gate',
      title: 'Ops & Pantry Gate Active',
      subtitle: 'Verify dinner ingredients before Walmart 11:00 AM afternoon cutoff',
      activeLeg: null,
      nextLeg: rhythm.afternoonChain.legs[0] || null,
      emmeMode,
      giselleActive,
    }
  }

  if (decimal >= 10.75 && decimal < 14.75) {
    return {
      stage: 'school_hours',
      title: 'Kids at School / Work Hours',
      subtitle: 'Owen & Emme at school · Kelly in Boca Raton · Jake household operations',
      activeLeg: null,
      nextLeg: rhythm.afternoonChain.legs[0] || null,
      emmeMode,
      giselleActive,
    }
  }

  if (decimal >= 14.75 && decimal < 17.5) {
    const activeLeg = rhythm.afternoonChain.legs.find((l) => {
      const [h, m] = l.time.split(':').map(Number)
      const legDec = h + m / 60
      return Math.abs(decimal - legDec) < 0.5
    }) || rhythm.afternoonChain.legs[0]

    return {
      stage: 'afternoon_relay',
      title: 'Afternoon Relay & Baton Passes',
      subtitle: giselleActive
        ? `Giselle active · Emme: ${emmeMode === 'bus' ? 'Bus #14 (~3:35 PM)' : 'Giselle Carpool'} · Olivia Tri-Rail @ 4:15 PM`
        : 'Giselle OFF TODAY · Backup driver needed for afternoon pickups',
      activeLeg,
      nextLeg: rhythm.afternoonChain.legs[1] || null,
      emmeMode,
      giselleActive,
    }
  }

  if (decimal >= 17.5 && decimal < 19.75) {
    return {
      stage: 'dinner_prep',
      title: 'Dinner Prep & Household Evening',
      subtitle: overrides.kellyEarlyHome
        ? 'Kelly home early · Dinner prep together'
        : 'Jake managing dinner prep · Kelly gym & commute (arrival ~8:00–9:00 PM)',
      activeLeg: null,
      nextLeg: null,
      emmeMode,
      giselleActive,
    }
  }

  if (decimal >= 19.75 && decimal < 21.5) {
    return {
      stage: 'kelly_commute',
      title: 'Evening Wind-Down & Arrival',
      subtitle: overrides.kellyEarlyHome ? 'Kelly arrived home' : 'Kelly returning home from Boca Raton',
      activeLeg: null,
      nextLeg: null,
      emmeMode,
      giselleActive,
    }
  }

  return {
    stage: 'rest',
    title: 'Household Rest Period',
    subtitle: 'Routines pause until tomorrow morning launch at 7:30 AM',
    activeLeg: null,
    nextLeg: rhythm.morningLaunch.legs[0] || null,
    emmeMode,
    giselleActive,
  }
}


