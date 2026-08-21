import { useMemo, useState, useCallback, useEffect } from 'react'
import { addDays, format, differenceInMinutes, parseISO } from 'date-fns'
import { useQuery } from '@tanstack/react-query'
import { useFamilyMembers } from './useFamilyMembers'
import { useMemberAvailability } from './useMemberAvailability'
import { useTodayEvents, useTomorrowEvents, type EventWithDetails } from './useCalendarEvents'
import { usePageVisibility } from './usePageVisibility'
import {
  fetchTodoCompletions,
  saveTodoToggle,
  subscribeToTodoSync,
  getStoredTodoCompletions,
} from '../utils/todoCompletionsSync.ts'
import { isReminderOrChore } from '../lib/heroFocus.mjs'
import {
  deserializeRoutineFromAvailabilityRules,
  deriveAmbientRoutineStatus,
  isRoutineDropoffException,
  getEstimatedDriveMinutes,
  applyTimeToDate,
  formatChildNames,
  type FamilyRoutine,
  type AmbientRoutineStatus,
} from '../lib/familyRoutines'
import type { FamilyMember, MemberAvailabilityException } from '../types'
import { resolveEventDriver } from '../lib/driverConflictEngine'

export interface DepartureItem {
  id: string
  venueName: string
  venueAddress: string
  arrivalWindow: string
  schoolStartTime: string
  departureTime: string
  leaveByTimeFormatted: string
  minutesUntilLeave: number
  driveMinutes: number
  driverName: string
  driverMember: FamilyMember | null
  children: FamilyMember[]
  childNamesFormatted: string
  isException: boolean
  exceptionLabel: string | null
  isLeaveNow: boolean
  isPrepUrgent: boolean
  isUpcoming: boolean
  isCompleted: boolean
}

export type TomorrowDeparture = DepartureItem

export interface BedtimePrepItem {
  id: string
  label: string
  completed: boolean
  childName?: string
  iconType: 'music' | 'backpack' | 'bottle' | 'lunch' | 'sports' | 'general'
}

export interface FamilyRoutineIntelligence {
  phase: 'evening_prep' | 'morning_action' | 'daytime_whereabouts' | 'rest'
  isEvening: boolean
  isMorning: boolean
  isDaytime: boolean
  targetDate: Date
  todayDayName: string
  todayFormattedDate: string
  todayDepartures: DepartureItem[]
  hasTodayDepartures: boolean
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

function deriveDeparturesForDate(
  targetDate: Date,
  now: Date,
  familyRoutines: FamilyRoutine[],
  familyMembers: FamilyMember[],
  availabilityExceptions: MemberAvailabilityException[] = [],
  calendarEvents: EventWithDetails[] = [],
): DepartureItem[] {
  if (familyRoutines.length === 0 || familyMembers.length === 0) return []

  const dateKey = format(targetDate, 'yyyy-MM-dd')
  const dayOfWeek = targetDate.getDay()

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
        // Morning window: between 5:30 AM and 9:30 AM
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

    if (childMorningEvents.length > 0) {
      const earlyEvt = childMorningEvents[0]
      const evtStart = parseISO(earlyEvt.start_time)
      const evtEnd = parseISO(earlyEvt.end_time)
      effStartLocal = format(evtStart, 'HH:mm')
      effVenueName = earlyEvt.location_name || earlyEvt.address || routine.venueName
      effVenueAddress = earlyEvt.address || routine.venueAddress

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
        customWindowStartTime = evtStart
        customSchoolStartTime = evtEnd
      } else {
        customWindowStartTime = evtStart
        customSchoolStartTime = evtEnd > evtStart ? evtEnd : new Date(evtStart.getTime() + 15 * 60000)
        customDepartureTime = new Date(evtStart.getTime() - driveMins * 60000).toISOString()
      }
    } else {
      const dayOverride = routine.dayOverrides?.find(
        (o) => o.dayOfWeek === dayOfWeek && o.enabled !== false,
      )

      effStartLocal = (dayOverride?.startLocal || routine.startLocal).slice(0, 5)
      effDropDriverName = dayOverride?.dropoffDriverName || routine.dropoffDriverName || 'Jake'
      effDropDriverId = dayOverride?.dropoffDriverId !== undefined ? dayOverride.dropoffDriverId : (routine.dropoffDriverId || null)
      overrideLabel = dayOverride?.label?.trim() || null
      effVenueName = routine.venueName
      effVenueAddress = routine.venueAddress
      isException = isRoutineDropoffException(routine, targetDate)
    }

