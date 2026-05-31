import { useMemo, useState, useEffect, useCallback, useRef } from 'react'
import { Link } from 'react-router-dom'
import { format, isAfter, isBefore, addDays } from 'date-fns'
import { motion, AnimatePresence } from 'framer-motion'
import { Cloud, MapPin, Clock, ChevronRight, AlertTriangle, Navigation, Bell, RefreshCw } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useFamilyMembers } from '../hooks/useFamilyMembers'
import { useTodayEvents } from '../hooks/useCalendarEvents'
import { useLiveClock, greetingFor } from '../hooks/useLiveClock'
import { useCalendarStore } from '../stores/calendarStore'
import { useHomeWeather } from '../hooks/useHomeWeather'
import { cn } from '../utils/cn'
import type { EventWithDetails } from '../hooks/useCalendarEvents'
import EventDetailPanel from '../components/calendar/EventDetailPanel'
import AIAssistantFab from '../components/shared/AIAssistantFab'
import MiniPlayer from '../components/music/MiniPlayer'
import HomeRightPanel from '../components/home/HomeRightPanel'
import { isAllDayReminder, isTimedReminder } from '../utils/holidays'
import SwipeableReminderPill from '../components/shared/SwipeableReminderPill'
import { usePullToRefresh } from '../hooks/usePullToRefresh'
import { WeatherIcon } from '../components/shared/WeatherIcon'

const SHARED_GOLD = '#C9A96E'

