import { useState, useMemo, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  format,
  parseISO,
  differenceInMinutes,
  subMinutes,
  startOfDay,
  endOfDay,
  isBefore,
  isSameDay,
  differenceInCalendarDays,
  addDays,
} from 'date-fns'
import { getEventStartDate } from '../utils/eventTime'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useLiveClock } from './useLiveClock'
import { useTodayEvents, useTomorrowEvents, useRollingEvents, type EventWithDetails } from './useCalendarEvents'
import { useWeekConflicts, useResolveConflict } from './useConflicts'
import { usePrepItems, useCompletePrepItem } from './usePrepItems'
import { useFamilyMembers } from './useFamilyMembers'
import { useHomeWeather } from './useHomeWeather'
import { useReminderNeedsYouActions } from './useReminderNeedsYouActions'
import { useMemberAvailability } from './useMemberAvailability'
import {
  fetchTodoCompletions,
  saveTodoToggle,
  subscribeToTodoSync,
  getStoredTodoCompletions,
  isTodoCompletedToday,
} from '../utils/todoCompletionsSync.ts'
import { useAppStore } from '../stores/appStore'
import { fetchTonightDinnerPlan, isValidDinnerPlan } from '../utils/dinnerPlanSync'
import { inferEventMode, inferEventPlanKind } from '../lib/eventCommandCenter'
import type { EventTransportationPlan, TransportationLeg } from '../lib/eventTransportation'
import {
  deserializeRoutineFromAvailabilityRules,
  deriveAmbientRoutineStatus,
  type AmbientRoutineStatus,
  type FamilyRoutine,
} from '../lib/familyRoutines'
import { isReminderOrChore } from '../lib/heroFocus.mjs'
import { clusterPrepItems } from '../utils/prepItemClusters'
import { splitActionableAndTransitItems } from '../utils/needsYouFeed'
import { isItemAlreadyScheduled, isExpiredEventSuggestion } from '../utils/calendarEventMatcher'
import { useGoogleSyncTriage } from './useGoogleSyncTriage'
import { supabase } from '../lib/supabase'
import type { Conflict, PrepItem, FamilyMember } from '../types'
import { CATEGORY_LABEL } from '../components/calendar/categoryFields'

// ── Household Dispatch (home-screen digest) ────────────────────────────────
// Categorizes a calendar event into the small set of buckets the dispatch
// card visualizes (a week-ribbon dot color, or a horizon-item tag) --
// deliberately coarser than the full 14-value event_enrichments.category
// taxonomy, since a glance-widget needs a handful of colors, not fourteen.
export type DispatchBucket = 'sports' | 'school' | 'social' | 'travel' | 'other'

function rawEventCategory(e: EventWithDetails): string {
  return ((e.enrichment?.category || (e as unknown as Record<string, unknown>).category || '') as string).toLowerCase()
}

function dispatchBucketForEvent(e: EventWithDetails): DispatchBucket {
  const cat = rawEventCategory(e)
  if (cat === 'sports') return 'sports'
  if (cat === 'school' || cat === 'child_care') return 'school'
  if (cat === 'social' || cat === 'birthday' || cat === 'holiday') return 'social'
  if (cat === 'travel') return 'travel'
  return 'other'
}

function dispatchCategoryLabel(e: EventWithDetails): string {
  const cat = rawEventCategory(e)
  return CATEGORY_LABEL[cat] || 'Household'
}

// Milestone-grade: worth naming individually on the 30-day horizon ledger
// (a real celebration or trip), not just anything with a category.
function isDispatchMilestone(e: EventWithDetails): boolean {
  const titleLower = (e.title || '').toLowerCase()
  const catLower = rawEventCategory(e)
  const isCelebration =
    /birthday|bday|anniversary|party|celebration|wedding|shower|graduation|gala|reunion|festival|tournament|recital|concert/i.test(titleLower) ||
    /birthday|anniversary|party|celebration|wedding|graduation/i.test(catLower)
  const isTrip = Boolean(
    e.trip_id || /trip|travel|flight|vacation|getaway|hotel/i.test(catLower) || /flight|hotel|trip to|vacation/i.test(titleLower),
  )
  return isCelebration || isTrip
}

