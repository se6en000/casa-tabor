/**
 * TABLET LAYOUT PROTOTYPE — /prototype
 * Wider sidebar (288px) + wider right panel (360px)
 * Click event row to expand details. Double-click to open edit modal.
 */

import { useMemo, useState, useRef } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { format, isAfter, isBefore, differenceInMinutes, addMinutes } from 'date-fns'
import {
  Home, Calendar, Sun, Music, Settings, Bell, Sparkles,
  Cloud, MapPin, ChevronRight, AlertTriangle, Clock,
  LayoutGrid, X, ChevronDown, Edit3, Tag, Car,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useFamilyMembers } from '../hooks/useFamilyMembers'
import { useTodayEvents } from '../hooks/useCalendarEvents'
import { useLiveClock, greetingFor } from '../hooks/useLiveClock'
import { useCalendarStore } from '../stores/calendarStore'
import { useHomeWeather } from '../hooks/useHomeWeather'
import { useNotifications } from '../hooks/useNotifications'
import { cn } from '../utils/cn'
import type { EventWithDetails } from '../hooks/useCalendarEvents'

const SHARED_GOLD = '#C9A96E'
function memberColor(ev: EventWithDetails) {
  if (!ev.members || ev.members.length === 0) return SHARED_GOLD
  return ev.members[0].family_member?.color_hex ?? SHARED_GOLD
}

const NAV = [
  { label: 'Home',     icon: Home,     to: '/' },
  { label: 'Calendar', icon: Calendar, to: '/calendar' },
  { label: 'Briefing', icon: Sun,      to: '/briefing' },
  { label: 'Music',    icon: Music,    to: '/music' },
  { label: 'Settings', icon: Settings, to: '/settings' },
]

