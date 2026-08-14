import { format, parseISO, differenceInMinutes, addMinutes } from 'date-fns'
import {
  MapPin,
  Car,
  Utensils,
  ShoppingBag,
  Clock,
  ChevronRight,
  Zap,
  Sparkles,
  Calendar,
  CheckCircle2,
  Navigation,
  ArrowRight,
  Bell,
} from 'lucide-react'
import { motion } from 'framer-motion'
import { useCalmKioskPresenter } from '../../hooks/useCalmKioskPresenter'
import type { EventWithDetails } from '../../hooks/useCalendarEvents'
import { useAppStore } from '../../stores/appStore'
import { cn } from '../../utils/cn'
import { formatDurationLong } from '../../utils/eventTime'
import { Button, PersonAvatarStack, JourneyProgressBar } from '../ui'

interface CalmKioskViewProps {
  onOpenEvent: (event: EventWithDetails) => void
}

export default function CalmKioskView({ onOpenEvent }: CalmKioskViewProps) {
  const dinnerPlan = useAppStore((s) => s.dinnerPlan)
  const {
    now,
    greeting,
    dailyBriefing,
    timeHorizonLabel,
    weather,
    nextEvent,
    appointmentEvents,
    isEvening,
    isDinnerPast,
    totalAttentionCount,
    minutesUntilNext,
    driveTimeMins,
    leaveAt,
    minutesUntilLeave,
    isTravelEvent,
    originName,
    destinationName,
    returnDestinationName,
    driverName,
    driverFamilyMemberId,
    setCanvasSubmode,
    navigateTo,
  } = useCalmKioskPresenter()

  const isLeaveNow = Boolean(
    isTravelEvent &&
      minutesUntilLeave !== null &&
      minutesUntilLeave <= 0 &&
      minutesUntilNext !== null &&
      minutesUntilNext > 0,
  )
  const isPrepUrgent = Boolean(
    isTravelEvent &&
      minutesUntilLeave !== null &&
      minutesUntilLeave > 0 &&
      minutesUntilLeave <= 15,
  )

  return (
    <div className="w-full h-full flex flex-col justify-between p-6 lg:p-10 max-w-7xl mx-auto overflow-y-auto">
      {/* ── Top Section: Ambient Greeting & Clock ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-casa-border/40">
        <div>
          <h1 className="font-display text-display-lg sm:text-display-xl text-casa-navy font-semibold tracking-tight leading-none">
            {greeting}, <span className="italic font-normal">Tabor Family</span>
          </h1>
          <p className="text-body text-casa-text-secondary mt-2 font-medium">
            {format(now, 'EEEE, MMMM d, yyyy')}
            {weather && ` · ${weather.condition || 'Clear'}, ${weather.temp}°F`}
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Notification Bell Badge for quick triage jump */}
          {totalAttentionCount > 0 ? (
            <Button
              variant="secondary"
              onClick={() => setCanvasSubmode('turbo')}
              className="flex items-center gap-2.5 px-4 py-2.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-900 hover:bg-amber-500/20 transition-all text-body-sm font-semibold shadow-2xs min-h-control"
              aria-label={`View ${totalAttentionCount} triage items in Turbo Canvas`}
            >
              <div className="relative flex items-center justify-center">
                <Bell size={16} className="text-amber-600" />
                <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
              </div>
              <span>{totalAttentionCount} Triage Items</span>
            </Button>
          ) : (
            <Button
              variant="secondary"
              onClick={() => setCanvasSubmode('turbo')}
              className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-casa-surface border border-casa-border hover:border-casa-navy text-casa-navy text-body-sm font-semibold transition-all shadow-2xs min-h-control"
            >
              <Zap size={15} className="text-amber-500" />
              <span>Turbo Canvas</span>
            </Button>
          )}
        </div>
      </div>

      {/* ── Main Middle Grid: Hero "Next Up" + Tonight's Dinner + Daily Schedule ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 my-6 items-start">
        {/* Hero Next Up Card (7 cols) */}
        <div className="lg:col-span-7 flex flex-col justify-start space-y-4">
          {nextEvent ? (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className={cn(
                'w-full rounded-3xl p-6 sm:p-7 bg-gradient-to-br from-casa-navy via-slate-900 to-slate-950 text-white border border-white/10 shadow-xl relative overflow-hidden group cursor-pointer transition-all duration-300',
                isLeaveNow
                  ? 'ring-2 ring-amber-400/60 shadow-glow-gold'
                  : isPrepUrgent
                  ? 'ring-1 ring-amber-400/30'
                  : '',
              )}
              onClick={() => onOpenEvent(nextEvent)}
            >
              {/* Background ambient glow */}
              <div className="absolute top-0 right-0 w-96 h-96 bg-casa-gold/10 rounded-full blur-3xl pointer-events-none" />

              <div>
                <div className="flex items-center justify-between gap-2 mb-4">
                  {(() => {
                    let statusLabel = 'NEXT UP'
                    let dotClass = 'bg-emerald-400'

                    const isUnderway = minutesUntilNext !== null && minutesUntilNext <= 0 && minutesUntilNext > -60

                    if (nextEvent.all_day) {
                      statusLabel = 'ALL DAY EVENT'
                      dotClass = 'bg-emerald-400'
                    } else if (isUnderway) {
                      try {
                        const end = parseISO(nextEvent.end_time)
                        const minsToEnd = differenceInMinutes(end, now)
                        if (minsToEnd <= 10 && minsToEnd > 0) {
                          statusLabel = `WRAPPING UP · ENDS IN ${formatDurationLong(minsToEnd)}`
                          dotClass = 'bg-amber-400 animate-pulse'
                        } else {
                          statusLabel = 'HAPPENING NOW'
                          dotClass = 'bg-emerald-400 animate-pulse'
                        }
                      } catch {
                        statusLabel = 'HAPPENING NOW'
                        dotClass = 'bg-emerald-400 animate-pulse'
                      }
                    } else if (isTravelEvent) {
                      if (minutesUntilLeave !== null && minutesUntilLeave <= 0) {
                        statusLabel = minutesUntilLeave >= -5 ? 'TIME TO LEAVE NOW' : `EN ROUTE · ${driveTimeMins ? `${driveTimeMins}M DRIVE` : 'IN TRANSIT'}`
                        dotClass = 'bg-amber-400 animate-pulse'
                      } else if (minutesUntilLeave !== null && minutesUntilLeave <= 15) {
                        statusLabel = `PREPARE TO LEAVE · ${formatDurationLong(minutesUntilLeave)} BUFFER`
                        dotClass = 'bg-amber-400 animate-pulse'
                      } else if (minutesUntilLeave !== null) {
                        statusLabel = `LEAVE IN ${formatDurationLong(minutesUntilLeave)}`
                        dotClass = 'bg-emerald-400'
                      }
                    } else if (minutesUntilNext !== null && minutesUntilNext > 0) {
                      statusLabel = `STARTS IN ${formatDurationLong(minutesUntilNext)}`
                      dotClass = 'bg-emerald-400'
                    }

                    return (
                      <div className="flex items-center gap-2">
                        <span className={cn('w-2.5 h-2.5 rounded-full', dotClass)} />
                        <span className="text-caption font-bold uppercase tracking-widest text-casa-gold">
                          {statusLabel}
                        </span>
                      </div>
                    )
                  })()}

                  <span className="text-caption text-white/80 font-mono bg-white/10 px-3 py-1 rounded-full border border-white/10">
                    {nextEvent.all_day
                      ? 'All Day'
                      : `${format(parseISO(nextEvent.start_time), 'h:mm a')} – ${format(parseISO(nextEvent.end_time), 'h:mm a')}`}
                  </span>
                </div>

                <h2 className="font-display text-display-sm sm:text-display-md font-bold !text-white tracking-tight leading-tight group-hover:text-casa-gold transition-colors">
                  {nextEvent.title}
                </h2>

                {nextEvent.description && (
                  <p className="text-white/70 text-body-sm mt-2.5 line-clamp-2 leading-relaxed">
                    {nextEvent.description}
                  </p>
                )}

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

                {/* Dual-Phase Journey & Departure Bar (Option A) */}
                <div className="mt-5">
                  <JourneyProgressBar
                    now={now}
                    leaveAt={leaveAt}
                    startTime={nextEvent.start_time}
                    endTime={nextEvent.end_time}
                    driveTimeMins={driveTimeMins}
                    isAllDay={Boolean(nextEvent.all_day)}
                    showLabels={true}
                    originName={originName}
                    destinationName={destinationName}
                    returnDestinationName={returnDestinationName}
                  />
                </div>
              </div>

              {/* Members and Logistics Footer */}
              <div className="pt-5 mt-5 border-t border-white/10 flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-2 flex-wrap">
                  {nextEvent.members.map((m) => {
                    const isDriver =
                      (driverFamilyMemberId && m.family_member?.id === driverFamilyMemberId) ||
                      (driverName && m.family_member?.name?.toLowerCase() === driverName.toLowerCase())

                    return (
                      <span
                        key={m.id}
                        className={cn(
                          'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-caption font-semibold transition-all',
                          isDriver
                            ? 'bg-casa-gold/25 text-casa-gold border border-casa-gold/50 shadow-sm ring-1 ring-casa-gold/30'
                            : 'bg-white/10 text-white',
                        )}
                        style={{
                          borderLeft: isDriver
                            ? undefined
                            : `3px solid ${m.family_member?.color_hex ?? 'var(--color-casa-gold)'}`,
                        }}
                      >
                        {isDriver && <Car size={12} className="text-casa-gold shrink-0 animate-pulse" />}
                        <span>{m.family_member?.name}</span>
                        {isDriver && (
                          <span className="text-2xs uppercase tracking-wider font-bold opacity-80">
                            (Driver)
                          </span>
                        )}
                      </span>
                    )
                  })}
                  {isTravelEvent && driveTimeMins && (
                    <span className="inline-flex items-center gap-1.5 text-caption text-white/80 bg-white/10 px-3 py-1 rounded-full border border-white/10">
                      <Car size={13} className="text-casa-gold shrink-0" />
                      {driverName && <span>{driverName} driving · </span>}
                      {minutesUntilNext !== null && minutesUntilNext <= 0 ? (
                        <>
                          <span>{driveTimeMins}m drive to {returnDestinationName}</span>
                          <span className="text-casa-gold font-bold">
                            · {returnDestinationName} ~{format(addMinutes(parseISO(nextEvent.end_time), driveTimeMins), 'h:mm a')}
                          </span>
                        </>
                      ) : (
                        <>
                          <span>{driveTimeMins}m drive</span>
                          {leaveAt && (
                            <span className="text-casa-gold font-bold">
                              · Leave {format(leaveAt, 'h:mm a')}
                            </span>
                          )}
                        </>
                      )}
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
            <div className="flex-1 flex flex-col items-center justify-center rounded-3xl p-8 bg-gradient-to-br from-slate-900 to-casa-navy text-white border border-white/10 shadow-xl text-center min-h-[260px]">
              <div className="w-14 h-14 rounded-2xl bg-casa-gold/20 text-casa-gold flex items-center justify-center mb-4 border border-casa-gold/30">
                <CheckCircle2 size={32} />
              </div>
              <h3 className="font-display text-heading font-bold text-white tracking-tight">
                {isEvening ? 'Evening Wind-Down · Schedule Complete' : 'Schedule is Clear Today'}
              </h3>
              <p className="text-body-sm text-white/70 max-w-md mt-2 leading-relaxed">
                {isEvening
                  ? 'All scheduled events for today are finished. Rest well & check tomorrow’s preview.'
                  : 'No upcoming events scheduled for today. Relax and enjoy your day!'}
              </p>
              <div className="mt-5 flex items-center gap-3">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => navigateTo('/calendar')}
                  className="bg-white/10 hover:bg-white/20 text-white font-semibold rounded-xl min-h-[44px] px-4 border border-white/15"
                >
                  <span>View Tomorrow's Schedule</span>
                  <ArrowRight size={14} className="ml-1" />
                </Button>
              </div>
            </div>
          )}

          {/* Stylized Ambient Daily Briefing Prose */}
          {dailyBriefing && (
            <div className="px-1 py-1 flex items-start gap-3">
              <div className="p-1.5 rounded-xl bg-amber-500/15 text-casa-gold shrink-0 mt-0.5 border border-amber-500/20">
                <Sparkles size={16} className="text-casa-gold animate-pulse" />
              </div>
              <div className="space-y-0.5 min-w-0">
                <span className="text-2xs uppercase tracking-widest font-sans font-bold text-amber-700">
                  {timeHorizonLabel}
                </span>
                <p className="font-display text-body-lg sm:text-heading text-casa-navy font-medium leading-relaxed">
                  {dailyBriefing}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Right Side (5 cols): Tonight's Kitchen + Upcoming Schedule Stream */}
        <div className="lg:col-span-5 flex flex-col gap-6">
          {/* Dinner Card */}
          <div className="rounded-3xl p-6 bg-gradient-to-br from-amber-500/10 via-casa-surface to-casa-surface border border-amber-500/20 shadow-sm flex flex-col justify-between">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-800 flex items-center justify-center font-bold">
                  {dinnerPlan.mode === 'takeout' ? (
                    <ShoppingBag size={16} />
                  ) : dinnerPlan.mode === 'leftovers' ? (
                    <Clock size={16} />
                  ) : (
                    <Utensils size={16} />
                  )}
                </div>
                <span className="text-caption font-bold uppercase tracking-widest text-amber-800">
                  {dinnerPlan.mode === 'takeout'
                    ? "Tonight's Takeout"
                    : dinnerPlan.mode === 'leftovers'
                    ? "Tonight's Leftovers"
                    : "Tonight's Kitchen"}
                </span>
              </div>
              <span className="text-caption font-semibold text-casa-muted">
                {isDinnerPast ? 'Dinner Completed' : dinnerPlan.targetTime || '6:30 PM Target'}
              </span>
            </div>

            <div>
              <h3 className="font-display text-heading font-bold text-casa-navy">
                {dinnerPlan.title}
              </h3>
              <p className="text-body-sm text-casa-text-secondary mt-1">
                {isDinnerPast
                  ? 'Dinner served · Kitchen closed'
                  : dinnerPlan.subtitle}
              </p>
            </div>

            <div className="pt-4 mt-4 border-t border-casa-border/50 flex items-center justify-between">
              <span className={cn(
                "inline-flex items-center gap-1.5 text-caption font-semibold px-2.5 py-1 rounded-md",
                isDinnerPast ? "text-slate-700 bg-slate-100" : "text-emerald-800 bg-emerald-100 border border-emerald-300"
              )}>
                <CheckCircle2 size={13} /> {isDinnerPast ? 'Cleaned up' : (dinnerPlan.statusBadge || 'Ingredients ready')}
              </span>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    document.dispatchEvent(
                      new CustomEvent('open-ai-chat', {
                        detail: {
                          agent: 'chef',
                          source: 'tonights-kitchen',
                          prompt: undefined,
                          autoSend: false,
                        },
                      })
                    )
                  }}
                  className="text-body-sm font-semibold text-casa-gold hover:text-amber-800 transition-colors flex items-center gap-1 min-h-[44px] px-2.5"
                >
                  <span>Change</span>
                </Button>
                {dinnerPlan.mode === 'cook' && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => navigateTo('/cook')}
                    className="text-body-sm font-bold text-casa-navy hover:text-casa-gold transition-colors flex items-center gap-1 min-h-[44px] px-3"
                  >
                    <span>Recipe</span>
                    <ArrowRight size={14} />
                  </Button>
                )}
              </div>
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
                className="text-caption font-bold text-casa-gold hover:underline min-h-[44px] px-3"
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
    </div>
  )
}
