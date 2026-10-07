import { format, setHours, setMinutes, setSeconds, setMilliseconds } from 'date-fns'
import type { CalendarEvent, FamilyMember, MemberAvailabilityRule, MemberAvailabilityException } from '../types'

export type RoutineSyncMode = 'none' | 'exceptions_only' | 'all'

export interface DayScheduleOverride {
  dayOfWeek: number // 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat, 0=Sun
  label?: string // e.g. "Early Strings", "Late Pickup", "Early Dismissal", "Office Day"
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
  /** Which of the person's routines this is: "main" for the first (older rows have no key), else its own. */
  key?: string
  memberId: string
  title: string
  /** care: someone has them for a while ("With Giselle", 2–5 after school) — where they are, no drop-off or pickup runs. */
  routineType?: 'school' | 'work' | 'camp' | 'custom' | 'care'
  venueName: string
  shortVenueName?: string | null
  venueAddress: string
  /** Where they're picked up when it isn't the venue (Liv: dropped at Bak, picked up at the Tri-Rail station; Oct 7). */
  pickupVenueName?: string | null
  pickupVenueAddress?: string | null
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
  pickupDriverName?: string | null
  pickupDriverId?: string | null
  effEndTime?: string | null
}

export interface RoutinePayload {
  type: 'family_routine' | 'school_routine'
  key?: string
  routineType?: 'school' | 'work' | 'camp' | 'custom' | 'care'
  title: string
  venueName: string
  shortVenueName?: string | null
  venueAddress: string
  pickupVenueName?: string | null
  pickupVenueAddress?: string | null
  startLocal?: string
  endLocal?: string
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

/**
 * Formats or cleanly shortens venue names for compact widgets and ambient status pills.
 * If a custom shortVenueName is specified on the routine, it is prioritized.
 * Otherwise, cleanly truncates redundant school suffixes like "Elementary School" or "of the Arts".
 */
export function formatDisplayVenueName(venueName = '', shortVenueName?: string | null): string {
  if (shortVenueName && shortVenueName.trim().length > 0) {
    return shortVenueName.trim()
  }
  if (!venueName) return ''
  let v = venueName.trim()
  v = v.replace(/\s+of the Arts$/i, '')
  v = v.replace(/\s+Elementary School$/i, '')
  return v
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

export function createWorkRoutine(
  memberId: string,
  memberName?: string,
  venueName = 'Office',
  venueAddress = '100 Clematis St, West Palm Beach, FL',
): FamilyRoutine {
  return {
    memberId,
    title: 'Work Routine',
    routineType: 'work',
    venueName,
    venueAddress,
    daysOfWeek: [1, 2, 3, 4, 5],
    startLocal: '08:30',
    endLocal: '17:30',
    dropoffDriverName: memberName || 'Self',
    pickupDriverName: memberName || 'Self',
    syncMode: 'none',
    syncToGoogle: false,
    enabled: true,
  }
}

export function createCustomRoutine(
  memberId: string,
  title = 'Weekly Routine',
  venueName = 'Routine Venue',
  venueAddress = 'West Palm Beach, FL',
): FamilyRoutine {
  return {
    memberId,
    title,
    routineType: 'custom',
    venueName,
    venueAddress,
    daysOfWeek: [1, 2, 3, 4, 5],
    startLocal: '08:00',
    endLocal: '15:00',
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
    const targetArrivalTime = applyTimeToDate(date, group.startLocal)
    const eventEndTime = new Date(targetArrivalTime.getTime() + 15 * 60000)
    const departureTime = new Date(targetArrivalTime.getTime() - driveMinutes * 60000)

    const driverMember = members.find((m) => m.id === group.driverId || m.name === group.driverName)
    const eventId = `routine-drop-${group.routineIds.sort().join('-')}-${dateKey}`
    const labelTag = group.label ? ` · ${group.label}` : ''

    events.push({
      id: eventId,
      title: `Drop off ${names} @ ${group.venueName}${labelTag}`,
      description: `Morning drop-off for ${names}.${group.label ? ` Note: ${group.label}.` : ''} Arrival at ${format(targetArrivalTime, 'h:mm a')}.`,
      start_time: targetArrivalTime.toISOString(),
      end_time: eventEndTime.toISOString(),
      all_day: false,
      has_due_date: true,
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
    const targetPickupTime = applyTimeToDate(date, group.endLocal)
    const eventEndTime = new Date(targetPickupTime.getTime() + 15 * 60000)
    const departureTime = new Date(targetPickupTime.getTime() - driveMinutes * 60000)

    const driverMember = members.find((m) => m.id === group.driverId || m.name === group.driverName)
    const eventId = `routine-pick-${group.routineIds.sort().join('-')}-${dateKey}`
    const labelTag = group.label ? ` · ${group.label}` : ''

    events.push({
      id: eventId,
      title: `Pick up ${names} @ ${group.venueName}${labelTag}`,
      description: `Afternoon pickup for ${names}.${group.label ? ` Note: ${group.label}.` : ''} Dismissal at ${format(targetPickupTime, 'h:mm a')}.`,
      start_time: targetPickupTime.toISOString(),
      end_time: eventEndTime.toISOString(),
      all_day: false,
      has_due_date: true,
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
  const { routine, child, date, homeAddress, driveMinutes, filterBySyncMode, forExternalSync } = options
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
      const displayVenue = formatDisplayVenueName(routine.venueName, routine.shortVenueName)
      activeStatuses.push({
        isActive: true,
        childName,
        venueName: displayVenue,
        endsAtFormatted,
        text: `${childName}: At ${displayVenue} until ${endsAtFormatted}`,
        pickupDriverName: routine.pickupDriverName || null,
        pickupDriverId: routine.pickupDriverId || null,
        effEndTime: effEndLocal,
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
    type: 'family_routine',
    key: routine.key || MAIN_ROUTINE_KEY,
    routineType: routine.routineType || 'school',
    title: routine.title,
    venueName: routine.venueName,
    shortVenueName: routine.shortVenueName || null,
    venueAddress: routine.venueAddress,
    ...(routine.pickupVenueName ? { pickupVenueName: routine.pickupVenueName, pickupVenueAddress: routine.pickupVenueAddress || null } : {}),
    startLocal: routine.startLocal,
    endLocal: routine.endLocal,
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

/** The first routine a person has; older rows carry no key and read as this one. */
export const MAIN_ROUTINE_KEY = 'main'
/** Plain "Working hours" rows (busy time from the old Settings page), read as a Work routine. */
export const WORK_HOURS_KEY = 'work-hours'

function routinePayloadOf(reason: string | null | undefined): RoutinePayload | null {
  if (!reason || !reason.trim().startsWith('{')) return null
  try {
    const parsed = JSON.parse(reason)
    return parsed && (parsed.type === 'family_routine' || parsed.type === 'school_routine') ? parsed as RoutinePayload : null
  } catch {
    return null
  }
}

/** The routine a rule belongs to ("main" for older rows), or null when it isn't a routine's. */
export function routineKeyOfRule(rule: { reason?: string | null }): string | null {
  const payload = routinePayloadOf(rule.reason)
  return payload ? payload.key || MAIN_ROUTINE_KEY : null
}

/** A plain busy-hours row: unavailable, and not a routine's. */
function isPlainHours(rule: MemberAvailabilityRule): boolean {
  return rule.availability_type === 'unavailable' && !routinePayloadOf(rule.reason)
}

function routineFromRules(memberId: string, routineRules: MemberAvailabilityRule[]): FamilyRoutine {
  const sortedRoutineRules = [...routineRules].sort((a, b) => {
    const aTime = (a.updated_at || a.created_at || '') as string
    const bTime = (b.updated_at || b.created_at || '') as string
    return bTime.localeCompare(aTime)
  })

  const first = sortedRoutineRules[0]
  const payload: RoutinePayload = routinePayloadOf(first.reason) ?? {
    type: 'family_routine',
    routineType: 'school',
    title: 'Routine',
    venueName: '',
    shortVenueName: null,
    venueAddress: '',
    dropoffDriverName: 'Jake',
    pickupDriverName: 'Kelly',
    syncMode: 'exceptions_only',
    syncToGoogle: true,
    enabled: true,
  }

  const days = Array.from(new Set(routineRules.map((r) => r.day_of_week))).sort()

  const rawSyncMode = payload.syncMode
  let syncMode: RoutineSyncMode
  if (rawSyncMode === 'none' || rawSyncMode === 'exceptions_only' || rawSyncMode === 'all') {
    syncMode = rawSyncMode
  } else if (payload.syncToGoogle === false) {
    syncMode = 'none'
  } else {
    syncMode = 'exceptions_only'
  }

  const overrides = payload.dayOverrides || []
  const nonOverriddenRule = routineRules.find(
    (r) => !overrides.some((o) => o.dayOfWeek === r.day_of_week && o.enabled !== false && Boolean(o.startLocal || o.endLocal))
  )
  const baseStart = payload.startLocal || nonOverriddenRule?.start_local || first.start_local
  const baseEnd = payload.endLocal || nonOverriddenRule?.end_local || first.end_local
  // Work and care have no drop-off or pickup; the old defaults (Jake, Kelly) are only for school-like routines.
  const work = payload.routineType === 'work' || payload.routineType === 'care'

  return {
    key: payload.key || MAIN_ROUTINE_KEY,
    memberId,
    title: payload.title || 'Routine',
    routineType: payload.routineType || 'school',
    venueName: payload.venueName ?? '',
    shortVenueName: payload.shortVenueName ?? null,
    venueAddress: payload.venueAddress ?? '',
    ...(payload.pickupVenueName ? { pickupVenueName: payload.pickupVenueName, pickupVenueAddress: payload.pickupVenueAddress ?? null } : {}),
    dayOverrides: overrides,
    startDate: payload.startDate || null,
    endDate: payload.endDate || null,
    daysOfWeek: days.length > 0 ? days : [1, 2, 3, 4, 5],
    startLocal: baseStart.slice(0, 5),
    endLocal: baseEnd.slice(0, 5),
    // Work has no drop-off or pickup; the old defaults (Jake, Kelly) are only for school-like routines.
    dropoffDriverName: payload.dropoffDriverName || (work ? '' : 'Jake'),
    dropoffDriverId: payload.dropoffDriverId,
    pickupDriverName: payload.pickupDriverName || (work ? '' : 'Kelly'),
    pickupDriverId: payload.pickupDriverId,
    syncMode,
    syncToGoogle: syncMode !== 'none',
    enabled: payload.enabled ?? true,
  }
}

/** Plain busy hours as a Work routine: the usual hours, and the days that differ as "different on some days". */
function workFromPlainHours(memberId: string, plain: MemberAvailabilityRule[]): FamilyRoutine {
  const hours = (r: MemberAvailabilityRule) => `${r.start_local.slice(0, 5)}-${r.end_local.slice(0, 5)}`
  const counts = new Map<string, number>()
  for (const r of plain) counts.set(hours(r), (counts.get(hours(r)) ?? 0) + 1)
  const usual = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0]
  const [startLocal, endLocal] = usual.split('-')
  const days = Array.from(new Set(plain.map((r) => r.day_of_week))).sort()
  const dayOverrides: DayScheduleOverride[] = plain
    .filter((r) => hours(r) !== usual)
    .map((r) => ({ dayOfWeek: r.day_of_week, startLocal: r.start_local.slice(0, 5), endLocal: r.end_local.slice(0, 5), enabled: true }))
  return {
    key: WORK_HOURS_KEY,
    memberId,
    title: 'Work',
    routineType: 'work',
    venueName: '',
    shortVenueName: null,
    venueAddress: '',
    daysOfWeek: days,
    startLocal,
    endLocal,
    dayOverrides,
    startDate: null,
    endDate: null,
    dropoffDriverName: '',
    pickupDriverName: '',
    syncMode: 'none',
    syncToGoogle: false,
    enabled: true,
  }
}

/**
 * All of a person's routines, from their member_availability_rules rows: each keyed routine (older rows are
 * "main"), then plain working hours as a Work routine when no routine replaced them.
 */
export function deserializeRoutinesFromAvailabilityRules(memberId: string, rules: MemberAvailabilityRule[]): FamilyRoutine[] {
  const mine = rules.filter((r) => r.member_id === memberId)
  const groups = new Map<string, MemberAvailabilityRule[]>()
  for (const rule of mine) {
    const key = routineKeyOfRule(rule)
    if (key) groups.set(key, [...(groups.get(key) ?? []), rule])
  }
  const routines = [...groups.values()].map((group) => routineFromRules(memberId, group))
  const plain = mine.filter(isPlainHours)
  if (plain.length > 0 && !groups.has(WORK_HOURS_KEY)) routines.push(workFromPlainHours(memberId, plain))
  // The main routine first, then the rest in the order they were added.
  const order = (r: FamilyRoutine) => (r.key === MAIN_ROUTINE_KEY ? 0 : r.key === WORK_HOURS_KEY ? 2 : 1)
  return routines.sort((a, b) => order(a) - order(b))
}

/**
 * Deserializes member_availability_rules rows for a member into their main FamilyRoutine (if found).
 * The old screens edit only this one; the Family Wall reads them all (deserializeRoutinesFromAvailabilityRules).
 */
export function deserializeRoutineFromAvailabilityRules(
  memberId: string,
  rules: MemberAvailabilityRule[],
): FamilyRoutine | null {
  const routineRules = rules.filter((r) => r.member_id === memberId && routineKeyOfRule(r) === MAIN_ROUTINE_KEY)
  if (routineRules.length === 0) {
    // No main routine: the first keyed one, so older screens still see something.
    const other = rules.filter((r) => r.member_id === memberId && routineKeyOfRule(r))
    return other.length ? routineFromRules(memberId, other.filter((r) => routineKeyOfRule(r) === routineKeyOfRule(other[0]))) : null
  }
  return routineFromRules(memberId, routineRules)
}

/**
 * Updates a FamilyRoutine's day override from an edited recurring event.
 */
export function updateRoutineDayOverrideFromEvent(
  routine: FamilyRoutine,
  event: {
    title?: string
    start_time?: string
    end_time?: string
    driverName?: string
    driverId?: string | null
    isPickup?: boolean
  },
  dayOfWeek: number,
): FamilyRoutine {
  const currentOverrides = routine.dayOverrides || []
  const existingIdx = currentOverrides.findIndex((o) => o.dayOfWeek === dayOfWeek && o.enabled !== false)
  const existing = existingIdx >= 0 ? currentOverrides[existingIdx] : null

  let newStartLocal = existing?.startLocal || routine.startLocal
  let newEndLocal = existing?.endLocal || routine.endLocal
  let newDropDriverName = existing?.dropoffDriverName || routine.dropoffDriverName
  let newDropDriverId = existing?.dropoffDriverId !== undefined ? existing.dropoffDriverId : routine.dropoffDriverId
  let newPickDriverName = existing?.pickupDriverName || routine.pickupDriverName
  let newPickDriverId = existing?.pickupDriverId !== undefined ? existing.pickupDriverId : routine.pickupDriverId

  if (event.start_time) {
    const match = event.start_time.match(/T(\d{2}:\d{2})/)
    const timeStr = match ? match[1] : format(new Date(event.start_time), 'HH:mm')
    if (event.isPickup) {
      newEndLocal = timeStr
      if (event.driverName) newPickDriverName = event.driverName
      if (event.driverId !== undefined) newPickDriverId = event.driverId
    } else {
      newStartLocal = timeStr
      if (event.driverName) newDropDriverName = event.driverName
      if (event.driverId !== undefined) newDropDriverId = event.driverId
    }
  }

  const updatedOverride: DayScheduleOverride = {
    dayOfWeek,
    startLocal: newStartLocal,
    endLocal: newEndLocal,
    dropoffDriverName: newDropDriverName,
    dropoffDriverId: newDropDriverId || null,
    pickupDriverName: newPickDriverName,
    pickupDriverId: newPickDriverId || null,
    label: event.title || existing?.label || 'Custom schedule',
    enabled: true,
  }

  const updatedOverrides = existingIdx >= 0
    ? currentOverrides.map((o, idx) => (idx === existingIdx ? updatedOverride : o))
    : [...currentOverrides, updatedOverride]

  return {
    ...routine,
    dayOverrides: updatedOverrides,
  }
}

export {
  syncMemberRoutineExceptions,
  extractDesiredRoutineSeries,
  getFirstOccurrenceDate,
} from './routineRecurrenceCoordinator.ts'

export type RoutineDayType = 'school_day' | 'weekend' | 'holiday_break'

export function resolveDayTypeForDate(
  targetDate: Date,
  familyRoutines: FamilyRoutine[],
  availabilityExceptions: MemberAvailabilityException[] = [],
): RoutineDayType {
  const dayOfWeek = targetDate.getDay() // 0=Sun, 6=Sat
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    return 'weekend'
  }

  const dateKey = format(targetDate, 'yyyy-MM-dd')
  const childRoutines = familyRoutines.filter((r) => r.enabled && r.routineType === 'school')
  if (childRoutines.length > 0) {
    const allChildrenDayOff = childRoutines.every((r) => {
      return availabilityExceptions.some((ex) => {
        if (ex.member_id !== r.memberId) return false
        if (ex.override_type !== 'day_off') return false
        try {
          const exStart = format(new Date(ex.start_at), 'yyyy-MM-dd')
          const exEnd = format(new Date(ex.end_at), 'yyyy-MM-dd')
          return dateKey >= exStart && dateKey <= exEnd
        } catch {
          return false
        }
      })
    })
    if (allChildrenDayOff) return 'holiday_break'
  }

  return 'school_day'
}




