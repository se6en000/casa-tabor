import { useMemo, useState, useCallback } from 'react'
import { addDays, format, differenceInMinutes } from 'date-fns'
import { useFamilyMembers } from './useFamilyMembers'
import { useMemberAvailability } from './useMemberAvailability'
import {
  deserializeRoutineFromAvailabilityRules,
  deserializeHouseholdRhythm,
  deriveAmbientRoutineStatus,
  isRoutineDropoffException,
  getEstimatedDriveMinutes,
  applyTimeToDate,
  formatChildNames,
  resolveTodayHandoffStage,
  getDailyOverrides,
  saveDailyOverrides,
  type FamilyRoutine,
  type AmbientRoutineStatus,
  type HouseholdWeekdayRhythm,
  type HandoffStageInfo,
  type DailyOverrides,
} from '../lib/familyRoutines'
import type { FamilyMember } from '../types'

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
  householdRhythm: HouseholdWeekdayRhythm
  handoffStage: HandoffStageInfo
  dailyOverrides: DailyOverrides
  setDailyOverride: (key: keyof DailyOverrides, value: unknown) => void
  toggleEmmeTransport: () => void
  toggleGiselleOff: () => void
}

const STORAGE_PREFIX = 'casa_bedtime_prep_'

function deriveDeparturesForDate(
  targetDate: Date,
  now: Date,
  familyRoutines: FamilyRoutine[],
  familyMembers: FamilyMember[],
): DepartureItem[] {
  if (familyRoutines.length === 0 || familyMembers.length === 0) return []

  const dateKey = format(targetDate, 'yyyy-MM-dd')
  const dayOfWeek = targetDate.getDay()

  const activeRoutines = familyRoutines.filter((r) => {
    if (!r.enabled) return false
    if (r.startDate && dateKey < r.startDate) return false
    if (r.endDate && dateKey > r.endDate) return false
    if (!r.daysOfWeek.includes(dayOfWeek)) return false
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
  }>()

  for (const routine of activeRoutines) {
    const child = familyMembers.find((m) => m.id === routine.memberId)
    if (!child) continue

    const dayOverride = routine.dayOverrides?.find(
      (o) => o.dayOfWeek === dayOfWeek && o.enabled !== false,
    )

    const effStartLocal = (dayOverride?.startLocal || routine.startLocal).slice(0, 5)
    const effDropDriverName = dayOverride?.dropoffDriverName || routine.dropoffDriverName || 'Jake'
    const effDropDriverId = dayOverride?.dropoffDriverId !== undefined ? dayOverride.dropoffDriverId : (routine.dropoffDriverId || null)
    const overrideLabel = dayOverride?.label?.trim() || null
    const isException = isRoutineDropoffException(routine, targetDate)

    const venueKey = routine.venueName.trim().toLowerCase()
    const dropKey = `${venueKey}|${effStartLocal}|${effDropDriverName}|${overrideLabel || ''}`

    if (!groups.has(dropKey)) {
      groups.set(dropKey, {
        venueName: routine.venueName,
        venueAddress: routine.venueAddress,
        startLocal: effStartLocal,
        driverName: effDropDriverName,
        driverId: effDropDriverId,
        label: overrideLabel,
        children: [child],
        isException,
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
    const schoolStartTime = applyTimeToDate(targetDate, group.startLocal)
    const windowStartTime = new Date(schoolStartTime.getTime() - 15 * 60000)
    const departureTime = new Date(windowStartTime.getTime() - driveMinutes * 60000)

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
      arrivalWindow: `${format(windowStartTime, 'h:mm a')} – ${format(schoolStartTime, 'h:mm a')}`,
      schoolStartTime: format(schoolStartTime, 'h:mm a'),
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
): BedtimePrepItem[] {
  if (departures.length === 0) return []

  const items: BedtimePrepItem[] = []

  for (const dep of departures) {
    const label = (dep.exceptionLabel || '').toLowerCase()
    if (label.includes('string') || label.includes('music') || label.includes('violin') || label.includes('instrument')) {
      const id = `item-music-${dateKey}`
      items.push({
        id,
        label: `${dep.childNamesFormatted}: Pack instrument & sheet music folder`,
        completed: Boolean(completedMap[id]),
        childName: dep.childNamesFormatted,
        iconType: 'music',
      })
    } else if (label.includes('sport') || label.includes('pe') || label.includes('gym')) {
      const id = `item-sports-${dateKey}`
      items.push({
        id,
        label: `${dep.childNamesFormatted}: Stage athletic uniform & shoes`,
        completed: Boolean(completedMap[id]),
        childName: dep.childNamesFormatted,
        iconType: 'sports',
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
  const { rules: availabilityRules = [] } = useMemberAvailability(memberIds)

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
    return deriveDeparturesForDate(now, now, familyRoutines, familyMembers as FamilyMember[])
  }, [now, familyRoutines, familyMembers])

  const hasTodayDepartures = todayDepartures.length > 0
  const nextTodayDeparture = useMemo(() => {
    return todayDepartures.find((d) => !d.isCompleted) || todayDepartures[0] || null
  }, [todayDepartures])

  // Derive TOMORROW's morning routine departures
  const tomorrowDepartures = useMemo<DepartureItem[]>(() => {
    return deriveDeparturesForDate(tomorrowDate, now, familyRoutines, familyMembers as FamilyMember[])
  }, [tomorrowDate, now, familyRoutines, familyMembers])

  const hasTomorrowExceptions = useMemo(() => {
    return tomorrowDepartures.some((d) => d.isException)
  }, [tomorrowDepartures])

  const primaryTomorrowException = useMemo(() => {
    return tomorrowDepartures.find((d) => d.isException) || null
  }, [tomorrowDepartures])

  // Bedtime & Morning Prep Checklist state management
  const [completedItems, setCompletedItems] = useState<Record<string, boolean>>(() => {
    try {
      const stored = localStorage.getItem(`${STORAGE_PREFIX}${todayKey}`)
      const tomorrowStored = localStorage.getItem(`${STORAGE_PREFIX}${tomorrowKey}`)
      return {
        ...(stored ? JSON.parse(stored) : {}),
        ...(tomorrowStored ? JSON.parse(tomorrowStored) : {}),
      }
    } catch {
      return {}
    }
  })

  const toggleTodayPrepItem = useCallback((id: string) => {
    setCompletedItems((prev) => {
      const next = { ...prev, [id]: !prev[id] }
      try {
        localStorage.setItem(`${STORAGE_PREFIX}${todayKey}`, JSON.stringify(next))
      } catch {}
      return next
    })
  }, [todayKey])

  const togglePrepItem = useCallback((id: string) => {
    setCompletedItems((prev) => {
      const next = { ...prev, [id]: !prev[id] }
      try {
        localStorage.setItem(`${STORAGE_PREFIX}${tomorrowKey}`, JSON.stringify(next))
      } catch {}
      return next
    })
  }, [tomorrowKey])

  const todayPrepChecklist = useMemo<BedtimePrepItem[]>(() => {
    return derivePrepChecklist(todayDepartures, todayKey, completedItems)
  }, [todayDepartures, todayKey, completedItems])

  const prepChecklist = useMemo<BedtimePrepItem[]>(() => {
    return derivePrepChecklist(tomorrowDepartures, tomorrowKey, completedItems)
  }, [tomorrowDepartures, tomorrowKey, completedItems])

  const completedCount = useMemo(() => {
    return prepChecklist.filter((item) => item.completed).length
  }, [prepChecklist])

  const totalPrepCount = prepChecklist.length
  const allPrepCompleted = totalPrepCount > 0 && completedCount === totalPrepCount

  // Ambient Statuses during current day
  const ambientStatuses = useMemo(() => {
    return deriveAmbientRoutineStatus(familyRoutines, familyMembers as FamilyMember[], now)
  }, [familyRoutines, familyMembers, now])

  // Household Weekday Rhythm (Casa Tabor Baseline)
  const householdRhythm = useMemo<HouseholdWeekdayRhythm>(() => {
    return deserializeHouseholdRhythm(availabilityRules, familyMembers as FamilyMember[])
  }, [availabilityRules, familyMembers])

  // Daily 1-Tap Quick Overrides state
  const [dailyOverrides, setDailyOverridesState] = useState<DailyOverrides>(() => {
    return getDailyOverrides(todayKey)
  })

  const setDailyOverride = useCallback((key: keyof DailyOverrides, value: unknown) => {
    setDailyOverridesState((prev) => {
      const next = { ...prev, [key]: value }
      saveDailyOverrides(todayKey, next)
      return next
    })
  }, [todayKey])

  const toggleEmmeTransport = useCallback(() => {
    setDailyOverridesState((prev) => {
      const currentMode = prev.emmeTransportMode || householdRhythm.afternoonChain.emmeDefaultMode
      const nextMode: 'bus' | 'giselle_carpool' = currentMode === 'bus' ? 'giselle_carpool' : 'bus'
      const next: DailyOverrides = { ...prev, emmeTransportMode: nextMode }
      saveDailyOverrides(todayKey, next)
      return next
    })
  }, [todayKey, householdRhythm])

  const toggleGiselleOff = useCallback(() => {
    setDailyOverridesState((prev) => {
      const next = { ...prev, giselleOffToday: !prev.giselleOffToday }
      saveDailyOverrides(todayKey, next)
      return next
    })
  }, [todayKey])

  // Current Handoff Stage
  const handoffStage = useMemo<HandoffStageInfo>(() => {
    return resolveTodayHandoffStage(householdRhythm, now)
  }, [householdRhythm, now, dailyOverrides])

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
    householdRhythm,
    handoffStage,
    dailyOverrides,
    setDailyOverride,
    toggleEmmeTransport,
    toggleGiselleOff,
  }
}

