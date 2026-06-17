import { useMemo, useState, useEffect, useCallback, useRef } from 'react'
import { Link } from 'react-router-dom'
import { format, isAfter, isBefore, addDays, addMinutes, startOfDay } from 'date-fns'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronRight, RefreshCw } from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useFamilyMembers } from '../hooks/useFamilyMembers'
import { useTodayEvents } from '../hooks/useCalendarEvents'
import { useLiveClock } from '../hooks/useLiveClock'
import { useCalendarStore } from '../stores/calendarStore'
import { cn } from '../utils/cn'
import type { EventWithDetails } from '../hooks/useCalendarEvents'
import EventDetailPanel from '../components/calendar/EventDetailPanel'
import LargeEventCard from '../components/calendar/LargeEventCard'
import ReminderEventCard from '../components/calendar/ReminderEventCard'
import MiniPlayer from '../components/music/MiniPlayer'
import HomeRightPanel from '../components/home/HomeRightPanel'
import PrepItemDetailPanel from '../components/home/PrepItemDetailPanel'
import { isAllDayReminder, isTimedReminder } from '../utils/holidays'
import { usePullToRefresh } from '../hooks/usePullToRefresh'
import type { PrepItem } from '../types'

const SHARED_GOLD = '#C9A96E'

function cleanEventTitle(title: string): string {
  const pipeIdx = title.indexOf(' | ')
  return pipeIdx !== -1 ? title.slice(pipeIdx + 3) : title
}

