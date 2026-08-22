import { useMemo } from 'react'
import { parseISO, differenceInMinutes, subMinutes } from 'date-fns'
import type { EventWithDetails } from './useCalendarEvents'
import type { FamilyMember } from '../types'
import { useFamilyRoutineIntelligence, type FamilyRoutineIntelligence } from './useFamilyRoutineIntelligence'
import { inferEventMode, inferEventPlanKind } from '../lib/eventCommandCenter'

export type HeroArchetype =
  | 'morning_launchpad'
  | 'imminent_transit'
  | 'daytime_logistics'
  | 'weekend_flow'
  | 'tomorrow_readiness'

export interface HeroIntelligenceState {
  archetype: HeroArchetype
  routineIntel: FamilyRoutineIntelligence
  imminentEvent: EventWithDetails | null
  concurrentEvents: EventWithDetails[]
  minutesUntilNext: number | null
  minutesUntilLeave: number | null
  driveTimeMins: number | null
  isTravelEvent: boolean
  isLeaveNow: boolean
  isPrepUrgent: boolean
  isEventUnderway: boolean
}

// Helper to check if an event requires travel / off-site transit
function checkIsTravelEvent(e: EventWithDetails | null | undefined): boolean {
  if (!e || e.all_day || e.event_type === 'reminder') return false
  const mode = inferEventMode(e)
  const kind = inferEventPlanKind(e, mode)
  if (kind !== 'travel') return false
  const locationName = (e.location_name || '').trim().toLowerCase()
  const isHome = locationName === 'home' || locationName.includes('at home')
  if (isHome) return false
  const hasPhysicalDestination = Boolean(
    (e.address && e.address.trim().length > 0) ||
    (e.location_name && e.location_name.trim().length > 0)
  )
  return hasPhysicalDestination
}

// Priority scoring function for candidate hero events
function scoreEventForHero(e: EventWithDetails, currentTime: Date): number {
  let score = 0
  const isTravel = checkIsTravelEvent(e)
  try {
    const start = parseISO(e.start_time)
    const end = parseISO(e.end_time)
    const isUnderway = start.getTime() <= currentTime.getTime() && end.getTime() > currentTime.getTime()
    const minsToStart = differenceInMinutes(start, currentTime)

    let driveTime = e.enrichment?.drive_time_mins || 0
    let departureTime: Date | null = null
    if (e.enrichment?.departure_time) {
      departureTime = new Date(e.enrichment.departure_time)
    } else if (driveTime > 0) {
      departureTime = subMinutes(start, driveTime)
    }
    const minsToLeave = departureTime ? differenceInMinutes(departureTime, currentTime) : null

    if (isTravel) {
      score += 100
      if (minsToLeave !== null && minsToLeave <= 0 && minsToStart > 0) {
        score += 80 // Time to leave now
      } else if (minsToLeave !== null && minsToLeave <= 15 && minsToStart > 0) {
        score += 50 // Prepare to leave
      } else if (isUnderway) {
        score += 40 // En route / underway
      } else if (minsToStart <= 60) {
        score += 25
      }
    } else {
      if (isUnderway) {
        score += 35
      } else if (minsToStart <= 15) {
        score += 20
      } else if (minsToStart <= 60) {
        score += 10
      }
    }

    score -= (start.getTime() - currentTime.getTime()) / (1000 * 60 * 60)
  } catch {}

  return score
}

