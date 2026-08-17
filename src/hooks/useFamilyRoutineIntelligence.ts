import { useMemo, useState, useEffect, useCallback } from 'react'
import { addDays, format } from 'date-fns'
import { useFamilyMembers } from './useFamilyMembers'
import { useMemberAvailability } from './useMemberAvailability'
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
import type { FamilyMember } from '../types'

export interface TomorrowDeparture {
  id: string
  venueName: string
  venueAddress: string
  arrivalWindow: string
  schoolStartTime: string
  departureTime: string
  leaveByTimeFormatted: string
  driveMinutes: number
  driverName: string
  driverMember: FamilyMember | null
  children: FamilyMember[]
  childNamesFormatted: string
  isException: boolean
  exceptionLabel: string | null
}

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
  tomorrowDate: Date
  tomorrowDayName: string
  tomorrowFormattedDate: string
  tomorrowDepartures: TomorrowDeparture[]
  hasTomorrowExceptions: boolean
  primaryTomorrowException: TomorrowDeparture | null
  prepChecklist: BedtimePrepItem[]
  togglePrepItem: (id: string) => void
  completedCount: number
  totalPrepCount: number
  allPrepCompleted: boolean
  ambientStatuses: AmbientRoutineStatus[]
  activeRoutinesCount: number
}

