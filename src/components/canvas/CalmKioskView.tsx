import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { format, differenceInMinutes, parseISO } from 'date-fns'
import {
  MapPin,
  Car,
  Utensils,
  ChevronRight,
  Zap,
  Sparkles,
  Calendar,
  CheckCircle2,
  Navigation,
  ArrowRight,
} from 'lucide-react'
import { motion } from 'framer-motion'
import { useLiveClock, greetingFor } from '../../hooks/useLiveClock'
import { useTodayEvents, type EventWithDetails } from '../../hooks/useCalendarEvents'
import { useWeekConflicts } from '../../hooks/useConflicts'
import { usePrepItems } from '../../hooks/usePrepItems'
import { useHomeWeather } from '../../hooks/useHomeWeather'
import { useAppStore } from '../../stores/appStore'
import { cn } from '../../utils/cn'
import { Button, PersonAvatarStack } from '../ui'

interface CalmKioskViewProps {
  onOpenEvent: (event: EventWithDetails) => void
}

export default function CalmKioskView({ onOpenEvent }: CalmKioskViewProps) {
  const navigate = useNavigate()
  const { setCanvasSubmode } = useAppStore()
  const now = useLiveClock(10_000)
  const { data: todayEvents = [] } = useTodayEvents(now)
  const { data: conflicts = [] } = useWeekConflicts()
  const { data: prepItems = [] } = usePrepItems()
  const { data: weather } = useHomeWeather()

  // Filter out meal events from general appointments stream (handled by Tonight's Kitchen)
  const appointmentEvents = useMemo(() => {
    return todayEvents.filter((e) => {
      const cat = (e.enrichment?.category || (e as any).category || '').toLowerCase()
      const title = (e.title || '').toLowerCase()
      return !cat.includes('meal') && !cat.includes('prep') && !cat.includes('cook') && !title.includes('dinner') && !title.includes('lunch')
    })
  }, [todayEvents])

  // Filter out dismissed items
  const activeConflicts = useMemo(() => conflicts.filter((c) => !c.resolved), [conflicts])
  const activePrep = useMemo(() => prepItems.filter((p) => !p.dismissed), [prepItems])
  const totalAttentionCount = activeConflicts.length + activePrep.length

  // Find next upcoming event today
  const nextEvent = useMemo(() => {
    const upcoming = todayEvents.filter((e) => {
      if (e.all_day) return false
      try {
        const start = parseISO(e.start_time)
        return start.getTime() > now.getTime() - 15 * 60 * 1000 // up to 15m after start
      } catch {
        return false
      }
    })
    return upcoming[0] || todayEvents[0] || null
  }, [todayEvents, now])

  // Minutes until next event
  const minutesUntilNext = useMemo(() => {
    if (!nextEvent) return null
    try {
      const start = parseISO(nextEvent.start_time)
      return differenceInMinutes(start, now)
    } catch {
      return null
    }
  }, [nextEvent, now])

  const greeting = greetingFor(now)

  return (
    <div className="w-full h-full flex flex-col justify-between p-6 lg:p-10 max-w-7xl mx-auto overflow-y-auto">
      {/* ── Top Section: Ambient Greeting & Clock ── */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-6 border-b border-casa-border/40">
        <div>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-casa-gold/15 text-casa-gold text-caption font-bold tracking-wider uppercase mb-2">
            <Sparkles size={12} /> Ambient Living Kiosk
          </span>
          <h1 className="font-display text-display-lg sm:text-display-xl text-casa-navy font-semibold tracking-tight leading-none">
            {greeting}, <span className="italic font-normal">Tabor Family</span>
          </h1>
          <p className="text-body text-casa-text-secondary mt-1.5 font-medium">
            {format(now, 'EEEE, MMMM d, yyyy')}
            {weather && ` · ${weather.condition || 'Clear'}, ${weather.temp}°F`}
          </p>
        </div>

        <div className="flex items-center gap-4">
          {/* Glowing Turbo Mode CTA Banner if attention items exist */}
          {totalAttentionCount > 0 ? (
            <Button
              variant="secondary"
              onClick={() => setCanvasSubmode('turbo')}
              className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-amber-500/15 border-2 border-amber-500/40 text-amber-900 shadow-sm hover:bg-amber-500/25 transition-all text-left h-auto min-h-control"
            >
              <div className="w-9 h-9 rounded-xl bg-amber-500 text-white flex items-center justify-center font-bold shrink-0 shadow-sm">
                <Zap size={18} />
              </div>
              <div className="min-w-0 pr-1">
                <div className="flex items-center gap-1.5 font-bold text-body-sm text-casa-navy">
                  <span>{totalAttentionCount} Items Need Attention</span>
                </div>
                <p className="text-caption text-casa-text-secondary">
                  Tap to launch Turbo triage canvas ➔
                </p>
              </div>
            </Button>
          ) : (
            <Button
              variant="secondary"
              onClick={() => setCanvasSubmode('turbo')}
              className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-casa-surface border border-casa-border hover:border-casa-navy text-casa-navy text-body-sm font-semibold transition-all shadow-sm h-auto min-h-control"
            >
              <Zap size={16} className="text-amber-500" />
              <span>Enter Turbo Canvas</span>
            </Button>
          )}
        </div>
      </div>

      {/* ── Main Middle Grid: Hero "Next Up" + Tonight's Dinner + Daily Schedule ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 my-6 flex-1 items-stretch">
        {/* Hero Next Up Card (7 cols) */}
        <div className="lg:col-span-7 flex flex-col">
          {nextEvent ? (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex-1 flex flex-col justify-between rounded-3xl p-6 sm:p-8 bg-gradient-to-br from-casa-navy via-slate-900 to-slate-950 text-white border border-white/10 shadow-xl relative overflow-hidden group cursor-pointer"
              onClick={() => onOpenEvent(nextEvent)}
            >
              {/* Background ambient glow */}
              <div className="absolute top-0 right-0 w-96 h-96 bg-casa-gold/10 rounded-full blur-3xl pointer-events-none" />

              <div>
                <div className="flex items-center justify-between gap-2 mb-4">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                    <span className="text-caption font-bold uppercase tracking-widest text-casa-gold">
                      {minutesUntilNext !== null && minutesUntilNext > 0
                        ? `Starts in ${minutesUntilNext} min`
                        : minutesUntilNext !== null && minutesUntilNext <= 0 && minutesUntilNext > -60
                        ? 'Happening Now'
                        : 'Next Up'}
                    </span>
                  </div>

                  <span className="text-caption text-white/80 font-mono bg-white/10 px-3 py-1 rounded-full border border-white/10">
                    {format(parseISO(nextEvent.start_time), 'h:mm a')} –{' '}
                    {format(parseISO(nextEvent.end_time), 'h:mm a')}
                  </span>
                </div>

                <h2 className="font-display text-display-sm sm:text-display-md font-bold !text-white tracking-tight leading-tight group-hover:text-casa-gold transition-colors">
                  {nextEvent.title}
                </h2>

                {nextEvent.location_name && (
                  <div className="flex items-center gap-2 text-white/80 mt-3 text-body-sm">
                    <MapPin size={16} className="text-casa-gold shrink-0" />
                    <span className="truncate">{nextEvent.location_name}</span>
                    {nextEvent.address && (
                      <span className="text-white/40 truncate hidden sm:inline">
                        · {nextEvent.address}
                      </span>
                    )}
                  </div>
                )}

                {/* Ambient Micro-Timeline Progress Line */}
                <div className="mt-5 w-full bg-white/10 h-1.5 rounded-full overflow-hidden flex items-center" title="Ambient Time Schedule Bar">
                  <div
                    className="bg-gradient-to-r from-casa-gold to-amber-400 h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${
                        minutesUntilNext !== null && minutesUntilNext <= 0
                          ? 100
                          : minutesUntilNext !== null && minutesUntilNext < 120
                          ? Math.max(15, Math.min(90, Math.round(100 - (minutesUntilNext / 120) * 85)))
                          : 15
                      }%`,
                    }}
                  />
                </div>
              </div>

              {/* Members and Logistics Footer */}
              <div className="pt-5 mt-5 border-t border-white/10 flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-2 flex-wrap">
                  {nextEvent.members.map((m) => (
                    <span
                      key={m.id}
                      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-caption font-semibold bg-white/10 text-white"
                      style={{
                        borderLeft: `3px solid ${m.family_member?.color_hex ?? 'var(--color-casa-gold)'}`,
                      }}
                    >
                      {m.family_member?.name}
                    </span>
                  ))}
                  {nextEvent.enrichment?.drive_time_mins && (
                    <span className="inline-flex items-center gap-1 text-caption text-white/70 bg-white/5 px-2.5 py-1 rounded-full">
                      <Car size={13} className="text-casa-gold" />
                      {nextEvent.enrichment.drive_time_mins}m drive
                    </span>
                  )}
                  {(nextEvent.address || nextEvent.location_name) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation()
                        const dest = encodeURIComponent(nextEvent.address || nextEvent.location_name || '')
                        window.open(`https://www.google.com/maps/search/?api=1&query=${dest}`, '_blank')
                      }}
                      title="Open navigation directions"
                      className="h-8 px-3 rounded-xl bg-casa-gold/20 hover:bg-casa-gold/30 text-casa-gold text-caption font-bold flex items-center gap-1.5 shrink-0 border border-casa-gold/40"
                    >
                      <Navigation size={13} className="text-casa-gold" />
                      <span>Directions</span>
                    </Button>
                  )}
                </div>

                <div className="flex items-center gap-1 text-casa-gold font-bold text-body-sm group-hover:translate-x-1 transition-transform">
                  <span>View Details</span>
                  <ChevronRight size={16} />
                </div>
              </div>
            </motion.div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center rounded-3xl p-8 bg-casa-surface border border-casa-border/60 text-center">
              <CheckCircle2 size={48} className="text-emerald-500 mb-3 opacity-80" />
              <h3 className="font-display text-heading font-semibold text-casa-navy">
                Schedule is Clear Today
              </h3>
              <p className="text-body-sm text-casa-text-secondary max-w-sm mt-1">
                No more scheduled events for today. Relax and enjoy your evening!
              </p>
            </div>
          )}
        </div>

        {/* Right Side (5 cols): Tonight's Dinner + Upcoming Schedule Stream */}
        <div className="lg:col-span-5 flex flex-col gap-6">
          {/* Dinner Card */}
          <div className="rounded-3xl p-6 bg-gradient-to-br from-amber-500/10 via-casa-surface to-casa-surface border border-amber-500/20 shadow-sm flex flex-col justify-between">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-800 flex items-center justify-center font-bold">
                  <Utensils size={16} />
                </div>
                <span className="text-caption font-bold uppercase tracking-widest text-amber-800">
                  Tonight's Kitchen
                </span>
              </div>
              <span className="text-caption font-semibold text-casa-muted">6:30 PM Target</span>
            </div>

            <div>
              <h3 className="font-display text-heading font-bold text-casa-navy">
                Herb-Roasted Chicken & Warm Farro
              </h3>
              <p className="text-body-sm text-casa-text-secondary mt-1">
                35m prep · Pantry stock confirmed · Chef: Sarah & Luke
              </p>
            </div>

            <div className="pt-4 mt-4 border-t border-casa-border/50 flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 text-caption font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-md">
                <CheckCircle2 size={13} /> Ingredients ready
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate('/cook')}
                className="text-body-sm font-bold text-casa-navy hover:text-casa-gold transition-colors flex items-center gap-1 min-h-[36px] px-2"
              >
                <span>Recipe</span>
                <ArrowRight size={14} />
              </Button>
            </div>
          </div>

          {/* Today's Schedule Stream */}
          <div className="flex-1 rounded-3xl p-6 bg-casa-surface border border-casa-border/60 shadow-sm flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display text-body-lg font-bold text-casa-navy flex items-center gap-2">
                <Calendar size={18} className="text-casa-gold" />
                Today's Appointments ({appointmentEvents.length})
              </h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setCanvasSubmode('turbo')}
                className="text-caption font-bold text-casa-gold hover:underline min-h-[36px] px-2"
              >
                Expand All
              </Button>
            </div>

            <div className="space-y-2.5 overflow-y-auto max-h-72 pr-1">
              {appointmentEvents.length > 0 ? (
                appointmentEvents.map((evt) => {
                  let isNow = false
                  try {
                    const start = parseISO(evt.start_time).getTime()
                    const end = parseISO(evt.end_time).getTime()
                    const currentTime = now.getTime()
                    isNow = !evt.all_day && currentTime >= start && currentTime <= end
                  } catch {
                    // Ignore parse errors
                  }

                  const avatarPeople = evt.members.map((m) => ({
                    id: m.family_member?.id || m.id,
                    name: m.family_member?.name || 'Member',
                    color: m.family_member?.color_hex || 'var(--color-casa-navy)',
                  }))

                  return (
                    <div
                      key={evt.id}
                      onClick={() => onOpenEvent(evt)}
                      className={cn(
                        'flex items-center justify-between p-3 rounded-2xl border transition-all cursor-pointer group',
                        isNow
                          ? 'bg-amber-500/10 border-amber-500/30 shadow-xs'
                          : 'bg-casa-bg/50 hover:bg-casa-gold/10 border-casa-border/30'
                      )}
                    >
                      <div className="min-w-0 flex-1 pr-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-caption font-semibold text-casa-navy">
                            {evt.all_day
                              ? 'All Day'
                              : format(parseISO(evt.start_time), 'h:mm a')}
                          </span>

                          {isNow && (
                            <span className="inline-flex items-center gap-1 text-caption font-bold uppercase tracking-wider text-amber-800 bg-amber-500/20 px-2 py-0.5 rounded-full">
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-600 animate-pulse" />
                              Now
                            </span>
                          )}

                          <span className="text-body-sm font-bold text-casa-navy truncate group-hover:text-casa-gold transition-colors">
                            {evt.title}
                          </span>
                        </div>

                        <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                          {evt.location_name && (
                            <p className="text-caption text-casa-text-secondary truncate flex items-center gap-1">
                              <MapPin size={11} className="text-casa-muted shrink-0" />
                              <span className="truncate">{evt.location_name}</span>
                            </p>
                          )}
                          {evt.enrichment?.drive_time_mins && (
                            <span className="inline-flex items-center gap-1 text-caption text-casa-text-secondary">
                              <Car size={11} className="text-casa-gold shrink-0" />
                              {evt.enrichment.drive_time_mins}m drive
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {(evt.address || evt.location_name) && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation()
                              const dest = encodeURIComponent(evt.address || evt.location_name || '')
                              window.open(`https://www.google.com/maps/search/?api=1&query=${dest}`, '_blank')
                            }}
                            title="Open navigation directions"
                            className="h-8 px-2 rounded-xl bg-casa-gold/15 hover:bg-casa-gold/25 text-casa-navy text-caption font-bold flex items-center gap-1 shrink-0 border border-casa-gold/30"
                          >
                            <Navigation size={12} className="text-casa-gold" />
                            <span>Directions</span>
                          </Button>
                        )}
                        <PersonAvatarStack people={avatarPeople} size="sm" max={2} />
                        <ChevronRight size={14} className="text-casa-muted group-hover:text-casa-navy ml-1 transition-transform group-hover:translate-x-0.5" />
                      </div>
                    </div>
                  )
                })
              ) : (
                <p className="text-caption text-casa-muted py-6 text-center">
                  No appointments scheduled for today.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Bottom Expand Bar ── */}
      <div className="pt-4 flex items-center justify-between border-t border-casa-border/40">
        <div className="flex items-center gap-3 text-caption text-casa-muted">
          <span className="font-semibold text-casa-navy">Living Canvas OS</span>
          <span>·</span>
          <span>Tap any event for quick slide-out details</span>
        </div>

        <Button
          variant="primary"
          onClick={() => setCanvasSubmode('turbo')}
          className="flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-casa-navy text-white hover:bg-slate-800 text-body-sm font-bold shadow-md hover:shadow-lg transition-all h-auto min-h-control"
        >
          <Zap size={16} className="text-casa-gold" />
          <span>Launch Turbo Mode (3-Pane)</span>
          <ChevronRight size={16} />
        </Button>
      </div>
    </div>
  )
}
