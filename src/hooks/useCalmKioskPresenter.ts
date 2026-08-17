import { useState, useMemo, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { format, parseISO, differenceInMinutes, subMinutes } from 'date-fns'
import { useLiveClock, greetingFor } from './useLiveClock'
import { useTodayEvents, useTomorrowEvents, type EventWithDetails } from './useCalendarEvents'
import { useWeekConflicts, useResolveConflict } from './useConflicts'
import { usePrepItems, useCompletePrepItem } from './usePrepItems'
import { useFamilyMembers } from './useFamilyMembers'
import { useHomeWeather } from './useHomeWeather'
import { useReminderNeedsYouActions } from './useReminderNeedsYouActions'
import { useMemberAvailability } from './useMemberAvailability'
import { useAppStore } from '../stores/appStore'
import { inferEventMode, inferEventPlanKind } from '../lib/eventCommandCenter'
import type { EventTransportationPlan, TransportationLeg } from '../lib/eventTransportation'
import {
  deserializeRoutineFromAvailabilityRules,
  deriveAmbientRoutineStatus,
  generateConsolidatedRoutineActionEvents,
  type AmbientRoutineStatus,
  type FamilyRoutine,
} from '../lib/familyRoutines'
import { isReminderOrChore } from '../lib/heroFocus.mjs'
import { clusterPrepItems } from '../utils/prepItemClusters'
import type { Conflict, PrepItem, FamilyMember } from '../types'

export interface CalmKioskPresenterState {
  now: Date
  greeting: string
  dailyBriefing: string
  timeHorizonLabel: string
  weather: ReturnType<typeof useHomeWeather>['data']
  nextEvent: EventWithDetails | null
  primaryHeroEvent: EventWithDetails | null
  concurrentEvents: EventWithDetails[]
  selectedHeroEventId: string | null
  setSelectedHeroEventId: (id: string | null) => void
  appointmentEvents: EventWithDetails[]
  pastEvents: EventWithDetails[]
  upcomingAppointments: EventWithDetails[]
  todayReminders: EventWithDetails[]
  todayEvents: EventWithDetails[]
  tomorrowEvents: EventWithDetails[]
  isTodayDone: boolean
  firstTomorrowEvent: EventWithDetails | null
  activeConflicts: Conflict[]
  activePrep: PrepItem[]
  familyMembers: FamilyMember[]
  ambientRoutineStatuses: AmbientRoutineStatus[]
  handleResolveConflict: (conflict: Conflict, resolution: string) => void
  handleCompletePrep: (item: PrepItem) => void
  pickupsCount: number
  isEvening: boolean
  isDinnerPast: boolean
  totalAttentionCount: number
  minutesUntilNext: number | null
  driveTimeMins: number | null
  leaveAt: Date | null
  minutesUntilLeave: number | null
  isTravelEvent: boolean
  transportationPlan: EventTransportationPlan | null
  originName: string
  destinationName: string
  returnDestinationName: string
  driverName: string | null
  driverFamilyMemberId: string | null
  prepSummaryText: string | null
  locationDisplayText: string | null
  setCanvasSubmode: (submode: 'calm' | 'turbo') => void
  navigateTo: (path: string) => void
}

export function useCalmKioskPresenter(): CalmKioskPresenterState {
  const navigate = useNavigate()
  const { setCanvasSubmode } = useAppStore()
  const now = useLiveClock(10_000)
  const { data: todayEvents = [] } = useTodayEvents(now)
  const { data: tomorrowEvents = [] } = useTomorrowEvents(now)
  const { data: conflicts = [] } = useWeekConflicts()
  const { data: prepItems = [] } = usePrepItems()
  const { data: familyMembers = [] } = useFamilyMembers()
  const { data: weather } = useHomeWeather()

  const [selectedHeroEventId, setSelectedHeroEventId] = useState<string | null>(null)

  const resolveConflict = useResolveConflict()
  const completePrep = useCompletePrepItem()
  const { queueMissedReminders } = useReminderNeedsYouActions()

  useEffect(() => {
    if (todayEvents.length > 0) {
      void queueMissedReminders(todayEvents, now).catch(() => {})
    }
  }, [todayEvents, now, queueMissedReminders])

  const activeConflicts = useMemo(
    () => conflicts.filter((c) => !c.resolved),
    [conflicts]
  )

  const activePrep = useMemo(
    () => prepItems.filter((p) => !p.dismissed),
    [prepItems]
  )

  const handleResolveConflict = (conflict: Conflict, resolution: string) => {
    void resolveConflict(conflict.id, resolution)
  }

  const handleCompletePrep = (item: PrepItem) => {
    void completePrep(item.id)
  }

  const clusteredPrep = useMemo(() => clusterPrepItems(activePrep), [activePrep])
  const totalAttentionCount = activeConflicts.length + clusteredPrep.length

  const memberIds = useMemo(() => familyMembers.map((m) => m.id), [familyMembers])
  const { rules: availabilityRules = [] } = useMemberAvailability(memberIds)

  const familyRoutines = useMemo<FamilyRoutine[]>(() => {
    return familyMembers
      .map((m) => deserializeRoutineFromAvailabilityRules(m.id, availabilityRules))
      .filter((r): r is FamilyRoutine => Boolean(r && r.enabled))
  }, [familyMembers, availabilityRules])

  const ambientRoutineStatuses = useMemo<AmbientRoutineStatus[]>(() => {
    return deriveAmbientRoutineStatus(familyRoutines, familyMembers, now)
  }, [familyRoutines, familyMembers, now])

  const routineTodayEvents = useMemo<EventWithDetails[]>(() => {
    if (familyRoutines.length === 0 || familyMembers.length === 0) return []
    const events = generateConsolidatedRoutineActionEvents({
      routines: familyRoutines,
      members: familyMembers,
      date: now,
      filterBySyncMode: true,
    })
    return events.map((ev): EventWithDetails => ({
      ...ev,
      members: (ev.members || []).map((m, idx) => ({
        id: m.id || `m-${idx}`,
        role: m.role || 'passenger',
        family_member: m.family_member || familyMembers.find(f => f.id === m.family_member_id)!,
      })).filter(m => Boolean(m.family_member)),
      enrichment: ev.enrichment || null,
      plan_override: (ev as any).plan_override || null,
      logistics: [],
      checklist: [],
      actions: [],
    }))
  }, [familyRoutines, familyMembers, now])

  const effectiveTodayEvents = useMemo<EventWithDetails[]>(() => {
    const existingTitles = new Set(todayEvents.map((e) => (e.title || '').toLowerCase()))
    const newRoutineEvents = routineTodayEvents.filter(
      (re) => !existingTitles.has(re.title.toLowerCase())
    )
    return [...todayEvents, ...newRoutineEvents]
  }, [todayEvents, routineTodayEvents])

  // Helper to test if an event is a meal (which is featured in Tonight's Kitchen)
  const isMealEvent = (e: EventWithDetails) => {
    const cat = (e.enrichment?.category || (e as any).category || '').toLowerCase()
    const title = (e.title || '').toLowerCase()
    return (
      cat.includes('meal') ||
      cat.includes('prep') ||
      cat.includes('cook') ||
      title.includes('dinner') ||
      title.includes('lunch')
    )
  }

  // Helper to test if an event is travel / off-site
  const checkIsTravelEvent = (e: EventWithDetails | null | undefined): boolean => {
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

  // Priority scoring function to intelligently rank simultaneous events:
  // Travel / off-site appointments take primary priority, followed by time-to-leave urgency, then home tasks.
  const scoreEventForHero = (e: EventWithDetails, currentTime: Date): number => {
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
        // Tier 1: Travel / Off-site
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
        // Tier 2/3: Local / Chores / On-site
        if (isUnderway) {
          score += 35
        } else if (minsToStart <= 15) {
          score += 20
        } else if (minsToStart <= 60) {
          score += 10
        }
      }

      // Secondary tie-breaker: earlier start time gets priority
      score -= (start.getTime() - currentTime.getTime()) / (1000 * 60 * 60)
    } catch {}

    return score
  }

  // Active candidates today (Hard events only — chores/reminders never take hero focus)
  const activeCandidates = useMemo(() => {
    return effectiveTodayEvents.filter((e) => {
      if (e.all_day) return false
      if (isMealEvent(e)) return false
      if (isReminderOrChore(e)) return false
      try {
        const start = parseISO(e.start_time)
        const end = parseISO(e.end_time)
        return end.getTime() > now.getTime() || start.getTime() > now.getTime() - 15 * 60 * 1000
      } catch {
        return false
      }
    })
  }, [effectiveTodayEvents, now])

  // Multi-Event Detection & Priority Ranking
  const { primaryHeroEvent, concurrentEvents, activeHeroEvent } = useMemo(() => {
    if (activeCandidates.length === 0) {
      return { primaryHeroEvent: null, concurrentEvents: [], activeHeroEvent: null }
    }

    // 1. Check for events currently underway
    const underwayEvents = activeCandidates.filter((e) => {
      try {
        const start = parseISO(e.start_time).getTime()
        const end = parseISO(e.end_time).getTime()
        return start <= now.getTime() && end > now.getTime()
      } catch {
        return false
      }
    })

    let activePool: EventWithDetails[] = []
    if (underwayEvents.length > 0) {
      activePool = underwayEvents
    } else {
      // Find earliest start time
      const earliestStart = activeCandidates.reduce((min, e) => {
        try {
          const t = parseISO(e.start_time).getTime()
          return t < min ? t : min
        } catch {
          return min
        }
      }, Infinity)

      // Pool includes events starting within 15 mins of the earliest upcoming start time
      activePool = activeCandidates.filter((e) => {
        try {
          const t = parseISO(e.start_time).getTime()
          return Math.abs(t - earliestStart) <= 15 * 60 * 1000
        } catch {
          return false
        }
      })
    }

    if (activePool.length === 0) {
      activePool = [activeCandidates[0]]
    }

    // Sort active pool by priority score descending (travel/off-site first)
    const sortedPool = [...activePool].sort((a, b) => scoreEventForHero(b, now) - scoreEventForHero(a, now))
    const primary = sortedPool[0] || null

    // Determine currently focused hero event (defaults to primary, or user-selected)
    let focused: EventWithDetails | null = primary
    if (selectedHeroEventId) {
      const match = activeCandidates.find((e) => e.id === selectedHeroEventId)
      if (match) {
        focused = match
      }
    }

    // Concurrent companion events: other active items besides the currently focused one
    const others = sortedPool.filter((e) => e.id !== focused?.id)

    return {
      primaryHeroEvent: primary,
      concurrentEvents: others,
      activeHeroEvent: focused,
    }
  }, [activeCandidates, selectedHeroEventId, now])

  const nextEvent = activeHeroEvent

  // Past events today (already ended, excluding meals and chores)
  const pastEvents = useMemo(() => {
    return effectiveTodayEvents
      .filter((e) => {
        if (isMealEvent(e)) return false
        if (isReminderOrChore(e)) return false
        if (e.all_day) return false
        try {
          const end = parseISO(e.end_time)
          return end.getTime() <= now.getTime()
        } catch {
          return false
        }
      })
      .sort((a, b) => {
        try {
          return parseISO(a.start_time).getTime() - parseISO(b.start_time).getTime()
        } catch {
          return 0
        }
      })
  }, [effectiveTodayEvents, now])

  // Upcoming / active appointment stream (Hard appointments only, excluding meals and chores/reminders)
  const upcomingAppointments = useMemo(() => {
    return effectiveTodayEvents
      .filter((e) => {
        if (isMealEvent(e)) return false
        if (isReminderOrChore(e)) return false
        if (e.all_day) return true
        try {
          const end = parseISO(e.end_time)
          return end.getTime() > now.getTime()
        } catch {
          return true
        }
      })
      .sort((a, b) => {
        try {
          return parseISO(a.start_time).getTime() - parseISO(b.start_time).getTime()
        } catch {
          return 0
        }
      })
  }, [effectiveTodayEvents, now])

  // Today's chores & reminders with suggested times (never hero)
  const todayReminders = useMemo(() => {
    return effectiveTodayEvents
      .filter((e) => {
        if (isMealEvent(e)) return false
        return isReminderOrChore(e)
      })
      .sort((a, b) => {
        try {
          return parseISO(a.start_time).getTime() - parseISO(b.start_time).getTime()
        } catch {
          return 0
        }
      })
  }, [effectiveTodayEvents])

  // Filter appointment stream (exclude meals, stale ended items)
  const appointmentEvents = useMemo(() => {
    return effectiveTodayEvents.filter((e) => {
      if (isMealEvent(e)) return false
      try {
        if (!e.all_day && parseISO(e.end_time).getTime() < now.getTime() - 30 * 60 * 1000) {
          return false
        }
      } catch {}
      return true
    })
  }, [effectiveTodayEvents, now])

  const tomorrowEventsSorted = useMemo(() => {
    return tomorrowEvents
      .filter((e) => !isMealEvent(e))
      .sort((a, b) => {
        if (a.all_day && !b.all_day) return -1
        if (!a.all_day && b.all_day) return 1
        try {
          return parseISO(a.start_time).getTime() - parseISO(b.start_time).getTime()
        } catch {
          return 0
        }
      })
  }, [tomorrowEvents])

  const isTodayDone = !nextEvent && upcomingAppointments.length === 0
  const firstTomorrowEvent = tomorrowEventsSorted[0] || null

  const hour = now.getHours()
  const isEvening = hour >= 18
  const isDinnerPast = hour >= 20

  const timeHorizonLabel = useMemo(() => {
    if (hour < 12) return 'Morning Briefing'
    if (hour < 17) return 'Afternoon Dispatch'
    return 'Evening Digest'
  }, [hour])

  const pickupsCount = useMemo(() => {
    return effectiveTodayEvents.filter((e) => {
      const t = (e.title || '').toLowerCase()
      return t.includes('pickup') || t.includes('drop-off') || t.includes('carpool')
    }).length
  }, [effectiveTodayEvents])

  const dailyBriefing = useMemo(() => {
    const weatherNote = weather
      ? weather.temp >= 85
        ? `Warm ${weather.temp}°F day ahead. Remember hydration & sun protection.`
        : weather.temp <= 50
        ? `Crisp ${weather.temp}°F conditions. Light jackets recommended.`
        : `${weather.temp}°F with ${weather.condition.toLowerCase()} skies.`
      : ''

    if (isTodayDone || isEvening) {
      const count = tomorrowEventsSorted.length
      if (count === 0) {
        return `Schedule complete for today. Tomorrow is open with no early appointments.`
      }

      const timedEvents = tomorrowEventsSorted.filter((e) => !e.all_day)
      const firstEvent = timedEvents[0] || tomorrowEventsSorted[0]

      let startTimeStr = ''
      if (firstEvent && !firstEvent.all_day) {
        try {
          startTimeStr = ` at ${format(parseISO(firstEvent.start_time), 'h:mm a')}`
        } catch {}
      }

      const pickupEvt = tomorrowEventsSorted.find((e) => {
        const t = (e.title || '').toLowerCase()
        return t.includes('pickup') || t.includes('drop-off')
      })
      const pickupName = pickupEvt?.members?.[0]?.family_member?.name || (pickupEvt ? 'Giselle' : null)
      const pickupPart = pickupName ? ` · ${pickupName} on pickup duty` : ''

      return `Tomorrow: ${count} event${count > 1 ? 's' : ''} scheduled${firstEvent ? `, starting${startTimeStr} with ${firstEvent.title}` : ''}${pickupPart}.`
    }

    if (hour < 12) {
      const count = effectiveTodayEvents.length
      const minsToNext = nextEvent ? differenceInMinutes(parseISO(nextEvent.start_time), now) : null
      const isNextSoon = minsToNext !== null && minsToNext <= 90
      const scheduleSummary = count > 0 ? `${count} calendar event${count > 1 ? 's' : ''} today.` : 'Open morning with clear schedule.'
      const nextSummary = isNextSoon && nextEvent ? ` First up: ${nextEvent.title} at ${format(parseISO(nextEvent.start_time), 'h:mm a')}.` : ''
      return `${weatherNote} ${scheduleSummary}${nextSummary}`
    }

    // Afternoon
    const nextSummary = nextEvent
      ? ` Next up: ${nextEvent.title}${nextEvent.members?.[0]?.family_member?.name ? ` (${nextEvent.members[0].family_member.name})` : ''}.`
      : ' All afternoon appointments complete.'

    const dinnerNote = isDinnerPast ? ' Dinner served.' : ' Dinner planned for 6:30 PM.'

    return `${weatherNote}${nextSummary}${dinnerNote}`
  }, [isTodayDone, isEvening, hour, effectiveTodayEvents, tomorrowEventsSorted, nextEvent, weather, isDinnerPast, now])

  const minutesUntilNext = useMemo(() => {
    if (!nextEvent) return null
    try {
      const start = parseISO(nextEvent.start_time)
      return differenceInMinutes(start, now)
    } catch {
      return null
    }
  }, [nextEvent, now])

  const isTravelEvent = useMemo(() => {
    if (!nextEvent) return false
    if (nextEvent.all_day) return false
    if (nextEvent.event_type === 'reminder') return false
    const mode = inferEventMode(nextEvent)
    const kind = inferEventPlanKind(nextEvent, mode)
    if (kind !== 'travel') return false
    const locationName = (nextEvent.location_name || '').trim().toLowerCase()
    const isHome = locationName === 'home' || locationName.includes('at home')
    if (isHome) return false
    const hasPhysicalDestination = Boolean(
      (nextEvent.address && nextEvent.address.trim().length > 0) ||
      (nextEvent.location_name && nextEvent.location_name.trim().length > 0)
    )
    return hasPhysicalDestination
  }, [nextEvent])

  const driveTimeMins = useMemo(() => {
    if (!isTravelEvent || !nextEvent) return null
    return nextEvent.enrichment?.drive_time_mins ?? null
  }, [isTravelEvent, nextEvent])

  const transportationPlan = useMemo<EventTransportationPlan | null>(() => {
    if (!isTravelEvent) return null
    return nextEvent?.plan_override?.transportation_plan ?? (nextEvent as any)?.transportation_plan ?? null
  }, [isTravelEvent, nextEvent])

  const outboundLeg = useMemo<TransportationLeg | null>(() => {
    if (!transportationPlan?.legs?.length) return null
    return transportationPlan.legs.find((l: TransportationLeg) => l.purpose !== 'return') ?? transportationPlan.legs[0]
  }, [transportationPlan])

  const returnLeg = useMemo<TransportationLeg | null>(() => {
    if (!transportationPlan?.legs?.length) return null
    return (
      transportationPlan.legs.find((l: TransportationLeg) => l.purpose === 'return') ??
      (transportationPlan.legs.length > 1 ? transportationPlan.legs[1] : null)
    )
  }, [transportationPlan])

  const originName = useMemo(() => {
    if (outboundLeg?.origin?.name) return outboundLeg.origin.name
    return 'Prep to Leave'
  }, [outboundLeg])

  const destinationName = useMemo(() => {
    if (outboundLeg?.destination?.name) return outboundLeg.destination.name
    if (nextEvent?.location_name) return nextEvent.location_name
    return 'Destination'
  }, [outboundLeg, nextEvent])

  const returnDestinationName = useMemo(() => {
    if (returnLeg?.destination?.name) return returnLeg.destination.name
    return 'Home'
  }, [returnLeg])

  const driverName = useMemo(() => {
    if (!isTravelEvent) return null
    return outboundLeg?.driverName || null
  }, [isTravelEvent, outboundLeg])

  const driverFamilyMemberId = useMemo(() => {
    if (!isTravelEvent) return null
    if (!outboundLeg?.driverName && !outboundLeg?.driverId) return null
    if (outboundLeg.driverId) return outboundLeg.driverId
    const match = nextEvent?.members?.find(
      (m) => m.family_member?.name?.toLowerCase() === outboundLeg.driverName?.toLowerCase(),
    )
    return match?.family_member?.id || null
  }, [isTravelEvent, outboundLeg, nextEvent])

  const leaveAt = useMemo(() => {
    if (!nextEvent || nextEvent.all_day || !isTravelEvent) return null
    try {
      const start = parseISO(nextEvent.start_time)
      const drive = driveTimeMins && driveTimeMins > 0 ? driveTimeMins : 10

      if (nextEvent.enrichment?.departure_time) {
        const dep = new Date(nextEvent.enrichment.departure_time)
        // Guard against stale dates/times: departure must be on same day, before/at start, within 3h
        if (
          !isNaN(dep.getTime()) &&
          dep.toDateString() === start.toDateString() &&
          dep.getTime() <= start.getTime() &&
          differenceInMinutes(start, dep) <= 180
        ) {
          return dep
        }
      }
      if (outboundLeg?.time && outboundLeg.timing === 'depart_at') {
        const [hh, mm] = outboundLeg.time.split(':').map(Number)
        const d = new Date(start.getTime())
        d.setHours(hh, mm, 0, 0)
        if (d.getTime() <= start.getTime() && differenceInMinutes(start, d) <= 180) {
          return d
        }
      }
      return subMinutes(start, drive)
    } catch {
      return null
    }
  }, [nextEvent, isTravelEvent, driveTimeMins, outboundLeg])

  const minutesUntilLeave = useMemo(() => {
    if (!leaveAt) return null
    return differenceInMinutes(leaveAt, now)
  }, [leaveAt, now])

  const prepSummaryText = useMemo(() => {
    if (!nextEvent) return null

    // 1. Explicit checklist items
    if (nextEvent.checklist && nextEvent.checklist.length > 0) {
      const pending = nextEvent.checklist.filter((item) => !item.checked)
      const list = pending.length > 0 ? pending : nextEvent.checklist
      const labels = list.map((item) => item.label?.trim()).filter(Boolean)
      if (labels.length > 0) {
        return labels.join(' · ')
      }
    }

    // 2. AI enrichment what_to_bring (array or string)
    if (nextEvent.enrichment?.what_to_bring) {
      const raw = nextEvent.enrichment.what_to_bring as unknown
      if (Array.isArray(raw) && raw.length > 0) {
        return raw.map((s) => String(s).trim()).filter(Boolean).join(' · ')
      }
      if (typeof raw === 'string' && raw.trim()) {
        const parts = raw
          .split(/[,;\n]/)
          .map((s) => s.trim())
          .filter(Boolean)
        if (parts.length > 0) {
          return parts.join(' · ')
        }
      }
    }

    // 3. Prep notes fallback
    if (nextEvent.enrichment?.prep_notes) {
      return nextEvent.enrichment.prep_notes.trim()
    }

    return null
  }, [nextEvent])

  const locationDisplayText = useMemo(() => {
    if (!nextEvent) return null
    const locName = nextEvent.location_name?.trim() || null
    const addr = nextEvent.address?.trim() || null

    if (!locName && !addr) return null
    if (!addr) return locName
    if (!locName) return addr

    // If title already mentions the location name (e.g. "Party at Coopers" vs "Katherine Cooper's House"),
    // don't repeat the location name; show the street address cleanly.
    const titleLower = (nextEvent.title || '').toLowerCase()
    const locLower = locName.toLowerCase()

    // Check partial token overlap (e.g. "Cooper" in "Party at Coopers")
    const locTokens = locLower.split(/[\s,.'’\-]+/).filter((t) => t.length > 3)
    const titleHasOverlap = locTokens.some((t) => titleLower.includes(t))

    if (titleHasOverlap || titleLower.includes(locLower) || locLower.includes(titleLower)) {
      return addr
    }

    return `${locName} · ${addr}`
  }, [nextEvent])

  const greeting = greetingFor(now)

  return {
    now,
    greeting,
    dailyBriefing,
    timeHorizonLabel,
    weather,
    nextEvent,
    primaryHeroEvent,
    concurrentEvents,
    selectedHeroEventId,
    setSelectedHeroEventId,
    appointmentEvents,
    pastEvents,
    upcomingAppointments,
    todayReminders,
    todayEvents: effectiveTodayEvents,
    tomorrowEvents: tomorrowEventsSorted,
    isTodayDone,
    firstTomorrowEvent,
    activeConflicts,
    activePrep,
    familyMembers,
    ambientRoutineStatuses,
    handleResolveConflict,
    handleCompletePrep,
    pickupsCount,
    isEvening,
    isDinnerPast,
    totalAttentionCount,
    minutesUntilNext,
    driveTimeMins,
    leaveAt,
    minutesUntilLeave,
    isTravelEvent,
    transportationPlan,
    originName,
    destinationName,
    returnDestinationName,
    driverName,
    driverFamilyMemberId,
    prepSummaryText,
    locationDisplayText,
    setCanvasSubmode,
    navigateTo: navigate,
  }
}
