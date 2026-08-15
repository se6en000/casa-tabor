import { useMemo, useState, useEffect, useCallback, useRef } from 'react'
import { Link } from 'react-router-dom'
import { format, isAfter, isBefore, addDays } from 'date-fns'
import { motion, AnimatePresence, useMotionValue, animate } from 'framer-motion'
import { Check, CheckCircle2, ChevronLeft, ChevronRight, RefreshCw, MapPin, Clock, Navigation, Bell, Phone, ChefHat } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useFamilyMembers } from '../hooks/useFamilyMembers'
import { useRollingEvents } from '../hooks/useCalendarEvents'
import { useLiveClock } from '../hooks/useLiveClock'
import { useCalendarStore } from '../stores/calendarStore'
import { useAppStore } from '../stores/appStore'
import { cn } from '../utils/cn'
import type { EventWithDetails } from '../hooks/useCalendarEvents'
import EventDetailPanel from '../components/calendar/EventDetailPanel'
import MiniPlayer from '../components/music/MiniPlayer'
import HomeRightPanel from '../components/home/HomeRightPanel'
import PrepItemDetailPanel from '../components/home/PrepItemDetailPanel'
import { isAllDayReminder, isTimedReminder } from '../utils/holidays'
import SwipeableReminderPill from '../components/shared/SwipeableReminderPill'
import { usePullToRefresh } from '../hooks/usePullToRefresh'
import { WeatherIcon } from '../components/shared/WeatherIcon'
import { LeaveByCard } from '../components/shared/LeaveByCard'
import { BirthdayCardDecoration } from '../components/shared/BirthdayCardDecoration'
import { useTravelEta, type TravelEtaResult } from '../hooks/useTravelEta'
import { useReminderNeedsYouActions } from '../hooks/useReminderNeedsYouActions'
import {
  getPersistedPlanOverrides,
  resolveEventMode,
} from '../lib/eventPlanOverrides'
import { derivePlan, type DerivedPerson } from '../lib/eventCommandCenter'
import { projectHomeTransportation } from '../lib/homeTransportationProjection.mjs'
import type { FamilyMember, PrepItem } from '../types'
import { eventOverlapsDay, getEventEndDate, getEventStartDate } from '../utils/eventTime'
import { formatDurationLabel, pickActiveHeroEvent, resolveRestingIndex } from '../lib/heroFocus.mjs'
import { cleanEventTitle, isBirthdayEvent } from '../utils/eventTitle'
import { buttonClassName } from '../design-system/variants.mjs'
import { Button, CalendarPill, Card, Chip, EmptyState, Heading, IconButton, PersonAvatarStack, PrimaryRail, Sheet, Text } from '../components/ui'
import SnoozeMenu from '../components/shared/SnoozeMenu'
import type { SnoozeDuration } from '../utils/snoozeDuration'

const SHARED_GOLD = 'var(--color-casa-gold)'