const STORAGE_PREFIX = 'casa_bedtime_prep_'

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

  const tomorrowDate = useMemo(() => addDays(now, 1), [now])
  const tomorrowKey = useMemo(() => format(tomorrowDate, 'yyyy-MM-dd'), [tomorrowDate])
  const tomorrowDayOfWeek = tomorrowDate.getDay()

  // Derive tomorrow's morning routine departures
  const tomorrowDepartures = useMemo<TomorrowDeparture[]>(() => {
    if (familyRoutines.length === 0 || familyMembers.length === 0) return []

    // Group active routines for tomorrow
    const activeForTomorrow = familyRoutines.filter((r) => {
      if (!r.enabled) return false
      if (r.startDate && tomorrowKey < r.startDate) return false
      if (r.endDate && tomorrowKey > r.endDate) return false
      if (!r.daysOfWeek.includes(tomorrowDayOfWeek)) return false
      return true
    })

    if (activeForTomorrow.length === 0) return []

    // Consolidated morning dropoff groups
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

    for (const routine of activeForTomorrow) {
      const child = (familyMembers as FamilyMember[]).find((m: FamilyMember) => m.id === routine.memberId)
      if (!child) continue

      const dayOverride = routine.dayOverrides?.find(
        (o) => o.dayOfWeek === tomorrowDayOfWeek && o.enabled !== false,
      )

      const effStartLocal = (dayOverride?.startLocal || routine.startLocal).slice(0, 5)
      const effDropDriverName = dayOverride?.dropoffDriverName || routine.dropoffDriverName || 'Jake'
      const effDropDriverId = dayOverride?.dropoffDriverId !== undefined ? dayOverride.dropoffDriverId : (routine.dropoffDriverId || null)
      const overrideLabel = dayOverride?.label?.trim() || null
      const isException = isRoutineDropoffException(routine, tomorrowDate)

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

    const departures: TomorrowDeparture[] = []
    for (const [key, group] of groups.entries()) {
      const driveMinutes = getEstimatedDriveMinutes(group.venueName, group.venueAddress)
      const schoolStartTime = applyTimeToDate(tomorrowDate, group.startLocal)
      const windowStartTime = new Date(schoolStartTime.getTime() - 15 * 60000)
      const departureTime = new Date(windowStartTime.getTime() - driveMinutes * 60000)

      const driverMember = (familyMembers as FamilyMember[]).find(
        (m: FamilyMember) => m.id === group.driverId || m.name.toLowerCase() === group.driverName.toLowerCase(),
      ) || null

      departures.push({
        id: `departure-${key}-${tomorrowKey}`,
        venueName: group.venueName,
        venueAddress: group.venueAddress,
        arrivalWindow: `${format(windowStartTime, 'h:mm a')} – ${format(schoolStartTime, 'h:mm a')}`,
        schoolStartTime: format(schoolStartTime, 'h:mm a'),
        departureTime: departureTime.toISOString(),
        leaveByTimeFormatted: format(departureTime, 'h:mm a'),
        driveMinutes,
        driverName: group.driverName,
        driverMember,
        children: group.children,
        childNamesFormatted: formatChildNames(group.children),
        isException: group.isException,
        exceptionLabel: group.label,
      })
    }

    // Sort earliest departure first
    return departures.sort((a, b) => new Date(a.departureTime).getTime() - new Date(b.departureTime).getTime())
  }, [familyRoutines, familyMembers, tomorrowDate, tomorrowKey, tomorrowDayOfWeek])

  const hasTomorrowExceptions = useMemo(() => {
    return tomorrowDepartures.some((d) => d.isException)
  }, [tomorrowDepartures])

  const primaryTomorrowException = useMemo(() => {
    return tomorrowDepartures.find((d) => d.isException) || null
  }, [tomorrowDepartures])

  // Bedtime Prep Checklist generation & state persistence
  const [completedItems, setCompletedItems] = useState<Record<string, boolean>>(() => {
    try {
      const stored = localStorage.getItem(`${STORAGE_PREFIX}${tomorrowKey}`)
      return stored ? JSON.parse(stored) : {}
    } catch {
      return {}
    }
  })

  // Keep storage in sync when date rolls over
  useEffect(() => {
    try {
      const stored = localStorage.getItem(`${STORAGE_PREFIX}${tomorrowKey}`)
      setCompletedItems(stored ? JSON.parse(stored) : {})
    } catch {
      setCompletedItems({})
    }
  }, [tomorrowKey])

  const togglePrepItem = useCallback((id: string) => {
    setCompletedItems((prev) => {
      const next = { ...prev, [id]: !prev[id] }
      try {
        localStorage.setItem(`${STORAGE_PREFIX}${tomorrowKey}`, JSON.stringify(next))
      } catch {}
      return next
    })
  }, [tomorrowKey])

  const prepChecklist = useMemo<BedtimePrepItem[]>(() => {
    if (tomorrowDepartures.length === 0) return []

    const items: BedtimePrepItem[] = []

    // 1. Check if any departure has a special label (e.g. Early Strings, Violin, Music, Art)
    for (const dep of tomorrowDepartures) {
      const label = (dep.exceptionLabel || '').toLowerCase()
      if (label.includes('string') || label.includes('music') || label.includes('violin') || label.includes('instrument')) {
        const id = `item-music-${tomorrowKey}`
        items.push({
          id,
          label: `${dep.childNamesFormatted}: Pack instrument & sheet music folder`,
          completed: Boolean(completedItems[id]),
          childName: dep.childNamesFormatted,
          iconType: 'music',
        })
      } else if (label.includes('sport') || label.includes('pe') || label.includes('gym')) {
        const id = `item-sports-${tomorrowKey}`
        items.push({
          id,
          label: `${dep.childNamesFormatted}: Stage athletic uniform & shoes`,
          completed: Boolean(completedItems[id]),
          childName: dep.childNamesFormatted,
          iconType: 'sports',
        })
      }
    }

    // 2. Standard essential readiness items
    const idBackpacks = `item-backpacks-${tomorrowKey}`
    items.push({
      id: idBackpacks,
      label: 'Backpacks & homework folders packed',
      completed: Boolean(completedItems[idBackpacks]),
      iconType: 'backpack',
    })

    const idBottles = `item-bottles-${tomorrowKey}`
    items.push({
      id: idBottles,
      label: 'Water bottles filled & chilled',
      completed: Boolean(completedItems[idBottles]),
      iconType: 'bottle',
    })

    const idLunch = `item-lunch-${tomorrowKey}`
    items.push({
      id: idLunch,
      label: 'Lunchboxes & morning snacks staged',
      completed: Boolean(completedItems[idLunch]),
      iconType: 'lunch',
    })

    return items
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

  return {
    phase,
    isEvening,
    isMorning,
    isDaytime,
    targetDate: now,
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