function eventColor(ev: EventWithDetails): string {
  if (!ev.members || ev.members.length === 0) return SHARED_GOLD
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
  const { data: weather } = useHomeWeather()
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null)
  const scrollRef = useRef<HTMLElement | null>(null)

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

  // Show tomorrow section always (not just when today is done)

  // Scroll-to-top on mount
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0
  }, [])

  const nextEvent = useMemo(
    () => events.find((e) => isAfter(new Date(e.end_time), now)),
    [events, now],
  )

  const selectedEvent = selectedEventId
    ? (events.find(e => e.id === selectedEventId) ?? tomorrowEvents.find(e => e.id === selectedEventId) ?? reminders.find(e => e.id === selectedEventId) ?? null)
    : null
  const qc = useQueryClient()

  const completeReminder = useCallback(async (id: string) => {
    await supabase.from('events').update({ status: 'cancelled' }).eq('id', id)
    qc.invalidateQueries({ queryKey: ['today-events'] })
  }, [qc])

  const dismissReminder = useCallback(async (id: string) => {
    await supabase.from('events').update({ status: 'cancelled' }).eq('id', id)
    qc.invalidateQueries({ queryKey: ['today-events'] })
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
      supabase.functions.invoke('analyze-conflicts', {})
        .then(() => qc.invalidateQueries({ queryKey: ['conflicts'] }))
        .catch(() => {})
      supabase.functions.invoke('analyze-prep', {})
        .then(() => qc.invalidateQueries({ queryKey: ['prep-items'] }))
        .catch(() => {})
    }
    // Weather is cheap (no LLM) — always run
    supabase.functions.invoke('weather-pending', {})
      .then(() => qc.invalidateQueries({ queryKey: ['events'] }))
      .catch(() => {})
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Pull-to-refresh ──────────────────────────────────────────
  const [pullDistance, setPullDistance] = useState(0)
  const [refreshing,  setRefreshing]   = useState(false)

  const handleRefresh = useCallback(async () => {
    setRefreshing(true)
    try { navigator.vibrate?.(15) } catch (_) {}
    // Pull-to-refresh always runs AI (manual user action) and resets cooldown
    markAIRan()
    await Promise.all([
      supabase.functions.invoke('analyze-conflicts', {}).catch(() => {}),
      supabase.functions.invoke('analyze-prep', {}).catch(() => {}),
      supabase.functions.invoke('weather-pending', {}).catch(() => {}),
    ])
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
    <div className="flex h-full overflow-hidden" onClick={() => setSelectedEventId(null)}>

      {/* ── Center content ─────────────────────────────────── */}
      <div
        ref={(el) => { ptrRef(el); scrollRef.current = el }}
        className="flex-1 min-w-0 overflow-y-auto px-6 pt-8 pb-12 lg:px-8"
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

        {/* ── Greeting + Next Up row — hidden on small screens ─ */}
        <div className="hidden lg:flex items-start gap-4 lg:gap-6 mb-4 lg:mb-5">
          {/* Greeting */}
          <header className="flex-1 min-w-0">
            <motion.h1
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="font-display text-display-xl text-casa-navy leading-none"
            >
              {greetingFor(now)}
            </motion.h1>
            <p className="text-body-lg text-casa-muted mt-2">
              {format(now, 'EEEE, MMMM d')}
            </p>
            {/* Clock/weather — only on mobile; sidebar shows it on tablet */}
            <div className="text-left lg:hidden mt-2">
              <p className="font-display text-display-lg text-casa-navy tabular-nums leading-none">
                {format(now, 'h:mm')}
                <span className="text-casa-muted ml-1 text-display-md">{format(now, 'a')}</span>
              </p>
              <p className="text-body-sm text-casa-muted mt-1 flex items-center gap-1.5">
                <Cloud size={14} className="text-casa-gold" />
                {weather
                  ? `${weather.temp}° · ${weather.condition} · ${weather.city}`
                  : '—'}
              </p>
            </div>
          </header>

          {/* Next Up — compact on desktop, inline with greeting */}
          <div className="hidden lg:block w-[280px] xl:w-[320px] shrink-0 self-center">
            <NextUpCard event={nextEvent} now={now} onClick={(id) => setSelectedEventId(id)} compact />
          </div>
        </div>

        {/* ── Family filter pills — hidden on small screens ──── */}
        <div className="hidden md:flex lg:hidden gap-2 mb-6 flex-wrap">
          {family?.map((m) => {
            const active = visibleMembers.length === 0 || visibleMembers.includes(m.id)
            return (
              <button
                key={m.id}
                onClick={() => toggleMember(m.id)}
                className={cn(
                  'flex items-center gap-2 px-3 py-1.5 rounded-pill border text-body-sm font-medium transition-all',
                  active
                    ? 'bg-casa-surface border-casa-border shadow-card'
                    : 'bg-transparent border-casa-divider text-casa-muted opacity-60',
                )}
              >
                <span
                  className="w-3 h-3 rounded-full transition-opacity"
                  style={{
                    backgroundColor: m.color_hex,
                    opacity: active ? 1 : 0.4,
                  }}
                />
                {m.name}
              </button>
            )
          })}
        </div>

        {/* ── Next-up hero card — mid screens only (desktop shows inline above) */}
        <div className="hidden md:block lg:hidden">
          <NextUpCard event={nextEvent} now={now} onClick={(id) => setSelectedEventId(id)} />
        </div>

        {/* ── Music mini player ─────────────────────────────── */}
        <div className="hidden md:block mt-4 lg:mt-3" onClick={e => e.stopPropagation()}>
          <MiniPlayer />
        </div>

        {/* ── Today's reminders ─────────────────────────────── */}
        {reminders.length > 0 && (
          <section className="mt-4">
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

        {/* ── Today's timeline ──────────────────────────────── */}
        <section className="mt-5">
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
              {events.filter(e => isBefore(new Date(e.end_time), now)).map((ev, i) => (
                <TimelineRow key={ev.id} event={ev} now={now} index={i} onClick={() => setSelectedEventId(ev.id)} />
              ))}

              {/* ── Now line ── */}
              {events.some(e => isAfter(new Date(e.end_time), now)) && (
                <li className="flex items-center gap-3 py-0.5 select-none pointer-events-none" aria-hidden>
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
                <TimelineRow key={ev.id} event={ev} now={now} index={i} onClick={() => setSelectedEventId(ev.id)} />
              ))}
            </ol>
          )}
        </section>

        {/* ── Tomorrow's timeline (shown when today is all done) ── */}
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
                  <TimelineRow key={ev.id} event={ev} now={tomorrow} index={i} onClick={() => setSelectedEventId(ev.id)} />
                ))}
              </ol>
            </motion.section>
          )}
        </AnimatePresence>


        <div onClick={e => e.stopPropagation()}>
          <EventDetailPanel
            event={selectedEvent}
            onClose={() => setSelectedEventId(null)}
          />
        </div>

        {/* ── AI Assistant ──────────────────────────────────── */}
        <AIAssistantFab
          page="home"
          events={events}
          family={family ?? []}
          homeCity={weather?.city}
        />
      </div>

      {/* ── Right panel (tablet only) ──────────────────────── */}
      <HomeRightPanel now={now} allTodayEvents={allTodayEvents ?? []} />
    </div>
  )
}

/* ── Next-up hero card ────────────────────────────────────────── */

