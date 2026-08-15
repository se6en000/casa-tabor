import { useState, useMemo } from 'react'
import { format, parseISO, isAfter, isBefore } from 'date-fns'
import { useLiveClock } from './useLiveClock'
import { useTodayEvents, useTomorrowEvents, type EventWithDetails } from './useCalendarEvents'
import { useWeekConflicts, useResolveConflict } from './useConflicts'
import {
  usePrepItems,
  useCompletePrepItem,
  useDownvotePrepItem,
  useSnoozePrepItem,
} from './usePrepItems'
import { useFamilyMembers } from './useFamilyMembers'
import { useHomeWeather } from './useHomeWeather'
import { type SnoozeDuration, snoozeDurationLabel } from '../utils/snoozeDuration'
import { useAttentionStore } from '../stores/attentionStore'
import { useAppStore } from '../stores/appStore'
import type { PrepItem, Conflict, FamilyMember } from '../types'

export interface DriverAvailability {
  member: FamilyMember
  isAvailable: boolean
  currentConflict?: string
}

export interface TurboCanvasPresenterState {
  now: Date
  todayEvents: EventWithDetails[]
  tomorrowEvents: EventWithDetails[]
  activeConflicts: Conflict[]
  activePrep: PrepItem[]
  pushedPrep: PrepItem[]
  familyMembers: FamilyMember[]
  weather: {
    temp: number
    condition: string
    icon: string
    humidity?: number
    feelsLike?: number
    uvIndex?: number
    precipProbability?: number
    city: string
  } | null
  householdNarrative: string
  copilotTip: string
  highlightedEventId: string | null
  setHighlightedEventId: (id: string | null) => void
  handleResolveConflict: (conflict: Conflict, resolution: string) => void
  handleCompletePrep: (item: PrepItem) => void
  handleDownvotePrep: (item: PrepItem) => void
  handleSnoozePrep: (id: string, period: SnoozeDuration) => void
  handlePushPrep: (item: PrepItem, bucket: 'later_today' | 'tomorrow' | 'weekend') => void
  handleRestorePushedPrep: (itemId: string) => void
  handleBatchAutoTriage: () => void
  openCopilotForConflict: (conflict: Conflict) => void
  openCopilotForEvent: (eventId: string) => void
  setCanvasSubmode: (submode: 'calm' | 'turbo') => void
  getDriverAvailabilities: (conflict: Conflict) => DriverAvailability[]
}

