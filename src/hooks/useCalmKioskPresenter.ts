import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { format, parseISO, differenceInMinutes, subMinutes } from 'date-fns'
import { useLiveClock, greetingFor } from './useLiveClock'
import { useTodayEvents, useTomorrowEvents, type EventWithDetails } from './useCalendarEvents'
import { useWeekConflicts, useResolveConflict } from './useConflicts'
import { usePrepItems, useCompletePrepItem } from './usePrepItems'
import { useFamilyMembers } from './useFamilyMembers'
import { useHomeWeather } from './useHomeWeather'
import { useAppStore } from '../stores/appStore'
import { inferEventMode, inferEventPlanKind } from '../lib/eventCommandCenter'
import type { EventTransportationPlan, TransportationLeg } from '../lib/eventTransportation'
import type { Conflict, PrepItem, FamilyMember } from '../types'

export interface CalmKioskPresenterState {
  now: Date
  greeting: string
  dailyBriefing: string
  timeHorizonLabel: string
  weather: ReturnType<typeof useHomeWeather>['data']
  nextEvent: EventWithDetails | null
  appointmentEvents: EventWithDetails[]
  pastEvents: EventWithDetails[]
  upcomingAppointments: EventWithDetails[]
  todayEvents: EventWithDetails[]
  tomorrowEvents: EventWithDetails[]
  isTodayDone: boolean
  firstTomorrowEvent: EventWithDetails | null
  activeConflicts: Conflict[]
  activePrep: PrepItem[]
  familyMembers: FamilyMember[]
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

  const resolveConflict = useResolveConflict()
  const completePrep = useCompletePrepItem()

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

  const totalAttentionCount = activeConflicts.length + activePrep.length

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

  // Find next upcoming event today (that hasn't ended yet)
  const nextEvent = useMemo(() => {
    const upcoming = todayEvents.filter((e) => {
      if (e.all_day) return false
      if (isMealEvent(e)) return false
      try {
        const start = parseISO(e.start_time)
        const end = parseISO(e.end_time)
        return end.getTime() > now.getTime() || start.getTime() > now.getTime() - 15 * 60 * 1000
      } catch {
        return false
      }
    })
    return upcoming[0] || null
  }, [todayEvents, now])

  // Past events today (already ended, excluding meals)
  const pastEvents = useMemo(() => {
    return todayEvents
      .filter((e) => {
        if (isMealEvent(e)) return false
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
  }, [todayEvents, now])

  // Upcoming / active appointment stream (happening now or later today, including hero, excluding meals)
  const upcomingAppointments = useMemo(() => {
    return todayEvents
      .filter((e) => {
        if (isMealEvent(e)) return false
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
  }, [todayEvents, now])

  // Filter appointment stream (exclude meals, stale ended items)
  const appointmentEvents = useMemo(() => {
    return todayEvents.filter((e) => {
      if (isMealEvent(e)) return false
      try {
        if (!e.all_day && parseISO(e.end_time).getTime() < now.getTime() - 30 * 60 * 1000) {
          return false
        }
      } catch {}
      return true
    })
  }, [todayEvents, now])

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
    return todayEvents.filter((e) => {
      const t = (e.title || '').toLowerCase()
      return t.includes('pickup') || t.includes('drop-off') || t.includes('carpool')
    }).length
  }, [todayEvents])

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
      const count = todayEvents.length
      const scheduleSummary = count > 0 ? `${count} event${count > 1 ? 's' : ''} scheduled for today.` : 'Open morning with clear schedule.'
      const nextSummary = nextEvent ? ` First up: ${nextEvent.title} at ${format(parseISO(nextEvent.start_time), 'h:mm a')}.` : ''
      return `${weatherNote} ${scheduleSummary}${nextSummary}`
    }

    // Afternoon
    const nextSummary = nextEvent
      ? ` Next up: ${nextEvent.title}${nextEvent.members?.[0]?.family_member?.name ? ` (${nextEvent.members[0].family_member.name})` : ''}.`
      : ' All afternoon appointments complete.'

    const dinnerNote = isDinnerPast ? ' Dinner served.' : ' Dinner planned for 6:30 PM.'

    return `${weatherNote}${nextSummary}${dinnerNote}`
  }, [isTodayDone, isEvening, hour, todayEvents, tomorrowEventsSorted, nextEvent, weather, isDinnerPast, now])

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
      if (nextEvent.enrichment?.departure_time) {
        return new Date(nextEvent.enrichment.departure_time)
      }
      if (outboundLeg?.time && outboundLeg.timing === 'depart_at') {
        const [hh, mm] = outboundLeg.time.split(':').map(Number)
        const d = parseISO(nextEvent.start_time)
        d.setHours(hh, mm, 0, 0)
        return d
      }
      const start = parseISO(nextEvent.start_time)
      if (driveTimeMins && driveTimeMins > 0) {
        return subMinutes(start, driveTimeMins)
      }
      return null
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
    appointmentEvents,
    pastEvents,
    upcomingAppointments,
    todayEvents,
    tomorrowEvents: tomorrowEventsSorted,
    isTodayDone,
    firstTomorrowEvent,
    activeConflicts,
    activePrep,
    familyMembers,
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