function NextUpCard({ event, now, onClick, compact = false }: { event: EventWithDetails | undefined; now: Date; onClick: (id: string) => void; compact?: boolean }) {
  if (!event) {
    return (
      <div className={cn("bg-casa-surface rounded-card border border-casa-border shadow-card", compact ? "p-3" : "p-6")}>
        <p className="text-overline font-body font-semibold text-casa-muted uppercase tracking-wider mb-1">
          Next up
        </p>
        <p className={cn("font-display text-casa-navy", compact ? "text-body-lg" : "text-display-md")}>
          All clear for the day.
        </p>
      </div>
    )
  }

  const start = new Date(event.start_time)
  const end = new Date(event.end_time)
  const happening = isBefore(start, now) && isAfter(end, now)
  const color = eventColor(event)
  const minsUntil = Math.round((start.getTime() - now.getTime()) / 60_000)
  const enr = event.enrichment

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="rounded-card shadow-card overflow-hidden border border-casa-border cursor-pointer hover:shadow-card-hover transition-shadow"
      style={{ backgroundColor: 'var(--color-casa-surface)' }}
      onClick={e => { e.stopPropagation(); onClick(event.id) }}
    >
      <div className="flex">
        <div className="w-1.5" style={{ backgroundColor: color }} />
        <div className={cn("flex-1", compact ? "p-3" : "p-6")}>
          <div className="flex items-center gap-2 mb-0.5">
            <p className="text-overline font-body font-semibold uppercase tracking-wider" style={{ color }}>
              {happening ? 'Now' : minsUntil < 60 ? `In ${minsUntil} min` : 'Next up'}
            </p>
            {event.members && event.members.length > 0 && (
              <div className="flex gap-1">
                {event.members.map((m) => (
                  <span
                    key={m.id}
                    className="w-4 h-4 rounded-full border-2 border-white"
                    style={{ backgroundColor: m.family_member?.color_hex }}
                    title={m.family_member?.name}
                  />
                ))}
              </div>
            )}
          </div>

          <h3 className={cn("font-display text-casa-navy leading-tight", compact ? "text-body-lg font-semibold" : "text-display-md")}>
            {event.title}
          </h3>

          <div className={cn("flex items-center gap-3 mt-2 text-casa-muted flex-wrap", compact ? "text-caption" : "text-body-sm mt-3 gap-4")}>
            <span className="flex items-center gap-1.5">
              <Clock size={compact ? 12 : 14} />
              {format(start, 'h:mm a')} – {format(end, 'h:mm a')}
            </span>
            {event.location_name && (
              <span className="flex items-center gap-1.5">
                <MapPin size={compact ? 12 : 14} />
                {event.location_name}
              </span>
            )}
            {!compact && enr?.weather_summary && (
              <span className="flex items-center gap-1.5">
                <Cloud size={14} />
                {enr.weather_summary}
              </span>
            )}
          </div>

          {!compact && enr?.departure_time && !happening && (
            <div className="mt-4 flex items-center gap-2 px-3 py-2 rounded-button bg-amber-50 border border-amber-200 text-body-sm">
              <AlertTriangle size={14} className="text-casa-warning shrink-0" />
              <span className="text-casa-text">
                Leave by <strong>{format(new Date(enr.departure_time), 'h:mm a')}</strong>
                {enr.drive_time_mins && ` · ${enr.drive_time_mins} min drive`}
              </span>
            </div>
          )}
          {compact && enr?.departure_time && !happening && (
            <div className="mt-2 flex items-center gap-1.5 text-caption text-amber-700">
              <AlertTriangle size={11} className="shrink-0" />
              Leave by <strong>{format(new Date(enr.departure_time), 'h:mm a')}</strong>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  )
}

/* ── Timeline row ─────────────────────────────────────────────── */

function TimelineRow({
  event,
  now,
  index,
  onClick,
}: {
  event: EventWithDetails
  now: Date
  index: number
  onClick: () => void
}) {
  const start = new Date(event.start_time)
  const end = new Date(event.end_time)
  const past = isBefore(end, now)
  const happening = isBefore(start, now) && isAfter(end, now)
  const color = eventColor(event)
  const timed = isTimedReminder(event)

  // Timed reminder — slim amber pill in the timeline
  if (timed) {
    return (
      <motion.li
        initial={{ opacity: 0, x: -8 }}
        animate={{ opacity: past ? 0.4 : 1, x: 0 }}
        transition={{ duration: 0.3, delay: index * 0.04 }}
        className="flex items-center gap-3 cursor-pointer"
        onClick={e => { e.stopPropagation(); onClick() }}
      >
        <div className="w-16 shrink-0 text-right">
          <p className="text-body-sm font-semibold text-casa-navy tabular-nums">
            {format(start, 'h:mm')}
            <span className="text-caption text-casa-muted ml-0.5">{format(start, 'a')}</span>
          </p>
        </div>
        <span className="w-2 rounded-full self-stretch" style={{ backgroundColor: '#C4893A' }} />
        <div
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-semibold"
          style={{ border: '1.5px solid #C4893A', backgroundColor: '#FDFAF4', color: '#7A5520' }}
        >
          <Bell size={13} style={{ color: '#C4893A' }} className="shrink-0" />
          <span>{event.title}</span>
          {event.members.length > 0 && (
            <div className="flex gap-0.5 ml-0.5">
              {event.members.slice(0, 4).map(m => (
                <span
                  key={m.id}
                  className="w-4 h-4 rounded-full text-white text-[8px] flex items-center justify-center font-bold border border-white"
                  style={{ backgroundColor: m.family_member?.color_hex }}
                  title={m.family_member?.name}
                >
                  {m.family_member?.name?.[0]}
                </span>
              ))}
            </div>
          )}
        </div>
      </motion.li>
    )
  }

  return (
    <motion.li
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: past ? 0.45 : 1, x: 0 }}
      transition={{ duration: 0.3, delay: index * 0.04 }}
      className="flex items-center gap-3 cursor-pointer"
      onClick={e => { e.stopPropagation(); onClick() }}
    >
      <div className="w-16 shrink-0 text-right">
        <p className="text-body-sm font-semibold text-casa-navy tabular-nums">
          {format(start, 'h:mm')}
          <span className="text-caption text-casa-muted ml-0.5">{format(start, 'a')}</span>
        </p>
      </div>
      <span
        className={cn('w-2 rounded-full self-stretch', happening && 'animate-pulse-gold')}
        style={{ backgroundColor: color }}
      />
      <div className="flex-1 min-w-0 bg-casa-surface rounded-card border border-casa-border px-4 py-3 shadow-card">
        {/* Row 1: title + members */}
        <div className="flex items-center justify-between gap-3">
          {(() => {
            // Strip "OwnerName | " prefix from title if it matches the primary member
            const primary = event.members?.find(m => m.role === 'primary')
            const others = event.members?.filter(m => m.role !== 'primary') ?? []
            const ownerName = primary?.family_member?.name ?? ''
            const pipeIdx = event.title.indexOf(' | ')
            const cleanTitle = pipeIdx !== -1 ? event.title.slice(pipeIdx + 3) : event.title

            return (
              <>
                <p className="font-body font-semibold text-casa-navy truncate">{cleanTitle}</p>
                {event.members && event.members.length > 0 && (
                  <div className="flex items-center gap-1 shrink-0">
                    {/* Owner as full pill */}
                    {primary && (
                      <span
                        className="px-2 py-0.5 rounded-full text-white text-[10px] font-bold leading-none whitespace-nowrap"
                        style={{ backgroundColor: primary.family_member?.color_hex ?? '#888' }}
                        title={ownerName}
                      >
                        {ownerName}
                      </span>
                    )}
                    {/* Other attendees as initials */}
                    {others.slice(0, 3).map((m) => (
                      <span
                        key={m.id}
                        className="w-5 h-5 rounded-full text-white text-[9px] font-bold flex items-center justify-center border-2 border-white"
                        style={{ backgroundColor: m.family_member?.color_hex }}
                        title={m.family_member?.name}
                      >
                        {m.family_member?.name?.[0]}
                      </span>
                    ))}
                  </div>
                )}
              </>
            )
          })()}
        </div>

        {/* Row 2: time range + location */}
        <div className="flex items-center flex-wrap gap-x-3 gap-y-0.5 mt-1">
          <span className="flex items-center gap-1 text-caption text-casa-muted tabular-nums">
            <Clock size={11} className="shrink-0" />
            {format(start, 'h:mm a')} – {format(end, 'h:mm a')}
            {event.location_name && (
              <WeatherIcon condition={event.enrichment?.weather_at_event} size={12} />
            )}
          </span>
          {event.location_name && (
            <span className="flex items-center gap-1 text-caption text-casa-muted truncate max-w-[180px]">
              <MapPin size={11} className="shrink-0 text-casa-error" />
              {event.location_name}
            </span>
          )}
        </div>

        {/* Row 3: departure alert or prep note */}
        {event.enrichment?.departure_time && !happening && (
          <div className="flex items-center gap-1 mt-1.5 text-caption font-semibold text-amber-700">
            <Navigation size={11} className="shrink-0" />
            Leave by {format(new Date(event.enrichment.departure_time), 'h:mm a')}
            {event.enrichment.drive_time_mins && ` · ${event.enrichment.drive_time_mins} min`}
          </div>
        )}
        {!event.enrichment?.departure_time && event.enrichment?.prep_notes && (
          <p className="text-caption text-casa-muted mt-1 line-clamp-1">{event.enrichment.prep_notes}</p>
        )}
      </div>
    </motion.li>
  )
}
