import { useState, useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { format, isAfter, isBefore, addDays, differenceInMinutes } from 'date-fns'
import {
  Clock,
  MapPin,
  Navigation,
  ChefHat,
  Zap,
  AlertCircle,
  ChevronRight,
  CheckCircle2,
} from 'lucide-react'
import { useRollingEvents } from '../../hooks/useCalendarEvents'
import { getEventStartDate, getEventEndDate, eventOverlapsDay } from '../../utils/eventTime'
import { useWeekConflicts } from '../../hooks/useConflicts'
import { usePrepItems } from '../../hooks/usePrepItems'
import { useTravelEta } from '../../hooks/useTravelEta'
import { useAppStore } from '../../stores/appStore'
import { useLiveClock } from '../../hooks/useLiveClock'
import { inferEventMode, inferEventPlanKind } from '../../lib/eventCommandCenter'
import { isReminderOrChore } from '../../lib/heroFocus.mjs'
import { openEventDetails } from '../../utils/openEventDetails'
import { Button } from '../ui'

interface MobileTodayViewProps {
  onOpenQuickCreate?: () => void
}

export default function MobileTodayView({ onOpenQuickCreate: _onOpenQuickCreate }: MobileTodayViewProps) {
  const navigate = useNavigate()
  const now = useLiveClock(30_000)
  const tomorrow = useMemo(() => addDays(now, 1), [now])
  const { data: rollingEvents = [] } = useRollingEvents(now)
  const { data: conflicts = [] } = useWeekConflicts()
  const { data: prepItems = [] } = usePrepItems()
  const dinnerPlan = useAppStore((s) => s.dinnerPlan)

  const [snoozedEventMinutes, setSnoozedEventMinutes] = useState<number | null>(null)

  // Filter Today & Tomorrow Events (Excluding chores and reminders from hero candidates)
  const todayEvents = useMemo(() => {
    return rollingEvents
      .filter((ev) => eventOverlapsDay(ev, now) && !isReminderOrChore(ev))
      .sort((a, b) => getEventStartDate(a).getTime() - getEventStartDate(b).getTime())
  }, [rollingEvents, now])

  const tomorrowEvents = useMemo(() => {
    return rollingEvents
      .filter((ev) => eventOverlapsDay(ev, tomorrow) && !isReminderOrChore(ev))
      .sort((a, b) => getEventStartDate(a).getTime() - getEventStartDate(b).getTime())
  }, [rollingEvents, tomorrow])

  // Active / Next Hero Event
  const activeEvent = useMemo(() => {
    return todayEvents.find((ev) => {
      const start = getEventStartDate(ev)
      const end = getEventEndDate(ev)
      return isBefore(start, now) && isAfter(end, now)
    }) ?? null
  }, [todayEvents, now])

  const nextUpcomingEvent = useMemo(() => {
    return todayEvents.find((ev) => isAfter(getEventStartDate(ev), now)) ?? null
  }, [todayEvents, now])

  const heroEvent = activeEvent ?? nextUpcomingEvent ?? tomorrowEvents[0] ?? null
  const isHeroActive = Boolean(activeEvent)
  const isHeroTomorrow = !activeEvent && !nextUpcomingEvent && Boolean(tomorrowEvents[0])

  // Hero Travel Classification & ETA Calculation
  const isHeroTravel = useMemo(() => {
    if (!heroEvent || heroEvent.all_day || heroEvent.event_type === 'reminder') return false
    const mode = inferEventMode(heroEvent)
    const kind = inferEventPlanKind(heroEvent, mode)
    if (kind !== 'travel') return false
    const loc = (heroEvent.location_name || '').trim().toLowerCase()
    if (loc === 'home' || loc.includes('at home')) return false
    return Boolean(
      (heroEvent.address && heroEvent.address.trim().length > 0) ||
      (heroEvent.location_name && heroEvent.location_name.trim().length > 0)
    )
  }, [heroEvent])

  const heroDestination = isHeroTravel ? (heroEvent?.address ?? heroEvent?.location_name ?? null) : null
  const heroTravelEta = useTravelEta({
    destination: heroDestination,
    eventStartIso: heroEvent?.start_time ?? null,
    enabled: Boolean(heroEvent && heroDestination && isHeroTravel),
    bufferMins: 5,
  })

  // Derive driver & responsible member
  const heroDriver = useMemo(() => {
    if (!heroEvent || !isHeroTravel) return null
    const driverMember = heroEvent.members?.find((m) => m.role === 'driver' || m.role === 'primary')?.family_member
      ?? heroEvent.members?.[0]?.family_member
    return driverMember?.name ?? null
  }, [heroEvent, isHeroTravel])

  // Triage / Needs You Items
  const activeConflicts = useMemo(() => {
    return conflicts.filter((c) => !c.resolved)
  }, [conflicts])

  const activePrep = useMemo(() => {
    return prepItems.filter((p) => !p.dismissed)
  }, [prepItems])

  const totalTriageCount = activeConflicts.length + activePrep.length

  // Google Maps Directions link
  const openDirections = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (heroDestination) {
      window.open(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(heroDestination)}`, '_blank')
    }
  }

  return (
    <div className="w-full flex flex-col gap-4 px-4 pt-3 pb-32 overflow-y-auto overscroll-contain">
      
      {/* ══════════════════════════════════════════════════════════════
          1. HERO NEXT-UP CARD (NAVY GRADIENT + GOLD)
         ══════════════════════════════════════════════════════════════ */}
      {heroEvent ? (
        <div
          role="button"
          tabIndex={0}
          data-tactile="true"
          data-calendar-event
          data-sidecar-loadable="true"
          data-event-id={heroEvent.id}
          onClick={() => openEventDetails(heroEvent.id)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              openEventDetails(heroEvent.id)
            }
          }}
          className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-casa-navy via-slate-900 to-slate-950 text-white p-4 shadow-[0_8px_24px_-4px_rgba(27,42,74,0.25)] border border-casa-gold/30 cursor-pointer active:scale-[0.97] active:opacity-75 transition-all duration-150"
        >
          {/* Top Status Pill */}
          <div className="flex items-center gap-2 mb-2">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-3xs font-bold uppercase tracking-wider">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              {isHeroActive ? (
                <span>In Progress · Live Now</span>
              ) : isHeroTomorrow ? (
                <span>First Up Tomorrow · {format(getEventStartDate(heroEvent), 'h:mm a')}</span>
              ) : (
                <span>
                  {isHeroTravel && heroTravelEta.data?.leave_by && differenceInMinutes(new Date(heroTravelEta.data.leave_by), now) <= 90
                    ? `Leave at ${format(new Date(heroTravelEta.data.leave_by), 'h:mm a')} · On Track`
                    : differenceInMinutes(getEventStartDate(heroEvent), now) > 60
                    ? `Today at ${format(getEventStartDate(heroEvent), 'h:mm a')}`
                    : `Starts in ${Math.max(1, differenceInMinutes(getEventStartDate(heroEvent), now))} min`}
                </span>
              )}
            </div>
          </div>

          {/* Event Title */}
          <h2 className="text-body-lg font-bold text-white tracking-tight leading-snug line-clamp-1">
            {heroEvent.title}
          </h2>

          {/* Meta Info Rows */}
          <div className="flex flex-col gap-1 mt-2 text-caption text-slate-300 font-medium">
            <div className="flex items-center gap-2">
              <Clock size={13} className="text-casa-gold shrink-0" />
              <span>
                {format(getEventStartDate(heroEvent), 'h:mm a')} – {format(getEventEndDate(heroEvent), 'h:mm a')}
                {heroDriver ? ` · Driver: ${heroDriver}` : ''}
              </span>
            </div>

            {heroDestination && (
              <div className="flex items-center gap-2">
                <MapPin size={13} className="text-casa-gold shrink-0" />
                <span className="truncate">
                  {heroDestination}
                  {heroTravelEta.data?.drive_time_mins ? ` (${heroTravelEta.data.drive_time_mins}m drive)` : ''}
                </span>
              </div>
            )}
          </div>

          {/* Action Buttons Track */}
          <div className="flex items-center gap-2 mt-3.5 pt-2 border-t border-white/10">
            {isHeroTravel && heroDestination && (
              <Button
                variant="primary"
                size="sm"
                onClick={openDirections}
                leadingIcon={<Navigation size={14} />}
                className="flex-1 min-h-[38px] font-bold text-caption bg-casa-gold text-casa-navy hover:bg-amber-400"
              >
                Directions
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation()
                setSnoozedEventMinutes(5)
              }}
              leadingIcon={<Clock size={14} />}
              className="flex-1 min-h-[38px] font-semibold text-caption text-white bg-white/10 hover:bg-white/20 border border-white/15"
            >
              {snoozedEventMinutes ? 'Snoozed 5m' : 'Snooze 5m'}
            </Button>
          </div>
        </div>
      ) : (
        /* Empty / Wind-Down State Hero */
        <div className="rounded-2xl bg-gradient-to-br from-casa-navy via-slate-900 to-slate-950 text-white p-5 text-center shadow-subtle border border-casa-gold/25">
          <div className="w-10 h-10 rounded-full bg-casa-gold/20 flex items-center justify-center mx-auto mb-2 text-casa-gold">
            <CheckCircle2 size={22} strokeWidth={2} />
          </div>
          <h2 className="text-body font-bold text-white">Evening Wind-Down</h2>
          <p className="text-caption text-slate-300 mt-1">All events for today are complete. Enjoy the rest of your night.</p>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
          2. NEEDS YOU (TRIAGE STRIP)
         ══════════════════════════════════════════════════════════════ */}
      {totalTriageCount > 0 && (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <span className="text-caption font-bold uppercase tracking-wider text-casa-muted">
              Action Queue ({totalTriageCount} {totalTriageCount === 1 ? 'matter' : 'matters'})
            </span>
            <Link to="/actions" className="text-caption font-semibold text-casa-gold hover:text-amber-700">
              Open Queue →
            </Link>
          </div>

          <div className="flex gap-2.5 overflow-x-auto pb-1 -mr-4 pr-4 no-scrollbar">
            {/* Conflict Chips */}
            {activeConflicts.map((c) => (
              <div
                key={c.id}
                role="button"
                tabIndex={0}
                data-tactile="true"
                onClick={() => navigate('/actions')}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    navigate('/actions')
                  }
                }}
                className="flex items-center gap-2.5 p-2.5 rounded-xl bg-casa-surface border border-casa-border shadow-2xs shrink-0 cursor-pointer hover:border-casa-gold active:scale-[0.97] active:opacity-75 transition-all duration-150 max-w-[240px]"
              >
                <div className="w-7 h-7 rounded-lg bg-amber-500/15 flex items-center justify-center text-amber-600 shrink-0">
                  <Zap size={14} strokeWidth={2.2} />
                </div>
                <div className="min-w-0">
                  <div className="text-caption font-bold text-casa-navy truncate">{c.event_a?.title || 'Schedule Conflict'}</div>
                  <div className="text-2xs text-casa-muted truncate">{c.description || 'Tap to resolve driver overlap'}</div>
                </div>
              </div>
            ))}

            {/* Prep Items */}
            {activePrep.map((p) => (
              <div
                key={p.id}
                role="button"
                tabIndex={0}
                data-tactile="true"
                onClick={() => navigate('/actions')}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    navigate('/actions')
                  }
                }}
                className="flex items-center gap-2.5 p-2.5 rounded-xl bg-casa-surface border border-casa-border shadow-2xs shrink-0 cursor-pointer hover:border-casa-gold active:scale-[0.97] active:opacity-75 transition-all duration-150 max-w-[240px]"
              >
                <div className="w-7 h-7 rounded-lg bg-red-500/15 flex items-center justify-center text-red-500 shrink-0">
                  <AlertCircle size={14} strokeWidth={2.2} />
                </div>
                <div className="min-w-0">
                  <div className="text-caption font-bold text-casa-navy truncate">{p.event_title || p.description}</div>
                  <div className="text-2xs text-casa-muted truncate">{p.description}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
          3. TONIGHT'S DINNER BANNER
         ══════════════════════════════════════════════════════════════ */}
      <Link
        to="/cook"
        className="flex items-center justify-between p-3.5 bg-casa-surface border border-casa-border border-l-4 border-l-casa-gold rounded-xl shadow-2xs hover:border-casa-gold active:scale-[0.97] active:opacity-75 transition-all duration-150"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-casa-gold/15 flex items-center justify-center text-casa-gold shrink-0">
            <ChefHat size={20} strokeWidth={1.8} />
          </div>
          <div className="min-w-0">
            <div className="text-body-sm font-bold text-casa-navy truncate">
              {dinnerPlan?.title || 'Lemon Herb Roasted Salmon'}
            </div>
            <div className="text-caption text-casa-muted truncate">
              {dinnerPlan?.subtitle || 'With Garlic Asparagus · 25m prep'}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1 text-caption font-bold text-casa-gold bg-casa-gold/12 px-3 py-1.5 rounded-full shrink-0 ml-2">
          <span>Cook</span>
          <ChevronRight size={13} strokeWidth={2.5} />
        </div>
      </Link>

      {/* ══════════════════════════════════════════════════════════════
          4. TODAY'S TIMELINE
         ══════════════════════════════════════════════════════════════ */}
      <div className="flex flex-col gap-2 mt-1">
        <div className="flex items-center justify-between">
          <span className="text-caption font-bold uppercase tracking-wider text-casa-muted">
            Today · {format(now, 'EEEE, MMM d')}
          </span>
          <span className="text-caption text-casa-muted font-medium">
            {todayEvents.length} scheduled
          </span>
        </div>

        {/* Real-Time Now Line */}
        <div className="flex items-center gap-2 py-1 select-none pointer-events-none">
          <span className="w-2 h-2 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.7)] animate-pulse shrink-0" />
          <div className="flex-1 h-px bg-red-400/40" />
          <span className="text-2xs font-mono font-bold text-red-500 shrink-0">
            NOW {format(now, 'h:mm a')}
          </span>
          <div className="flex-1 h-px bg-red-400/40" />
        </div>

        {/* Timeline Events List */}
        {todayEvents.length === 0 ? (
          <div className="p-4 rounded-xl bg-casa-surface border border-casa-border text-center text-caption text-casa-muted">
            No events on today's schedule.
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {todayEvents.map((ev) => {
              const start = getEventStartDate(ev)
              const end = getEventEndDate(ev)
              const durationMins = Math.max(15, differenceInMinutes(end, start))
              const memberNames = ev.members?.map((m) => m.family_member.name).join(', ') || 'Family'

              return (
                <div
                  key={ev.id}
                  role="button"
                  tabIndex={0}
                  data-tactile="true"
                  data-calendar-event
                  data-sidecar-loadable="true"
                  data-event-id={ev.id}
                  onClick={() => openEventDetails(ev.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      openEventDetails(ev.id)
                    }
                  }}
                  className="flex items-center gap-3 p-3 rounded-xl bg-casa-surface border border-casa-border shadow-2xs hover:border-casa-gold active:scale-[0.97] active:opacity-75 transition-all duration-150 cursor-pointer"
                >
                  {/* Time Badge */}
                  <div className="flex flex-col items-center justify-center min-w-[48px] text-center shrink-0">
                    <span className="text-body-sm font-mono font-bold text-casa-navy leading-none">
                      {format(start, 'h:mm')}
                    </span>
                    <span className="text-3xs text-casa-muted mt-1 font-medium">
                      {durationMins >= 60 ? `${(durationMins / 60).toFixed(1).replace('.0', '')}h` : `${durationMins}m`}
                    </span>
                  </div>

                  {/* Vertical Member Color Bar */}
                  <div className="w-1 h-8 rounded-full shrink-0 bg-casa-gold" />

                  {/* Event Title & Subtitle */}
                  <div className="min-w-0 flex-1">
                    <div className="text-body-sm font-semibold text-casa-navy truncate">
                      {ev.title}
                    </div>
                    <div className="flex items-center gap-1.5 text-2xs text-casa-muted mt-0.5 truncate">
                      <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-casa-gold" />
                      <span>{memberNames}</span>
                      {ev.location_name && (
                        <span>· {ev.location_name}</span>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════════════
          5. TOMORROW'S TIMELINE PREVIEW
         ══════════════════════════════════════════════════════════════ */}
      {tomorrowEvents.length > 0 && (
        <div className="flex flex-col gap-2 mt-2">
          <div className="flex items-center justify-between">
            <span className="text-caption font-bold uppercase tracking-wider text-casa-muted">
              Tomorrow · {format(tomorrow, 'EEEE')}
            </span>
            <span className="text-caption text-casa-muted font-medium">
              {tomorrowEvents.length} scheduled
            </span>
          </div>

          <div className="flex flex-col gap-2">
            {tomorrowEvents.slice(0, 3).map((ev) => {
              const start = getEventStartDate(ev)
              const end = getEventEndDate(ev)
              const durationMins = Math.max(15, differenceInMinutes(end, start))
              const memberNames = ev.members?.map((m) => m.family_member.name).join(', ') || 'Family'

              return (
                <div
                  key={ev.id}
                  role="button"
                  tabIndex={0}
                  data-tactile="true"
                  data-calendar-event
                  data-sidecar-loadable="true"
                  data-event-id={ev.id}
                  onClick={() => openEventDetails(ev.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      openEventDetails(ev.id)
                    }
                  }}
                  className="flex items-center gap-3 p-3 rounded-xl bg-casa-surface border border-casa-border shadow-2xs hover:border-casa-gold active:scale-[0.97] active:opacity-75 transition-all duration-150 cursor-pointer"
                >
                  <div className="flex flex-col items-center justify-center min-w-[48px] text-center shrink-0">
                    <span className="text-body-sm font-mono font-bold text-casa-navy leading-none">
                      {format(start, 'h:mm')}
                    </span>
                    <span className="text-3xs text-casa-muted mt-1 font-medium">
                      {durationMins >= 60 ? `${(durationMins / 60).toFixed(1).replace('.0', '')}h` : `${durationMins}m`}
                    </span>
                  </div>

                  <div className="w-1 h-8 rounded-full shrink-0 bg-emerald-500" />

                  <div className="min-w-0 flex-1">
                    <div className="text-body-sm font-semibold text-casa-navy truncate">
                      {ev.title}
                    </div>
                    <div className="flex items-center gap-1.5 text-2xs text-casa-muted mt-0.5 truncate">
                      <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-emerald-500" />
                      <span>{memberNames}</span>
                      {ev.location_name && <span>· {ev.location_name}</span>}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

    </div>
  )
}