function normalizeForMatch(value: string | null | undefined): string {
  return (value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

interface EventMatchCandidate {
  id: string
  title: string
  start_time: string
}

function extractEventIdFromSourceRef(sourceRef: string | null | undefined): string | null {
  if (!sourceRef?.startsWith('event:')) return null
  const [, eventId] = sourceRef.split(':')
  return eventId || null
}

function findMatchingEventIdForPrepItem(
  item: PrepItem,
  candidateEvents: EventMatchCandidate[],
): string | null {
  if (item.event_id) return item.event_id

  const itemTitle = normalizeForMatch(item.event_title)
  const itemDescription = normalizeForMatch(item.description)
  const itemDate = item.event_date ? new Date(item.event_date).toDateString() : null

  const sourceTitle = itemTitle || itemDescription
  if (!sourceTitle) return null

  for (const event of candidateEvents) {
    const eventTitle = normalizeForMatch(cleanEventTitle(event.title))
    const titleMatch = (
      (eventTitle.length > 0 && (eventTitle.includes(sourceTitle) || sourceTitle.includes(eventTitle))) ||
      (itemDescription.length > 0 && eventTitle.length > 0 && itemDescription.includes(eventTitle))
    )
    if (!titleMatch) continue
    if (itemDate && new Date(event.start_time).toDateString() !== itemDate) continue
    return event.id
  }

  return null
}

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
  const primary = ev.members.find((m) => m.role === 'primary')
  if (primary?.family_member?.color_hex) return primary.family_member.color_hex
  if (ev.members.length >= 4) return SHARED_GOLD
  return ev.members[0].family_member?.color_hex ?? SHARED_GOLD
}

export default function HomePage() {
  const now = useLiveClock(15_000)
  const { data: family } = useFamilyMembers()
  const { data: allTodayEvents, isLoading } = useTodayEvents(now)
  const tomorrow = useMemo(() => addDays(now, 1), [now.toDateString()])
  const { data: allTomorrowEvents } = useTodayEvents(tomorrow)
  const { visibleMembers, toggleMember } = useCalendarStore()
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null)
  const [selectedPrepItem, setSelectedPrepItem] = useState<PrepItem | null>(null)
  const scrollRef = useRef<HTMLElement | null>(null)
  const nowLineRef = useRef<HTMLLIElement | null>(null)
  const homeFamily = useMemo(
    () => (family ?? []).filter(m => m.role === 'parent' || m.role === 'child'),
    [family],
  )

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

  const prepEventCandidates = useMemo<EventWithDetails[]>(() => {
    const unique = new Map<string, EventWithDetails>()
    for (const event of [...(allTodayEvents ?? []), ...(allTomorrowEvents ?? [])]) {
      unique.set(event.id, event)
    }
    return [...unique.values()]
  }, [allTodayEvents, allTomorrowEvents])

  const nextTodayEvent = useMemo(
    () => events.find((e) => isAfter(new Date(e.end_time), now)) ?? null,
    [events, now],
  )

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
  const { data: selectedEventFromDb } = useQuery<EventWithDetails | null>({
    queryKey: ['events', 'single', selectedEventId],
    enabled: !!selectedEventId && !selectedEvent,
    queryFn: async () => {
      if (!selectedEventId) return null
      const enrichmentSelect = `
        id,
        event_id,
        category,
        confidence,
        what_to_bring,
        outfit_suggestion,
        parking_notes,
        contact_name,
        contact_phone,
        cost_estimate,
        dietary_notes,
        meal_impact,
        prep_notes,
        departure_time,
        drive_time_mins,
        route_summary,
        weather_at_event,
        weather_summary,
        enriched_by,
        enriched_at,
        created_at,
        updated_at
      `
      const { data, error } = await supabase
        .from('events')
        .select(`
          *,
          event_members (
            id,
            role,
            family_member:family_members (*)
          ),
          event_enrichments (${enrichmentSelect}),
          event_logistics ( * ),
          event_checklist_items ( * ),
          event_action_items ( * )
        `)
        .eq('id', selectedEventId)
        .neq('status', 'cancelled')
        .maybeSingle()

      if (error) throw error
      if (!data) return null

      return {
        ...data,
        members: data.event_members?.map((em: any) => ({
          id: em.id,
          role: em.role,
          family_member: em.family_member,
        })) ?? [],
        enrichment: Array.isArray(data.event_enrichments)
          ? data.event_enrichments[0] ?? null
          : (data.event_enrichments ?? null),
        logistics: (data.event_logistics ?? []).sort((a: any, b: any) => a.sort_order - b.sort_order),
        checklist: (data.event_checklist_items ?? []).sort((a: any, b: any) => a.sort_order - b.sort_order),
        actions: data.event_action_items ?? [],
      } as EventWithDetails
    },
    staleTime: 60_000,
  })
  const selectedEventResolved = selectedEvent ?? selectedEventFromDb ?? null
  useEffect(() => {
    if (selectedEventId) setSelectedPrepItem(null)
  }, [selectedEventId])
  const qc = useQueryClient()

  const handlePrepItemSelect = useCallback(async (item: PrepItem) => {
    const linkedEventId = extractEventIdFromSourceRef(item.source_ref) ?? item.event_id
    if (linkedEventId) {
      setSelectedPrepItem(null)
      setSelectedEventId(linkedEventId)
      return
    }

    const localMatch = findMatchingEventIdForPrepItem(item, prepEventCandidates)
    if (localMatch) {
      setSelectedPrepItem(null)
      setSelectedEventId(localMatch)
      return
    }

    const anchorDate = item.event_date ?? item.due_by ?? null
    const date = anchorDate ? new Date(anchorDate) : null
    const isValidDate = !!date && !Number.isNaN(date.getTime())

    const lower = isValidDate ? new Date(date) : addDays(new Date(), -7)
    const upper = isValidDate ? new Date(date) : addDays(new Date(), 30)
    if (isValidDate) {
      lower.setHours(0, 0, 0, 0)
      upper.setHours(23, 59, 59, 999)
    }

    const { data: dbCandidates, error } = await supabase
      .from('events')
      .select('id, title, start_time')
      .neq('status', 'cancelled')
      .gte('start_time', lower.toISOString())
      .lte('start_time', upper.toISOString())
      .order('start_time', { ascending: true })
      .limit(200)

    if (error) {
      console.error('[home] failed to resolve prep item event', error)
      setSelectedEventId(null)
      setSelectedPrepItem(item)
      return
    }

    const dbMatch = findMatchingEventIdForPrepItem(item, (dbCandidates ?? []) as EventMatchCandidate[])
    if (dbMatch) {
      setSelectedPrepItem(null)
      setSelectedEventId(dbMatch)
      return
    }

    setSelectedEventId(null)
    setSelectedPrepItem(item)
  }, [prepEventCandidates])
  const { data: displayConfig } = useQuery<Record<string, unknown> | null>({
    queryKey: ['settings', 'display_config'],
    queryFn: async () => {
      const { data } = await supabase.from('settings').select('value').eq('key', 'display_config').single()
      return (data?.value as Record<string, unknown>) ?? null
    },
    staleTime: 60_000,
    refetchInterval: 60_000,
  })
  const showHomeHero = (displayConfig?.show_home_hero as boolean | undefined) ?? true

  const completeReminder = useCallback(async (id: string) => {
    await supabase.from('events').update({ status: 'cancelled' }).eq('id', id)
    qc.invalidateQueries({ queryKey: ['events'] })
  }, [qc])

  const dismissReminder = useCallback(async (id: string) => {
    await supabase.from('events').update({ status: 'cancelled' }).eq('id', id)
    qc.invalidateQueries({ queryKey: ['events'] })
  }, [qc])

  const snoozeReminder = useCallback(async (event: EventWithDetails) => {
    const start = new Date(event.start_time)
    const end = new Date(event.end_time)
    const durationMs = Math.max(15 * 60_000, end.getTime() - start.getTime())
    const timed = isTimedReminder(event)
    const nextStart = timed
      ? addMinutes(start, 30)
      : startOfDay(addDays(start, 1))
    const nextEnd = new Date(nextStart.getTime() + durationMs)
    await supabase
      .from('events')
      .update({ start_time: nextStart.toISOString(), end_time: nextEnd.toISOString(), updated_at: new Date().toISOString() })
      .eq('id', event.id)
    qc.invalidateQueries({ queryKey: ['events'] })
  }, [qc])

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
    <div
      className="flex h-full overflow-hidden"
      onClick={() => {
        setSelectedEventId(null)
        setSelectedPrepItem(null)
      }}
    >

      {/* ── Center content ─────────────────────────────────── */}
      <div
        ref={(el) => { ptrRef(el); scrollRef.current = el }}
        className="flex-1 min-w-0 overflow-y-auto overscroll-contain touch-pan-y px-6 pt-8 pb-12 lg:px-8 bg-casa-main"
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

        {showHomeHero && (
          <DesktopHeroCard
            now={now}
            nextTodayEvent={nextTodayEvent}
            fallbackTomorrowEvent={tomorrowEvents[0] ?? null}
            onViewDetails={(event) => {
              setSelectedPrepItem(null)
              setSelectedEventId(event.id)
            }}
          />
        )}

        {/* ── Today's timeline — first, front and center ──── */}
        <section className="mt-4">
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="font-display text-heading text-casa-navy">Today</h2>
            <Link
              to="/calendar"
              className="text-body-sm text-casa-gold hover:brightness-110 flex items-center gap-0.5 font-medium"
            >
              Full calendar <ChevronRight size={14} />
            </Link>
          </div>
          {!isLoading && reminders.length > 0 && (
            <ol className="space-y-2 mb-3">
              {reminders.map((r) => (
                <li key={r.id}>
                  <ReminderEventCard
                    event={r}
                    timed={false}
                    selected={selectedEventId === r.id}
                    onClick={() => setSelectedEventId(r.id)}
                    onComplete={() => completeReminder(r.id)}
                    onSnooze={() => snoozeReminder(r)}
                    onDismiss={() => dismissReminder(r.id)}
                  />
                </li>
              ))}
            </ol>
          )}

          {isLoading ? (
            <div className="text-casa-muted text-body animate-breathe py-8 text-center">
              Loading…
            </div>
          ) : events.length === 0 ? (
            <div className="bg-casa-card rounded-card border border-casa-border p-8 text-center text-casa-muted text-body">
              Nothing scheduled. Enjoy the quiet.
            </div>
          ) : (
            <ol className="space-y-2">
              {/* Past events */}
              {events.filter(e => isBefore(new Date(e.end_time), now)).map((ev, i) => (
                <TimelineRow
                  key={ev.id}
                  event={ev}
                  now={now}
                  index={i}
                  selected={selectedEventId === ev.id}
                  onClick={() => setSelectedEventId(ev.id)}
                  onComplete={completeReminder}
                  onDismiss={dismissReminder}
                  onSnooze={snoozeReminder}
                />
              ))}

              {/* ── Now line ── */}
              {events.some(e => isAfter(new Date(e.end_time), now)) && (
                <li ref={nowLineRef} className="flex items-center gap-3 py-0.5 select-none pointer-events-none" aria-hidden>
                  <div className="w-16 shrink-0" />
                  <span className="w-2 shrink-0" />
                  <div className="flex-1 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.5)] animate-pulse flex-shrink-0" />
                    <div className="flex-1 h-px bg-red-400/50" />
                    <span className="text-caption font-bold text-red-500 tabular-nums flex-shrink-0">
                      {format(now, 'h:mm a')}
                    </span>
                    <div className="flex-1 h-px bg-red-400/50" />
                  </div>
                </li>
              )}

              {/* Upcoming events */}
              {events.filter(e => isAfter(new Date(e.end_time), now)).map((ev, i) => (
                <TimelineRow
                  key={ev.id}
                  event={ev}
                  now={now}
                  index={i}
                  selected={selectedEventId === ev.id}
                  onClick={() => setSelectedEventId(ev.id)}
                  onComplete={completeReminder}
                  onDismiss={dismissReminder}
                  onSnooze={snoozeReminder}
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
                    selected={selectedEventId === ev.id}
                    onClick={() => setSelectedEventId(ev.id)}
                    onComplete={completeReminder}
                    onDismiss={dismissReminder}
                    onSnooze={snoozeReminder}
                  />
                ))}
              </ol>
            </motion.section>
          )}
        </AnimatePresence>

        {/* ── Family filter + music player ─────────────────── */}
        <div className="mt-6 space-y-4">
          <div className="flex gap-2 flex-wrap">
            {homeFamily.map((m) => {
              const active = visibleMembers.length === 0 || visibleMembers.includes(m.id)
              return (
                <button
                  key={m.id}
                  onClick={() => toggleMember(m.id)}
                  className={cn(
                    'flex items-center gap-2 px-3 py-1.5 rounded-pill border text-body-sm font-medium transition-all',
                    active
                      ? 'bg-casa-card border-casa-border shadow-card'
                      : 'bg-transparent border-casa-divider text-casa-muted opacity-60',
                  )}
                >
                  <span
                    className="w-3 h-3 rounded-full transition-opacity"
                    style={{ backgroundColor: m.color_hex, opacity: active ? 1 : 0.4 }}
                  />
                  {m.name}
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
            event={selectedEventResolved}
            onClose={() => setSelectedEventId(null)}
          />
        </div>

        <div onClick={e => e.stopPropagation()}>
          <PrepItemDetailPanel
            item={selectedPrepItem}
            onClose={() => setSelectedPrepItem(null)}
          />
        </div>


      </div>

      {/* ── Right panel (tablet only) ──────────────────────── */}
      <HomeRightPanel
        now={now}
        allTodayEvents={allTodayEvents ?? []}
        onSelectPrepItem={(item) => {
          void handlePrepItemSelect(item)
        }}
      />
    </div>
  )
}

function DesktopHeroCard({
  now,
  nextTodayEvent,
  fallbackTomorrowEvent,
  onViewDetails,
}: {
  now: Date
  nextTodayEvent: EventWithDetails | null
  fallbackTomorrowEvent: EventWithDetails | null
  onViewDetails: (event: EventWithDetails) => void
}) {
  const focusEvent = nextTodayEvent ?? fallbackTomorrowEvent
  if (!focusEvent) return null

  const focusStart = new Date(focusEvent.start_time)
  const isTodayFocus = !!nextTodayEvent
  const minutesUntil = Math.max(0, Math.round((focusStart.getTime() - now.getTime()) / 60000))
  const hours = Math.floor(minutesUntil / 60)
  const mins = minutesUntil % 60
  const countdown = hours > 0 ? `${hours}H ${mins}M` : `${mins}M`
  const dayHour = now.getHours()
  const daypart = dayHour < 12 ? 'MORNING' : dayHour < 17 ? 'MIDDAY' : 'TONIGHT'
  const leadLabel = isTodayFocus
    ? `UP NEXT · IN ${countdown}`
    : `${daypart} · YOU'RE CLEAR`

  const primary = focusEvent.members?.find((m) => m.role === 'primary')
  const orderedMembers = [
    ...(primary ? [primary] : []),
    ...((focusEvent.members ?? []).filter((m) => m.role !== 'primary').slice(0, 3)),
  ]
  const leaveAt = focusEvent.enrichment?.departure_time
    ? new Date(focusEvent.enrichment.departure_time)
    : new Date(focusEvent.start_time)
  const eventLabel = cleanEventTitle(focusEvent.title)
  const primaryName = primary?.family_member?.name ?? 'You'
  const heroTitle = isTodayFocus
    ? (focusEvent.enrichment?.departure_time
      ? `Leave by ${format(leaveAt, 'h:mm a')} for ${primaryName.toLowerCase() === 'you' ? 'your' : `${primaryName}'s`} ${eventLabel.toLowerCase()}`
      : `${primaryName}'s ${eventLabel.toLowerCase()} starts at ${format(new Date(focusEvent.start_time), 'h:mm a')}`)
    : `Nothing left today — first move is ${format(new Date(focusEvent.start_time), 'h:mm a')} tomorrow`
  const detailText = focusEvent.enrichment?.prep_notes
    ?? focusEvent.description
    ?? (isTodayFocus
      ? `${eventLabel} is at ${format(new Date(focusEvent.start_time), 'h:mm a')}${focusEvent.location_name ? ` at ${focusEvent.location_name}` : ''}.`
      : `${eventLabel} is queued for tomorrow${focusEvent.location_name ? ` at ${focusEvent.location_name}` : ''}.`)

  const leaveLabel = focusEvent.enrichment?.departure_time ? 'LEAVE BY' : 'STARTS AT'
  const mapsUrl = mapsUrlForEvent(focusEvent)
  const weatherLabel = focusEvent.enrichment?.weather_at_event
  const locationLabel = focusEvent.location_name
  const driveLabel = focusEvent.enrichment?.drive_time_mins
    ? `${focusEvent.enrichment.drive_time_mins} min drive`
    : null

  return (
    <section className="hidden lg:block mt-2 mb-6" onClick={(e) => e.stopPropagation()}>
      <div className="relative rounded-[22px] border border-casa-navy/30 bg-casa-navy text-white shadow-card p-6 grid grid-cols-[1fr_236px] xl:grid-cols-[1fr_248px] gap-6 overflow-hidden">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/8 via-transparent to-black/10" />
        <div className="pointer-events-none absolute inset-0 ring-1 ring-white/10 rounded-[22px]" />

        <div className="relative min-w-0">
          <p className="text-caption font-bold tracking-[0.16em] text-casa-gold">{leadLabel}</p>
          <h1 className="font-display text-display-md leading-[1.02] mt-2 !text-white max-w-none pr-1">{heroTitle}</h1>
          <p className="text-body mt-3 text-white/86 max-w-[60ch] line-clamp-2">{detailText}</p>

          {orderedMembers.length > 0 && (
            <div className="mt-4 flex items-center gap-2">
              {orderedMembers.map((m) => (
                <span
                  key={m.id}
                  className="px-2.5 py-1 rounded-full text-caption font-bold leading-none whitespace-nowrap text-white border flex items-center gap-1.5"
                  style={{
                    background: `linear-gradient(180deg, rgba(255,255,255,0.16) 0%, rgba(255,255,255,0.08) 100%)`,
                    borderColor: `${m.family_member?.color_hex ?? '#62708F'}AA`,
                  }}
                >
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: m.family_member?.color_hex ?? '#62708F' }}
                  />
                  {m.family_member?.name}
                </span>
              ))}
              <span className="text-white/35 text-caption">•</span>
            </div>
          )}

          <div className="mt-4 flex items-center flex-wrap gap-x-3 gap-y-1 text-body-sm text-white/88">
            {driveLabel && <span>{driveLabel}</span>}
            {locationLabel && <><span>•</span><span>{locationLabel}</span></>}
            {weatherLabel && <><span>•</span><span>{weatherLabel}</span></>}
          </div>
        </div>

        <div className="relative flex flex-col gap-3 min-w-[236px]">
          <div className="rounded-card border border-white/20 bg-gradient-to-b from-white/10 to-white/5 px-4 py-3 text-right shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]">
            <p className="text-caption font-semibold tracking-[0.08em] text-white/80">{leaveLabel}</p>
            <p className="font-display text-display-sm leading-none text-casa-gold mt-1 whitespace-nowrap">{format(leaveAt, 'h:mm a')}</p>
          </div>
          {mapsUrl ? (
            <a
              href={mapsUrl}
              target="_blank"
              rel="noreferrer"
              className="h-11 rounded-button bg-casa-gold text-casa-navy font-semibold flex items-center justify-center whitespace-nowrap hover:brightness-110 transition-all border border-casa-gold/50 shadow-[0_1px_0_rgba(255,255,255,0.25)_inset]"
            >
              Get directions
            </a>
          ) : (
            <button
              disabled
              className="h-11 rounded-button border border-white/20 bg-white/5 text-white/60 font-semibold whitespace-nowrap"
            >
              Get directions
            </button>
          )}
          <button
            onClick={() => onViewDetails(focusEvent)}
            className="h-11 rounded-button border border-white/25 bg-gradient-to-b from-white/6 to-white/[0.03] text-white font-semibold whitespace-nowrap hover:from-white/12 hover:to-white/[0.06] transition-all shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]"
          >
            View details
          </button>
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
  selected,
  onClick,
  onComplete,
  onDismiss,
  onSnooze,
}: {
  event: EventWithDetails
  now: Date
  index: number
  selected: boolean
  onClick: () => void
  onComplete?: (id: string) => void
  onDismiss?: (id: string) => void
  onSnooze?: (event: EventWithDetails) => void
}) {
  const end = new Date(event.end_time)
  const past = isBefore(end, now)
  const color = eventColor(event)
  const timed = isTimedReminder(event)

  // Timed reminders use the same card shell and time rail as normal events.
  if (timed) {
    return (
      <motion.li
        initial={{ opacity: 0, x: -8 }}
        animate={{ opacity: past ? 0.4 : 1, x: 0 }}
        transition={{ duration: 0.3, delay: index * 0.04 }}
        className="cursor-pointer"
        onClick={e => { e.stopPropagation(); onClick() }}
      >
        <ReminderEventCard
          event={event}
          timed
          selected={selected}
          onClick={onClick}
          onComplete={onComplete ? () => onComplete(event.id) : undefined}
          onSnooze={onSnooze ? () => onSnooze(event) : undefined}
          onDismiss={onDismiss ? () => onDismiss(event.id) : undefined}
        />
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
      <LargeEventCard event={event} color={color} now={now} />
    </motion.li>
  )
}
