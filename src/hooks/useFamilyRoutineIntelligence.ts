import { useMemo, useState, useEffect, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format, addDays, parseISO } from 'date-fns'
import type { FamilyMember, MemberAvailabilityException } from '../types'
import { useFamilyMembers } from './useFamilyMembers'
import { useMemberAvailability } from './useMemberAvailability'
import { useTodayEvents, useTomorrowEvents, type EventWithDetails } from './useCalendarEvents'
import {
  deserializeRoutineFromAvailabilityRules,
  formatDisplayVenueName,
  type FamilyRoutine,
  type AmbientRoutineStatus,
  deriveAmbientRoutineStatus,
  resolveDayTypeForDate,
  type RoutineDayType,
} from '../lib/familyRoutines'
import { isReminderOrChore } from '../lib/heroFocus.mjs'
import {
  fetchTodoCompletions,
  getStoredTodoCompletions,
  saveTodoToggle,
  subscribeToTodoSync,
} from '../utils/todoCompletionsSync'
import { usePageVisibility } from './usePageVisibility'

export { resolveDayTypeForDate, type RoutineDayType }

export interface DepartureItem {
  id: string
  eventId?: string
  rawEvent?: EventWithDetails
  title?: string
  venueName: string
  venueAddress: string
  shortVenueName?: string
  departureTime: string // ISO string
  leaveByTimeFormatted: string // e.g. "7:42 AM"
  arrivalWindow: string // e.g. "8:00 AM"
  driveMinutes: number
  driverName: string
  driverMember: FamilyMember | null
  children: FamilyMember[]
  childNamesFormatted: string // e.g. "Emme & Owen"
  isException: boolean
  exceptionLabel: string | null // e.g. "Early Strings"
  isCompleted: boolean // True if departureTime + 20 min grace window has passed
  isLeaveNow: boolean
  isPrepUrgent: boolean
  minutesUntilLeave: number
  isDeparted: boolean
  isWeekendActivity?: boolean
}

export interface BedtimePrepItem {
  id: string
  label: string
  completed: boolean
  childName?: string
  iconType?: 'backpack' | 'bottle' | 'lunch' | 'music' | 'sports' | 'gift' | 'general'
}

export interface FamilyRoutineIntelligence {
  phase: 'evening_prep' | 'morning_action' | 'daytime_whereabouts' | 'rest'
  isEvening: boolean
  isMorning: boolean
  isDaytime: boolean
  targetDate: Date
  todayDayType: RoutineDayType
  tomorrowDayType: RoutineDayType
  isTodayWeekend: boolean
  isTomorrowWeekend: boolean
  isTodaySchoolDay: boolean
  isTomorrowSchoolDay: boolean
  todayDayName: string
  todayFormattedDate: string
  todayDepartures: DepartureItem[]
  hasTodayDepartures: boolean
  allTodayDeparturesCompleted: boolean
  isMorningActionActive: boolean
  nextTodayDeparture: DepartureItem | null
  todayPrepChecklist: BedtimePrepItem[]
  toggleTodayPrepItem: (id: string) => void
  tomorrowDate: Date
  tomorrowDayName: string
  tomorrowFormattedDate: string
  tomorrowDepartures: DepartureItem[]
  hasTomorrowExceptions: boolean
  primaryTomorrowException: DepartureItem | null
  prepChecklist: BedtimePrepItem[]
  togglePrepItem: (id: string) => void
  completedCount: number
  totalPrepCount: number
  allPrepCompleted: boolean
  ambientStatuses: AmbientRoutineStatus[]
  activeRoutinesCount: number
}

const STORAGE_PREFIX = 'casa_bedtime_prep_'

function getEstimatedDriveMinutes(venueName = '', venueAddress = ''): number {
  const text = `${venueName} ${venueAddress}`.toLowerCase()
  if (text.includes('bak middle') || text.includes('bak') || text.includes('echo lake')) return 18
  if (text.includes('palm beach public')) return 10
  if (text.includes('phipps') || text.includes('soccer')) return 12
  if (text.includes('cocoanut row')) return 10
  if (text.includes('great lawn') || text.includes('pompano')) return 35
  if (text.includes('cox science') || text.includes('aquarium')) return 10
  return 15
}