export function useHeroIntelligence(
  now: Date = new Date(),
  todayEvents: EventWithDetails[] = [],
  _familyMembers: FamilyMember[] = [],
  manualView: 'today' | 'tomorrow' = 'today',
): HeroIntelligenceState {
  const routineIntel = useFamilyRoutineIntelligence(now)

  const currentHour = now.getHours()
  const currentMinute = now.getMinutes()
  const decimalTime = currentHour + currentMinute / 60

  // 1. Filter out meal placeholders, chores, and all-day items for imminent spotlight
  const hardEventCandidates = useMemo(() => {
    return todayEvents.filter((e) => {
      if (e.all_day) return false
      if (e.event_type === 'reminder') return false
      const title = (e.title || '').trim().toLowerCase()
      if (title.startsWith('cook:') || title.startsWith("tonight's kitchen:") || title.startsWith('recipe:')) {
        return false
      }
      try {
        const start = parseISO(e.start_time)
        const end = parseISO(e.end_time)
        return end.getTime() > now.getTime() || start.getTime() > now.getTime() - 15 * 60 * 1000
      } catch {
        return false
      }
    })
  }, [todayEvents, now])

  // 2. Select primary imminent / active hero event
  const { imminentEvent, concurrentEvents } = useMemo(() => {
    if (hardEventCandidates.length === 0) {
      return { imminentEvent: null, concurrentEvents: [] }
    }

    const underwayEvents = hardEventCandidates.filter((e) => {
      try {
        const start = parseISO(e.start_time).getTime()
        const end = parseISO(e.end_time).getTime()
        return start <= now.getTime() && end > now.getTime()
      } catch {
        return false
      }
    })

    let pool: EventWithDetails[] = []
    if (underwayEvents.length > 0) {
      pool = underwayEvents
    } else {
      const earliest = hardEventCandidates.reduce((min, e) => {
        try {
          const t = parseISO(e.start_time).getTime()
          return t < min ? t : min
        } catch {
          return min
        }
      }, Infinity)

      pool = hardEventCandidates.filter((e) => {
        try {
          const t = parseISO(e.start_time).getTime()
          return Math.abs(t - earliest) <= 15 * 60 * 1000
        } catch {
          return false
        }
      })
    }

    if (pool.length === 0) pool = [hardEventCandidates[0]]

    const sorted = [...pool].sort((a, b) => scoreEventForHero(b, now) - scoreEventForHero(a, now))
    const primary = sorted[0] || null
    const others = sorted.filter((e) => e.id !== primary?.id)

    return { imminentEvent: primary, concurrentEvents: others }
  }, [hardEventCandidates, now])

  // 3. Timing and departure calculations for the imminent event
  const {
    minutesUntilNext,
    minutesUntilLeave,
    driveTimeMins,
    isTravelEvent,
    isLeaveNow,
    isPrepUrgent,
    isEventUnderway,
  } = useMemo(() => {
    if (!imminentEvent) {
      return {
        minutesUntilNext: null,
        minutesUntilLeave: null,
        driveTimeMins: null,
        isTravelEvent: false,
        isLeaveNow: false,
        isPrepUrgent: false,
        isEventUnderway: false,
      }
    }

    try {
      const start = parseISO(imminentEvent.start_time)
      const end = parseISO(imminentEvent.end_time)
      const minsToStart = differenceInMinutes(start, now)
      const isUnderway = now.getTime() >= start.getTime() && now.getTime() <= end.getTime()
      const isTravel = checkIsTravelEvent(imminentEvent)

      let driveTime = imminentEvent.enrichment?.drive_time_mins || null
      let leaveAt: Date | null = null

      if (imminentEvent.enrichment?.departure_time) {
        leaveAt = new Date(imminentEvent.enrichment.departure_time)
      } else if (driveTime && driveTime > 0) {
        leaveAt = subMinutes(start, driveTime)
      }

      const minsToLeave = leaveAt ? differenceInMinutes(leaveAt, now) : null
      const leaveNow = minsToLeave !== null && minsToLeave <= 5 && minsToStart > 0
      const prepUrgent = minsToLeave !== null && minsToLeave > 5 && minsToLeave <= 15 && minsToStart > 0

      return {
        minutesUntilNext: minsToStart,
        minutesUntilLeave: minsToLeave,
        driveTimeMins: driveTime,
        isTravelEvent: isTravel,
        isLeaveNow: leaveNow,
        isPrepUrgent: prepUrgent,
        isEventUnderway: isUnderway,
      }
    } catch {
      return {
        minutesUntilNext: null,
        minutesUntilLeave: null,
        driveTimeMins: null,
        isTravelEvent: false,
        isLeaveNow: false,
        isPrepUrgent: false,
        isEventUnderway: false,
      }
    }
  }, [imminentEvent, now])

  // 4. Deterministic Archetype Resolver
  const archetype = useMemo<HeroArchetype>(() => {
    // 1. Manual User Toggle overrides all
    if (manualView === 'tomorrow') {
      return 'tomorrow_readiness'
    }

    // 2. Weekday Morning Launchpad (6:00 AM – 9:15 AM)
    if (
      decimalTime >= 6.0 &&
      decimalTime < 9.25 &&
      routineIntel.isTodaySchoolDay &&
      routineIntel.hasTodayDepartures &&
      !routineIntel.allTodayDeparturesCompleted
    ) {
      return 'morning_launchpad'
    }

    // 3. Imminent Event Transit Spotlight (Within 45m of travel departure or event start)
    const isImminentUrgent =
      imminentEvent &&
      !imminentEvent.all_day &&
      ((minutesUntilLeave !== null && minutesUntilLeave <= 45) ||
        (minutesUntilNext !== null && minutesUntilNext <= 45 && minutesUntilNext > -180))

    if (isImminentUrgent) {
      return 'imminent_transit'
    }

    // 4. Weekend Flow & Household Rhythm (9:00 AM – 8:00 PM on weekends)
    if (routineIntel.isTodayWeekend && decimalTime < 20.0) {
      return 'weekend_flow'
    }

    // 5. Weekday Daytime Logistics (9:15 AM – 5:30 PM on school/work days)
    if (!routineIntel.isTodayWeekend && decimalTime >= 9.25 && decimalTime < 17.5) {
      return 'daytime_logistics'
    }

    // 6. Evening Wind-down & Tomorrow Prep (Evening 5:30 PM+ or Night)
    return 'tomorrow_readiness'
  }, [
    manualView,
    decimalTime,
    routineIntel.isTodaySchoolDay,
    routineIntel.isTodayWeekend,
    routineIntel.hasTodayDepartures,
    routineIntel.allTodayDeparturesCompleted,
    imminentEvent,
    minutesUntilLeave,
    minutesUntilNext,
  ])

  return {
    archetype,
    routineIntel,
    imminentEvent,
    concurrentEvents,
    minutesUntilNext,
    minutesUntilLeave,
    driveTimeMins,
    isTravelEvent,
    isLeaveNow,
    isPrepUrgent,
    isEventUnderway,
  }
}