// Day-worthy for the week ribbon: either milestone-grade, carries real prep
// (unchecked checklist, prep notes, a linked prep item), or falls into a
// category worth flagging at a glance -- excludes routine/admin noise
// (errands, chores, work) so a busy calendar doesn't dot every single day.
function isDispatchNotable(e: EventWithDetails, prepItems: PrepItem[]): boolean {
  if (isDispatchMilestone(e)) return true
  const eWithChecklist = e as unknown as { checklist?: Array<{ checked: boolean }> }
  const hasUncheckedChecklist = Boolean(eWithChecklist.checklist?.some((item) => !item.checked))
  const hasPrepNotes = Boolean(
    (e.enrichment?.prep_notes && e.enrichment.prep_notes.trim().length > 0) ||
      (e.enrichment?.what_to_bring &&
        (Array.isArray(e.enrichment.what_to_bring) ? e.enrichment.what_to_bring.length > 0 : Boolean(e.enrichment.what_to_bring))),
  )
  const hasLinkedPrepItem = prepItems.some((p) => Boolean(p.event_id && p.event_id === e.id && !p.dismissed))
  if (hasUncheckedChecklist || hasPrepNotes || hasLinkedPrepItem) return true
  const bucket = dispatchBucketForEvent(e)
  return bucket === 'sports' || bucket === 'school' || bucket === 'social' || bucket === 'travel'
}

function dispatchPrepPhrase(e: EventWithDetails): string | null {
  const eWithChecklist = e as unknown as { checklist?: Array<{ checked: boolean; label: string }> }
  if (eWithChecklist.checklist && eWithChecklist.checklist.length > 0) {
    const total = eWithChecklist.checklist.length
    const checked = eWithChecklist.checklist.filter((c) => c.checked).length
    if (checked < total) return `${checked} of ${total} ready`
  }
  if (e.enrichment?.what_to_bring) {
    const raw = e.enrichment.what_to_bring
    const itemStr = Array.isArray(raw) ? raw[0] : String(raw).split(/[,;]/)[0]
    if (itemStr) return `Bring: ${itemStr.trim()}`
  }
  if (e.enrichment?.prep_notes) {
    const note = e.enrichment.prep_notes.trim()
    if (note.length > 0 && note.length <= 60) return note
  }
  return null
}

export interface DispatchDay {
  date: Date
  dayName: string
  dayNum: string
  isToday: boolean
  categories: DispatchBucket[]
}

export interface DispatchHorizonItem {
  id: string
  title: string
  daysAway: number
  dateLabel: string
  bucket: DispatchBucket
  categoryLabel: string
  prepPhrase: string | null
}

export interface CalmKioskPresenterState {
  now: Date
  dispatchHeadline: string
  dispatchWeekDays: DispatchDay[]
  dispatchHorizon: DispatchHorizonItem[]
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
  openReminders: EventWithDetails[]
  overdueReminders: EventWithDetails[]
  activeReminders: EventWithDetails[]
  completedReminders: EventWithDetails[]
  completedItems: Record<string, boolean>
  setCompletedItems: React.Dispatch<React.SetStateAction<Record<string, boolean>>>
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
  handleCompleteReminder: (id: string) => Promise<void>
  handleToggleReminder: (id: string) => Promise<void>
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
  isRefreshing: boolean
  refreshBriefing: () => Promise<void>
}