function resolveEventDriver(
  evt: EventWithDetails,
  familyMembers: FamilyMember[],
): { id: string | null; name: string | null } {
  if (evt.plan_override?.driver_overrides) {
    const overrideKeys = Object.keys(evt.plan_override.driver_overrides)
    if (overrideKeys.length > 0) {
      const driverMemberId = evt.plan_override.driver_overrides[overrideKeys[0]]
      const driver = familyMembers.find((m) => m.id === driverMemberId)
      if (driver) return { id: driver.id, name: driver.name }
    }
  }

  const driverMember = (evt.members || []).find((m) => m.role === 'driver')?.family_member
  if (driverMember) {
    return { id: driverMember.id, name: driverMember.name }
  }

  const titleLower = (evt.title || '').toLowerCase()
  if (titleLower.includes('jake')) return { id: null, name: 'Jake' }
  if (titleLower.includes('kelly')) return { id: null, name: 'Kelly' }
  if (titleLower.includes('giselle')) return { id: null, name: 'Giselle' }

  return { id: null, name: 'Jake' }
}

function deriveDeparturesForDate(
  targetDate: Date,
  now: Date,
  familyRoutines: FamilyRoutine[],
  familyMembers: FamilyMember[],
  availabilityExceptions: MemberAvailabilityException[] = [],
  calendarEvents: EventWithDetails[] = [],
): DepartureItem[] {
  const dayType = resolveDayTypeForDate(targetDate, familyRoutines, availabilityExceptions)
  const dateKey = format(targetDate, 'yyyy-MM-dd')
  const dayOfWeek = targetDate.getDay()

  // ─────────────────────────────────────────────────────────────
  // 1. WEEKEND or HOLIDAY / BREAK DEPARTURES (Event-Driven Flow)
  // ─────────────────────────────────────────────────────────────
  if (dayType === 'weekend' || dayType === 'holiday_break') {
    const departures: DepartureItem[] = []

    const hardEvents = calendarEvents
      .filter((evt) => {
        if (evt.event_type === 'reminder' || isReminderOrChore(evt)) return false
        try {
          const start = parseISO(evt.start_time)
          const evtDateStr = format(start, 'yyyy-MM-dd')
          return evtDateStr === dateKey
        } catch {
          return false
        }
      })
      .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())

    for (const evt of hardEvents) {
      try {
        const start = parseISO(evt.start_time)
        const driveMins = evt.enrichment?.drive_time_mins || getEstimatedDriveMinutes(evt.location_name || '', evt.address || '')
        const departureDate = new Date(start.getTime() - driveMins * 60 * 1000)
        const isCompleted = now.getTime() > departureDate.getTime() + 20 * 60 * 1000
        const minutesUntilLeave = Math.round((departureDate.getTime() - now.getTime()) / 60000)
        const isLeaveNow = minutesUntilLeave <= 5 && !isCompleted
        const isPrepUrgent = minutesUntilLeave > 5 && minutesUntilLeave <= 20 && !isCompleted
        const isDeparted = isCompleted

        const { id: resolvedDriverId, name: resolvedDriverName } = resolveEventDriver(evt, familyMembers)
        const driverMember = familyMembers.find((m) => m.id === resolvedDriverId) || null

        const eventAttendees = (evt.members || [])
          .map((m) => m.family_member)
          .filter((m): m is FamilyMember => Boolean(m))

        const attendeeNames = eventAttendees.length > 0
          ? eventAttendees.map((m) => m.name).join(' & ')
          : 'Tabor Family'

        departures.push({
          id: `dep-event-${evt.id}-${dateKey}`,
          eventId: evt.id,
          rawEvent: evt,
          title: evt.title,
          venueName: evt.location_name || evt.address || evt.title,
          venueAddress: evt.address || '',
          shortVenueName: formatDisplayVenueName(evt.location_name || evt.title),
          departureTime: departureDate.toISOString(),
          leaveByTimeFormatted: evt.all_day ? 'Flexible' : format(departureDate, 'h:mm a'),
          arrivalWindow: evt.all_day ? 'All Day' : format(start, 'h:mm a'),
          driveMinutes: driveMins,
          driverName: resolvedDriverName || 'Jake',
          driverMember,
          children: eventAttendees,
          childNamesFormatted: attendeeNames,
          isException: false,
          exceptionLabel: evt.title,
          isCompleted,
          isLeaveNow,
          isPrepUrgent,
          minutesUntilLeave,
          isDeparted,
          isWeekendActivity: true,
        })
      } catch {}
    }

    return departures
  }

  // ─────────────────────────────────────────────────────────────
  // 2. SCHOOL DAY DEPARTURES (Weekday Routine Logistics)
  // ─────────────────────────────────────────────────────────────
  if (familyRoutines.length === 0 || familyMembers.length === 0) return []

  const activeRoutines = familyRoutines.filter((r) => {
    if (!r.enabled) return false
    if (r.startDate && dateKey < r.startDate) return false
    if (r.endDate && dateKey > r.endDate) return false
    if (!r.daysOfWeek.includes(dayOfWeek)) return false

    // If child has day_off exception on targetDate, skip routine departure
    const hasDayOff = availabilityExceptions.some((ex) => {
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
    if (hasDayOff) return false

    return true
  })

  if (activeRoutines.length === 0) return []

  const groups = new Map<string, {
    venueName: string
    venueAddress: string
    startLocal: string
    driverName: string
    driverId: string | null
    label: string | null
    children: FamilyMember[]
    isException: boolean
    customDepartureTime?: string
    customWindowStartTime?: Date
    customSchoolStartTime?: Date
    eventId?: string
    rawEvent?: EventWithDetails
  }>()

  for (const routine of activeRoutines) {
    const child = familyMembers.find((m) => m.id === routine.memberId)
    if (!child) continue

    // Check if there are morning calendar events specifically for this child
    const childMorningEvents = calendarEvents.filter((evt) => {
      if (evt.all_day || evt.event_type === 'reminder' || isReminderOrChore(evt)) return false
      try {
        const start = parseISO(evt.start_time)
        const evtDateStr = format(start, 'yyyy-MM-dd')
        if (evtDateStr !== dateKey) return false
        const hour = start.getHours() + start.getMinutes() / 60
        if (hour < 5.5 || hour > 9.5) return false

        const isChildAttendee = (evt.members || []).some(
          (m) => m.family_member?.id === child.id || m.family_member?.name?.toLowerCase() === child.name.toLowerCase()
        )
        const isChildInTitle = (evt.title || '').toLowerCase().includes(child.name.toLowerCase())
        return isChildAttendee || isChildInTitle
      } catch {
        return false
      }
    }).sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())

    let effStartLocal: string
    let effDropDriverName: string
    let effDropDriverId: string | null
    let overrideLabel: string | null
    let effVenueName: string
    let effVenueAddress: string
    let isException: boolean
    let customDepartureTime: string | undefined
    let customWindowStartTime: Date | undefined
    let customSchoolStartTime: Date | undefined
    let effEventId: string | undefined
    let effRawEvent: EventWithDetails | undefined

    if (childMorningEvents.length > 0) {
      const earlyEvt = childMorningEvents[0]
      const evtStart = parseISO(earlyEvt.start_time)
      effStartLocal = format(evtStart, 'HH:mm')
      effVenueName = earlyEvt.location_name || earlyEvt.address || routine.venueName
      effVenueAddress = earlyEvt.address || routine.venueAddress
      effEventId = earlyEvt.id
      effRawEvent = earlyEvt

      const { id: resolvedDriverId, name: resolvedDriverName } = resolveEventDriver(earlyEvt, familyMembers)
      effDropDriverName = resolvedDriverName || routine.dropoffDriverName || 'Jake'
      effDropDriverId = resolvedDriverId || routine.dropoffDriverId || null

      const cleanedTitle = earlyEvt.title
        .replace(new RegExp(`^${child.name}\\s*([0-9]+(:[0-9]+)?\\s*(am|pm)?:?)?\\s*:?\\s*`, 'i'), '')
        .replace(/^(drop off|drop-off)\s*/i, '')
        .trim()
      overrideLabel = cleanedTitle || earlyEvt.title
      isException = true

      const driveMins = earlyEvt.enrichment?.drive_time_mins || getEstimatedDriveMinutes(effVenueName, effVenueAddress)
      if (earlyEvt.enrichment?.departure_time) {
        customDepartureTime = earlyEvt.enrichment.departure_time
      } else {
        const depDate = new Date(evtStart.getTime() - driveMins * 60 * 1000)
        customDepartureTime = depDate.toISOString()
      }
      customWindowStartTime = evtStart
      customSchoolStartTime = evtStart
    } else {
      const override = (routine.dayOverrides || []).find((o) => o.dayOfWeek === dayOfWeek && o.enabled)
      effStartLocal = override?.startLocal || routine.startLocal
      effDropDriverName = override?.dropoffDriverName || routine.dropoffDriverName || 'Jake'
      effDropDriverId = override?.dropoffDriverId || routine.dropoffDriverId || null
      overrideLabel = override?.label || null
      effVenueName = routine.venueName
      effVenueAddress = routine.venueAddress
      isException = Boolean(override?.startLocal && override.startLocal !== routine.startLocal)
    }

    const groupKey = `${effVenueName}::${effStartLocal}::${effDropDriverName}`

    if (!groups.has(groupKey)) {
      groups.set(groupKey, {
        venueName: effVenueName,
        venueAddress: effVenueAddress,
        startLocal: effStartLocal,
        driverName: effDropDriverName,
        driverId: effDropDriverId,
        label: overrideLabel,
        children: [child],
        isException,
        customDepartureTime,
        customWindowStartTime,
        customSchoolStartTime,
        eventId: effEventId,
        rawEvent: effRawEvent,
      })
    } else {
      const g = groups.get(groupKey)!
      if (!g.children.some((c) => c.id === child.id)) {
        g.children.push(child)
      }
      if (isException) {
        g.isException = true
        if (overrideLabel) g.label = overrideLabel
      }
      if (effEventId && !g.eventId) {
        g.eventId = effEventId
        g.rawEvent = effRawEvent
      }
    }
  }

  const departures: DepartureItem[] = []

  for (const [key, grp] of groups.entries()) {
    const [hoursStr, minsStr] = grp.startLocal.split(':')
    const targetHours = parseInt(hoursStr, 10) || 8
    const targetMins = parseInt(minsStr, 10) || 0

    const driveMins = getEstimatedDriveMinutes(grp.venueName, grp.venueAddress)

    const windowStart = grp.customWindowStartTime || new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), targetHours, targetMins)
    const schoolStart = grp.customSchoolStartTime || windowStart

    const departureDate = grp.customDepartureTime
      ? new Date(grp.customDepartureTime)
      : new Date(schoolStart.getTime() - driveMins * 60 * 1000)

    const isCompleted = now.getTime() > departureDate.getTime() + 20 * 60 * 1000
    const minutesUntilLeave = Math.round((departureDate.getTime() - now.getTime()) / 60000)
    const isLeaveNow = minutesUntilLeave <= 5 && !isCompleted
    const isPrepUrgent = minutesUntilLeave > 5 && minutesUntilLeave <= 20 && !isCompleted
    const isDeparted = isCompleted

    const driverMember = familyMembers.find((m) => m.id === grp.driverId) || null

    const childNames = grp.children.map((c) => c.name)
    const childNamesFormatted =
      childNames.length === 1
        ? childNames[0]
        : childNames.slice(0, -1).join(', ') + ' & ' + childNames[childNames.length - 1]

    const eventId = grp.eventId || `routine-drop-${grp.children.map((c) => c.id).sort().join('-')}-${dateKey}`

    const rawEvent: EventWithDetails = grp.rawEvent || {
      id: eventId,
      title: grp.label ? `${grp.label} · Drop off ${childNamesFormatted}` : `Drop off ${childNamesFormatted} @ ${grp.venueName}`,
      description: `Morning drop-off for ${childNamesFormatted}.${grp.label ? ` Note: ${grp.label}.` : ''}`,
      start_time: windowStart.toISOString(),
      end_time: new Date(windowStart.getTime() + 15 * 60000).toISOString(),
      all_day: false,
      event_type: 'event',
      location_name: grp.venueName,
      address: grp.venueAddress,
      lat: null,
      lng: null,
      google_event_id: null,
      google_calendar_id: null,
      source_member_id: driverMember?.id || grp.driverId || null,
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
          role: 'driver',
          family_member: driverMember,
        }] : []),
        ...grp.children.map((child, idx) => ({
          id: `mem-${eventId}-child-${idx}`,
          role: 'passenger',
          family_member: child,
        })),
      ],
      enrichment: {
        id: `enr-${eventId}`,
        event_id: eventId,
        drive_time_mins: driveMins,
        departure_time: departureDate.toISOString(),
        route_summary: `Direct drive to ${grp.venueName}`,
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
        category: 'school',
        category_locked: true,
        confidence: 'high',
        enriched_by: 'family_routines',
        enriched_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      plan_override: null,
      logistics: [],
      checklist: [],
      actions: [],
    }

    departures.push({
      id: `dep-${key}-${dateKey}`,
      eventId,
      rawEvent,
      title: grp.label || 'School Drop-off',
      venueName: grp.venueName,
      venueAddress: grp.venueAddress,
      shortVenueName: formatDisplayVenueName(grp.venueName),
      departureTime: departureDate.toISOString(),
      leaveByTimeFormatted: format(departureDate, 'h:mm a'),
      arrivalWindow: format(windowStart, 'h:mm a'),
      driveMinutes: driveMins,
      driverName: grp.driverName,
      driverMember,
      children: grp.children,
      childNamesFormatted,
      isException: grp.isException,
      exceptionLabel: grp.label,
      isCompleted,
      isLeaveNow,
      isPrepUrgent,
      minutesUntilLeave,
      isDeparted,
      isWeekendActivity: false,
    })
  }

  return departures.sort((a, b) => new Date(a.departureTime).getTime() - new Date(b.departureTime).getTime())
}

