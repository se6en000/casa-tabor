import { useMemo, useState, useEffect, useCallback, useRef } from 'react'
import { Link } from 'react-router-dom'
import { format, isAfter, isBefore, addDays } from 'date-fns'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronRight, RefreshCw, MapPin, Clock, Navigation, Bell } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useFamilyMembers } from '../hooks/useFamilyMembers'
import { useTodayEvents } from '../hooks/useCalendarEvents'
import { useLiveClock } from '../hooks/useLiveClock'
import { useCalendarStore } from '../stores/calendarStore'
import { cn } from '../utils/cn'
import type { EventWithDetails } from '../hooks/useCalendarEvents'
import EventDetailPanel from '../components/calendar/EventDetailPanel'
import MiniPlayer from '../components/music/MiniPlayer'
import HomeRightPanel from '../components/home/HomeRightPanel'
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
  getPersistedDriverOverrideMemberIds,
  resolveEventMode,
} from '../lib/eventPlanOverrides'
import { derivePlan, type DerivedPerson } from '../lib/eventCommandCenter'
import { useMemberAvailability } from '../hooks/useMemberAvailability'
import type { FamilyMember } from '../types'
import {
  evaluateMemberAvailabilityForWindow,
  indexAvailabilityExceptionsByMember,
  indexAvailabilityRulesByMember,
} from '../lib/memberAvailability'
import { getEventEndDate, getEventStartDate } from '../utils/eventTime'
import { cleanEventTitle, isBirthdayEvent } from '../utils/eventTitle'

const SHARED_GOLD = '#C9A96E'

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

