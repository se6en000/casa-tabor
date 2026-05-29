import { useMemo, useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { format, isAfter, isBefore } from 'date-fns'
import { motion } from 'framer-motion'
import { Cloud, MapPin, Clock, ChevronRight, AlertTriangle } from 'lucide-react'
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
import PrepAlertsSection from '../components/shared/PrepAlertsSection'
import ConflictAlertsSection from '../components/shared/ConflictAlertsSection'
import MiniPlayer from '../components/music/MiniPlayer'
import HomeRightPanel from '../components/home/HomeRightPanel'

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
  const { visibleMembers, toggleMember } = useCalendarStore()
  const { data: weather } = useHomeWeather()
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null)

  const events = useMemo<EventWithDetails[]>(() => {
    if (!allTodayEvents) return []
    if (visibleMembers.length === 0) return allTodayEvents
    return allTodayEvents.filter((ev) =>
      ev.members?.some((m) => visibleMembers.includes(m.family_member.id)),
    )
  }, [allTodayEvents, visibleMembers])

  const nextEvent = useMemo(
    () => events.find((e) => isAfter(new Date(e.end_time), now)),
    [events, now],
  )

  const selectedEvent = selectedEventId ? (events.find(e => e.id === selectedEventId) ?? null) : null
  const qc = useQueryClient()

  // Trigger conflict + prep analysis on mount; invalidate queries when done so UI updates
  useEffect(() => {
    supabase.functions.invoke('analyze-conflicts', {})
      .then(() => qc.invalidateQueries({ queryKey: ['conflicts'] }))
      .catch(() => {})
    supabase.functions.invoke('analyze-prep', {})
      .then(() => qc.invalidateQueries({ queryKey: ['prep-items'] }))
      .catch(() => {})
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    // lg: side-by-side with right panel. Mobile: single column.
    <div className="flex lg:h-[calc(100vh)] lg:overflow-hidden" onClick={() => setSelectedEventId(null)}>

      {/* ── Center content ─────────────────────────────────── */}
      <div className="flex-1 min-w-0 overflow-y-auto px-6 pt-8 pb-12 lg:px-8">

        {/* ── Greeting + live clock ─────────────────────────── */}
        <header className="flex items-end justify-between mb-8">
          <div>
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
          </div>
          {/* Clock/weather — only on mobile; sidebar shows it on tablet */}
          <div className="text-right lg:hidden">
            <p className="font-display text-display-lg text-casa-navy tabular-nums leading-none">
              {format(now, 'h:mm')}
              <span className="text-casa-muted ml-1 text-display-md">{format(now, 'a')}</span>
            </p>
            <p className="text-body-sm text-casa-muted mt-1 flex items-center justify-end gap-1.5">
              <Cloud size={14} className="text-casa-gold" />
              {weather
                ? `${weather.temp}° · ${weather.condition} · ${weather.city}`
                : '—'}
            </p>
          </div>
        </header>

        {/* ── Family filter pills — mobile only ─────────────── */}
        <div className="lg:hidden flex gap-2 mb-6 flex-wrap">
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

        {/* ── Next-up hero card ─────────────────────────────── */}
        <NextUpCard event={nextEvent} now={now} onClick={(id) => setSelectedEventId(id)} />

        {/* ── Conflict alerts ───────────────────────────────── */}
        <ConflictAlertsSection className="mt-4" />

        {/* ── Prep & Readiness alerts ───────────────────────── */}
        <PrepAlertsSection className="mt-3" />

        {/* ── Music mini player ─────────────────────────────── */}
        <div className="mt-6" onClick={e => e.stopPropagation()}>
          <MiniPlayer />
        </div>

        {/* ── Today's timeline ──────────────────────────────── */}
        <section className="mt-8">
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

        {/* ── Event detail panel ────────────────────────────── */}
        <EventDetailPanel
          event={selectedEvent}
          onClose={() => setSelectedEventId(null)}
        />

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

function NextUpCard({ event, now, onClick }: { event: EventWithDetails | undefined; now: Date; onClick: (id: string) => void }) {
  if (!event) {
    return (
      <div className="bg-casa-surface rounded-card border border-casa-border p-6 shadow-card">
        <p className="text-overline font-body font-semibold text-casa-muted uppercase tracking-wider mb-1">
          Next up
        </p>
        <p className="font-display text-display-md text-casa-navy">
          You're all clear for the rest of the day.
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
        <div className="flex-1 p-6">
          <div className="flex items-center gap-2 mb-1">
            <p className="text-overline font-body font-semibold uppercase tracking-wider" style={{ color }}>
              {happening ? 'Happening now' : minsUntil < 60 ? `In ${minsUntil} min` : 'Next up'}
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

          <h3 className="font-display text-display-md text-casa-navy leading-tight">
            {event.title}
          </h3>

          <div className="flex items-center gap-4 mt-3 text-body-sm text-casa-muted flex-wrap">
            <span className="flex items-center gap-1.5">
              <Clock size={14} />
              {format(start, 'h:mm a')} – {format(end, 'h:mm a')}
            </span>
            {event.location_name && (
              <span className="flex items-center gap-1.5">
                <MapPin size={14} />
                {event.location_name}
              </span>
            )}
            {enr?.weather_summary && (
              <span className="flex items-center gap-1.5">
                <Cloud size={14} />
                {enr.weather_summary}
              </span>
            )}
          </div>

          {enr?.departure_time && !happening && (
            <div className="mt-4 flex items-center gap-2 px-3 py-2 rounded-button bg-amber-50 border border-amber-200 text-body-sm">
              <AlertTriangle size={14} className="text-casa-warning shrink-0" />
              <span className="text-casa-text">
                Leave by <strong>{format(new Date(enr.departure_time), 'h:mm a')}</strong>
                {enr.drive_time_mins && ` · ${enr.drive_time_mins} min drive`}
              </span>
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
      <div className="flex-1 min-w-0 bg-casa-surface rounded-card border border-casa-border px-4 py-2.5 shadow-card">
        <div className="flex items-center justify-between gap-3">
          <p className="font-body font-semibold text-casa-navy truncate">
            {event.title}
          </p>
          {event.members && event.members.length > 0 && (
            <div className="flex gap-1 shrink-0">
              {event.members.slice(0, 4).map((m) => (
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
        </div>
        {event.location_name && (
          <p className="text-caption text-casa-muted truncate mt-0.5">
            {event.location_name}
          </p>
        )}
      </div>
    </motion.li>
  )
}