function derivePrepChecklist(
  dayType: RoutineDayType,
  departures: DepartureItem[],
  dateKey: string,
  completedMap: Record<string, boolean>,
  calendarEvents: EventWithDetails[] = [],
): BedtimePrepItem[] {
  const items: BedtimePrepItem[] = []

  // ─────────────────────────────────────────────────────────────
  // 1. SCHOOL DAY PREP (Sun night → Thu night for Mon–Fri school)
  // ─────────────────────────────────────────────────────────────
  if (dayType === 'school_day') {
    const idBackpacks = `item-backpacks-${dateKey}`
    items.push({
      id: idBackpacks,
      label: 'Backpacks & homework folders packed',
      completed: Boolean(completedMap[idBackpacks]),
      iconType: 'backpack',
    })

    const idLunch = `item-lunch-${dateKey}`
    items.push({
      id: idLunch,
      label: 'Lunchboxes & morning snacks staged',
      completed: Boolean(completedMap[idLunch]),
      iconType: 'lunch',
    })

    const idBottles = `item-bottles-${dateKey}`
    items.push({
      id: idBottles,
      label: 'Water bottles filled & chilled',
      completed: Boolean(completedMap[idBottles]),
      iconType: 'bottle',
    })

    // Contextual conditional items: ONLY if tomorrow actually has music/sports/devices
    for (const dep of departures) {
      if (dep.isException && dep.exceptionLabel) {
        const text = dep.exceptionLabel.toLowerCase()
        if (text.includes('string') || text.includes('violin') || text.includes('instrument') || text.includes('orchestra')) {
          const id = `item-music-${dateKey}`
          if (!items.some((i) => i.id === id)) {
            items.push({
              id,
              label: `${dep.childNamesFormatted}: Pack instrument & sheet music folder`,
              completed: Boolean(completedMap[id]),
              childName: dep.childNamesFormatted,
              iconType: 'music',
            })
          }
        }
        if (text.includes('sport') || text.includes('pe') || text.includes('gym') || text.includes('athletic')) {
          const id = `item-sports-${dateKey}`
          if (!items.some((i) => i.id === id)) {
            items.push({
              id,
              label: `${dep.childNamesFormatted}: Stage athletic uniform & shoes`,
              completed: Boolean(completedMap[id]),
              childName: dep.childNamesFormatted,
              iconType: 'sports',
            })
          }
        }
      }
    }
  } else if (dayType === 'weekend') {
    // ─────────────────────────────────────────────────────────────
    // 2. WEEKEND READINESS PREP (Fri & Sat nights for Sat & Sun)
    // ─────────────────────────────────────────────────────────────
    let hasBirthdayItem = false
    let hasSportsItem = false
    let hasMusicItem = false
    let hasProjectItem = false
    let hasMedicalItem = false
    let hasOutingItem = false

    for (const evt of calendarEvents) {
      try {
        const start = parseISO(evt.start_time)
        const evtDateStr = format(start, 'yyyy-MM-dd')
        if (evtDateStr !== dateKey) continue

        const title = (evt.title || '').toLowerCase()
        const loc = (evt.location_name || '').toLowerCase()
        const passengerName = (evt.members || []).find((m) => m.role === 'passenger')?.family_member?.name || ''
        const prefix = passengerName ? `${passengerName}: ` : ''

        // 1. Birthday party / celebration (Get gift & card ready)
        if (!hasBirthdayItem && (title.includes('birthday') || title.includes('bday') || title.includes('b-day') || title.includes('party'))) {
          hasBirthdayItem = true
          const id = `item-birthday-${dateKey}`
          items.push({
            id,
            label: `${prefix}Get birthday gift & card ready / wrap present`,
            completed: Boolean(completedMap[id]),
            childName: passengerName,
            iconType: 'gift',
          })
        }

        // 2. Sports (Soccer, Tennis, Swim, Game, Practice, Tournament, Martial Arts)
        if (!hasSportsItem && (title.includes('soccer') || title.includes('tennis') || title.includes('baseball') || title.includes('basketball') || title.includes('swim') || title.includes('karate') || title.includes('gymnastics') || title.includes('practice') || title.includes('game') || title.includes('match') || title.includes('tournament') || title.includes('league'))) {
          hasSportsItem = true
          const id = `item-sports-${dateKey}`
          items.push({
            id,
            label: `${prefix}Stage athletic uniform, cleats & sports gear`,
            completed: Boolean(completedMap[id]),
            childName: passengerName,
            iconType: 'sports',
          })
        }

        // 3. Formal music lessons / strings / orchestra (exclude festivals/concerts in park)
        const isFormalMusic = (title.includes('violin') || title.includes('viola') || title.includes('cello') || title.includes('piano') || title.includes('guitar') || title.includes('strings') || title.includes('orchestra') || title.includes('music lesson') || title.includes('recital')) && !title.includes('fest') && !title.includes('festival')
        if (!hasMusicItem && isFormalMusic) {
          hasMusicItem = true
          const id = `item-music-${dateKey}`
          items.push({
            id,
            label: `${prefix}Pack instrument & sheet music folder`,
            completed: Boolean(completedMap[id]),
            childName: passengerName,
            iconType: 'music',
          })
        }

        // 4. Community service / volunteer / clean-up / project
        if (!hasProjectItem && (title.includes('clean-up') || title.includes('cleanup') || title.includes('volunteer') || title.includes('project uplift') || title.includes('community service') || title.includes('workday'))) {
          hasProjectItem = true
          const id = `item-project-${dateKey}`
          items.push({
            id,
            label: 'Stage project supplies, work gear & sun protection',
            completed: Boolean(completedMap[id]),
            iconType: 'general',
          })
        }

        // 5. Doctor / Pediatrician / Dentist / Clinic
        if (!hasMedicalItem && (title.includes('doctor') || title.includes('pediatric') || title.includes('dentist') || title.includes('checkup') || title.includes('well-child') || title.includes('clinic') || title.includes('appointment'))) {
          hasMedicalItem = true
          const id = `item-medical-${dateKey}`
          items.push({
            id,
            label: 'Prepare check-in forms & insurance cards',
            completed: Boolean(completedMap[id]),
            iconType: 'general',
          })
        }

        // 6. Outings / Science Center / Festival / Beach / Aquarium
        if (!hasOutingItem && (title.includes('fest') || title.includes('festival') || title.includes('science center') || title.includes('aquarium') || title.includes('museum') || title.includes('zoo') || loc.includes('science center') || loc.includes('aquarium') || loc.includes('museum') || loc.includes('lawn') || loc.includes('beach') || loc.includes('park'))) {
          hasOutingItem = true
          const id = `item-outing-${dateKey}`
          items.push({
            id,
            label: 'Stage tickets, passes & family day essentials',
            completed: Boolean(completedMap[id]),
            iconType: 'general',
          })
        }
      } catch {}
    }

    // 7. Proactive To-Dos / Reminders for Tomorrow
    const tomorrowReminders = calendarEvents.filter((e) => e.event_type === 'reminder')
    for (const rem of tomorrowReminders) {
      const id = `item-reminder-${rem.id}`
      items.push({
        id,
        label: `To-Do: ${rem.title}`,
        completed: Boolean(completedMap[id]),
        iconType: 'general',
      })
    }

    // 8. Weekend Hydration
    const idBottles = `item-bottles-${dateKey}`
    items.push({
      id: idBottles,
      label: 'Water bottles filled & chilled for weekend activities',
      completed: Boolean(completedMap[idBottles]),
      iconType: 'bottle',
    })

    // If no specific gear was needed, add relaxed weekend flow item
    if (!hasBirthdayItem && !hasSportsItem && !hasProjectItem && !hasMusicItem && !hasMedicalItem && !hasOutingItem && tomorrowReminders.length === 0) {
      const idOpen = `item-weekend-open-${dateKey}`
      items.push({
        id: idOpen,
        label: 'Weekend recharge · Family breakfast & open morning flow',
        completed: Boolean(completedMap[idOpen]),
        iconType: 'general',
      })
    }
  } else {
    // ─────────────────────────────────────────────────────────────
    // 3. SCHOOL HOLIDAY / BREAK PREP
    // ─────────────────────────────────────────────────────────────
    const idHoliday = `item-holiday-${dateKey}`
    items.push({
      id: idHoliday,
      label: 'School holiday break · No morning school routine required',
      completed: Boolean(completedMap[idHoliday]),
      iconType: 'general',
    })
    const idBottles = `item-bottles-${dateKey}`
    items.push({
      id: idBottles,
      label: 'Water bottles filled & chilled for day activities',
      completed: Boolean(completedMap[idBottles]),
      iconType: 'bottle',
    })
  }

  return items
}

