import { format, parseISO, differenceInMinutes, subMinutes } from 'date-fns'
import {
  Clock,
  Car,
  MapPin,
  Gift,
  Navigation,
  ChevronRight,
  Moon,
  Layers,
} from 'lucide-react'
import type { DepartureItem } from '../../../hooks/useFamilyRoutineIntelligence' 
import { motion } from 'framer-motion'
import { cn } from '../../../utils/cn'
import type { EventWithDetails } from '../../../hooks/useCalendarEvents'
import { useHeroTheme } from '../../../hooks/useHeroTheme'
import { JourneyProgressBar } from '../../ui'
import { Button } from '../../ui'

interface ImminentTransitWidgetProps {
  now?: Date
  event: EventWithDetails
  onOpenEvent?: (event: EventWithDetails) => void
  minutesUntilNext?: number | null
  minutesUntilLeave?: number | null
  driveTimeMins?: number | null
  isTravelEvent?: boolean
  isLeaveNow?: boolean
  isPrepUrgent?: boolean
  concurrentEvents?: EventWithDetails[]
  onSelectHeroEventId?: (eventId: string) => void
  schoolDropoffs?: DepartureItem[]
  tomorrowSummary?: { eventCount: number; prepItemsReady: number; totalPrepItems: number } | null
  onToggleTomorrowView?: () => void
  className?: string
}

function formatDurationLong(mins: number): string {
  if (mins <= 0) return 'NOW'
  const h = Math.floor(mins / 60)
  const m = mins % 60
  if (h === 0) return `${m}M`
  if (m === 0) return `${h}H`
  return `${h}H ${m}M`
}