    const venueKey = effVenueName.trim().toLowerCase()
    const dropKey = `${venueKey}|${effStartLocal}|${effDropDriverName}|${overrideLabel || ''}`

    if (!groups.has(dropKey)) {
      groups.set(dropKey, {
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
      })
    } else {
      const g = groups.get(dropKey)!
      if (!g.children.some((c) => c.id === child.id)) {
        g.children.push(child)
      }
      if (isException) g.isException = true
    }
  }

  const departures: DepartureItem[] = []
  for (const [key, group] of groups.entries()) {
    const driveMinutes = getEstimatedDriveMinutes(group.venueName, group.venueAddress)
    const targetArrivalTime = group.customSchoolStartTime || applyTimeToDate(targetDate, group.startLocal)
    const departureTime = group.customDepartureTime
      ? new Date(group.customDepartureTime)
      : new Date(targetArrivalTime.getTime() - driveMinutes * 60000)

    const driverMember = familyMembers.find(
      (m) => m.id === group.driverId || m.name.toLowerCase() === group.driverName.toLowerCase(),
    ) || null

    const minutesUntilLeave = differenceInMinutes(departureTime, now)
    const isLeaveNow = minutesUntilLeave <= 0 && minutesUntilLeave >= -20
    const isPrepUrgent = minutesUntilLeave > 0 && minutesUntilLeave <= 15
    const isUpcoming = minutesUntilLeave > 15
    const isCompleted = minutesUntilLeave < -20

    departures.push({
      id: `departure-${key}-${dateKey}`,
      venueName: group.venueName,
      venueAddress: group.venueAddress,
      arrivalWindow: format(targetArrivalTime, 'h:mm a'),
      schoolStartTime: format(targetArrivalTime, 'h:mm a'),
      departureTime: departureTime.toISOString(),
      leaveByTimeFormatted: format(departureTime, 'h:mm a'),
      minutesUntilLeave,
      driveMinutes,
      driverName: group.driverName,
      driverMember,
      children: group.children,
      childNamesFormatted: formatChildNames(group.children),
      isException: group.isException,
      exceptionLabel: group.label,
      isLeaveNow,
      isPrepUrgent,
      isUpcoming,
      isCompleted,
    })
  }

  return departures.sort((a, b) => new Date(a.departureTime).getTime() - new Date(b.departureTime).getTime())
}