export function useFamilyRoutineIntelligence(now: Date = new Date()): FamilyRoutineIntelligence {
  const { data: familyMembers = [] } = useFamilyMembers()
  const memberIds = useMemo(() => (familyMembers as FamilyMember[]).map((m: FamilyMember) => m.id), [familyMembers])
  const { rules: availabilityRules = [], exceptions: availabilityExceptions = [] } = useMemberAvailability(memberIds)
  const { data: todayEvents = [] } = useTodayEvents(now)
  const { data: tomorrowEvents = [] } = useTomorrowEvents(now)

  const familyRoutines = useMemo<FamilyRoutine[]>(() => {
    return (familyMembers as FamilyMember[])
      .map((m: FamilyMember) => deserializeRoutineFromAvailabilityRules(m.id, availabilityRules))
      .filter((r): r is FamilyRoutine => Boolean(r && r.enabled))
  }, [familyMembers, availabilityRules])

  const currentHour = now.getHours()
  const currentMinute = now.getMinutes()
  const decimalTime = currentHour + currentMinute / 60

  const todayKey = useMemo(() => format(now, 'yyyy-MM-dd'), [now])
  const tomorrowDate = useMemo(() => addDays(now, 1), [now])
  const tomorrowKey = useMemo(() => format(tomorrowDate, 'yyyy-MM-dd'), [tomorrowDate])

  const todayDayType = useMemo<RoutineDayType>(() => {
    return resolveDayTypeForDate(now, familyRoutines, availabilityExceptions)
  }, [now, familyRoutines, availabilityExceptions])

  const tomorrowDayType = useMemo<RoutineDayType>(() => {
    return resolveDayTypeForDate(tomorrowDate, familyRoutines, availabilityExceptions)
  }, [tomorrowDate, familyRoutines, availabilityExceptions])

  // Derive TODAY's morning routine departures
  const todayDepartures = useMemo<DepartureItem[]>(() => {
    return deriveDeparturesForDate(now, now, familyRoutines, familyMembers as FamilyMember[], availabilityExceptions, todayEvents)
  }, [now, familyRoutines, familyMembers, availabilityExceptions, todayEvents])

  const hasTodayDepartures = todayDepartures.length > 0

  // True if today has departures and every single departure has departed and completed its grace window
  const allTodayDeparturesCompleted = useMemo(() => {
    if (todayDepartures.length === 0) return false
    return todayDepartures.every((d) => d.isCompleted)
  }, [todayDepartures])

  const isMorningActionActive = useMemo(() => {
    if (decimalTime < 6.0 || decimalTime >= 9.5) return false
    if (!hasTodayDepartures) return false
    return !allTodayDeparturesCompleted
  }, [decimalTime, hasTodayDepartures, allTodayDeparturesCompleted])

  const phase: FamilyRoutineIntelligence['phase'] = useMemo(() => {
    if (decimalTime >= 17.5 && decimalTime < 23.0) return 'evening_prep'
    if (decimalTime >= 6.0 && decimalTime < 9.5) {
      if (hasTodayDepartures && allTodayDeparturesCompleted) {
        return 'daytime_whereabouts'
      }
      return 'morning_action'
    }
    if (decimalTime >= 9.5 && decimalTime < 17.5) return 'daytime_whereabouts'
    return 'rest'
  }, [decimalTime, hasTodayDepartures, allTodayDeparturesCompleted])

  const isEvening = phase === 'evening_prep'
  const isMorning = phase === 'morning_action'
  const isDaytime = phase === 'daytime_whereabouts'

  const nextTodayDeparture = useMemo(() => {
    return todayDepartures.find((d) => !d.isCompleted) || todayDepartures[0] || null
  }, [todayDepartures])

  // Derive TOMORROW's departures
  const tomorrowDepartures = useMemo<DepartureItem[]>(() => {
    return deriveDeparturesForDate(tomorrowDate, now, familyRoutines, familyMembers as FamilyMember[], availabilityExceptions, tomorrowEvents)
  }, [tomorrowDate, now, familyRoutines, familyMembers, availabilityExceptions, tomorrowEvents])

  const hasTomorrowExceptions = useMemo(() => {
    return tomorrowDepartures.some((d) => d.isException)
  }, [tomorrowDepartures])

  const primaryTomorrowException = useMemo(() => {
    return tomorrowDepartures.find((d) => d.isException) || null
  }, [tomorrowDepartures])

  const isPageVisible = usePageVisibility()
  const { data: serverCompletions } = useQuery({
    queryKey: ['household-todo-completions'],
    queryFn: fetchTodoCompletions,
    staleTime: 60_000,
    refetchInterval: isPageVisible ? 120_000 : false,
  })

  // Bedtime & Morning Prep Checklist state management
  const [completedItems, setCompletedItems] = useState<Record<string, boolean>>(() => {
    try {
      const stored = localStorage.getItem(`${STORAGE_PREFIX}${todayKey}`)
      const tomorrowStored = localStorage.getItem(`${STORAGE_PREFIX}${tomorrowKey}`)
      const unifiedStored = getStoredTodoCompletions()
      return {
        ...(stored ? JSON.parse(stored) : {}),
        ...(tomorrowStored ? JSON.parse(tomorrowStored) : {}),
        ...unifiedStored,
      }
    } catch {
      return getStoredTodoCompletions()
    }
  })

  useEffect(() => {
    if (serverCompletions && Object.keys(serverCompletions).length > 0) {
      setCompletedItems((prev) => ({ ...serverCompletions, ...prev }))
    }
  }, [serverCompletions])

  useEffect(() => {
    const unsubscribe = subscribeToTodoSync((id, completed, fullMap) => {
      setCompletedItems((prev) => ({
        ...prev,
        ...fullMap,
        [id]: completed,
      }))
    })
    return unsubscribe
  }, [])

  const toggleTodayPrepItem = useCallback((id: string) => {
    setCompletedItems((prev) => {
      const nextVal = !prev[id]
      const next = { ...prev, [id]: nextVal }
      try {
        localStorage.setItem(`${STORAGE_PREFIX}${todayKey}`, JSON.stringify(next))
      } catch {}
      void saveTodoToggle(id, nextVal)
      return next
    })
  }, [todayKey])

  const togglePrepItem = useCallback((id: string) => {
    setCompletedItems((prev) => {
      const nextVal = !prev[id]
      const next = { ...prev, [id]: nextVal }
      try {
        localStorage.setItem(`${STORAGE_PREFIX}${tomorrowKey}`, JSON.stringify(next))
      } catch {}
      void saveTodoToggle(id, nextVal)
      return next
    })
  }, [tomorrowKey])

  const todayPrepChecklist = useMemo<BedtimePrepItem[]>(() => {
    return derivePrepChecklist(todayDayType, todayDepartures, todayKey, completedItems, todayEvents)
  }, [todayDayType, todayDepartures, todayKey, completedItems, todayEvents])

  const prepChecklist = useMemo<BedtimePrepItem[]>(() => {
    return derivePrepChecklist(tomorrowDayType, tomorrowDepartures, tomorrowKey, completedItems, tomorrowEvents)
  }, [tomorrowDayType, tomorrowDepartures, tomorrowKey, completedItems, tomorrowEvents])

  const completedCount = useMemo(() => {
    return prepChecklist.filter((item) => item.completed).length
  }, [prepChecklist])

  const totalPrepCount = prepChecklist.length
  const allPrepCompleted = totalPrepCount > 0 && completedCount === totalPrepCount

  // Ambient Statuses during current day
  const ambientStatuses = useMemo(() => {
    return deriveAmbientRoutineStatus(familyRoutines, familyMembers as FamilyMember[], now)
  }, [familyRoutines, familyMembers, now])

  return {
    phase,
    isEvening,
    isMorning,
    isDaytime,
    targetDate: now,
    todayDayType,
    tomorrowDayType,
    isTodayWeekend: todayDayType === 'weekend',
    isTomorrowWeekend: tomorrowDayType === 'weekend',
    isTodaySchoolDay: todayDayType === 'school_day',
    isTomorrowSchoolDay: tomorrowDayType === 'school_day',
    todayDayName: format(now, 'EEEE'),
    todayFormattedDate: format(now, 'MMMM d'),
    todayDepartures,
    hasTodayDepartures,
    allTodayDeparturesCompleted,
    isMorningActionActive,
    nextTodayDeparture,
    todayPrepChecklist,
    toggleTodayPrepItem,
    tomorrowDate,
    tomorrowDayName: format(tomorrowDate, 'EEEE'),
    tomorrowFormattedDate: format(tomorrowDate, 'MMMM d'),
    tomorrowDepartures,
    hasTomorrowExceptions,
    primaryTomorrowException,
    prepChecklist,
    togglePrepItem,
    completedCount,
    totalPrepCount,
    allPrepCompleted,
    ambientStatuses,
    activeRoutinesCount: familyRoutines.length,
  }
}