export default function TabletPrototypePage() {
  const now = useLiveClock(15_000)
  const { data: family } = useFamilyMembers()
  const { data: allEvents } = useTodayEvents(now)
  const { visibleMembers, toggleMember } = useCalendarStore()
  const { data: weather } = useHomeWeather()
  const { notifications, unreadCount } = useNotifications()
  const [bannerDismissed, setBannerDismissed] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [editingEvent, setEditingEvent] = useState<EventWithDetails | null>(null)

  const events = useMemo<EventWithDetails[]>(() => {
    if (!allEvents) return []
    if (visibleMembers.length === 0) return allEvents
    return allEvents.filter(ev =>
      ev.members?.some(m => visibleMembers.includes(m.family_member.id))
    )
  }, [allEvents, visibleMembers])

  const nextEvent = useMemo(() => events.find(e => isAfter(new Date(e.end_time), now)), [events, now])
  const minsToNext = nextEvent ? differenceInMinutes(new Date(nextEvent.start_time), now) : null
  const upcomingEvents = events.filter(e => isAfter(new Date(e.end_time), now))
  const pastEvents = events.filter(e => !isAfter(new Date(e.end_time), now))

  // Who's home: infer status per family member from their events right now
  const whoStatus = useMemo(() => {
    if (!family || !allEvents) return []
    return family.map(m => {
      const memberEvents = allEvents.filter(e => e.members?.some(em => em.family_member.id === m.id))
      const activeNow = memberEvents.find(e =>
        isBefore(new Date(e.start_time), now) && isAfter(new Date(e.end_time), now)
      )
      const nextUp = memberEvents
        .filter(e => isAfter(new Date(e.start_time), now))
        .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())[0]
      return { member: m, activeNow, nextUp }
    })
  }, [family, allEvents, now])

  return (
    <div className="fixed inset-0 bg-casa-bg flex flex-col overflow-hidden font-body text-casa-text">

      {/* Prototype banner */}
      {!bannerDismissed && (
        <div className="bg-casa-navy text-white text-caption flex items-center justify-between px-5 py-2 flex-shrink-0 z-50">
          <span className="flex items-center gap-2">
            <LayoutGrid size={13} />
            <strong>PROTOTYPE</strong> — Tablet layout mockup. Click events to expand · Double-click to edit.
            <Link to="/" className="underline ml-3 opacity-60 hover:opacity-100">← Back to real app</Link>
          </span>
          <button onClick={() => setBannerDismissed(true)} className="opacity-60 hover:opacity-100 ml-4"><X size={14} /></button>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">

        {/* ══ SIDEBAR (288px) ══════════════════════════════════════ */}
        <aside className="w-72 flex-shrink-0 bg-casa-surface border-r border-casa-border flex flex-col h-full overflow-y-auto">

          {/* Brand + clock */}
          <div className="px-7 pt-8 pb-6 border-b border-casa-border">
            <div className="font-display text-display-md text-casa-navy leading-none">Casa Tabor</div>
            <div className="font-mono text-display-lg text-casa-navy mt-2 tabular-nums leading-none">
              {format(now, 'h:mm')}
              <span className="text-heading ml-1.5 text-casa-muted">{format(now, 'a')}</span>
            </div>
            <div className="text-caption text-casa-muted mt-1">{format(now, 'EEEE, MMMM d')}</div>
            {weather && (
              <div className="flex items-center gap-1.5 text-caption text-casa-muted mt-2">
                <Cloud size={12} />
                <span>{weather.temp}° · {weather.condition}</span>
              </div>
            )}
          </div>

          {/* Family — filter + who's home merged */}
          <div className="px-4 py-5 border-b border-casa-border">
            <p className="text-caption text-casa-muted uppercase tracking-wider mb-3 px-3">Family</p>
            <div className="flex flex-col gap-0.5">
              {family?.map(m => {
                const active = visibleMembers.length === 0 || visibleMembers.includes(m.id)
                const status = whoStatus.find(s => s.member.id === m.id)
                const busy = !!status?.activeNow
                const statusLabel = status?.activeNow
                  ? status.activeNow.location_name
                    ? `Out · ${status.activeNow.location_name.split(' ').slice(0, 3).join(' ')}`
                    : `Busy until ${format(new Date(status.activeNow.end_time), 'h:mm a')}`
                  : status?.nextUp
                    ? `Free · next ${format(new Date(status.nextUp.start_time), 'h:mm a')}`
                    : 'Free'

                return (
                  <button
                    key={m.id}
                    onClick={() => toggleMember(m.id)}
                    className={cn(
                      'flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-left w-full',
                      active ? 'bg-casa-bg' : 'opacity-35 hover:opacity-60',
                    )}
                  >
                    {/* Avatar */}
                    <span className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-[11px] font-bold text-white"
                      style={{ backgroundColor: m.color_hex }}>
                      {m.name[0]}
                    </span>
                    {/* Name + status */}
                    <div className="flex-1 min-w-0">
                      <p className={cn('text-body font-medium leading-tight', active ? 'text-casa-navy' : 'text-casa-muted')}>
                        {m.name}
                      </p>
                      <p className="text-caption text-casa-muted truncate leading-tight mt-0.5">
                        {statusLabel}
                      </p>
                    </div>
                    {/* Presence dot */}
                    <span className={cn(
                      'w-2.5 h-2.5 rounded-full flex-shrink-0',
                      !active ? 'bg-casa-muted/30' : busy ? 'bg-amber-400' : 'bg-emerald-400'
                    )} />
                  </button>
                )
              })}
            </div>
          </div>

          {/* Nav */}
          <nav className="flex-1 px-4 py-4 flex flex-col gap-0.5">
            {NAV.map(({ to, icon: Icon, label }) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/'}
                className={({ isActive }) => cn(
                  'flex items-center gap-3 px-4 py-3.5 rounded-xl transition-colors text-body font-medium',
                  isActive ? 'bg-casa-navy text-white' : 'text-casa-muted hover:text-casa-navy hover:bg-casa-bg',
                )}
              >
                {({ isActive }) => <><Icon size={19} strokeWidth={isActive ? 2 : 1.8} />{label}</>}
              </NavLink>
            ))}
          </nav>

          {/* AI + notifications */}
          <div className="px-4 pb-8 pt-4 border-t border-casa-border flex flex-col gap-2">
            <button className="flex items-center gap-3 px-4 py-3.5 rounded-xl bg-casa-gold/10 hover:bg-casa-gold/20 text-casa-gold transition-colors text-body font-medium">
              <Sparkles size={19} strokeWidth={1.8} /> Ask AI
            </button>
            <button className="flex items-center gap-3 px-4 py-3.5 rounded-xl text-casa-muted hover:text-casa-navy hover:bg-casa-bg transition-colors text-body font-medium">
              <Bell size={19} strokeWidth={1.8} /> Activity
              {unreadCount > 0 && (
                <span className="ml-auto text-caption font-bold bg-red-500 text-white rounded-full min-w-[20px] h-5 px-1.5 flex items-center justify-center">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>
          </div>
        </aside>

        {/* ══ MAIN CENTER ══════════════════════════════════════════ */}
        <main className="flex-1 flex flex-col h-full overflow-hidden min-w-0">

          {/* Greeting */}
          <div className="px-8 pt-8 pb-5 flex items-start justify-between flex-shrink-0 border-b border-casa-border">
            <div>
              <h1 className="font-display text-display-lg text-casa-navy leading-none">{greetingFor(now)}</h1>
              <p className="text-body text-casa-muted mt-1">{format(now, 'EEEE, MMMM d')}</p>
            </div>
          </div>

          {/* NEXT UP */}
          {nextEvent && (
            <div className="mx-8 mt-5 mb-2 flex-shrink-0">
              <div className="bg-casa-navy text-white rounded-2xl p-5 shadow-modal">
                <div className="flex items-center gap-2 mb-3 opacity-70">
                  <span className="w-2 h-2 rounded-full bg-casa-gold animate-pulse" />
                  <span className="text-caption uppercase tracking-widest">Next Up</span>
                  {minsToNext !== null && minsToNext > 0 && (
                    <span className="ml-auto text-caption bg-white/10 rounded-full px-3 py-1">in {minsToNext} min</span>
                  )}
                </div>
                <div className="font-display text-display-md leading-tight mb-2">{nextEvent.title}</div>
                <div className="flex items-center gap-5 text-body-sm opacity-80 flex-wrap">
                  <span className="flex items-center gap-1.5"><Clock size={13} />{format(new Date(nextEvent.start_time), 'h:mm a')} – {format(new Date(nextEvent.end_time), 'h:mm a')}</span>
                  {nextEvent.location_name && <span className="flex items-center gap-1.5"><MapPin size={13} />{nextEvent.location_name}</span>}
                </div>
              </div>
            </div>
          )}

          {/* Today timeline */}
          <div className="flex-1 overflow-y-auto px-8 py-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-heading font-display text-casa-navy">Today</h2>
              <Link to="/calendar" className="text-caption text-casa-muted hover:text-casa-gold flex items-center gap-1">Full calendar <ChevronRight size={13} /></Link>
            </div>
            <div className="space-y-2">
              {pastEvents.map(ev => (
                <EventRow key={ev.id} ev={ev} dim now={now}
                  expanded={expandedId === ev.id}
                  onClick={() => setExpandedId(expandedId === ev.id ? null : ev.id)}
                  onDoubleClick={() => setEditingEvent(ev)}
                />
              ))}

              {/* ── NOW LINE ── */}
              {events.length > 0 && (
                <div className="flex items-center gap-3 py-1 select-none">
                  <span className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0 shadow-[0_0_6px_rgba(239,68,68,0.6)] animate-pulse" />
                  <div className="flex-1 h-px bg-red-400/60" />
                  <span className="text-caption font-bold text-red-500 tabular-nums flex-shrink-0">
                    {format(now, 'h:mm a')}
                  </span>
                  <div className="flex-1 h-px bg-red-400/60" />
                </div>
              )}

              {upcomingEvents.map(ev => (
                <EventRow key={ev.id} ev={ev} now={now}
                  expanded={expandedId === ev.id}
                  onClick={() => setExpandedId(expandedId === ev.id ? null : ev.id)}
                  onDoubleClick={() => setEditingEvent(ev)}
                />
              ))}
              {events.length === 0 && (
                <div className="py-16 text-center text-casa-muted text-body">No events today</div>
              )}
            </div>
          </div>
        </main>

        {/* ══ RIGHT PANEL (360px) ══════════════════════════════════ */}
        <aside className="w-[360px] flex-shrink-0 border-l border-casa-border bg-casa-surface flex flex-col h-full overflow-y-auto">

          {/* Week strip */}
          <div className="px-6 pt-6 pb-5 border-b border-casa-border">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-body font-medium text-casa-navy">This Week</h3>
              <Link to="/calendar" className="text-caption text-casa-gold hover:brightness-110">See all</Link>
            </div>
            <WeekStrip now={now} events={allEvents ?? []} />
          </div>

          {/* Alerts */}
          <div className="px-6 py-5 border-b border-casa-border">
            <div className="flex items-center gap-2 text-body font-medium text-casa-navy mb-3">
              <AlertTriangle size={15} className="text-amber-500" /> Alerts
            </div>
            <div className="text-caption text-casa-muted bg-amber-50 rounded-xl px-4 py-3">
              No conflicts today 🎉
            </div>
          </div>

          {/* Recent notifications */}
          <div className="px-6 py-5 border-b border-casa-border">
            <h3 className="text-body font-medium text-casa-navy mb-3">Recent Activity</h3>
            {notifications.slice(0, 5).length === 0 ? (
              <p className="text-caption text-casa-muted">No recent activity</p>
            ) : (
              <div className="space-y-0">
                {notifications.slice(0, 5).map(n => (
                  <div key={n.id} className="text-caption py-2.5 border-b border-casa-divider last:border-0">
                    <span className={cn('font-medium', !n.read ? 'text-casa-navy' : 'text-casa-muted')}>{n.title}</span>
                    <span className="block text-casa-muted opacity-70 mt-0.5">{format(new Date(n.created_at), 'h:mm a')}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Briefing */}
          <div className="px-6 py-5">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-body font-medium text-casa-navy">Daily Briefing</h3>
              <Link to="/briefing" className="text-caption text-casa-gold">Read →</Link>
            </div>
            <p className="text-caption text-casa-muted italic leading-relaxed">
              {events.length} events scheduled today.
              {weather ? ` ${weather.temp}° and ${weather.condition?.toLowerCase()} in West Palm Beach.` : ''}
            </p>
          </div>
        </aside>
      </div>

      {/* Edit modal */}
      <AnimatePresence>
        {editingEvent && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/30 z-50" onClick={() => setEditingEvent(null)} />
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 12 }}
              className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none"
            >
              <div className="bg-casa-surface rounded-2xl shadow-modal p-7 w-[min(520px,90vw)] pointer-events-auto">
                <div className="flex items-start justify-between mb-5">
                  <h2 className="font-display text-display-md text-casa-navy leading-tight pr-4">{editingEvent.title}</h2>
                  <button onClick={() => setEditingEvent(null)} className="text-casa-muted hover:text-casa-navy flex-shrink-0">
                    <X size={20} />
                  </button>
                </div>
                <div className="space-y-3 text-body text-casa-muted">
                  <div className="flex items-center gap-2.5">
                    <Clock size={16} className="text-casa-gold flex-shrink-0" />
                    <span>{format(new Date(editingEvent.start_time), 'EEEE, MMMM d · h:mm a')} – {format(new Date(editingEvent.end_time), 'h:mm a')}</span>
                  </div>
                  {editingEvent.location_name && (
                    <div className="flex items-center gap-2.5">
                      <MapPin size={16} className="text-casa-gold flex-shrink-0" />
                      <span>{editingEvent.location_name}</span>
                    </div>
                  )}
                  {editingEvent.description && (
                    <div className="flex items-start gap-2.5">
                      <Tag size={16} className="text-casa-gold flex-shrink-0 mt-0.5" />
                      <span className="text-body-sm leading-relaxed">{editingEvent.description}</span>
                    </div>
                  )}
                  {editingEvent.members && editingEvent.members.length > 0 && (
                    <div className="flex items-center gap-2.5 pt-1">
                      <div className="flex -space-x-1.5">
                        {editingEvent.members.map(m => (
                          <span key={m.family_member.id}
                            className="w-7 h-7 rounded-full border-2 border-white flex items-center justify-center text-[10px] font-bold text-white"
                            style={{ backgroundColor: m.family_member.color_hex }}>
                            {m.family_member.name[0]}
                          </span>
                        ))}
                      </div>
                      <span className="text-body-sm">{editingEvent.members.map(m => m.family_member.name).join(', ')}</span>
                    </div>
                  )}
                </div>
                <div className="mt-6 pt-5 border-t border-casa-border flex items-center gap-3">
                  <button className="flex items-center gap-2 px-5 py-2.5 bg-casa-navy text-white rounded-xl text-body font-medium hover:brightness-110 transition-all">
                    <Edit3 size={15} /> Edit Event
                  </button>
                  <button onClick={() => setEditingEvent(null)} className="px-5 py-2.5 text-casa-muted rounded-xl text-body hover:bg-casa-bg transition-colors">
                    Close
                  </button>
                  <p className="ml-auto text-caption text-casa-muted italic">Prototype — edit not wired yet</p>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}

/* ── EventRow ────────────────────────────────────────────────── */
function EventRow({ ev, dim, expanded, now, onClick, onDoubleClick }: {
  ev: EventWithDetails
  dim?: boolean
  expanded: boolean
  now: Date
  onClick: () => void
  onDoubleClick: () => void
}) {
  const color = memberColor(ev)
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Leave-by: if event has a location and starts in future, suggest leaving 15 min early
  const TRAVEL_MINS = 15
  const leaveBy = ev.location_name && isAfter(new Date(ev.start_time), now)
    ? addMinutes(new Date(ev.start_time), -TRAVEL_MINS)
    : null
  const minsUntilLeave = leaveBy ? differenceInMinutes(leaveBy, now) : null
  const showLeaveAlert = leaveBy && minsUntilLeave !== null && minsUntilLeave >= 0 && minsUntilLeave <= 45

  function handleClick() {
    if (clickTimer.current) {
      clearTimeout(clickTimer.current)
      clickTimer.current = null
      onDoubleClick()
    } else {
      clickTimer.current = setTimeout(() => {
        clickTimer.current = null
        onClick()
      }, 250)
    }
  }

  return (
    <div
      onClick={handleClick}
      className={cn(
        'rounded-xl bg-casa-surface border border-casa-border transition-all cursor-pointer select-none overflow-hidden',
        dim ? 'opacity-35 hover:opacity-55' : 'hover:shadow-card-hover',
        expanded && 'shadow-card-hover ring-1 ring-casa-gold/30',
      )}
    >
      {/* Row */}
      <div className="flex items-center gap-4 px-5 py-4">
        <div className="w-1 h-10 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
        <div className="w-20 text-caption text-casa-muted text-right flex-shrink-0 tabular-nums leading-tight">
          <div>{format(new Date(ev.start_time), 'h:mm')}</div>
          <div className="opacity-60">{format(new Date(ev.start_time), 'a')}</div>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-body font-medium text-casa-navy truncate">{ev.title}</p>
          {ev.location_name && (
            <p className="text-caption text-casa-muted truncate mt-0.5">{ev.location_name}</p>
          )}
        </div>
        <div className="flex -space-x-1.5 mr-2">
          {ev.members?.slice(0, 3).map(m => (
            <span key={m.family_member.id}
              className="w-7 h-7 rounded-full border-2 border-white flex items-center justify-center text-[10px] font-bold text-white"
              style={{ backgroundColor: m.family_member.color_hex }}>
              {m.family_member.name[0]}
            </span>
          ))}
        </div>
        <ChevronDown size={16} className={cn('text-casa-muted transition-transform flex-shrink-0', expanded && 'rotate-180')} />
      </div>

      {/* Expanded detail */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-5 pb-4 pt-1 border-t border-casa-border/50 space-y-2 text-body-sm text-casa-muted">
              {/* Leave-by alert */}
              {showLeaveAlert && leaveBy && (
                <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-amber-800">
                  <Car size={13} className="flex-shrink-0 text-amber-600" />
                  <span className="font-medium">
                    Leave by {format(leaveBy, 'h:mm a')}
                  </span>
                  <span className="opacity-70">
                    · {minsUntilLeave === 0 ? 'now!' : `in ${minsUntilLeave} min`} · ~{TRAVEL_MINS} min drive
                  </span>
                </div>
              )}
              <div className="flex items-center gap-2">
                <Clock size={13} className="text-casa-gold flex-shrink-0" />
                <span>{format(new Date(ev.start_time), 'h:mm a')} – {format(new Date(ev.end_time), 'h:mm a')}</span>
              </div>
              {ev.location_name && (
                <div className="flex items-center gap-2">
                  <MapPin size={13} className="text-casa-gold flex-shrink-0" />
                  <span>{ev.location_name}{ev.address ? ` · ${ev.address}` : ''}</span>
                </div>
              )}
              {ev.description && (
                <p className="text-caption leading-relaxed pl-5">{ev.description}</p>
              )}
              {ev.members && ev.members.length > 0 && (
                <div className="flex items-center gap-2 pl-5">
                  <span className="text-caption">{ev.members.map(m => m.family_member.name).join(', ')}</span>
                </div>
              )}
              <p className="text-caption text-casa-muted/50 pl-5 pt-1 italic">Double-tap to edit</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/* ── WeekStrip ───────────────────────────────────────────────── */
function WeekStrip({ now, events }: { now: Date; events: EventWithDetails[] }) {
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now)
    d.setDate(d.getDate() - now.getDay() + i)
    return d
  })
  return (
    <div className="flex gap-1.5">
      {days.map((d, i) => {
        const isToday = d.toDateString() === now.toDateString()
        const count = events.filter(e => new Date(e.start_time).toDateString() === d.toDateString()).length
        return (
          <div key={i} className={cn(
            'flex-1 flex flex-col items-center py-2.5 rounded-xl text-center transition-colors cursor-pointer',
            isToday ? 'bg-casa-navy text-white' : 'hover:bg-casa-bg text-casa-muted',
          )}>
            <span className="text-caption uppercase tracking-wider opacity-70">{format(d, 'EEE')[0]}</span>
            <span className={cn('text-body font-medium mt-1', isToday ? 'text-white' : 'text-casa-navy')}>{format(d, 'd')}</span>
            {count > 0
              ? <span className={cn('text-[10px] font-bold mt-1', isToday ? 'text-casa-gold' : 'text-casa-muted')}>{count}</span>
              : <span className="h-3 mt-1" />
            }
          </div>
        )
      })}
    </div>
  )
}