export function useTurboCanvasPresenter(): TurboCanvasPresenterState {
  const { setCanvasSubmode, setAiDrawerOpen } = useAppStore()
  const now = useLiveClock(10_000)
  const { data: todayEvents = [] } = useTodayEvents(now)
  const { data: tomorrowEvents = [] } = useTomorrowEvents(now)
  const { data: conflicts = [] } = useWeekConflicts()
  const { data: prepItems = [] } = usePrepItems()
  const { data: familyMembers = [] } = useFamilyMembers()
  const { data: weather = null } = useHomeWeather()

  const resolveConflict = useResolveConflict()
  const completePrep = useCompletePrepItem()
  const downvotePrep = useDownvotePrepItem()
  const snoozePrep = useSnoozePrepItem()

  const [pushedPrepIds, setPushedPrepIds] = useState<Record<string, 'later_today' | 'tomorrow' | 'weekend'>>({})

  const {
    highlightedEventId,
    setHighlightedEventId,
    pendingDismissalIds,
    scheduleUndoableAction,
  } = useAttentionStore()

  // Filter out pending dismissed items optimistically
  const activeConflicts = useMemo(
    () => conflicts.filter((c) => !c.resolved && !pendingDismissalIds.has(`conflict-${c.id}`)),
    [conflicts, pendingDismissalIds]
  )

  const unpushedPrep = useMemo(
    () => prepItems.filter((p) => !p.dismissed && !pendingDismissalIds.has(`prep-${p.id}`)),
    [prepItems, pendingDismissalIds]
  )

  const activePrep = useMemo(
    () => unpushedPrep.filter((p) => !pushedPrepIds[p.id]),
    [unpushedPrep, pushedPrepIds]
  )

  const pushedPrep = useMemo(
    () => unpushedPrep.filter((p) => Boolean(pushedPrepIds[p.id])),
    [unpushedPrep, pushedPrepIds]
  )

  // Driver availability heuristic for a specific conflict
  const getDriverAvailabilities = (conflict: Conflict): DriverAvailability[] => {
    const drivers = familyMembers.filter(
      (m) => m.can_drive || m.role === 'parent' || m.role === 'caregiver'
    )
    const candidates = drivers.length > 0 ? drivers : familyMembers

    const eventTime = conflict.event_a?.start_time ? parseISO(conflict.event_a.start_time) : null

    return candidates.map((m) => {
      if (!eventTime) return { member: m, isAvailable: true }

      // Check if this member is attached to any other event in that window
      const isBooked = todayEvents.some((evt) => {
        if (evt.id === conflict.event_a?.id) return false
        if (!evt.start_time || !evt.end_time) return false
        const memberIsOnEvent = evt.members?.some((em) => em.family_member?.id === m.id)
        if (!memberIsOnEvent) return false

        const start = parseISO(evt.start_time)
        const end = parseISO(evt.end_time)
        return isAfter(eventTime, start) && isBefore(eventTime, end)
      })

      return {
        member: m,
        isAvailable: !isBooked,
        currentConflict: isBooked ? 'Busy with another event' : undefined,
      }
    })
  }

  // Dynamic Natural Language Household Status Narrative
  const householdNarrative = useMemo(() => {
    const totalTriage = activeConflicts.length + activePrep.length

    if (todayEvents.length === 0) {
      if (totalTriage > 0) {
        return `No scheduled appointments today, but ${totalTriage} actionable item${totalTriage > 1 ? 's require' : ' requires'} triage in the Action Hub.`
      }
      return 'No scheduled appointments today. Great time for meal prep, household organization, or family downtime.'
    }

    if (todayEvents.length === 1) {
      const e = todayEvents[0]
      let timeStr = 'all-day'
      if (!e.all_day && e.start_time) {
        try {
          timeStr = `at ${format(parseISO(e.start_time), 'h:mm a')}`
        } catch {
          timeStr = 'today'
        }
      }
      const memberNames = e.members?.map((m) => m.family_member?.name).filter(Boolean)
      const memberPart = memberNames && memberNames.length > 0 ? ` (${memberNames.join(', ')})` : ''
      const locPart = e.location_name ? ` at ${e.location_name}` : ''
      const triagePart = activeConflicts.length > 0 ? ` Note: ${activeConflicts.length} conflict needs resolution.` : ''
      return `Today features 1 event: ${e.title}${memberPart} ${timeStr}${locPart}.${triagePart}`
    }

    const timedEvents = todayEvents.filter((e) => !e.all_day)
    const firstEvent = timedEvents[0] || todayEvents[0]
    const lastEvent = timedEvents[timedEvents.length - 1] || todayEvents[todayEvents.length - 1]

    let firstTimeStr = ''
    if (!firstEvent.all_day && firstEvent.start_time) {
      try {
        firstTimeStr = ` at ${format(parseISO(firstEvent.start_time), 'h:mm a')}`
      } catch {}
    }

    const firstMember = firstEvent.members?.[0]?.family_member?.name
    const firstPart = `Starts${firstTimeStr} with ${firstEvent.title}${firstMember ? ` (${firstMember})` : ''}`

    let lastPart = ''
    if (lastEvent.id !== firstEvent.id && !lastEvent.all_day && lastEvent.start_time) {
      try {
        const lastTimeStr = format(parseISO(lastEvent.start_time), 'h:mm a')
        const lastMember = lastEvent.members?.[0]?.family_member?.name
        lastPart = `, wrapping up with ${lastEvent.title}${lastMember ? ` (${lastMember})` : ''} at ${lastTimeStr}`
      } catch {}
    }

    const triageSuffix =
      activeConflicts.length > 0
        ? ` ${activeConflicts.length} schedule conflict${activeConflicts.length > 1 ? 's' : ''} flagged for review.`
        : activePrep.length > 0
        ? ` ${activePrep.length} prep task${activePrep.length > 1 ? 's' : ''} queued.`
        : ''

    return `Today features ${todayEvents.length} events across the family. ${firstPart}${lastPart}.${triageSuffix}`
  }, [todayEvents, activeConflicts, activePrep])

  // Contextual Proactive Copilot Insight
  const copilotTip = useMemo(() => {
    // 1. Weather Precipitation Risk
    if (weather?.precipProbability && weather.precipProbability >= 30) {
      return `Rain expected in ${weather.city || 'your area'} (${weather.precipProbability}% chance). Remember umbrellas and rain gear for outdoor transit.`
    }
    if (weather?.condition && /rain|shower|storm|drizzle|snow|flurry/i.test(weather.condition)) {
      return `${weather.condition} forecast today (${weather.temp}°F in ${weather.city || 'your area'}). Keep umbrellas handy for afternoon pickups.`
    }

    // 2. Weather Extreme Heat or Cold
    if (weather?.temp && weather.temp >= 86) {
      return `Warm afternoon ahead (${weather.temp}°F). Pack water bottles and sunscreen for outdoor activities.`
    }
    if (weather?.temp && weather.temp <= 36) {
      return `Chilly temperatures today (${weather.temp}°F in ${weather.city || 'your area'}). Warm coats and layers recommended.`
    }
    if (weather?.uvIndex && weather.uvIndex >= 8) {
      return `High UV index (${weather.uvIndex}) this afternoon. Sun protection recommended for outdoor schedules.`
    }

    // 3. Urgent Conflict / Ride Needs
    const driveConflict = activeConflicts.find((c) => c.conflict_type === 'drive_time')
    if (driveConflict) {
      return `Unassigned ride needed: ${driveConflict.description || 'Transportation coordination required'}. Assign a driver in 1 tap in the Action Hub.`
    }
    if (activeConflicts.length > 0) {
      return `${activeConflicts.length} schedule conflict detected on the calendar. Review overlapping times in the Action Hub.`
    }

    // 4. Overdue Prep Task
    const nowMs = Date.now()
    const overduePrep = activePrep.find((p) => p.due_by && new Date(p.due_by).getTime() < nowMs)
    if (overduePrep) {
      const taskName = overduePrep.description || overduePrep.event_title || 'Prep Item'
      return `Priority task pending: "${taskName}". Tap Done or Snooze in the Hub to keep on track.`
    }

    // 5. Harmonious Fallback
    if (weather) {
      return `Forecast is ${weather.condition.toLowerCase()} at ${weather.temp}°F in ${weather.city}. All household operations are running smoothly.`
    }
    return `Schedule is on track with ${todayEvents.length} event${todayEvents.length === 1 ? '' : 's'} today. Household in harmony.`
  }, [weather, activeConflicts, activePrep, todayEvents])

  // 1-Click Action Handlers with 4000ms Undo Window
  const handleResolveConflict = (conflict: Conflict, resolution: string) => {
    const toastId = `conflict-${conflict.id}`
    scheduleUndoableAction({
      id: toastId,
      title: 'Resolved conflict',
      actionLabel: resolution,
      onCommit: () => resolveConflict(conflict.id, resolution),
      onUndo: () => {},
    })
  }

  const handleCompletePrep = (item: PrepItem) => {
    const toastId = `prep-${item.id}`
    const label = item.description || item.event_title || 'Prep Item'
    scheduleUndoableAction({
      id: toastId,
      title: 'Completed task',
      actionLabel: label,
      onCommit: () => completePrep(item.id),
      onUndo: () => {},
    })
  }

  const handleDownvotePrep = (item: PrepItem) => {
    const toastId = `prep-${item.id}`
    const label = item.description || item.event_title || 'Prep Item'
    scheduleUndoableAction({
      id: toastId,
      title: 'Marked not relevant',
      actionLabel: label,
      onCommit: () => downvotePrep(item.id),
      onUndo: () => {},
    })
  }

  const handleSnoozePrep = (id: string, period: SnoozeDuration) => {
    const item = prepItems.find((p) => p.id === id)
    const toastId = `prep-${id}`
    const periodLabel = snoozeDurationLabel(period) || period
    const label = item?.description || item?.event_title || 'Task'
    scheduleUndoableAction({
      id: toastId,
      title: `Snoozed (${periodLabel})`,
      actionLabel: label,
      onCommit: () => snoozePrep(id, period),
      onUndo: () => {},
    })
  }

  const handlePushPrep = (item: PrepItem, bucket: 'later_today' | 'tomorrow' | 'weekend') => {
    setPushedPrepIds((prev) => ({ ...prev, [item.id]: bucket }))
    const bucketLabel =
      bucket === 'later_today' ? 'Later Today' : bucket === 'tomorrow' ? 'Tomorrow' : 'This Weekend'
    const label = item.description || item.event_title || 'Task'
    scheduleUndoableAction({
      id: `push-${item.id}`,
      title: `Pushed to ${bucketLabel}`,
      actionLabel: label,
      onCommit: () => {},
      onUndo: () => {
        setPushedPrepIds((prev) => {
          const next = { ...prev }
          delete next[item.id]
          return next
        })
      },
    })
  }

  const handleRestorePushedPrep = (itemId: string) => {
    setPushedPrepIds((prev) => {
      const next = { ...prev }
      delete next[itemId]
      return next
    })
  }

  const handleBatchAutoTriage = () => {
    // 1. Resolve ride conflicts with best available driver
    activeConflicts.forEach((conflict) => {
      if (conflict.conflict_type === 'drive_time') {
        const availabilities = getDriverAvailabilities(conflict)
        const bestDriver = availabilities.find((a) => a.isAvailable)?.member || availabilities[0]?.member
        if (bestDriver) {
          handleResolveConflict(conflict, `Auto-assigned ${bestDriver.name} as driver`)
        }
      }
    })
  }

  const openCopilotForConflict = (conflict: Conflict) => {
    setAiDrawerOpen(true)
    const targetEventId = conflict.event_a?.id || conflict.event_b?.id
    if (targetEventId) {
      document.dispatchEvent(
        new CustomEvent('casa:open-event-details', {
          detail: { eventId: targetEventId },
        })
      )
    }
  }

  const openCopilotForEvent = (eventId: string) => {
    setAiDrawerOpen(true)
    document.dispatchEvent(
      new CustomEvent('casa:open-event-details', {
        detail: { eventId },
      })
    )
  }

  return {
    now,
    todayEvents,
    tomorrowEvents,
    activeConflicts,
    activePrep,
    pushedPrep,
    familyMembers,
    weather,
    householdNarrative,
    copilotTip,
    highlightedEventId,
    setHighlightedEventId,
    handleResolveConflict,
    handleCompletePrep,
    handleDownvotePrep,
    handleSnoozePrep,
    handlePushPrep,
    handleRestorePushedPrep,
    handleBatchAutoTriage,
    openCopilotForConflict,
    openCopilotForEvent,
    setCanvasSubmode,
    getDriverAvailabilities,
  }
}