function deriveHomeCardResponsibility(event: EventWithDetails, mode: ReturnType<typeof resolveEventMode>, household: FamilyMember[]) {
  const plan = derivePlan(event, mode, { household })
  const persisted = getPersistedPlanOverrides(event)
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
    attendees,
    summary,
    roleBadge: mode === 'hosted' ? 'supervise' as const : 'drive' as const,
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
  const { data: allTodayEvents, isLoading } = useTodayEvents(now)
  const tomorrow = useMemo(() => addDays(now, 1), [now.toDateString()])
  const { data: allTomorrowEvents } = useTodayEvents(tomorrow)
  const { visibleMembers, toggleMember } = useCalendarStore()
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null)
  const scrollRef = useRef<HTMLElement | null>(null)
  const nowLineRef = useRef<HTMLLIElement | null>(null)
  const homeFamily = useMemo(
    () => (family ?? []).filter((m) => (
      (m.role === 'parent' || m.role === 'child' || m.role === 'caregiver')
      && (m.show_on_home_sidebar ?? true)
    )),
    [family],
  )
  const availability = useMemberAvailability(homeFamily.map((member) => member.id))
  const rulesByMember = useMemo(
    () => indexAvailabilityRulesByMember(availability.rules),
    [availability.rules],
  )
  const exceptionsByMember = useMemo(
    () => indexAvailabilityExceptionsByMember(availability.exceptions),
    [availability.exceptions],
  )
  const familyStatusByMember = useMemo(() => {
    const sourceEvents = allTodayEvents ?? []
    const assignedDriverOverridesByEvent = new Map(
      sourceEvents.map((event) => [event.id, getPersistedDriverOverrideMemberIds(event)]),
    )
    return new Map(homeFamily.map((member) => {
      const mine = sourceEvents.filter((event) => {
        const isAttendee = event.members?.some((eventMember) => eventMember.family_member.id === member.id)
        const isAssignedViaOverride = assignedDriverOverridesByEvent.get(event.id)?.has(member.id) ?? false
        return Boolean(isAttendee || isAssignedViaOverride)
      })
      const activeNow = mine.find((event) => isBefore(getEventStartDate(event), now) && isAfter(getEventEndDate(event), now))
      const nextUp = mine
        .filter((event) => isAfter(getEventStartDate(event), now))
        .sort((a, b) => getEventStartDate(a).getTime() - getEventStartDate(b).getTime())[0]
      const nowWindowEnd = new Date(now.getTime() + (30 * 60 * 1000))
      const availabilityAssessment = evaluateMemberAvailabilityForWindow(
        member,
        now,
        nowWindowEnd,
        rulesByMember.get(member.id) ?? [],
        exceptionsByMember.get(member.id) ?? [],
        { requireCanDrive: false },
      )
      const label = activeNow
        ? activeNow.location_name
          ? `Out · ${activeNow.location_name.split(' ').slice(0, 3).join(' ')}`
          : `Busy until ${format(getEventEndDate(activeNow), 'h:mm a')}`
        : !availabilityAssessment.available
          ? availabilityAssessment.reason ?? 'Unavailable'
          : availabilityAssessment.softUnavailable
            ? `${availabilityAssessment.reason ?? 'Blocked hours'} (flex)`
            : nextUp
              ? `Next: ${format(getEventStartDate(nextUp), 'h:mm a')}`
              : 'Free today'
      const constrained = !availabilityAssessment.available || availabilityAssessment.softUnavailable
      return [member.id, { label, busy: Boolean(activeNow), constrained }]
    }))
  }, [allTodayEvents, homeFamily, now, rulesByMember, exceptionsByMember])

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
  const { snoozeReminderOneHour, moveReminderToNeedsYou, queueMissedReminders } = useReminderNeedsYouActions()

  const completeReminder = useCallback(async (id: string) => {
    await supabase.from('events').update({ status: 'cancelled' }).eq('id', id)
    qc.invalidateQueries({ queryKey: ['today-events'] })
  }, [qc])

  const dismissReminder = useCallback(async (id: string) => {
    await supabase.from('events').update({ status: 'cancelled' }).eq('id', id)
    qc.invalidateQueries({ queryKey: ['today-events'] })
  }, [qc])

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
    try { navigator.vibrate?.(15) } catch (_) {}
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
    try { navigator.vibrate?.(10) } catch (_) {}
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
      <div
        ref={(el) => { ptrRef(el); scrollRef.current = el }}
        className="flex-1 min-w-0 overflow-y-auto overscroll-contain touch-pan-y px-6 pt-8 pb-12 lg:px-8"
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

        <DesktopHeroCard
          now={now}
          nextTodayEvent={nextTodayEvent}
          fallbackTomorrowEvent={tomorrowEvents[0] ?? null}
          onViewDetails={(event) => setSelectedEventId(event.id)}
          travelEta={heroTravelEta.data}
        />

        {/* ── Today's timeline — first, front and center ──── */}
        <section className="mt-2">
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="font-display text-heading text-casa-navy">Today</h2>
            <Link
              to="/calendar"
              className="text-body-sm text-casa-muted hover:text-casa-navy flex items-center gap-0.5"
            >
              Full calendar <ChevronRight size={14} />
            </Link>
          </div>

          {isLoading ? (
            <div className="text-casa-muted text-body animate-breathe py-8 text-center">
              Loading…
            </div>
          ) : events.length === 0 ? (
            <div className="bg-casa-surface rounded-card border border-casa-border p-8 text-center text-casa-muted text-body">
              Nothing scheduled. Enjoy the quiet.
            </div>
          ) : (
            <ol className="space-y-2">
              {/* Past events */}
              {events.filter(e => isBefore(getEventEndDate(e), now)).map((ev, i) => (
                <TimelineRow
                  key={ev.id}
                  event={ev}
                  now={now}
                  index={i}
                  household={family ?? []}
                  onClick={() => setSelectedEventId(ev.id)}
                  onComplete={completeReminder}
                  onSnooze={(event) => {
                    void snoozeReminderOneHour(event).catch((error) => {
                      console.error('HomePage: failed to snooze reminder by 1 hour', error)
                    })
                  }}
                  onSendToNeedsYou={(event) => {
                    void moveReminderToNeedsYou(event).catch((error) => {
                      console.error('HomePage: failed to move reminder to Needs you', error)
                    })
                  }}
                />
              ))}

              {/* ── Now line ── */}
              {events.some(e => isAfter(getEventEndDate(e), now)) && (
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
              {events.filter(e => isAfter(getEventEndDate(e), now)).map((ev, i) => (
                <TimelineRow
                  key={ev.id}
                  event={ev}
                  now={now}
                  index={i}
                  household={family ?? []}
                  onClick={() => setSelectedEventId(ev.id)}
                  onComplete={completeReminder}
                  onSnooze={(event) => {
                    void snoozeReminderOneHour(event).catch((error) => {
                      console.error('HomePage: failed to snooze reminder by 1 hour', error)
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
                <h2 className="font-display text-heading text-casa-navy">
                  Tomorrow · {format(tomorrow, 'EEEE, MMM d')}
                </h2>
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
                    onSnooze={(event) => {
                      void snoozeReminderOneHour(event).catch((error) => {
                        console.error('HomePage: failed to snooze reminder by 1 hour', error)
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
                  onDismiss={dismissReminder}
                />
              ))}
            </div>
          </section>
        )}

        {/* ── Family filter + music player ─────────────────── */}
        <div className="mt-6 space-y-4">
          <div className="flex gap-2 flex-wrap">
            {homeFamily.map((m) => {
              const active = visibleMembers.length === 0 || visibleMembers.includes(m.id)
              const status = familyStatusByMember.get(m.id)
              return (
                <button
                  key={m.id}
                  onClick={() => toggleMember(m.id)}
                  className={cn(
                    'flex items-center gap-2 px-3 py-1.5 rounded-pill border transition-all min-w-0',
                    active
                      ? 'bg-casa-surface border-casa-border shadow-card'
                      : 'bg-transparent border-casa-divider hover:bg-casa-surface/50',
                  )}
                >
                  <span
                    className="w-3 h-3 rounded-full transition-opacity"
                    style={{ backgroundColor: m.color_hex, opacity: active ? 1 : 0.4 }}
                  />
                  <span className={cn('text-body-sm font-semibold transition-opacity shrink-0', active ? 'text-casa-navy opacity-100' : 'text-casa-navy opacity-45')}>
                    {m.name}
                  </span>
                  <span className={cn('text-[0.68rem] leading-[1.15] font-normal text-casa-text-faint tabular-nums truncate max-w-[11rem]', !active && 'opacity-80')}>
                    {status?.label ?? 'Free today'}
                  </span>
                  <span className={cn(
                    'w-2 h-2 rounded-full shrink-0',
                    !active ? 'bg-casa-muted/30' : status?.busy || status?.constrained ? 'bg-amber-400' : 'bg-emerald-400',
                  )} />
                </button>
              )
            })}
          </div>
          <div onClick={e => e.stopPropagation()}>
            <MiniPlayer />
          </div>
        </div>


        <div onClick={e => e.stopPropagation()}>
          <EventDetailPanel
            event={selectedEvent}
            onClose={() => setSelectedEventId(null)}
          />
        </div>


      </div>

      {/* ── Right panel (tablet only) ──────────────────────── */}
      <HomeRightPanel now={now} allTodayEvents={allTodayEvents ?? []} />
    </div>
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

function DesktopHeroCard({
  now,
  nextTodayEvent,
  fallbackTomorrowEvent,
  onViewDetails,
  travelEta,
}: {
  now: Date
  nextTodayEvent: EventWithDetails | null
  fallbackTomorrowEvent: EventWithDetails | null
  onViewDetails: (event: EventWithDetails) => void
  travelEta?: TravelEtaResult | null
}) {
  const focusEvent = nextTodayEvent ?? fallbackTomorrowEvent
  if (!focusEvent) return null

  const focusStart = getEventStartDate(focusEvent)
  const focusMode = resolveEventMode(focusEvent)
  const isHosted = focusMode === 'hosted'
  const isTodayFocus = !!nextTodayEvent
  const isAllDay = Boolean(focusEvent.all_day)
  const eventLabel = cleanEventTitle(focusEvent.title)
  const leadLabel = isTodayFocus ? `UP NEXT · ${eventLabel.toUpperCase()}` : 'TOMORROW · FIRST UP'

  const liveLeaveBy = !isHosted && !isAllDay && isTodayFocus && travelEta?.found && travelEta.leave_by
    ? new Date(travelEta.leave_by)
    : null
  const leaveAt = isHosted || isAllDay
    ? focusStart
    : (liveLeaveBy
      ?? (focusEvent.enrichment?.departure_time ? new Date(focusEvent.enrichment.departure_time) : focusStart))
  const minutesUntilLeave = Math.max(0, Math.round((leaveAt.getTime() - now.getTime()) / 60000))
  const headlineText = isAllDay
    ? (isTodayFocus ? 'All day' : 'All day tomorrow')
    : (isTodayFocus
      ? `${isHosted ? 'Starts at' : 'Leave by'} ${format(leaveAt, 'h:mm a')}`
      : `Tomorrow starts at ${format(leaveAt, 'h:mm a')}`)

  const destinationLabel = focusEvent.address ?? focusEvent.location_name ?? 'At home'
  const driveMins = isTodayFocus && travelEta?.found && typeof travelEta.drive_time_mins === 'number'
    ? travelEta.drive_time_mins
    : focusEvent.enrichment?.drive_time_mins
  const detailParts = isHosted
    ? ['At home']
    : [
      destinationLabel,
      typeof driveMins === 'number' ? `${driveMins} min drive` : null,
      focusEvent.enrichment?.weather_at_event ?? null,
    ].filter((part): part is string => Boolean(part && part.trim()))

  const status = deriveHeroStatus({
    isTodayFocus,
    isAllDay,
    minutesUntilLeave,
    trafficDelayMins: travelEta?.traffic_delay_mins ?? null,
  })
  const ringWindowMins = isTodayFocus ? (isHosted ? 180 : 120) : 24 * 60
  const ringProgress = isTodayFocus && !isAllDay
    ? Math.max(0.06, Math.min(1, minutesUntilLeave / ringWindowMins))
    : 1
  const ringRadius = 96
  const ringCircumference = 2 * Math.PI * ringRadius
  const ringDashOffset = ringCircumference * (1 - ringProgress)
  const ringValue = isTodayFocus
    ? (isAllDay ? 'All day' : formatHeroCountdown(minutesUntilLeave))
    : 'Tomorrow'
  const ringLabel = isTodayFocus
    ? (isAllDay ? 'HAPPENING TODAY' : (isHosted ? 'UNTIL IT STARTS' : 'UNTIL YOU LEAVE'))
    : (isAllDay ? 'STARTS ALL DAY' : `STARTS ${format(leaveAt, 'h:mm a').toUpperCase()}`)

  const mapsUrl = isHosted ? null : mapsUrlForEvent(focusEvent)

  return (
    <section className="hidden lg:block mt-2 mb-6" onClick={(e) => e.stopPropagation()}>
      <div className="relative rounded-[22px] border border-casa-navy/30 bg-casa-navy text-white shadow-card p-7 grid grid-cols-[1fr_420px] gap-8 overflow-hidden">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/8 via-transparent to-black/10" />
        <div className="relative min-w-0 flex flex-col">
          <p className="text-caption font-bold tracking-[0.16em] text-casa-gold">{leadLabel}</p>
          <h1 className="font-display text-display-md leading-[1.02] mt-2 !text-white max-w-none pr-1">
            {headlineText}
          </h1>
          <div className="mt-4 text-body text-white/86 max-w-[68ch] leading-relaxed">
            {detailParts.length > 0 ? detailParts.join(' · ') : eventLabel}
          </div>
          <div className="mt-6 flex items-center gap-3">
            {mapsUrl ? (
              <a
                href={mapsUrl}
                target="_blank"
                rel="noreferrer"
                className="h-12 px-7 rounded-button bg-casa-gold text-casa-navy font-semibold text-[1.08rem] flex items-center justify-center gap-2 whitespace-nowrap hover:brightness-110 transition-all border border-casa-gold/50"
              >
                <Navigation size={18} />
                Get directions
              </a>
            ) : (
              <button disabled className="h-12 px-7 rounded-button border border-white/20 bg-white/5 text-white/60 font-semibold text-[1.08rem] whitespace-nowrap">
                Get directions
              </button>
            )}
            <button
              onClick={() => onViewDetails(focusEvent)}
              className="h-12 px-7 rounded-button border border-white/25 bg-gradient-to-b from-white/6 to-white/[0.03] text-white font-semibold text-[1.08rem] whitespace-nowrap hover:from-white/12 hover:to-white/[0.06] transition-all"
            >
              View details
            </button>
          </div>
        </div>

        <div className="relative min-h-[292px] min-w-[432px]">
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
              <span className={cn(
                'mt-2.5 inline-flex items-center gap-1.5 rounded-pill border px-2.5 py-0.5 text-caption font-semibold',
                heroStatusClasses(status.tone),
              )}>
                <span className="h-2 w-2 rounded-full bg-current opacity-85" />
                {status.label}
              </span>
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
  onSnooze?: (event: EventWithDetails) => void | Promise<void>
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
    function handleOverridesUpdated(e: Event) {
      const detail = (e as CustomEvent<{ eventId?: string }>).detail
      if (!detail?.eventId || detail.eventId === event.id) {
        setOverrideVersion((v) => v + 1)
      }
    }
    window.addEventListener('casa:overrides-updated', handleOverridesUpdated)
    return () => window.removeEventListener('casa:overrides-updated', handleOverridesUpdated)
  }, [event.id])

  const responsibility = useMemo(
    () => deriveHomeCardResponsibility(event, mode, household),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [event, household, mode, overrideVersion],
  )
  const showLiveLeaveBy = !event.all_day && !happening && !isHosted && Boolean(event.address || event.location_name)
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
    async function handleSnooze(e: React.MouseEvent) {
      e.stopPropagation()
      if (checking || snoozing || movingToNeedsYou || !onSnooze) return
      setSnoozing(true)
      try {
        await onSnooze(event)
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
        transition={{ duration: 0.3, delay: index * 0.04 }}
        className="cursor-pointer"
        onClick={e => { e.stopPropagation(); onClick() }}
      >
        <div
          className="relative w-full overflow-hidden rounded-card border border-casa-accent-soft-border bg-casa-accent-subtle px-4 py-2.5"
        >
          <span className="absolute left-0 top-0 bottom-0 w-[8px] rounded-l-card bg-casa-warning" />
          <div className="flex items-center gap-2 pl-1 text-caption font-semibold text-casa-top-pick-band">
            <button
              onClick={handleCheck}
              disabled={checking || snoozing || movingToNeedsYou}
              className={`shrink-0 w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${
                checking ? 'bg-green-500 border-green-500' : 'border-casa-accent-soft-border hover:border-casa-success bg-transparent'
              }`}
              title="Mark done"
            >
              {checking && (
                <svg width="8" height="6" viewBox="0 0 9 7" fill="none">
                  <path d="M1 3.5L3.5 6L8 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              )}
            </button>
            <button
              onClick={handleSnooze}
              disabled={checking || snoozing || movingToNeedsYou || !onSnooze}
              className="shrink-0 w-5 h-5 rounded border border-casa-accent-soft-border bg-white/80 text-casa-muted hover:text-casa-text hover:bg-white transition-colors inline-flex items-center justify-center disabled:opacity-40"
              title="Snooze 1 hour"
            >
              <SnoozeOneHourIcon className={cn('w-3 h-3', snoozing && 'animate-pulse')} />
            </button>
            <button
              onClick={handleMoveToNeedsYou}
              disabled={checking || snoozing || movingToNeedsYou || !onSendToNeedsYou}
              className="shrink-0 w-5 h-5 rounded border border-casa-accent-soft-border bg-white/80 text-casa-muted hover:text-casa-text hover:bg-white transition-colors inline-flex items-center justify-center disabled:opacity-40"
              title="Move to Needs you"
            >
              <NeedsYouTransferIcon className={cn('w-3 h-3', movingToNeedsYou && 'animate-pulse')} />
            </button>
            <Bell size={13} className="shrink-0 text-casa-warning" />
            <span className="text-casa-muted tabular-nums">
              {format(start, 'h:mm a')}
            </span>
            <span className={cn(checking && 'line-through opacity-50')}>{event.title}</span>
            {event.members.length > 0 && (
              <div className="flex gap-1 ml-0.5">
                {event.members.slice(0, 3).map((m) => (
                  <span
                    key={m.id}
                    className="px-1.5 py-0.5 rounded-pill text-white text-[9px] font-bold leading-none whitespace-nowrap"
                    style={{ backgroundColor: m.family_member?.color_hex ?? SHARED_GOLD }}
                  >
                    {m.family_member?.name}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </motion.li>
    )
  }

  return (
    <motion.li
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: past ? 0.45 : 1, x: 0 }}
      transition={{ duration: 0.3, delay: index * 0.04 }}
      className="cursor-pointer"
      onClick={e => { e.stopPropagation(); onClick() }}
    >
      <div className={cn(
        'relative w-full min-w-0 overflow-hidden rounded-card border border-casa-border px-4 py-3 shadow-card',
        isBirthday ? 'bg-gradient-to-br from-[#FDF1F6] via-casa-surface to-[#FFFBEE]' : 'bg-casa-surface',
      )}>
        {isBirthday && <BirthdayCardDecoration />}
        <span
          className={cn('absolute left-0 top-0 bottom-0 w-[12px] rounded-l-card', happening && 'animate-pulse-gold')}
          style={{ backgroundColor: color }}
        />
        <div className="relative z-10 flex items-start gap-3">
          <div className="relative shrink-0 pl-1 pt-0.5">
            <span
              className={cn(
                'w-12 h-12 rounded-full text-white flex items-center justify-center text-[18px] font-bold shadow-card',
                responsibility.responsible?.role === 'caregiver' && 'ring-2 ring-casa-gold/55 ring-offset-2 ring-offset-casa-surface',
              )}
              style={{ backgroundColor: responsibility.responsible?.color ?? 'var(--color-casa-gold)' }}
              aria-label={responsibility.responsible ? `${responsibility.responsible.name} is responsible` : 'Responsible adult'}
            >
              {responsibility.responsible?.initial ?? '?'}
            </span>
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
                <div className="flex items-center gap-1 shrink-0">
                  {responsibility.attendees.slice(0, 3).map((m) => (
                    <span
                      key={m.id}
                      className="px-2 py-0.5 rounded-pill text-white text-caption font-bold leading-none whitespace-nowrap"
                      style={{ backgroundColor: m.family_member?.color_hex ?? SHARED_GOLD }}
                    >
                      {m.family_member?.name}
                    </span>
                  ))}
                  {responsibility.attendees.length > 3 && (
                    <span className="px-1.5 py-0.5 rounded-pill bg-casa-bg text-casa-muted text-caption font-bold leading-none">
                      +{responsibility.attendees.length - 3}
                    </span>
                  )}
                </div>
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
                    destination={event.address ?? event.location_name}
                    eventStartIso={event.start_time}
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
      </div>
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