export function useCalmKioskPresenter(): CalmKioskPresenterState {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { setCanvasSubmode } = useAppStore()
  const now = useLiveClock(10_000)
  // Collapses `now`'s every-10-seconds ticking down to day granularity for
  // memos that only ever care which calendar day it is (the Ahead card's
  // week ribbon and horizon list) -- without this they were rebuilding a
  // fresh array on every tick even though their actual output only changes
  // once a day, forcing an unmemoized HouseholdDispatchCard/TomorrowPreviewWidget
  // to re-render every 10s along with the rest of the page. Found chasing
  // residual (post-hover-fix) touch-scroll roughness on the kiosk home
  // screen (2026-09-13).
  const todayKey = format(now, 'yyyy-MM-dd')
  const [isRefreshing, setIsRefreshing] = useState(false)
  const { data: todayEvents = [] } = useTodayEvents(now)
  const { data: tomorrowEvents = [] } = useTomorrowEvents(now)
  const { data: rollingEvents = [] } = useRollingEvents(now)
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

  const { data: serverCompletions } = useQuery({
    queryKey: ['household-todo-completions'],
    queryFn: fetchTodoCompletions,
    staleTime: 5 * 60_000,
    refetchInterval: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
  })

  const [completedItems, setCompletedItems] = useState<Record<string, boolean>>(() => {
    return getStoredTodoCompletions()
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

  const handleToggleReminder = useCallback(
    async (id: string) => {
      setCompletedItems((prev) => {
        const nextVal = !prev[id]
        void saveTodoToggle(id, nextVal)
        return { ...prev, [id]: nextVal }
      })
    },
    [],
  )

  const handleCompleteReminder = useCallback(
    async (id: string) => {
      await handleToggleReminder(id)
    },
    [handleToggleReminder],
  )

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

  const { failedJobs } = useGoogleSyncTriage()

  const unscheduledPrep = useMemo(() => {
    const staleOrDuplicateIds: string[] = []
    const filtered = activePrep.filter((p) => {
      const isExpired = isExpiredEventSuggestion(p, now)
      if (isExpired) {
        staleOrDuplicateIds.push(p.id)
        return false
      }

      if (rollingEvents.length > 0) {
        const alreadyScheduled = isItemAlreadyScheduled(p, rollingEvents)
        if (alreadyScheduled) {
          staleOrDuplicateIds.push(p.id)
          return false
        }
      }

      return true
    })

    // Silently auto-archive duplicate or expired prep items in Supabase in the background
    if (staleOrDuplicateIds.length > 0) {
      void supabase
        .from('prep_items')
        .update({ dismissed: true, dismissed_at: new Date().toISOString() })
        .in('id', staleOrDuplicateIds)
        .then(() => {})
    }

    return filtered
  }, [activePrep, rollingEvents, now])

  const { actionableItems } = useMemo(
    () => splitActionableAndTransitItems(unscheduledPrep),
    [unscheduledPrep]
  )

  const clusteredPrep = useMemo(() => clusterPrepItems(actionableItems), [actionableItems])
  const totalAttentionCount = activeConflicts.length + failedJobs.length + clusteredPrep.length

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

  // todayEvents from useTodayEvents is the single source of truth (already contains deduplicated physical + synthetic routine events)
  const effectiveTodayEvents = todayEvents

  // Helper to test if an event is strictly a home cooking placeholder (handled by Tonight's Kitchen)
  const isMealEvent = (e: EventWithDetails) => {
    const title = (e.title || '').trim().toLowerCase()
    // Explicit kitchen recipe placeholders
    if (title.startsWith('cook:') || title.startsWith("tonight's kitchen:") || title.startsWith('recipe:')) {
      return true
    }
    // If it has an offsite venue, restaurant, or location, it is ALWAYS a real appointment
    const loc = (e.location_name || e.address || '').trim().toLowerCase()
    if (loc && !['home', 'at home', 'casa'].includes(loc)) {
      return false
    }
    return false
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

      const driveTime = e.enrichment?.drive_time_mins || 0
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
    } catch { /* ignore — best-effort, non-critical */ }

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

    let activePool: EventWithDetails[]
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

  // Rolling chores & reminders (past 7 days missed/overdue through end of today, plus items completed today)
  const todayReminders = useMemo(() => {
    const todayEnd = endOfDay(now)
    return rollingEvents
      .filter((e) => {
        if (isMealEvent(e)) return false
        if (!isReminderOrChore(e) && e.event_type !== 'reminder') return false
        const startDate = getEventStartDate(e)
        const isCompleted = Boolean(completedItems[e.id])
        if (isCompleted) {
          return isTodoCompletedToday(e.id, startDate, now)
        }
        // Rolling: includes past 7 days (missed/overdue) up through end of today
        return isBefore(startDate, todayEnd) || isSameDay(startDate, now)
      })
      .sort((a, b) => getEventStartDate(a).getTime() - getEventStartDate(b).getTime())
  }, [rollingEvents, completedItems, now])

  // Reminders breakdown (reactive to completedItems)
  const openReminders = useMemo(() => {
    return todayReminders.filter((e) => !completedItems[e.id])
  }, [todayReminders, completedItems])

  const overdueReminders = useMemo(() => {
    const startOfTodayMs = startOfDay(now).getTime()
    const nowMs = now.getTime()
    return todayReminders.filter((evt) => {
      if (completedItems[evt.id]) return false
      const startMs = getEventStartDate(evt).getTime()
      // Past days (missed) OR earlier today (past timed event)
      const isPastDay = startMs < startOfTodayMs
      const isEarlierToday = !evt.all_day && startMs < nowMs
      return isPastDay || isEarlierToday
    })
  }, [todayReminders, completedItems, now])

  const activeReminders = useMemo(() => {
    const startOfTodayMs = startOfDay(now).getTime()
    const nowMs = now.getTime()
    return todayReminders.filter((evt) => {
      if (completedItems[evt.id]) return false
      const startMs = getEventStartDate(evt).getTime()
      // Today only: either all-day or scheduled for now / in the future today
      const isToday = startMs >= startOfTodayMs
      const isFutureOrAllDay = evt.all_day || startMs >= nowMs
      return isToday && isFutureOrAllDay
    })
  }, [todayReminders, completedItems, now])

  const completedReminders = useMemo(() => {
    return todayReminders.filter((evt) => Boolean(completedItems[evt.id]))
  }, [todayReminders, completedItems])

  const refreshBriefing = useCallback(async () => {
    setIsRefreshing(true)
    try {
      await Promise.allSettled([
        queryClient.invalidateQueries({ queryKey: ['calendar_events'] }),
        queryClient.invalidateQueries({ queryKey: ['weather'] }),
        queryClient.invalidateQueries({ queryKey: ['conflicts'] }),
        queryClient.invalidateQueries({ queryKey: ['prep_items'] }),
        queryClient.invalidateQueries({ queryKey: ['family_members'] }),
        fetchTonightDinnerPlan().then((plan) => {
          if (plan && isValidDinnerPlan(plan)) {
            useAppStore.getState().setDinnerPlan(plan, { localOnly: true })
          }
        }),
      ])
    } finally {
      setTimeout(() => {
        setIsRefreshing(false)
      }, 600)
    }
  }, [queryClient])

  // Filter appointment stream (exclude meals, stale ended items)
  const appointmentEvents = useMemo(() => {
    return effectiveTodayEvents.filter((e) => {
      if (isMealEvent(e)) return false
      try {
        if (!e.all_day && parseISO(e.end_time).getTime() < now.getTime() - 30 * 60 * 1000) {
          return false
        }
      } catch { /* ignore — best-effort, non-critical */ }
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

  // Plain word, not a time-of-day flourish ("Morning Briefing" / "Afternoon
  // Dispatch" / "Evening Digest") -- the clock already lives in the top bar,
  // and a household doesn't need three fancy names for the same card.
  const timeHorizonLabel = 'Ahead'

  const pickupsCount = useMemo(() => {
    return effectiveTodayEvents.filter((e) => {
      const t = (e.title || '').toLowerCase()
      return t.includes('pickup') || t.includes('drop-off') || t.includes('carpool')
    }).length
  }, [effectiveTodayEvents])

  // ── Household Dispatch: This Week ribbon (today through +6 days) ──
  // Signal, not noise: only events isDispatchNotable() flags get a dot, so a
  // routine errand-filled day doesn't drown out the days that actually matter.
  const dispatchWeekDays = useMemo<DispatchDay[]>(() => {
    const todayStart = startOfDay(parseISO(todayKey))
    return Array.from({ length: 7 }, (_, i) => {
      const dayStart = addDays(todayStart, i)
      const dayEnd = addDays(dayStart, 1)
      const dayEvents = rollingEvents.filter((e: EventWithDetails) => {
        if (isMealEvent(e)) return false
        try {
          const start = parseISO(e.start_time)
          return start >= dayStart && start < dayEnd
        } catch {
          return false
        }
      })
      const buckets = new Set<DispatchBucket>()
      for (const e of dayEvents) {
        if (isDispatchNotable(e, prepItems)) buckets.add(dispatchBucketForEvent(e))
      }
      return {
        date: dayStart,
        dayName: format(dayStart, 'EEE'),
        dayNum: format(dayStart, 'd'),
        isToday: i === 0,
        categories: Array.from(buckets),
      }
    })
  }, [rollingEvents, prepItems, todayKey])

  // ── Household Dispatch: On the Horizon (7–30 day lookahead) ──
  // Deliberately a higher bar than the week ribbon -- only milestone-grade
  // events (a real celebration or trip) earn a named line on this ledger;
  // routine prep-heavy events already showed up as a dot in the week above.
  const dispatchHorizon = useMemo<DispatchHorizonItem[]>(() => {
    const todayStart = startOfDay(parseISO(todayKey))
    const candidates = rollingEvents.filter((e: EventWithDetails) => {
      if (isMealEvent(e)) return false
      try {
        const eventStart = startOfDay(parseISO(e.start_time))
        const daysAway = differenceInCalendarDays(eventStart, todayStart)
        if (daysAway < 7 || daysAway > 30) return false
        return isDispatchMilestone(e)
      } catch {
        return false
      }
    })
    return candidates
      .sort((a, b) => {
        try {
          return parseISO(a.start_time).getTime() - parseISO(b.start_time).getTime()
        } catch {
          return 0
        }
      })
      .slice(0, 4)
      .map((e): DispatchHorizonItem => {
        const start = parseISO(e.start_time)
        return {
          id: e.id,
          title: e.title,
          daysAway: differenceInCalendarDays(startOfDay(start), todayStart),
          dateLabel: format(start, 'MMM d'),
          bucket: dispatchBucketForEvent(e),
          categoryLabel: dispatchCategoryLabel(e),
          prepPhrase: dispatchPrepPhrase(e),
        }
      })
  }, [rollingEvents, todayKey])

  // ── Household Dispatch: one-line headline (weather + tomorrow's first move) ──
  // Open reminders/to-dos already have their own dedicated section on this
  // page (see the To-Dos list below) -- repeating them here was pure
  // redundancy, so this headline stays to exactly the two things nothing
  // else on the page already says.
  const dispatchHeadline = useMemo(() => {
    const weatherNote = weather
      ? weather.temp >= 85
        ? `Warm, ${weather.temp}°F.`
        : weather.temp <= 50
          ? `Crisp, ${weather.temp}°F.`
          : `${weather.temp}°F, ${weather.condition.toLowerCase()}.`
      : ''

    let nextMoveNote = ''
    const timedTomorrow = tomorrowEventsSorted.filter((e) => !e.all_day)
    const firstTomorrow = timedTomorrow[0]
    if (firstTomorrow) {
      try {
        const start = parseISO(firstTomorrow.start_time)
        const prep = dispatchPrepPhrase(firstTomorrow)
        nextMoveNote = `Tomorrow's first move: ${firstTomorrow.title}, ${format(start, 'h:mm a')}${prep ? ` — ${prep}` : ''}.`
      } catch { /* ignore — best-effort, non-critical */ }
    } else if (tomorrowEventsSorted.length === 0) {
      nextMoveNote = 'Tomorrow is wide open.'
    }

    return [weatherNote, nextMoveNote].filter(Boolean).join(' ')
  }, [weather, tomorrowEventsSorted])

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
    // EventWithDetails only carries the plan under plan_override; the
    // top-level fallback guards against an older/alternate event shape that
    // placed it directly on the event.
    const legacyEvent = nextEvent as (EventWithDetails & { transportation_plan?: EventTransportationPlan | null }) | null
    return nextEvent?.plan_override?.transportation_plan ?? legacyEvent?.transportation_plan ?? null
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
    const locTokens = locLower.split(/[\s,.'’-]+/).filter((t) => t.length > 3)
    const titleHasOverlap = locTokens.some((t) => titleLower.includes(t))

    if (titleHasOverlap || titleLower.includes(locLower) || locLower.includes(titleLower)) {
      return addr
    }

    return `${locName} · ${addr}`
  }, [nextEvent])

  return {
    now,
    dispatchHeadline,
    dispatchWeekDays,
    dispatchHorizon,
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
    openReminders,
    overdueReminders,
    activeReminders,
    completedReminders,
    completedItems,
    setCompletedItems,
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
    handleCompleteReminder,
    handleToggleReminder,
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
    isRefreshing,
    refreshBriefing,
  }
}