function derivePrepChecklist(
  departures: DepartureItem[],
  dateKey: string,
  completedMap: Record<string, boolean>,
  calendarEvents: EventWithDetails[] = [],
): BedtimePrepItem[] {
  if (departures.length === 0 && calendarEvents.length === 0) return []

  const items: BedtimePrepItem[] = []

  // Collect text hints from both departures and morning calendar events
  const textCorpus: { label: string; childName?: string }[] = []
  for (const dep of departures) {
    if (dep.exceptionLabel) {
      textCorpus.push({ label: dep.exceptionLabel, childName: dep.childNamesFormatted })
    }
  }

  for (const evt of calendarEvents) {
    try {
      const start = parseISO(evt.start_time)
      const evtDateStr = format(start, 'yyyy-MM-dd')
      if (evtDateStr === dateKey && !evt.all_day) {
        const hour = start.getHours() + start.getMinutes() / 60
        // Daytime / school prep window: events starting before 2:00 PM (14.0)
        if (hour < 14.0) {
          const title = evt.title || ''
          const desc = evt.description || ''
          const childName = (evt.members || []).find((m) => m.role === 'passenger')?.family_member?.name || ''
          textCorpus.push({ label: `${title} ${desc}`, childName })
        }
      }
    } catch {}
  }

  let hasMusicItem = false
  let hasSportsItem = false
  let hasDeviceItem = false

  for (const item of textCorpus) {
    const text = item.label.toLowerCase()
    if (!hasMusicItem && (text.includes('string') || text.includes('music') || text.includes('violin') || text.includes('instrument') || text.includes('orchestra'))) {
      hasMusicItem = true
      const id = `item-music-${dateKey}`
      const prefix = item.childName ? `${item.childName}: ` : ''
      items.push({
        id,
        label: `${prefix}Pack instrument & sheet music folder`,
        completed: Boolean(completedMap[id]),
        childName: item.childName,
        iconType: 'music',
      })
    }
    if (!hasSportsItem && (text.includes('sport') || text.includes('pe') || text.includes('gym') || text.includes('athletic') || text.includes('soccer') || text.includes('tennis') || text.includes('swim'))) {
      hasSportsItem = true
      const id = `item-sports-${dateKey}`
      const prefix = item.childName ? `${item.childName}: ` : ''
      items.push({
        id,
        label: `${prefix}Stage athletic uniform & shoes`,
        completed: Boolean(completedMap[id]),
        childName: item.childName,
        iconType: 'sports',
      })
    }
    if (!hasDeviceItem && (text.includes('iready') || text.includes('assessment') || text.includes('chromebook') || text.includes('ipad test'))) {
      hasDeviceItem = true
      const id = `item-device-${dateKey}`
      const prefix = item.childName ? `${item.childName}: ` : ''
      items.push({
        id,
        label: `${prefix}Charge school device & pack headphones`,
        completed: Boolean(completedMap[id]),
        childName: item.childName,
        iconType: 'general',
      })
    }
  }

  const idBackpacks = `item-backpacks-${dateKey}`
  items.push({
    id: idBackpacks,
    label: 'Backpacks & homework folders packed',
    completed: Boolean(completedMap[idBackpacks]),
    iconType: 'backpack',
  })

  const idBottles = `item-bottles-${dateKey}`
  items.push({
    id: idBottles,
    label: 'Water bottles filled & chilled',
    completed: Boolean(completedMap[idBottles]),
    iconType: 'bottle',
  })

  const idLunch = `item-lunch-${dateKey}`
  items.push({
    id: idLunch,
    label: 'Lunchboxes & morning snacks staged',
    completed: Boolean(completedMap[idLunch]),
    iconType: 'lunch',
  })

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

  // Phase computation:
  // Evening Prep: 5:30 PM (17.5) to 11:00 PM (23.0)
  // Rest: 11:00 PM (23.0) to 6:00 AM (6.0)
  // Morning Action: 6:00 AM (6.0) to 9:30 AM (9.5)
  // Daytime Whereabouts: 9:30 AM (9.5) to 5:30 PM (17.5)
  const phase: FamilyRoutineIntelligence['phase'] = useMemo(() => {
    if (decimalTime >= 17.5 && decimalTime < 23.0) return 'evening_prep'
    if (decimalTime >= 6.0 && decimalTime < 9.5) return 'morning_action'
    if (decimalTime >= 9.5 && decimalTime < 17.5) return 'daytime_whereabouts'
    return 'rest'
  }, [decimalTime])

  const isEvening = phase === 'evening_prep'
  const isMorning = phase === 'morning_action'
  const isDaytime = phase === 'daytime_whereabouts'

  const todayKey = useMemo(() => format(now, 'yyyy-MM-dd'), [now])
  const tomorrowDate = useMemo(() => addDays(now, 1), [now])
  const tomorrowKey = useMemo(() => format(tomorrowDate, 'yyyy-MM-dd'), [tomorrowDate])

  // Derive TODAY's morning routine departures
  const todayDepartures = useMemo<DepartureItem[]>(() => {
    return deriveDeparturesForDate(now, now, familyRoutines, familyMembers as FamilyMember[], availabilityExceptions, todayEvents)
  }, [now, familyRoutines, familyMembers, availabilityExceptions, todayEvents])

  const hasTodayDepartures = todayDepartures.length > 0
  const nextTodayDeparture = useMemo(() => {
    return todayDepartures.find((d) => !d.isCompleted) || todayDepartures[0] || null
  }, [todayDepartures])

  // Derive TOMORROW's morning routine departures
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
    return derivePrepChecklist(todayDepartures, todayKey, completedItems, todayEvents)
  }, [todayDepartures, todayKey, completedItems, todayEvents])

  const prepChecklist = useMemo<BedtimePrepItem[]>(() => {
    return derivePrepChecklist(tomorrowDepartures, tomorrowKey, completedItems, tomorrowEvents)
  }, [tomorrowDepartures, tomorrowKey, completedItems, tomorrowEvents])

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
    todayDayName: format(now, 'EEEE'),
    todayFormattedDate: format(now, 'MMMM d'),
    todayDepartures,
    hasTodayDepartures,
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