export default function ImminentTransitWidget({
  now = new Date(),
  event,
  onOpenEvent,
  minutesUntilNext = null,
  minutesUntilLeave = null,
  driveTimeMins = null,
  isTravelEvent = false,
  isLeaveNow = false,
  isPrepUrgent = false,
  concurrentEvents = [],
  onSelectHeroEventId,
  schoolDropoffs = [],
  tomorrowSummary = null,
  onToggleTomorrowView,
  className,
}: ImminentTransitWidgetProps) {
  const { heroTheme } = useHeroTheme(now)
  const isHeroNavy = heroTheme === 'navy'

  const locationDisplayText = event.location_name
    ? event.address
      ? `${event.location_name} · ${event.address}`
      : event.location_name
    : event.address || null

  let prepSummaryText: string | null = null
  if (event.checklist && event.checklist.length > 0) {
    const pending = event.checklist.filter((item) => !item.checked)
    const list = pending.length > 0 ? pending : event.checklist
    const labels = list.map((item) => item.label?.trim()).filter(Boolean)
    if (labels.length > 0) prepSummaryText = labels.join(' · ')
  } else if (event.enrichment?.what_to_bring) {
    const raw = event.enrichment.what_to_bring as unknown
    if (Array.isArray(raw) && raw.length > 0) prepSummaryText = raw.join(' · ')
    else if (typeof raw === 'string' && raw.trim()) prepSummaryText = raw.trim()
  }

  const originName = 'Home'
  const destinationName = event.location_name || event.title || 'Destination'
  const returnDestinationName = 'Home'

  let leaveAt: Date | null = null
  if (event.enrichment?.departure_time) {
    leaveAt = new Date(event.enrichment.departure_time)
  } else if (driveTimeMins && driveTimeMins > 0) {
    try {
      leaveAt = subMinutes(parseISO(event.start_time), driveTimeMins)
    } catch {}
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      data-calendar-event
      data-sidecar-loadable="true"
      data-event-id={event.id}
      className={cn(
        'w-full rounded-3xl p-6 sm:p-7 relative overflow-hidden group cursor-pointer transition-all duration-300',
        isHeroNavy
          ? 'bg-gradient-to-br from-casa-navy via-slate-900 to-slate-950 text-white border border-white/10 shadow-xl'
          : 'bg-casa-surface text-casa-navy border border-casa-border shadow-card',
        isLeaveNow
          ? isHeroNavy
            ? 'ring-2 ring-amber-400/60 shadow-glow-gold'
            : 'ring-2 ring-amber-500/80 shadow-glow-gold'
          : isPrepUrgent
          ? isHeroNavy
            ? 'ring-1 ring-amber-400/30'
            : 'ring-1 ring-amber-500/40'
          : '',
        className,
      )}
      onClick={() => onOpenEvent && onOpenEvent(event)}
    >
      {/* Background ambient glow */}
      {isHeroNavy && (
        <div className="absolute top-0 right-0 w-96 h-96 bg-casa-gold/10 rounded-full blur-3xl pointer-events-none" />
      )}

      <div>
        <div
          className={cn(
            'flex flex-wrap items-center justify-between gap-2 mb-4 pb-3 border-b',
            isHeroNavy ? 'border-white/10' : 'border-casa-divider/60',
          )}
        >
          {(() => {
            let statusLabel = 'NEXT UP'
            let dotClass = 'bg-casa-gold'

            const isUnderway = minutesUntilNext !== null && minutesUntilNext <= 0 && minutesUntilNext > -180
            const effectiveMinsToLeave =
              minutesUntilLeave !== null
                ? minutesUntilLeave
                : minutesUntilNext !== null
                ? minutesUntilNext - 10
                : null
            const isAmbient =
              !isUnderway &&
              ((effectiveMinsToLeave !== null && effectiveMinsToLeave > 60) ||
                (minutesUntilNext !== null && minutesUntilNext > 60))

            if (event.all_day) {
              statusLabel = 'ALL DAY EVENT'
              dotClass = 'bg-emerald-400'
            } else if (isUnderway) {
              try {
                const end = parseISO(event.end_time)
                const minsToEnd = differenceInMinutes(end, now)
                if (minsToEnd <= 0) {
                  statusLabel = 'CONCLUDED · WRAPPING UP'
                  dotClass = 'bg-emerald-400'
                } else if (minsToEnd <= 10) {
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
            } else if (isAmbient) {
              try {
                statusLabel = `TODAY AT ${format(parseISO(event.start_time), 'h:mm a')}`
              } catch {
                statusLabel = 'NEXT UP'
              }
              dotClass = 'bg-casa-gold/80'
            } else if (isTravelEvent) {
              if (minutesUntilLeave !== null && minutesUntilLeave <= 0) {
                statusLabel =
                  minutesUntilLeave >= -5
                    ? 'TIME TO LEAVE NOW'
                    : `EN ROUTE · ${driveTimeMins ? `${driveTimeMins}M DRIVE` : 'IN TRANSIT'}`
                dotClass = 'bg-amber-400 animate-pulse'
              } else if (minutesUntilLeave !== null && minutesUntilLeave <= 15) {
                statusLabel = `PREPARE TO LEAVE · ${formatDurationLong(minutesUntilLeave)} BUFFER`
                dotClass = 'bg-amber-400 animate-pulse'
              } else if (minutesUntilLeave !== null && minutesUntilLeave <= 60) {
                statusLabel = `LEAVE IN ${formatDurationLong(minutesUntilLeave)}`
                dotClass = 'bg-emerald-400'
              } else {
                statusLabel = `TODAY AT ${format(parseISO(event.start_time), 'h:mm a')}`
                dotClass = 'bg-casa-gold/80'
              }
            } else if (minutesUntilNext !== null && minutesUntilNext > 0) {
              statusLabel = `STARTS IN ${formatDurationLong(minutesUntilNext)}`
              dotClass = 'bg-emerald-400'
            }

            return (
              <div className="flex items-center gap-2">
                <span className={cn('w-2.5 h-2.5 rounded-full', dotClass)} />
                <span
                  className={cn(
                    'text-caption font-bold uppercase tracking-widest',
                    isHeroNavy ? 'text-casa-gold' : 'text-casa-gold',
                  )}
                >
                  {statusLabel}
                </span>
              </div>
            )
          })()}

          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={cn(
                'text-caption font-mono px-3 py-1 rounded-full border',
                isHeroNavy
                  ? 'text-white/80 bg-white/10 border-white/10'
                  : 'text-casa-navy bg-casa-surface-subtle border-casa-border',
              )}
            >
              {event.all_day
                ? 'All Day'
                : `${format(parseISO(event.start_time), 'h:mm a')} – ${format(parseISO(event.end_time), 'h:mm a')}`}
            </span>
          </div>
        </div>

        <h2
          className={cn(
            'font-display text-display-sm sm:text-display-md font-bold tracking-tight leading-tight transition-colors',
            isHeroNavy ? '!text-white group-hover:text-casa-gold' : '!text-casa-navy group-hover:text-casa-gold',
          )}
        >
          {event.title}
        </h2>

        {event.description && (
          <p
            className={cn(
              'text-body-sm mt-2.5 line-clamp-2 leading-relaxed',
              isHeroNavy ? 'text-white/70' : 'text-casa-text-secondary',
            )}
          >
            {event.description}
          </p>
        )}

        {locationDisplayText && (
          <div
            className={cn(
              'flex items-center gap-2 mt-2.5 text-body-sm',
              isHeroNavy ? 'text-white/80' : 'text-casa-muted',
            )}
          >
            <MapPin size={15} className="text-casa-gold shrink-0" />
            <span className="truncate">{locationDisplayText}</span>
          </div>
        )}

        {prepSummaryText && (
          <div
            className={cn(
              'flex items-center gap-2 mt-2 text-caption',
              isHeroNavy ? 'text-slate-300/90' : 'text-casa-muted',
            )}
          >
            <Gift size={15} className="text-casa-gold shrink-0" />
            <span className={cn('font-semibold shrink-0', isHeroNavy ? 'text-white/90' : 'text-casa-navy')}>
              Bring:
            </span>
            <span className={cn('truncate', isHeroNavy ? 'text-white/75' : 'text-casa-navy/80')}>
              {prepSummaryText}
            </span>
          </div>
        )}

        {/* Logistics Bar: Live Journey Tracker (≤ 60m) vs Peaceful Ambient Route Preview (> 60m) */}
        <div className="mt-5">
          {(() => {
            const isUnderway = minutesUntilNext !== null && minutesUntilNext <= 0 && minutesUntilNext > -180
            const effectiveMinsToLeave =
              minutesUntilLeave !== null
                ? minutesUntilLeave
                : minutesUntilNext !== null
                ? minutesUntilNext - 10
                : null
            const isAmbient =
              !isUnderway &&
              ((effectiveMinsToLeave !== null && effectiveMinsToLeave > 60) ||
                (minutesUntilNext !== null && minutesUntilNext > 60))

            if (!isAmbient) {
              return (
                <JourneyProgressBar
                  now={now}
                  leaveAt={isTravelEvent ? leaveAt : null}
                  startTime={event.start_time}
                  endTime={event.end_time}
                  driveTimeMins={isTravelEvent ? driveTimeMins : null}
                  isAllDay={Boolean(event.all_day)}
                  showLabels={true}
                  originName={originName}
                  destinationName={destinationName}
                  returnDestinationName={returnDestinationName}
                  theme={isHeroNavy ? 'navy' : 'linen'}
                />
              )
            }

            return (
              <div
                className={cn(
                  'flex flex-wrap items-center justify-between gap-3 py-2.5 px-4 rounded-2xl border text-caption',
                  isHeroNavy
                    ? 'bg-white/[0.04] border-white/10 text-white/70'
                    : 'bg-casa-surface-subtle border-casa-border text-casa-text-secondary',
                )}
              >
                <div className="flex items-center gap-2">
                  <Car size={14} className="text-casa-gold" />
                  <span className={cn('font-medium', isHeroNavy ? 'text-white/90' : 'text-casa-navy')}>
                    {originName} → {destinationName}
                  </span>
                  {driveTimeMins ? (
                    <span
                      className={cn(
                        'text-2xs font-mono font-bold px-2 py-0.5 rounded-full border',
                        isHeroNavy
                          ? 'bg-white/10 text-casa-gold border-white/10'
                          : 'bg-casa-gold/15 text-casa-gold border-casa-gold/30',
                      )}
                    >
                      ~{driveTimeMins} min
                    </span>
                  ) : null}
                </div>
                <div
                  className={cn(
                    'flex items-center gap-1.5 text-2xs font-medium',
                    isHeroNavy ? 'text-white/50' : 'text-casa-muted',
                  )}
                >
                  <Clock size={12} className="text-casa-gold/70" />
                  <span>
                    {leaveAt
                      ? `Live tracking begins at ${format(subMinutes(leaveAt, 60), 'h:mm a')}`
                      : 'Live tracking activates 60m before departure'}
                  </span>
                </div>
              </div>
            )
          })()}
        </div>
      </div>

      {/* Members and Logistics Footer */}
      <div
        className={cn(
          'pt-5 mt-5 border-t flex flex-wrap items-center justify-between gap-4',
          isHeroNavy ? 'border-white/10' : 'border-casa-divider/60',
        )}
      >
        <div className="flex items-center gap-2 flex-wrap">
          {(event.members || []).map((m) => {
            const isDriver = m.role === 'driver'

            return (
              <span
                key={m.id}
                className={cn(
                  'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-caption font-semibold transition-all border',
                  isHeroNavy
                    ? 'bg-white/10 text-white border-white/10'
                    : 'bg-casa-surface-subtle text-casa-navy border-casa-border',
                )}
                style={{
                  borderLeft: `3px solid ${m.family_member?.color_hex ?? 'var(--color-casa-gold)'}`,
                }}
              >
                {isDriver && <Car size={13} className="text-casa-gold shrink-0" />}
                <span>{m.family_member?.name}</span>
              </span>
            )
          })}
          {isTravelEvent && (event.address || event.location_name) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation()
                const dest = encodeURIComponent(event.address || event.location_name || '')
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

      {/* ── Multi-Track Concurrent Events (1-to-Many Simultaneous Family Logistics) ── */}
      {concurrentEvents.length > 0 && (
        <div
          className={cn(
            'mt-5 pt-4 border-t',
            isHeroNavy ? 'border-white/10' : 'border-casa-divider/60',
          )}
        >
          <div className="flex items-center justify-between gap-2 mb-2.5">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
              <span className="text-3xs font-bold uppercase tracking-widest text-casa-gold flex items-center gap-1.5">
                <Layers size={12} className="text-casa-gold" />
                <span>Simultaneous Family Logistics ({concurrentEvents.length} Active)</span>
              </span>
            </div>
            <span
              className={cn(
                'text-3xs font-medium',
                isHeroNavy ? 'text-white/50' : 'text-casa-muted',
              )}
            >
              1-Tap to switch spotlight
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {concurrentEvents.map((evt) => {
              let isUnderway = false
              try {
                const start = parseISO(evt.start_time).getTime()
                const end = parseISO(evt.end_time).getTime()
                isUnderway = !evt.all_day && now.getTime() >= start && now.getTime() <= end
              } catch {}

              const evtMember = evt.members?.[0]?.family_member

              return (
                <div
                  key={evt.id}
                  role="button"
                  tabIndex={0}
                  onClick={(e) => {
                    e.stopPropagation()
                    if (onSelectHeroEventId) onSelectHeroEventId(evt.id)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      e.stopPropagation()
                      if (onSelectHeroEventId) onSelectHeroEventId(evt.id)
                    }
                  }}
                  className={cn(
                    'group/item flex items-center justify-between gap-3 p-3 rounded-2xl border transition-all cursor-pointer shadow-2xs active:scale-[0.98]',
                    isHeroNavy
                      ? 'bg-white/5 hover:bg-white/10 border-white/10 hover:border-casa-gold/50 text-white'
                      : 'bg-casa-surface-subtle hover:bg-casa-surface-subtle/80 border-casa-border hover:border-casa-gold/50 text-casa-navy',
                  )}
                  title={`Switch spotlight to ${evt.title}`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                      {evtMember && (
                        <span
                          className={cn(
                            'inline-flex items-center px-2 py-0.5 rounded-full text-3xs font-bold',
                            isHeroNavy ? 'text-white bg-white/15' : 'text-casa-navy bg-white border border-casa-border',
                          )}
                          style={{
                            borderLeft: `3px solid ${evtMember.color_hex || 'var(--color-casa-gold)'}`,
                          }}
                        >
                          {evtMember.name}
                        </span>
                      )}
                      <span
                        className={cn(
                          'text-3xs font-mono',
                          isHeroNavy ? 'text-white/60' : 'text-casa-muted',
                        )}
                      >
                        {evt.all_day ? 'All Day' : `${format(parseISO(evt.start_time), 'h:mm a')}`}
                      </span>
                      {isUnderway && (
                        <span className="inline-flex items-center gap-1 text-3xs font-bold text-emerald-600 dark:text-emerald-400">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                          Now
                        </span>
                      )}
                    </div>

                    <h4
                      className={cn(
                        'text-caption font-semibold truncate transition-colors group-hover/item:text-casa-gold',
                        isHeroNavy ? 'text-white' : 'text-casa-navy',
                      )}
                    >
                      {evt.title}
                    </h4>
                  </div>

                  <div className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-casa-gold/15 group-hover/item:bg-casa-gold/25 text-casa-gold text-caption font-bold shrink-0 transition-all border border-casa-gold/30">
                    <span className="text-2xs">Focus</span>
                    <ChevronRight size={13} className="group-hover/item:translate-x-0.5 transition-transform" />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Early Morning Companion: School Drop-offs Ahead ── */}
      {schoolDropoffs && schoolDropoffs.length > 0 && (
        <div
          className={cn(
            'mt-5 pt-4 border-t flex flex-wrap items-center justify-between gap-3',
            isHeroNavy ? 'border-white/10' : 'border-casa-divider/60',
          )}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className={cn(
                'w-7 h-7 rounded-xl flex items-center justify-center font-bold shrink-0',
                isHeroNavy ? 'bg-amber-400/20 text-amber-300' : 'bg-casa-gold/20 text-casa-navy',
              )}
            >
              <Car size={14} className="text-casa-gold" />
            </div>
            <div className="min-w-0">
              <span className="text-3xs font-bold uppercase tracking-wider text-casa-gold block">
                School Launchpad Ahead
              </span>
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                {schoolDropoffs.map((d) => (
                  <span
                    key={d.id}
                    onClick={(e) => {
                      e.stopPropagation()
                      if (onOpenEvent && d.rawEvent) onOpenEvent(d.rawEvent)
                    }}
                    className={cn(
                      'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-caption font-semibold border transition-all cursor-pointer shadow-2xs hover:scale-105 active:scale-95',
                      isHeroNavy ? 'bg-white/10 border-white/15 text-white' : 'bg-casa-surface-subtle border-casa-border text-casa-navy',
                    )}
                  >
                    <span>{d.shortVenueName || d.venueName}</span>
                    <span className="opacity-40">·</span>
                    <span className="font-mono text-3xs opacity-90">{d.driverName ? `${d.driverName} drives` : d.leaveByTimeFormatted}</span>
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Evening Companion: Tomorrow Prep Preview Ribbon ── */}
      {tomorrowSummary && (
        <div
          className={cn(
            'mt-5 pt-4 border-t flex flex-wrap items-center justify-between gap-3',
            isHeroNavy ? 'border-white/10' : 'border-casa-divider/60',
          )}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className={cn(
                'w-7 h-7 rounded-xl flex items-center justify-center font-bold shrink-0',
                isHeroNavy ? 'bg-indigo-500/20 text-indigo-300' : 'bg-indigo-50 text-indigo-700',
              )}
            >
              <Moon size={14} className={isHeroNavy ? 'text-indigo-300' : 'text-indigo-600'} />
            </div>
            <div className="min-w-0">
              <span className="text-3xs font-bold uppercase tracking-wider text-indigo-400 block">
                Tomorrow at a Glance
              </span>
              <span className={cn('text-caption font-medium truncate block', isHeroNavy ? 'text-white/80' : 'text-casa-text-secondary')}>
                {tomorrowSummary.eventCount} {tomorrowSummary.eventCount === 1 ? 'event' : 'events'} · Prep: {tomorrowSummary.prepItemsReady} of {tomorrowSummary.totalPrepItems} ready
              </span>
            </div>
          </div>

          {onToggleTomorrowView && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onToggleTomorrowView()
              }}
              className={cn(
                'px-3 py-1.5 rounded-xl text-caption font-bold border transition-all flex items-center gap-1 shrink-0 shadow-2xs hover:scale-105 active:scale-95',
                isHeroNavy
                  ? 'bg-white/10 hover:bg-white/15 border-white/15 text-white'
                  : 'bg-casa-surface-subtle hover:bg-casa-surface-subtle/80 border-casa-border text-casa-navy',
              )}
            >
              <span>Tomorrow Flow</span>
              <ChevronRight size={13} />
            </button>
          )}
        </div>
      )}
    </motion.div>
  )
}