function mapsUrlForEvent(event: EventWithDetails): string | null {
  const mapsQuery = event.address
    ? (event.location_name ? `${event.location_name}, ${event.address}` : event.address)
    : (event.location_name ?? '')
  return mapsQuery
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapsQuery)}`
    : null
}

function eventColor(ev: EventWithDetails): string {
  if (!ev.members || ev.members.length === 0) return SHARED_GOLD
  if (ev.members.length >= 4) return SHARED_GOLD
  return ev.members[0].family_member?.color_hex ?? SHARED_GOLD
}

function fallbackResponsiblePerson(event: EventWithDetails): DerivedPerson | null {
  const fallbackMember = event.members.find((m) => m.role === 'primary')?.family_member
    ?? event.members[0]?.family_member
    ?? null
  if (!fallbackMember) return null
  return {
    id: fallbackMember.id,
    name: fallbackMember.name,
    initial: fallbackMember.name?.[0]?.toUpperCase() ?? '?',
    color: fallbackMember.color_hex ?? SHARED_GOLD,
    role: fallbackMember.role,
  }
}

function projectedDriverPerson(
  driver: { id: string; name: string } | null | undefined,
  household: FamilyMember[],
): DerivedPerson | null {
  if (!driver) return null
  const member = household.find((candidate) => candidate.id === driver.id)
    ?? household.find((candidate) => candidate.name.toLowerCase() === driver.name.toLowerCase())
  return member
    ? toDerivedPersonFromMember(member)
    : {
        id: driver.id,
        name: driver.name,
        initial: driver.name[0]?.toUpperCase() ?? '?',
        color: 'var(--color-casa-navy)',
      }
}

function deriveHomeCardResponsibility(
  event: EventWithDetails,
  mode: ReturnType<typeof resolveEventMode>,
  household: FamilyMember[],
  now: Date,
) {
  const persisted = getPersistedPlanOverrides(event)
  const explicit = projectHomeTransportation(event, persisted.transportationPlan, now)
  if (explicit) {
    const drivers = explicit.drivers
      .map((driver) => projectedDriverPerson(driver, household))
      .filter((driver): driver is DerivedPerson => driver !== null)
    const responsible = projectedDriverPerson(explicit.nextDriver, household) ?? drivers[0] ?? null
    const driverIds = new Set(drivers.map((driver) => driver.id))
    const driverNames = new Set(drivers.map((driver) => driver.name.toLowerCase()))
    const attendees = event.members.filter((member) => (
      !driverIds.has(member.family_member.id) &&
      !driverNames.has(member.family_member.name.toLowerCase())
    ))
    return {
      responsible,
      drivers,
      attendees: attendees.length > 0 ? attendees : event.members,
      summary: explicit.summary,
      roleBadge: 'drive' as const,
      nextLeg: explicit.nextLeg,
      hasSavedTransportation: true,
    }
  }

  const plan = derivePlan(event, mode, { household })
  const effectiveLegs = applyPersistedDriverOverrides(event, plan.legs, household, persisted.driverOverrides ?? {}, persisted.waits ?? null)
  const transportLeg = effectiveLegs.find((leg) => leg.kind === 'drop' || leg.kind === 'depart' || leg.kind === 'pickup' || leg.kind === 'return')
  const firstDriverLeg = transportLeg ?? effectiveLegs.find((leg) => leg.driver)
  const responsible = firstDriverLeg?.driver ?? fallbackResponsiblePerson(event)
  const attendees = (() => {
    if (!responsible) return event.members
    const withoutResponsible = event.members.filter((m) => m.family_member.id !== responsible.id)
    return withoutResponsible.length > 0 ? withoutResponsible : event.members
  })()
  const name = responsible?.name ?? (mode === 'hosted' ? 'Caregiver' : 'Driver')
  const stayLeg = effectiveLegs.find((leg) => leg.kind === 'stay')
  const hasDropOrDepart = effectiveLegs.some((leg) => leg.kind === 'drop' || leg.kind === 'depart')
  const hasPickupOrReturn = effectiveLegs.some((leg) => leg.kind === 'pickup' || leg.kind === 'return')
  const summary = mode === 'hosted'
    ? `${name} supervising`
    : stayLeg?.waits
      ? `${name} drives & stays`
      : hasDropOrDepart && hasPickupOrReturn
        ? `${name} drives`
        : hasDropOrDepart
          ? `${name} drops off`
          : hasPickupOrReturn
            ? `${name} picks up`
            : `${name} drives`
  return {
    responsible,
    drivers: responsible ? [responsible] : [],
    attendees,
    summary,
    roleBadge: mode === 'hosted' ? 'supervise' as const : 'drive' as const,
    nextLeg: null,
    hasSavedTransportation: false,
  }
}

function toDerivedPersonFromMember(member: FamilyMember | undefined | null): DerivedPerson | null {
  if (!member) return null
  return {
    id: member.id,
    name: member.name,
    initial: member.name?.[0]?.toUpperCase() ?? '?',
    color: member.color_hex ?? SHARED_GOLD,
    role: member.role,
  }
}

function applyPersistedDriverOverrides(
  event: EventWithDetails,
  legs: ReturnType<typeof derivePlan>['legs'],
  household: FamilyMember[],
  driverOverrides: Record<number, string>,
  waitsOverride: boolean | null,
) {
  const attendeeById = new Map(event.members.map((m) => [m.family_member.id, m.family_member]))
  const householdById = new Map(household.map((m) => [m.id, m]))
  const withDriverOverrides = legs.map((leg, index) => {
    const overrideDriverId = driverOverrides[index]
    if (!overrideDriverId || !leg.driver) return leg
    const familyMember = attendeeById.get(overrideDriverId) ?? householdById.get(overrideDriverId)
    const overrideDriver = toDerivedPersonFromMember(familyMember)
    return overrideDriver ? { ...leg, driver: overrideDriver } : leg
  })
  const waits = waitsOverride ?? Boolean(withDriverOverrides.find((leg) => leg.kind === 'stay')?.waits)
  return withDriverOverrides.map((leg) => {
    if (leg.kind !== 'stay') return leg
    if (!waits) return { ...leg, waits: false }
    const driveLeg = withDriverOverrides.find((item) => item.kind === 'drop' || item.kind === 'depart')
    return { ...leg, waits: true, title: `${driveLeg?.driver?.name ?? 'Driver'} waits on site` }
  })
}

export default function HomePage() {
  const now = useLiveClock(15_000)
  const { data: family } = useFamilyMembers()
  const { data: rollingEvents, isLoading } = useRollingEvents(now)
  const currentDateKey = format(now, 'yyyy-MM-dd')
  const tomorrow = useMemo(
    () => addDays(new Date(`${currentDateKey}T12:00:00`), 1),
    [currentDateKey],
  )
  const allTodayEvents = useMemo(
    () => rollingEvents?.filter((event) => eventOverlapsDay(event, now)),
    [rollingEvents, currentDateKey],
  )
  const allTomorrowEvents = useMemo(
    () => rollingEvents?.filter((event) => eventOverlapsDay(event, tomorrow)),
    [rollingEvents, tomorrow],
  )
  const { visibleMembers } = useCalendarStore()
  const aiDrawerOpen = useAppStore((s) => s.aiDrawerOpen)
  const dinnerPlan = useAppStore((s) => s.dinnerPlan)
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null)
  const [selectedPrepItem, setSelectedPrepItem] = useState<PrepItem | null>(null)
  const [pastItemsOpen, setPastItemsOpen] = useState(false)
  const scrollRef = useRef<HTMLElement | null>(null)
  const nowLineRef = useRef<HTMLLIElement | null>(null)
  const events = useMemo<EventWithDetails[]>(() => {
    if (!allTodayEvents) return []
    const memberOk = (ev: EventWithDetails) =>
      visibleMembers.length === 0 || ev.members?.some((m) => visibleMembers.includes(m.family_member.id)) || ev.members.length === 0
    return allTodayEvents.filter((ev) => {
      if (ev.event_type !== 'reminder') return visibleMembers.length === 0 || ev.members?.some(m => visibleMembers.includes(m.family_member.id))
      // Timed reminders go into the timeline
      return isTimedReminder(ev) && memberOk(ev)
    })
  }, [allTodayEvents, visibleMembers])

  const reminders = useMemo<EventWithDetails[]>(() => {
    if (!allTodayEvents) return []
    const memberOk = (ev: EventWithDetails) =>
      visibleMembers.length === 0 || ev.members?.some(m => visibleMembers.includes(m.family_member.id)) || ev.members.length === 0
    return allTodayEvents.filter(ev => isAllDayReminder(ev) && memberOk(ev))
  }, [allTodayEvents, visibleMembers])

  const tomorrowEvents = useMemo<EventWithDetails[]>(() => {
    if (!allTomorrowEvents) return []
    const memberOk = (ev: EventWithDetails) =>
      visibleMembers.length === 0 || ev.members?.some((m) => visibleMembers.includes(m.family_member.id)) || ev.members.length === 0
    return allTomorrowEvents.filter((ev) => {
      if (ev.event_type !== 'reminder') return visibleMembers.length === 0 || ev.members?.some(m => visibleMembers.includes(m.family_member.id))
      return isTimedReminder(ev) && memberOk(ev)
    })
  }, [allTomorrowEvents, visibleMembers])
  const nextTodayEvent = useMemo(
    () => events.find((e) => isAfter(getEventStartDate(e), now)) ?? null,
    [events, now],
  )
  const pastEvents = useMemo(
    () => events
      .filter((event) => isBefore(getEventEndDate(event), now))
      .sort((first, second) => getEventEndDate(second).getTime() - getEventEndDate(first).getTime()),
    [events, now],
  )
  const currentAndUpcomingEvents = useMemo(
    () => events.filter((event) => isAfter(getEventEndDate(event), now)),
    [events, now],
  )
  // An event that is happening right now (started, not yet ended). This lets the
  // hero stay live *during* a hosted block (e.g. a caregiver session) instead of
  // vanishing the moment it starts — the point at which "how much of my window
  // is left?" matters most. All-day events and reminders are excluded so they
  // don't hijack the live state.
  const activeHeroEvent = useMemo(
    () => pickActiveHeroEvent(events, now) ?? null,
    [events, now],
  )
  const nextTodayEventMode = nextTodayEvent ? resolveEventMode(nextTodayEvent) : null
  const heroDestination = nextTodayEvent && nextTodayEventMode !== 'hosted'
    ? (nextTodayEvent.address ?? nextTodayEvent.location_name)
    : null
  const heroTravelEta = useTravelEta({
    destination: heroDestination,
    eventStartIso: nextTodayEvent?.start_time ?? null,
    enabled: Boolean(nextTodayEvent && heroDestination),
    bufferMins: 10,
  })

  // Show tomorrow section always (not just when today is done)

  // Scroll so the "now" line is near the top of the viewport (with some breathing room above)
  useEffect(() => {
    const container = scrollRef.current
    const nowLine = nowLineRef.current
    if (!container || !nowLine) return
    const offset = nowLine.offsetTop - 80  // 80px of context above the now line
    container.scrollTop = Math.max(0, offset)
  }, [isLoading])

  const selectedEvent = selectedEventId
    ? (events.find(e => e.id === selectedEventId) ?? tomorrowEvents.find(e => e.id === selectedEventId) ?? reminders.find(e => e.id === selectedEventId) ?? null)
    : null
  const qc = useQueryClient()
  const {
    completeReminder,
    snoozeReminderByDuration,
    moveReminderToNeedsYou,
    queueMissedReminders,
  } = useReminderNeedsYouActions()

  const reminderSweepBucket = Math.floor(now.getTime() / 60_000)
  useEffect(() => {
    const timedReminders = events.filter((event) => isTimedReminder(event))
    if (timedReminders.length === 0) return
    void queueMissedReminders(timedReminders, new Date()).catch((error) => {
      console.error('HomePage: failed to queue missed reminders in Needs you', error)
    })
  }, [events, queueMissedReminders, reminderSweepBucket])

  // ── Scheduled AI analysis: max 5x/day between 6am–10pm, ~3h cooldown ──
  // Uses localStorage to persist across page navigations without hitting Gemini on every load.
  const RUN_COOLDOWN_MS = 3 * 60 * 60 * 1000 // 3 hours
  const MAX_RUNS_PER_DAY = 5

  function shouldRunAI(): boolean {
    const hour = new Date().getHours()
    if (hour < 6 || hour >= 22) return false // outside 6am–10pm window
    const lastRun = Number(localStorage.getItem('aiAnalysisLastRun') ?? 0)
    const runsToday = Number(localStorage.getItem('aiAnalysisRunsToday') ?? 0)
    const lastRunDate = localStorage.getItem('aiAnalysisDate') ?? ''
    const today = new Date().toDateString()
    if (lastRunDate !== today) {
      // New day — reset counter
      localStorage.setItem('aiAnalysisRunsToday', '0')
      localStorage.setItem('aiAnalysisDate', today)
      return true
    }
    if (runsToday >= MAX_RUNS_PER_DAY) return false
    return Date.now() - lastRun >= RUN_COOLDOWN_MS
  }

  function markAIRan() {
    const runsToday = Number(localStorage.getItem('aiAnalysisRunsToday') ?? 0)
    localStorage.setItem('aiAnalysisLastRun', String(Date.now()))
    localStorage.setItem('aiAnalysisRunsToday', String(runsToday + 1))
    localStorage.setItem('aiAnalysisDate', new Date().toDateString())
  }

  // Trigger conflict + prep analysis + weather fill on mount (rate-limited)
  useEffect(() => {
    if (shouldRunAI()) {
      markAIRan()
      supabase.functions.invoke('orchestrate-household', {})
        .then(() => Promise.all([
          qc.invalidateQueries({ queryKey: ['conflicts'] }),
          qc.invalidateQueries({ queryKey: ['prep-items'] }),
          qc.invalidateQueries({ queryKey: ['events'] }),
        ]))
        .catch(() => {})
    } else {
      // Keep weather fresh even when full orchestration is rate-limited.
      supabase.functions.invoke('weather-pending', {})
        .then(() => qc.invalidateQueries({ queryKey: ['events'] }))
        .catch(() => {})
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Pull-to-refresh ──────────────────────────────────────────
  const [pullDistance, setPullDistance] = useState(0)
  const [refreshing,  setRefreshing]   = useState(false)

  const handleRefresh = useCallback(async () => {
    setRefreshing(true)
    try {
      navigator.vibrate?.(15)
    } catch {
      // Vibration is optional and may be blocked by the browser.
    }
    // Pull-to-refresh always runs AI (manual user action) and resets cooldown
    markAIRan()
    await supabase.functions.invoke('orchestrate-household', {}).catch(() => {})
    await Promise.all([
      qc.invalidateQueries({ queryKey: ['today-events'] }),
      qc.invalidateQueries({ queryKey: ['conflicts'] }),
      qc.invalidateQueries({ queryKey: ['prep-items'] }),
      qc.invalidateQueries({ queryKey: ['events'] }),
    ])
    await new Promise(r => setTimeout(r, 600))
    setRefreshing(false)
    try {
      navigator.vibrate?.(10)
    } catch {
      // Vibration is optional and may be blocked by the browser.
    }
  }, [qc])

  const ptrRef = usePullToRefresh({
    threshold: 64,
    onRefresh: handleRefresh,
    onPull: d => setPullDistance(d),
    onReset: () => setPullDistance(0),
  })

  return (
    // lg: side-by-side with right panel. Mobile: single column.
    <div className="flex h-full overflow-hidden bg-casa-bg" onClick={() => setSelectedEventId(null)}>

      {/* ── Center content ─────────────────────────────────── */}
      <PrimaryRail
        ref={(el) => { ptrRef(el); scrollRef.current = el }}
        className="overflow-y-auto overscroll-contain touch-pan-y px-6 pt-8 pb-12 lg:px-8"
      >
        {/* ── Pull-to-refresh indicator ─────────────────────── */}
        <AnimatePresence>
          {(pullDistance > 4 || refreshing) && (
            <motion.div
              key="ptr"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex justify-center mb-2 -mt-6 pointer-events-none"
              style={{ height: refreshing ? 40 : pullDistance }}
            >
              <motion.div
                animate={refreshing ? { rotate: 360 } : { rotate: (pullDistance / 64) * 180 }}
                transition={refreshing ? { repeat: Infinity, duration: 0.7, ease: 'linear' } : { duration: 0 }}
                className="self-end mb-1"
              >
                <RefreshCw
                  size={20}
                  className={pullDistance >= 64 || refreshing ? 'text-casa-gold' : 'text-casa-muted'}
                />
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        <HeroCarousel
          now={now}
          events={events}
          fallbackTomorrowEvent={tomorrowEvents[0] ?? null}
          activeEvent={activeHeroEvent}
          nextTodayEvent={nextTodayEvent}
          onViewDetails={(event) => setSelectedEventId(event.id)}
          travelEta={heroTravelEta.data}
        />

        {/* ── Tonight's Dinner Preview (Mobile glance -> 1-tap into /cook) ── */}
        {Boolean(dinnerPlan?.title) && (
          <div className="mt-3 mb-1 lg:hidden">
            <Link
              to="/cook"
              className="flex items-center justify-between p-3.5 bg-casa-surface border border-casa-border border-l-4 border-l-casa-gold rounded-card shadow-subtle hover:border-casa-gold transition-all duration-150 active:scale-[0.97] active:opacity-75"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-casa-gold/15 flex items-center justify-center flex-shrink-0 text-casa-gold">
                  <ChefHat size={20} strokeWidth={1.8} />
                </div>
                <div className="min-w-0">
                  <div className="text-caption font-bold uppercase tracking-wider text-casa-gold leading-none mb-1">
                    Tonight's Dinner
                  </div>
                  <div className="text-body-sm font-semibold text-casa-navy truncate">
                    {dinnerPlan.title}
                  </div>
                  {dinnerPlan.subtitle && (
                    <div className="text-caption text-casa-muted truncate">
                      {dinnerPlan.subtitle}
                    </div>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1 text-caption font-semibold text-casa-gold bg-casa-gold/10 px-2.5 py-1 rounded-full shrink-0 ml-2">
                <span>Cook</span>
                <ChevronRight size={14} />
              </div>
            </Link>
          </div>
        )}

        {/* ── Today's timeline — first, front and center ──── */}
        <section className="mt-2">
          <div className="flex items-baseline justify-between mb-3">
            <Heading role="heading">Today</Heading>
            <Link
              to="/calendar"
              className="text-body-sm text-casa-muted hover:text-casa-navy flex items-center gap-0.5"
            >
              Full calendar <ChevronRight size={14} />
            </Link>
          </div>

          {isLoading ? (
            <Text role="body" muted className="animate-breathe py-8 text-center">Loading…</Text>
          ) : events.length === 0 ? (
            <EmptyState title="Nothing scheduled" description="Enjoy the quiet." />
          ) : (
            <ol className="space-y-2">
              {pastEvents.length > 0 && (
                <li className="list-none pb-1">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <div>
                      <Text role="body" as="h4" className="font-semibold text-casa-navy">Earlier today</Text>
                      <Text role="caption" muted>
                        {pastEvents.length} {pastEvents.length === 1 ? 'item' : 'items'}
                      </Text>
                    </div>
                    {pastEvents.length > 3 && (
                      <Button variant="ghost" size="sm" onClick={() => setPastItemsOpen(true)}>
                        View all {pastEvents.length}
                      </Button>
                    )}
                  </div>
                  <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                    {pastEvents.slice(0, 3).map((event) => (
                      <PastTimelineCard
                        key={event.id}
                        event={event}
                        onClick={() => setSelectedEventId(event.id)}
                      />
                    ))}
                  </div>
                </li>
              )}

              {/* ── Now line ── */}
              {currentAndUpcomingEvents.length > 0 && (
                <li ref={nowLineRef} className="py-0.5 select-none pointer-events-none" aria-hidden>
                  <div className="w-full flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.5)] animate-pulse shrink-0" />
                    <div className="flex-1 h-px bg-red-400/50" />
                    <span className="text-caption font-bold text-red-500 tabular-nums shrink-0">
                      {format(now, 'h:mm a')}
                    </span>
                    <div className="flex-1 h-px bg-red-400/50" />
                  </div>
                </li>
              )}

              {/* Upcoming events */}
              {currentAndUpcomingEvents.map((ev, i) => (
                <TimelineRow
                  key={ev.id}
                  event={ev}
                  now={now}
                  index={i}
                  household={family ?? []}
                  onClick={() => setSelectedEventId(ev.id)}
                  onComplete={completeReminder}
                  onSnooze={(event, duration) => {
                    void snoozeReminderByDuration(event, duration).catch((error) => {
                      console.error('HomePage: failed to snooze reminder', error)
                    })
                  }}
                  onSendToNeedsYou={(event) => {
                    void moveReminderToNeedsYou(event).catch((error) => {
                      console.error('HomePage: failed to move reminder to Needs you', error)
                    })
                  }}
                />
              ))}
            </ol>
          )}
        </section>

        {/* ── Tomorrow's timeline ─────────────────────────── */}
        <AnimatePresence>
          {tomorrowEvents.length > 0 && (
            <motion.section
              key="tomorrow"
              className="mt-8"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 16 }}
              transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
            >
              <div className="flex items-baseline justify-between mb-3">
                <Heading role="heading">
                  Tomorrow · {format(tomorrow, 'EEEE, MMM d')}
                </Heading>
              </div>
              <ol className="space-y-2">
                {tomorrowEvents.map((ev, i) => (
                  <TimelineRow
                    key={ev.id}
                    event={ev}
                    now={now}
                    index={i}
                    household={family ?? []}
                    onClick={() => setSelectedEventId(ev.id)}
                    onComplete={completeReminder}
                    onSnooze={(event, duration) => {
                      void snoozeReminderByDuration(event, duration).catch((error) => {
                        console.error('HomePage: failed to snooze reminder', error)
                      })
                    }}
                    onSendToNeedsYou={(event) => {
                      void moveReminderToNeedsYou(event).catch((error) => {
                        console.error('HomePage: failed to move reminder to Needs you', error)
                      })
                    }}
                  />
                ))}
              </ol>
            </motion.section>
          )}
        </AnimatePresence>

        {/* ── Reminders ────────────────────────────────────── */}
        {reminders.length > 0 && (
          <section className="mt-6">
            <div className="flex flex-wrap gap-2">
              {reminders.map(r => (
                <SwipeableReminderPill
                  key={r.id}
                  id={r.id}
                  title={r.title}
                  members={r.members}
                  onClick={() => { setSelectedEventId(r.id) }}
                  onComplete={completeReminder}
                  onDismiss={completeReminder}
                />
              ))}
            </div>
          </section>
        )}

        {/* ── Music player ─────────────────────────────────── */}
        <div className="mt-6" onClick={e => e.stopPropagation()}>
          <MiniPlayer />
        </div>


        <div onClick={e => e.stopPropagation()}>
          <EventDetailPanel
            event={selectedEvent}
            onClose={() => setSelectedEventId(null)}
          />
        </div>

        <Sheet
          open={pastItemsOpen}
          onClose={() => setPastItemsOpen(false)}
          title={`Earlier today · ${pastEvents.length} ${pastEvents.length === 1 ? 'item' : 'items'}`}
          showHandle
          panelClassName="max-h-[85dvh] bg-casa-bg"
          contentClassName="bg-casa-bg"
        >
          <div className="space-y-2">
            {pastEvents.map((event) => (
              <PastTimelineCard
                key={event.id}
                event={event}
                onClick={() => {
                  setPastItemsOpen(false)
                  setSelectedEventId(event.id)
                }}
              />
            ))}
          </div>
        </Sheet>


      </PrimaryRail>

      {/* ── Right panel (tablet only) ──────────────────────── */}
      <AnimatePresence initial={false}>
        {!aiDrawerOpen && (
          <motion.div
            key="home-right-panel-motion"
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 'auto', opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.32, 0.72, 0, 1] }}
            className="hidden lg:flex flex-none basis-5/16 min-w-0 h-full overflow-hidden"
          >
            <HomeRightPanel
              now={now}
              allTodayEvents={allTodayEvents ?? []}
              onSelectPrepItem={setSelectedPrepItem}
              className="w-full basis-full flex"
            />
          </motion.div>
        )}
      </AnimatePresence>

      <div onClick={e => e.stopPropagation()}>
        <PrepItemDetailPanel item={selectedPrepItem} onClose={() => setSelectedPrepItem(null)} />
      </div>
    </div>
  )
}

function PastTimelineCard({ event, onClick }: { event: EventWithDetails; onClick: () => void }) {
  const start = getEventStartDate(event)
  const end = getEventEndDate(event)
  const reminder = isTimedReminder(event)
  const member = event.members[0]?.family_member

  return (
    <Card
      interactive
      padding="sm"
      tone="surface"
      onClick={(clickEvent) => {
        clickEvent.stopPropagation()
        onClick()
      }}
      aria-label={`View ${cleanEventTitle(event.title)} details`}
      className="flex min-h-control items-center gap-3 opacity-75"
    >
      <span className="flex size-control-sm shrink-0 items-center justify-center rounded-button bg-casa-bg text-casa-muted">
        {reminder ? <Bell size={16} /> : <CheckCircle2 size={18} />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-body-sm font-semibold text-casa-text">
          {cleanEventTitle(event.title)}
        </span>
        <span className="block truncate text-caption text-casa-muted">
          {event.all_day ? 'All day' : `${format(start, 'h:mm a')} – ${format(end, 'h:mm a')}`}
          {member?.name ? ` · ${member.name}` : ''}
        </span>
      </span>
      <Text role="caption" muted className="shrink-0">
        {reminder ? 'Reminder' : 'Ended'}
      </Text>
    </Card>
  )
}

type HeroStatusTone = 'on-track' | 'tight' | 'urgent' | 'late' | 'calm'

function formatHeroCountdown(minutes: number): string {
  const clamped = Math.max(0, minutes)
  const hours = Math.floor(clamped / 60)
  const mins = clamped % 60
  return `${hours}:${String(mins).padStart(2, '0')}`
}

function deriveHeroStatus({
  isTodayFocus,
  isAllDay,
  minutesUntilLeave,
  trafficDelayMins,
}: {
  isTodayFocus: boolean
  isAllDay: boolean
  minutesUntilLeave: number
  trafficDelayMins: number | null
}): { label: string; tone: HeroStatusTone } {
  if (!isTodayFocus) return { label: 'Tomorrow', tone: 'calm' }
  if (isAllDay) return { label: 'All day', tone: 'calm' }
  if (minutesUntilLeave <= 0) return { label: 'Late', tone: 'late' }
  if (minutesUntilLeave <= 5) return { label: 'Leave now', tone: 'urgent' }
  if (minutesUntilLeave <= 15 || (trafficDelayMins ?? 0) >= 10) return { label: 'Tight', tone: 'tight' }
  return { label: 'On track', tone: 'on-track' }
}

function heroStatusClasses(tone: HeroStatusTone): string {
  if (tone === 'on-track') return 'border-emerald-300/40 bg-emerald-300/15 text-emerald-100'
  if (tone === 'tight') return 'border-amber-300/45 bg-amber-300/18 text-amber-100'
  if (tone === 'urgent') return 'border-orange-300/45 bg-orange-300/18 text-orange-100'
  if (tone === 'late') return 'border-rose-300/45 bg-rose-300/18 text-rose-100'
  return 'border-white/25 bg-white/10 text-white/90'
}

// How long the hero waits after the user swipes away before snapping back to
// the "live" resting card (in-progress → next-up → first). Long enough to read
// a slide, short enough that an ignored kiosk always returns to the truth.
const HERO_IDLE_REVERT_MS = 9000

// Gutter between hero slides. Cards stay full-width/edge-aligned at rest (so they
// line up with the content below); this gap only reveals as clean page-colored
// negative space between cards mid-drag, so the seam reads as intentional.
const HERO_SLIDE_GAP = 20

function HeroCarousel({
  now,
  events,
  fallbackTomorrowEvent,
  activeEvent,
  nextTodayEvent,
  onViewDetails,
  travelEta,
}: {
  now: Date
  events: EventWithDetails[]
  fallbackTomorrowEvent: EventWithDetails | null
  activeEvent: EventWithDetails | null
  nextTodayEvent: EventWithDetails | null
  onViewDetails: (event: EventWithDetails) => void
  travelEta?: TravelEtaResult | null
}) {
  // Slides = today's timed events in chronological order (already member-filtered
  // upstream). Two edge behaviors preserve the pre-carousel hero:
  //  • today empty  → single non-swipeable tomorrow-first slide.
  //  • day is over (nothing live/upcoming) but there are past events → append
  //    tomorrow's first as a trailing "then tomorrow" slide and rest there, so
  //    the hero still looks ahead while letting you swipe back through today.
  const dayIsOver = !activeEvent && !nextTodayEvent
  const slides = useMemo<EventWithDetails[]>(() => {
    if (events.length === 0) return fallbackTomorrowEvent ? [fallbackTomorrowEvent] : []
    if (dayIsOver && fallbackTomorrowEvent) return [...events, fallbackTomorrowEvent]
    return events
  }, [events, fallbackTomorrowEvent, dayIsOver])
  const multi = slides.length > 1

  // The "live" index the hero rests on: in-progress → next-up → last slide once
  // the day is over (the trailing tomorrow peek, or the most recent event).
  // Recomputed as time advances so the resting position stays truthful.
  const restingIndex = useMemo(
    () =>
      activeEvent || nextTodayEvent
        ? resolveRestingIndex(slides, activeEvent?.id, nextTodayEvent?.id)
        : Math.max(0, slides.length - 1),
    [slides, activeEvent, nextTodayEvent],
  )

  // `override` holds the user's manually-selected slide (after a swipe/tap/arrow).
  // While null, the hero simply renders `restingIndex` — so it self-follows the
  // live position with zero state mirroring. A debounced timer clears the override
  // to snap back home. This avoids setState-in-effect entirely.
  const [override, setOverride] = useState<number | null>(null)
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const effectiveIndex = Math.max(
    0,
    Math.min(slides.length - 1, override != null ? override : restingIndex),
  )

  useEffect(
    () => () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current)
    },
    [],
  )

  // Measure the viewport so the filmstrip track can translate by exact pixels
  // (finger-accurate drag + neighbor peek) and rebuild constraints on resize.
  // MUST use a callback ref, not useEffect([]): HeroCarousel returns null on the
  // first render(s) while events load async, so a mount-only effect would run
  // before the node exists and never re-attach — leaving viewportWidth at 0,
  // which silently disables drag and freezes the track (the "nothing happens" bug).
  const [viewportWidth, setViewportWidth] = useState(0)
  const roRef = useRef<ResizeObserver | null>(null)
  const setViewportEl = useCallback((el: HTMLDivElement | null) => {
    if (roRef.current) {
      roRef.current.disconnect()
      roRef.current = null
    }
    if (!el) return
    setViewportWidth(el.offsetWidth)
    const ro = new ResizeObserver(() => setViewportWidth(el.offsetWidth))
    ro.observe(el)
    roRef.current = ro
  }, [])

  // Drag and the index-driven slide must share ONE x so they don't fight: framer
  // owns `x` during a drag gesture, and we imperatively spring it to the target
  // whenever the shown index (or width) changes. Putting x in `animate={{}}` while
  // also using `drag` re-pins x every render and cancels the gesture — the bug
  // that made the track feel dead.
  const x = useMotionValue(0)
  const hasPositionedRef = useRef(false)

  const goTo = useCallback(
    (next: number) => {
      const clamped = Math.max(0, Math.min(slides.length - 1, next))
      setOverride(clamped)
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current)
      idleTimerRef.current = setTimeout(() => {
        setOverride(null)
      }, HERO_IDLE_REVERT_MS)
    },
    [slides.length],
  )

  // Spring the shared x to a given slide index. Used both by the index-change
  // effect and directly on drag end (so a settle back to the SAME index still
  // animates home instead of freezing where the finger released).
  const springTo = useCallback(
    (index: number) => {
      if (viewportWidth === 0) return
      const target = -index * (viewportWidth + HERO_SLIDE_GAP)
      if (!hasPositionedRef.current) {
        hasPositionedRef.current = true
        x.set(target) // first paint: jump to the resting slide, don't slide in
        return
      }
      return animate(x, target, {
        type: 'spring',
        stiffness: 300,
        damping: 34,
        mass: 0.9,
      })
    },
    [x, viewportWidth],
  )

  // Spring to the shown slide whenever the index or width changes (arrow taps,
  // dot taps, live auto-follow, idle-revert, and resize all route through here).
  useEffect(() => {
    const controls = springTo(effectiveIndex)
    return () => controls?.stop()
  }, [effectiveIndex, springTo])

  if (slides.length === 0) return null

  const safeIndex = effectiveIndex

  return (
    <div className="hidden lg:block relative mt-2 mb-6">
      {/* Filmstrip viewport: fixed-height (all slides rendered side-by-side, so the
          flex track's stretch equalizes every card to the tallest → the timeline
          below never jumps). Track translates by the measured viewport width so a
          drag follows the finger and reveals the neighbor card's edge. */}
      <div ref={setViewportEl} className="overflow-hidden">
        <motion.div
          className="flex items-stretch"
          style={{ x, gap: HERO_SLIDE_GAP }}
          data-native-drag
          drag={multi && viewportWidth > 0 ? 'x' : false}
          dragConstraints={{ left: -(slides.length - 1) * (viewportWidth + HERO_SLIDE_GAP), right: 0 }}
          dragElastic={0.14}
          dragMomentum={false}
          onDragEnd={(_e, info) => {
            if (!multi) return
            const threshold = Math.max(60, viewportWidth * 0.18)
            const flung = Math.abs(info.velocity.x) > 520
            let target = safeIndex
            if ((info.offset.x < -threshold || (flung && info.velocity.x < 0)) && safeIndex < slides.length - 1) {
              target = safeIndex + 1
            } else if ((info.offset.x > threshold || (flung && info.velocity.x > 0)) && safeIndex > 0) {
              target = safeIndex - 1
            }
            springTo(target) // always animate (handles settle back to same index)
            goTo(target)
          }}
        >
          {slides.map((s) => {
            const sIsInProgress = !!activeEvent && s.id === activeEvent.id
            const sIsToday = events.some((e) => e.id === s.id)
            const sTravelEta = nextTodayEvent && s.id === nextTodayEvent.id ? travelEta : null
            return (
              <div key={s.id} className="shrink-0 grow-0 basis-full">
                <DesktopHeroCard
                  now={now}
                  focusEvent={s}
                  isInProgress={sIsInProgress}
                  isTodayFocus={sIsToday}
                  onViewDetails={onViewDetails}
                  travelEta={sTravelEta}
                />
              </div>
            )
          })}
        </motion.div>
      </div>

      {multi && (
        <div className="flex items-center justify-center gap-3 mt-3">
          <IconButton
            onClick={() => goTo(safeIndex - 1)}
            disabled={safeIndex === 0}
            aria-label="Previous event"
            variant="secondary"
            icon={<ChevronLeft size={18} />}
          />
          <div className="flex items-center gap-1.5">
            {slides.map((s, i) => (
              <IconButton
                key={s.id}
                type="button"
                onClick={() => goTo(i)}
                aria-label={`Go to event ${i + 1} of ${slides.length}`}
                aria-current={i === safeIndex}
                size="sm"
                variant="ghost"
                className="rounded-full"
                icon={<span className={cn(
                  'mx-auto block h-1.5 rounded-full transition-all',
                  i === safeIndex ? 'w-6 bg-casa-gold' : 'w-1.5 bg-casa-navy/25',
                )} />}
              />
            ))}
          </div>
          <IconButton
            onClick={() => goTo(safeIndex + 1)}
            disabled={safeIndex === slides.length - 1}
            aria-label="Next event"
            variant="secondary"
            icon={<ChevronRight size={18} />}
          />
        </div>
      )}
    </div>
  )
}

function DesktopHeroCard({
  now,
  focusEvent,
  isInProgress,
  isTodayFocus,
  onViewDetails,
  travelEta,
}: {
  now: Date
  focusEvent: EventWithDetails
  isInProgress: boolean
  isTodayFocus: boolean
  onViewDetails: (event: EventWithDetails) => void
  travelEta?: TravelEtaResult | null
}) {
  const focusStart = getEventStartDate(focusEvent)
  const focusEnd = getEventEndDate(focusEvent)
  const focusMode = resolveEventMode(focusEvent)
  const isHosted = focusMode === 'hosted'
  const isAllDay = Boolean(focusEvent.all_day)
  const eventLabel = cleanEventTitle(focusEvent.title)
  const isBirthday = isBirthdayEvent(focusEvent)
  const totalDurationMins = Math.max(0, Math.round((focusEnd.getTime() - focusStart.getTime()) / 60000))
  const minutesUntilEnd = Math.max(0, Math.round((focusEnd.getTime() - now.getTime()) / 60000))
  const timeRangeLabel = `${format(focusStart, 'h:mm a')} – ${format(focusEnd, 'h:mm a')}`
  const contactName = focusEvent.enrichment?.contact_name?.trim() || null
  const contactPhoneRaw = focusEvent.enrichment?.contact_phone?.trim() || null
  const telUrl = contactPhoneRaw ? `tel:${contactPhoneRaw.replace(/[^\d+]/g, '')}` : null
  const readinessItems = isHosted && !isBirthday
    ? [
      ...focusEvent.checklist.filter((item) => !item.checked).map((item) => item.label),
      focusEvent.enrichment?.prep_notes ?? null,
      focusEvent.enrichment?.dietary_notes ?? null,
    ]
      .map((item) => (typeof item === 'string' ? item.trim() : ''))
      .filter((item): item is string => Boolean(item))
      .slice(0, 3)
    : []
  const leadLabel = isBirthday
    ? `${isTodayFocus ? 'TODAY' : 'TOMORROW'} · BIRTHDAY 🎉`
    : isInProgress
      ? `IN PROGRESS · ${eventLabel.toUpperCase()}`
      : (isTodayFocus ? `UP NEXT · ${eventLabel.toUpperCase()}` : 'TOMORROW · FIRST UP')

  const liveLeaveBy = !isHosted && !isAllDay && isTodayFocus && !isInProgress && travelEta?.found && travelEta.leave_by
    ? new Date(travelEta.leave_by)
    : null
  const leaveAt = isHosted || isAllDay
    ? focusStart
    : (liveLeaveBy
      ?? (focusEvent.enrichment?.departure_time ? new Date(focusEvent.enrichment.departure_time) : focusStart))
  const minutesUntilLeave = Math.max(0, Math.round((leaveAt.getTime() - now.getTime()) / 60000))
  const headlineText = isBirthday
    ? `🎂 ${eventLabel}`
    : isInProgress
      ? `Ends at ${format(focusEnd, 'h:mm a')}`
      : (isAllDay
        ? (isTodayFocus ? 'All day' : 'All day tomorrow')
        : (isTodayFocus
          ? `${isHosted ? 'Starts at' : 'Leave by'} ${format(leaveAt, 'h:mm a')}`
          : `Tomorrow starts at ${format(leaveAt, 'h:mm a')}`))

  const destinationLabel = focusEvent.address ?? focusEvent.location_name ?? 'At home'
  const driveMins = isTodayFocus && travelEta?.found && typeof travelEta.drive_time_mins === 'number'
    ? travelEta.drive_time_mins
    : focusEvent.enrichment?.drive_time_mins
  const birthdayTimeLabel = isAllDay ? 'All day' : `${isTodayFocus ? '' : 'Tomorrow · '}${format(focusStart, 'h:mm a')}`
  const detailParts = isBirthday
    ? [
      birthdayTimeLabel,
      focusEvent.description?.trim() || null,
    ].filter((part): part is string => Boolean(part))
    : isInProgress
      ? [
        timeRangeLabel,
        `${formatDurationLabel(minutesUntilEnd)} ${isHosted ? 'of your window left' : 'left'}`,
      ].filter((part): part is string => Boolean(part))
      : (isHosted
        ? [
          timeRangeLabel,
          totalDurationMins > 0 ? formatDurationLabel(totalDurationMins) : null,
        ].filter((part): part is string => Boolean(part))
        : [
          destinationLabel,
          typeof driveMins === 'number' ? `${driveMins} min drive` : null,
          focusEvent.enrichment?.weather_at_event ?? null,
        ].filter((part): part is string => Boolean(part && part.trim())))

  const status = isInProgress
    ? (minutesUntilEnd <= 10
      ? { label: 'Wrapping up', tone: 'tight' as const }
      : { label: 'Underway', tone: 'on-track' as const })
    : deriveHeroStatus({
      isTodayFocus,
      isAllDay,
      minutesUntilLeave,
      trafficDelayMins: travelEta?.traffic_delay_mins ?? null,
    })
  const ringWindowMins = isInProgress
    ? Math.max(1, totalDurationMins)
    : isTodayFocus ? (isHosted ? 180 : 120) : 24 * 60
  const ringProgress = isInProgress
    ? Math.max(0.06, Math.min(1, minutesUntilEnd / ringWindowMins))
    : isTodayFocus && !isAllDay
      ? Math.max(0.06, Math.min(1, minutesUntilLeave / ringWindowMins))
      : 1
  const ringRadius = 96
  const ringCircumference = 2 * Math.PI * ringRadius
  const ringDashOffset = ringCircumference * (1 - ringProgress)
  const ringValue = isInProgress
    ? formatHeroCountdown(minutesUntilEnd)
    : isTodayFocus
      ? (isAllDay ? 'All day' : formatHeroCountdown(minutesUntilLeave))
      : 'Tomorrow'
  const ringLabel = isInProgress
    ? (isHosted ? 'OF COVERAGE LEFT' : 'TIME LEFT')
    : isTodayFocus
      ? (isAllDay ? 'HAPPENING TODAY' : (isHosted ? 'UNTIL IT STARTS' : 'UNTIL YOU LEAVE'))
      : (isAllDay ? 'STARTS ALL DAY' : `STARTS ${format(leaveAt, 'h:mm a').toUpperCase()}`)

  const mapsUrl = isHosted || isInProgress ? null : mapsUrlForEvent(focusEvent)

  return (
    <section className="relative h-full" onClick={(e) => e.stopPropagation()}>
      <div className="relative h-full rounded-modal border border-casa-navy/30 bg-casa-navy text-white shadow-card p-7 grid grid-cols-[1fr_420px] gap-8 overflow-hidden">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/8 via-transparent to-black/10" />
        {isBirthday && <BirthdayCardDecoration className="opacity-60" />}
        <div className="relative z-10 min-w-0 flex flex-col">
          <p className="text-caption font-bold tracking-[0.16em] text-casa-gold">{leadLabel}</p>
          <h1 className="font-display text-display-md leading-[1.02] mt-2 !text-white max-w-none pr-1">
            {headlineText}
          </h1>
          <div className="mt-4 text-body text-white/86 max-w-[68ch] leading-relaxed">
            {detailParts.length > 0 ? detailParts.join(' · ') : eventLabel}
          </div>
          {readinessItems.length > 0 && (
            <div className="mt-2 flex items-center gap-2 text-body-sm text-white/64">
              <span className="text-caption font-bold tracking-[0.12em] text-casa-gold/90 whitespace-nowrap">
                {isInProgress ? 'ON HAND' : 'BEFORE YOU START'}
              </span>
              <span className="min-w-0 truncate">{readinessItems.join(' · ')}</span>
            </div>
          )}
          <div className="mt-6 flex items-center gap-3">
            {mapsUrl ? (
              <a
                href={mapsUrl}
                target="_blank"
                rel="noreferrer"
                className={buttonClassName({ size: 'lg' })}
              >
                <Navigation size={18} />
                Get directions
              </a>
            ) : telUrl ? (
              <a
                href={telUrl}
                className={buttonClassName({ size: 'lg' })}
              >
                <Phone size={18} />
                {contactName ? `Call ${contactName.split(' ')[0]}` : 'Call'}
              </a>
            ) : null}
            <Button
              onClick={() => onViewDetails(focusEvent)}
              size="lg"
              variant={mapsUrl || telUrl ? 'secondary' : 'primary'}
              className={cn(
                mapsUrl || telUrl ? 'border-white/25 bg-white/10 text-white hover:bg-white/15' : '',
              )}
            >
              View details
            </Button>
          </div>
        </div>

        <div className="relative z-10 min-h-[292px] min-w-[432px]">
          <div className="absolute top-[3%] right-[3%] bottom-[3%] aspect-square min-h-[232px]">
            <svg className="h-full w-full -rotate-90" viewBox="0 0 220 220" aria-hidden>
              <circle
                cx="110"
                cy="110"
                r={ringRadius}
                fill="none"
                stroke="rgba(255,255,255,0.16)"
                strokeWidth="16"
              />
              <circle
                cx="110"
                cy="110"
                r={ringRadius}
                fill="none"
                stroke="var(--color-casa-gold)"
                strokeLinecap="round"
                strokeWidth="16"
                strokeDasharray={ringCircumference}
                strokeDashoffset={ringDashOffset}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-5">
              <p className="font-display text-display-md leading-none !text-white">{ringValue}</p>
              <p className="mt-2 text-caption tracking-[0.12em] text-white/72">{ringLabel}</p>
              <Chip size="sm" className={cn('mt-2.5', heroStatusClasses(status.tone))}>
                <span className="h-2 w-2 rounded-full bg-current opacity-85" />
                {status.label}
              </Chip>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

/* ── Timeline row ─────────────────────────────────────────────── */

function TimelineRow({
  event,
  now,
  index,
  household,
  onClick,
  onComplete,
  onSnooze,
  onSendToNeedsYou,
}: {
  event: EventWithDetails
  now: Date
  index: number
  household: FamilyMember[]
  onClick: () => void
  onComplete?: (id: string) => void
  onSnooze?: (event: EventWithDetails, duration: SnoozeDuration) => void | Promise<void>
  onSendToNeedsYou?: (event: EventWithDetails) => void | Promise<void>
}) {
  const start = getEventStartDate(event)
  const end = getEventEndDate(event)
  const past = isBefore(end, now)
  const happening = isBefore(start, now) && isAfter(end, now)
  const color = eventColor(event)
  const timed = isTimedReminder(event)
  const mode = resolveEventMode(event)
  const isHosted = mode === 'hosted'

  const [checking, setChecking] = useState(false)
  const [snoozing, setSnoozing] = useState(false)
  const [movingToNeedsYou, setMovingToNeedsYou] = useState(false)
  const [overrideVersion, setOverrideVersion] = useState(0)
  const cleanTitle = cleanEventTitle(event.title)
  const isBirthday = isBirthdayEvent(event)

  // Re-derive responsibility whenever the event panel writes new driver overrides.
  useEffect(() => {
    function handleEventUpdated(e: Event) {
      const detail = (e as CustomEvent<{ eventId?: string }>).detail
      if (!detail?.eventId || detail.eventId === event.id) {
        setOverrideVersion((v) => v + 1)
      }
    }
    function handleOverridesUpdated(e: Event) {
      const detail = (e as CustomEvent<{ eventId?: string }>).detail
      if (!detail?.eventId || detail.eventId === event.id) {
        setOverrideVersion((v) => v + 1)
      }
    }
    window.addEventListener('casa:event-updated', handleEventUpdated)
    window.addEventListener('casa:overrides-updated', handleOverridesUpdated)
    return () => {
      window.removeEventListener('casa:event-updated', handleEventUpdated)
      window.removeEventListener('casa:overrides-updated', handleOverridesUpdated)
    }
  }, [event.id])

  const responsibility = useMemo(
    () => deriveHomeCardResponsibility(event, mode, household, now),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [event, household, mode, now, overrideVersion],
  )
  const nextSavedLeg = responsibility.nextLeg
  const showLiveLeaveBy = !event.all_day && !isHosted && (
    responsibility.hasSavedTransportation
      ? Boolean(nextSavedLeg?.destination && nextSavedLeg.timingIso)
      : !happening && Boolean(event.address || event.location_name)
  )
  const showFallbackLeaveBy = !event.all_day && !happening && !isHosted && !(event.address || event.location_name) && Boolean(event.enrichment?.departure_time)
  const fallbackDepartureAt = event.enrichment?.departure_time ? new Date(event.enrichment.departure_time) : null

  // Timed reminder — slim amber pill in the timeline with dismiss checkbox
  if (timed) {
    async function handleCheck(e: React.MouseEvent) {
      e.stopPropagation()
      if (checking || snoozing || movingToNeedsYou || !onComplete) return
      setChecking(true)
      await new Promise(r => setTimeout(r, 320))
      onComplete(event.id)
    }
    async function handleSnooze(duration: SnoozeDuration) {
      if (checking || snoozing || movingToNeedsYou || !onSnooze) return
      setSnoozing(true)
      try {
        await onSnooze(event, duration)
      } finally {
        setSnoozing(false)
      }
    }
    async function handleMoveToNeedsYou(e: React.MouseEvent) {
      e.stopPropagation()
      if (checking || snoozing || movingToNeedsYou || !onSendToNeedsYou) return
      setMovingToNeedsYou(true)
      try {
        await onSendToNeedsYou(event)
      } finally {
        setMovingToNeedsYou(false)
      }
    }
    return (
      <motion.li
        initial={{ opacity: 0, x: -8 }}
        animate={{ opacity: past ? 0.4 : 1, x: 0 }}
        exit={{ opacity: 0, height: 0, marginBottom: 0, overflow: 'hidden' }}
        whileTap={{ scale: 0.97, opacity: 0.75 }}
        transition={{ duration: 0.3, delay: index * 0.04 }}
        className="cursor-pointer"
        onClick={e => { e.stopPropagation(); onClick() }}
      >
        <Card tone="accent" padding="sm" className="relative w-full overflow-hidden pl-5">
          <span className="absolute left-0 top-0 bottom-0 w-[8px] rounded-l-card bg-casa-warning" />
          <div className="flex items-center gap-2 pl-1 text-caption font-semibold text-casa-top-pick-band">
            <IconButton
              onClick={handleCheck}
              disabled={checking || snoozing || movingToNeedsYou}
              variant={checking ? 'primary' : 'secondary'}
              size="sm"
              icon={<Check size={16} />}
              aria-label="Mark reminder done"
              title="Mark done"
            />
            <SnoozeMenu
              onSnooze={(duration) => { void handleSnooze(duration) }}
              renderTrigger={({ onClick }) => (
                <IconButton
                  onClick={onClick}
                  disabled={checking || snoozing || movingToNeedsYou || !onSnooze}
                  variant="secondary"
                  size="sm"
                  icon={<SnoozeOneHourIcon className={cn('size-4', snoozing && 'animate-pulse')} />}
                  aria-label="Snooze reminder"
                  title="Snooze"
                />
              )}
            />
            <IconButton
              onClick={handleMoveToNeedsYou}
              disabled={checking || snoozing || movingToNeedsYou || !onSendToNeedsYou}
              variant="secondary"
              size="sm"
              icon={<NeedsYouTransferIcon className={cn('size-4', movingToNeedsYou && 'animate-pulse')} />}
              aria-label="Move reminder to Needs you"
              title="Move to Needs you"
            />
            <Bell size={13} className="shrink-0 text-casa-warning" />
            <span className="text-casa-muted tabular-nums">
              {format(start, 'h:mm a')}
            </span>
            <span className={cn(checking && 'line-through opacity-50')}>{event.title}</span>
            {event.members.length > 0 && (
              <div className="flex gap-1 ml-0.5">
                {event.members.slice(0, 3).map((m) => (
                  <CalendarPill
                    key={m.id}
                    color={m.family_member?.color_hex ?? SHARED_GOLD}
                  >
                    {m.family_member?.name}
                  </CalendarPill>
                ))}
              </div>
            )}
          </div>
        </Card>
      </motion.li>
    )
  }

  return (
    <motion.li
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: past ? 0.45 : 1, x: 0 }}
      whileTap={{ scale: 0.97, opacity: 0.75 }}
      transition={{ duration: 0.3, delay: index * 0.04 }}
      className="cursor-pointer"
      role="button"
      tabIndex={0}
      onClick={e => { e.stopPropagation(); onClick() }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClick()
        }
      }}
    >
      <Card
        padding="sm"
        className={cn(
          'relative w-full min-w-0 overflow-hidden pl-5',
          isBirthday && 'bg-gradient-to-br from-casa-accent-subtle via-casa-surface to-casa-bg',
        )}
      >
        {isBirthday && <BirthdayCardDecoration />}
        <span
          className={cn('absolute left-0 top-0 bottom-0 w-[12px] rounded-l-card', happening && 'animate-pulse-gold')}
          style={{ backgroundColor: color }}
        />
        <div className="relative z-10 flex items-start gap-3">
          <div className="relative shrink-0 pl-1 pt-0.5">
            <PersonAvatarStack
              people={responsibility.drivers.map((driver) => ({
                id: driver.id,
                name: driver.name,
                color: driver.color,
              }))}
              max={2}
              size="lg"
              emptyLabel={responsibility.summary}
              className={cn(
                responsibility.responsible?.role === 'caregiver' && 'rounded-full ring-2 ring-casa-gold/55 ring-offset-2 ring-offset-casa-surface',
              )}
            />
            <span
              className={cn(
                'absolute right-[-2px] bottom-[-2px] w-5 h-5 rounded-full border-2 border-casa-surface flex items-center justify-center',
                responsibility.roleBadge === 'drive' ? 'bg-casa-navy' : 'bg-casa-success-strong',
              )}
              aria-label={responsibility.roleBadge === 'drive' ? 'Driving role' : 'Supervising role'}
            >
              {responsibility.roleBadge === 'drive' ? <DrivingBadgeIcon /> : <SupervisingBadgeIcon />}
            </span>
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-body font-semibold text-casa-text truncate md:overflow-visible md:text-clip md:whitespace-normal">
                  {isBirthday && <span className="mr-1" aria-hidden="true">🎂</span>}
                  {cleanTitle}
                </p>
                <div className="flex items-center flex-wrap gap-x-3 gap-y-0.5 mt-1">
                  <span className="flex items-center gap-1 text-caption text-casa-muted tabular-nums">
                    <Clock size={11} className="shrink-0" />
                    {event.all_day ? 'All day' : `${format(start, 'h:mm a')} – ${format(end, 'h:mm a')}`}
                    {event.location_name && (
                      <WeatherIcon condition={event.enrichment?.weather_at_event} size={12} />
                    )}
                  </span>
                  {event.location_name && (
                    isHosted ? (
                      <span className="text-caption font-semibold uppercase tracking-wide text-casa-muted">At home</span>
                    ) : (
                      <span className="flex items-center gap-1 text-caption text-casa-muted truncate max-w-[180px] md:max-w-none md:overflow-visible md:text-clip md:whitespace-normal">
                        <MapPin size={11} className="shrink-0 text-casa-error" />
                        {event.location_name}
                      </span>
                    )
                  )}
                  {isHosted && !event.location_name && (
                    <span className="text-caption font-semibold uppercase tracking-wide text-casa-muted">At home</span>
                  )}
                </div>
              </div>

              {responsibility.attendees.length > 0 && (
                <PersonAvatarStack
                  people={responsibility.attendees.map((m) => ({
                    id: m.id,
                    name: m.family_member?.name ?? '?',
                    color: m.family_member?.color_hex ?? SHARED_GOLD,
                  }))}
                  max={3}
                  size="sm"
                  className="shrink-0"
                />
              )}
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className={cn(
                'text-caption font-semibold',
                isHosted ? 'text-casa-success-strong' : 'text-casa-gold',
              )}>
                {responsibility.summary}
              </span>
              {showLiveLeaveBy && (
                <>
                  <span className="text-casa-text-faint text-caption">·</span>
                  <LeaveByCard
                    origin={nextSavedLeg?.origin}
                    destination={nextSavedLeg?.destination ?? event.address ?? event.location_name}
                    eventStartIso={nextSavedLeg
                      ? nextSavedLeg.leg.timing === 'arrive_by' ? nextSavedLeg.timingIso : null
                      : event.start_time}
                    departureTimeIso={nextSavedLeg?.leg.timing === 'depart_at' ? nextSavedLeg.timingIso : null}
                    compact
                    className="!text-casa-gold"
                  />
                </>
              )}
              {showFallbackLeaveBy && (
                <>
                  <span className="text-casa-text-faint text-caption">·</span>
                  <span className="flex items-center gap-1 text-caption font-semibold text-casa-gold">
                    <Navigation size={11} className="shrink-0" />
                    {fallbackDepartureAt ? `Leave by ${format(fallbackDepartureAt, 'h:mm a')}` : 'Leave by soon'}
                    {event.enrichment?.drive_time_mins && ` · ${event.enrichment.drive_time_mins} min`}
                  </span>
                </>
              )}
            </div>

            {(isHosted || !event.enrichment?.departure_time) && event.enrichment?.prep_notes && (
              <p className="text-caption text-casa-muted mt-1 line-clamp-1 md:line-clamp-none">{event.enrichment.prep_notes}</p>
            )}
          </div>
        </div>
      </Card>
    </motion.li>
  )
}

function DrivingBadgeIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="8.5" stroke="white" strokeWidth="2" strokeLinecap="round" />
      <circle cx="12" cy="12" r="2" stroke="white" strokeWidth="2" />
      <path d="M12 3.5v6M5.8 16.6l4.1-2.7M18.2 16.6l-4.1-2.7" stroke="white" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

function SupervisingBadgeIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M12 3l7 2.6v5.2c0 4.3-3 7.3-7 8.4-4-1.1-7-4.1-7-8.4V5.6z" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function SnoozeOneHourIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <circle cx="12" cy="13" r="7" stroke="currentColor" strokeWidth="1.8" />
      <path d="M12 9.8v3.4l2.2 1.3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8.2 3.8h7.6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M5.7 6.2h2.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

function NeedsYouTransferIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path d="M4.5 6.5h10.5M4.5 11.5h8M4.5 16.5h6.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M14.2 9.2l4.3 3.3-4.3 3.3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
