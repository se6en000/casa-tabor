import { format, parseISO, subMinutes } from 'date-fns'
import { Clock, MapPin, ChevronRight, Car, Gift } from 'lucide-react'
import { motion } from 'framer-motion'
import { cn } from '../../../utils/cn'
import type { EventWithDetails } from '../../../hooks/useCalendarEvents'
import { useHeroTheme } from '../../../hooks/useHeroTheme'
import { getEventDisplayDescription } from '../../../utils/eventDescription'
import { PersonAvatarStack } from '../../ui'

interface HeroFlybyCardProps {
  now: Date
  event: EventWithDetails
  onOpenEvent?: (event: EventWithDetails) => void
  className?: string
}

/**
 * A single swipeable "flyby" slide for one of today's remaining events --
 * the same rich detail (leave-by, drive time, prep items, attendees) as the
 * algorithmically-chosen ImminentTransitWidget hero, generalized to render
 * for ANY event rather than only the single most-urgent one. All of this
 * data is already on the event row (event.enrichment / event.checklist),
 * so there's no extra fetch per card.
 */
export default function HeroFlybyCard({ now, event, onOpenEvent, className }: HeroFlybyCardProps) {
  const { heroTheme } = useHeroTheme(now)
  const isHeroNavy = heroTheme === 'navy'

  let start: Date
  let end: Date
  try {
    start = parseISO(event.start_time)
    end = parseISO(event.end_time)
  } catch {
    start = now
    end = now
  }

  const isUnderway = !event.all_day && now.getTime() >= start.getTime() && now.getTime() <= end.getTime()
  const isPast = !event.all_day && now.getTime() > end.getTime()

  const driveTimeMins = event.enrichment?.drive_time_mins || null
  let leaveAt: Date | null = null
  if (event.enrichment?.departure_time) {
    leaveAt = new Date(event.enrichment.departure_time)
  } else if (driveTimeMins && driveTimeMins > 0) {
    try {
      leaveAt = subMinutes(start, driveTimeMins)
    } catch {
      leaveAt = null
    }
  }
  const showLeaveBy = Boolean(leaveAt) && !isPast && !isUnderway

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

  const locationDisplayText = event.location_name
    ? event.address
      ? `${event.location_name} · ${event.address}`
      : event.location_name
    : event.address || null

  const statusLabel = event.all_day
    ? 'ALL DAY'
    : isUnderway
      ? 'HAPPENING NOW'
      : isPast
        ? 'COMPLETED'
        : showLeaveBy
          ? `LEAVE BY ${format(leaveAt as Date, 'h:mm a')}`
          : `STARTS AT ${format(start, 'h:mm a')}`

  const dotClass = isUnderway ? 'bg-emerald-400' : isPast ? 'bg-casa-muted' : 'bg-casa-gold'

  const avatarPeople = event.members.map((m) => ({
    id: m.family_member?.id || m.id,
    name: m.family_member?.name || 'Member',
    color: m.family_member?.color_hex || 'var(--color-casa-navy)',
  }))

  return (
    <motion.div
      data-calendar-event
      data-sidecar-loadable="true"
      data-event-id={event.id}
      className={cn(
        'w-full h-full rounded-3xl p-6 sm:p-7 relative overflow-hidden group cursor-pointer transition-all duration-300',
        isHeroNavy
          ? 'bg-gradient-to-br from-casa-navy via-slate-900 to-slate-950 text-white border border-white/10 shadow-xl'
          : 'bg-casa-surface text-casa-navy border border-casa-border shadow-card',
        isPast && 'opacity-60',
        className,
      )}
      onClick={() => onOpenEvent?.(event)}
    >
      {isHeroNavy && (
        <div className="absolute top-0 right-0 w-96 h-96 bg-casa-gold/10 rounded-full blur-3xl pointer-events-none" />
      )}

      <div
        className={cn(
          'flex items-center gap-2 mb-4 pb-3 border-b',
          isHeroNavy ? 'border-white/10' : 'border-casa-divider/60',
        )}
      >
        <span className={cn('w-2 h-2 rounded-full shrink-0', dotClass)} />
        <span
          className={cn(
            'text-caption font-bold uppercase tracking-widest',
            isHeroNavy ? 'text-white/70' : 'text-casa-muted',
          )}
        >
          {statusLabel}
        </span>
      </div>

      <h2
        className={cn(
          'font-display text-display-sm sm:text-display-md font-bold tracking-tight leading-tight transition-colors',
          isHeroNavy ? '!text-white group-hover:text-casa-gold' : '!text-casa-navy group-hover:text-casa-gold',
        )}
      >
        {event.title}
      </h2>

      {getEventDisplayDescription(event.description) && (
        <p
          className={cn(
            'text-body-sm mt-2.5 line-clamp-2 leading-relaxed',
            isHeroNavy ? 'text-white/70' : 'text-casa-text-secondary',
          )}
        >
          {getEventDisplayDescription(event.description)}
        </p>
      )}

      <div
        className={cn(
          'flex items-center gap-2 mt-2.5 text-body-sm font-semibold',
          isHeroNavy ? 'text-white/80' : 'text-casa-muted',
        )}
      >
        <Clock size={15} className="text-casa-gold shrink-0" />
        <span>{event.all_day ? 'All Day' : `${format(start, 'h:mm a')} – ${format(end, 'h:mm a')}`}</span>
      </div>

      {locationDisplayText && (
        <div
          className={cn(
            'flex items-center gap-2 mt-2.5 text-body-sm',
            isHeroNavy ? 'text-white/80' : 'text-casa-muted',
          )}
        >
          <MapPin size={15} className="text-casa-gold shrink-0" />
          <span className="line-clamp-1">{locationDisplayText}</span>
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
          <span className="line-clamp-2">Bring: {prepSummaryText}</span>
        </div>
      )}

      <div className="flex items-center justify-between gap-3 mt-5">
        <div className="flex items-center gap-2.5">
          {showLeaveBy && driveTimeMins ? (
            <span
              className={cn(
                'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-caption font-bold shrink-0',
                isHeroNavy
                  ? 'bg-white/10 text-white'
                  : 'bg-casa-surface-subtle text-casa-navy border border-casa-border',
              )}
            >
              <Car size={13} />
              ~{driveTimeMins} min drive
            </span>
          ) : null}
          {event.members.length > 0 && <PersonAvatarStack people={avatarPeople} size="sm" max={3} />}
        </div>
        <div
          className={cn(
            'flex items-center gap-1 font-bold text-body-sm shrink-0 group-hover:translate-x-1 transition-transform',
            isHeroNavy ? 'text-casa-gold' : 'text-casa-gold-hover',
          )}
        >
          <span>View Details</span>
          <ChevronRight size={16} />
        </div>
      </div>
    </motion.div>
  )
}
