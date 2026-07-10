import { format, isSameDay } from 'date-fns'
import { CheckCircle2, Clock3, Navigation } from 'lucide-react'
import type { EventWithDetails } from '../../hooks/useCalendarEvents'
import { cn } from '../../utils/cn'
import { WeatherIcon } from '../shared/WeatherIcon'
import { getEventDisplayEnd, getMultiDayBoundaryLabel, isEventMultiDay, withColorAlpha } from '../../utils/eventTime'
import { cleanEventTitle } from '../../utils/eventTitle'
import { Chip } from '../ui'

interface LargeEventCardProps {
  event: EventWithDetails
  color: string
  now?: Date
  selected?: boolean
  className?: string
  contextDay?: Date
}

export default function LargeEventCard({
  event,
  color,
  now = new Date(),
  selected = false,
  className,
  contextDay,
}: LargeEventCardProps) {
  const start = new Date(event.start_time)
  const end = new Date(event.end_time)
  const displayEnd = getEventDisplayEnd(event)
  const happening = start <= now && end >= now
  const multiDay = isEventMultiDay(event)
  const boundaryLabel = contextDay ? getMultiDayBoundaryLabel(event, contextDay) : null
  const members = event.members ?? []
  const primary = members.find((m) => m.role === 'primary') ?? members[0]
  const others = members.filter((m) => m !== primary)
  const ownerName = primary?.family_member?.name ?? ''
  const cleanTitle = cleanEventTitle(event.title)
  const showSyncState = event.event_type !== 'reminder'
  const isGoogleSynced = !!event.google_event_id

  return (
    <div
      className={cn(
        'min-w-0 bg-casa-card rounded-card border border-casa-border shadow-card overflow-hidden',
        happening && 'animate-pulse-gold',
        selected && 'ring-1 ring-casa-gold/60 shadow-card-hover',
        className,
      )}
      style={{
        borderLeft: `6px solid ${color}`,
        backgroundColor: multiDay ? withColorAlpha(color, '1A') : undefined,
      }}
    >
      <div className="grid grid-cols-[96px_1fr] min-h-[98px]">
        <div className="grid content-start justify-items-end pr-3 pl-2 pt-3 border-r border-casa-divider/70">
          {multiDay ? (
            <>
              <p className="text-body-sm font-semibold text-casa-navy leading-none text-right">
                {boundaryLabel?.startsWith('Starts')
                  ? 'Starts'
                  : boundaryLabel?.startsWith('Ends')
                    ? 'Ends'
                    : boundaryLabel?.startsWith('Continues')
                      ? 'Continues'
                      : 'Multi-day'}
              </p>
              <p className="text-caption text-casa-muted font-semibold mt-1 text-right">
                {boundaryLabel ?? `${format(start, 'MMM d')} – ${format(displayEnd, 'MMM d')}`}
              </p>
            </>
          ) : (
            <>
              <p className="text-display-sm font-display font-bold text-casa-navy tabular-nums leading-none text-right">
                {format(start, 'h:mm')}
              </p>
              <p className="text-caption text-casa-muted font-semibold uppercase mt-1 text-right">
                {format(start, 'a')}
              </p>
            </>
          )}
        </div>

        <div className="px-4 py-3 min-w-0">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="font-body font-semibold text-casa-text text-heading leading-snug truncate">{cleanTitle}</p>
              {multiDay && (
                <Chip size="sm" className="mt-1">
                  Multi-day
                </Chip>
              )}
            </div>
            {members.length > 0 && (
              <div className="flex items-center gap-1 shrink-0 pt-0.5">
                {primary && (
                  <Chip
                    size="sm"
                    className="border-transparent text-white"
                    style={{ backgroundColor: primary.family_member?.color_hex ?? '#888' }}
                    title={ownerName}
                  >
                    {ownerName}
                  </Chip>
                )}
                {others.slice(0, 3).map((m) => (
                  <Chip
                    key={m.id}
                    size="sm"
                    className="border-transparent text-white"
                    style={{ backgroundColor: m.family_member?.color_hex ?? '#888' }}
                  >
                    {m.family_member?.name}
                  </Chip>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center flex-wrap gap-x-3 gap-y-0.5 mt-1 min-w-0">
            <span className="flex items-center gap-1 text-body-sm text-casa-muted tabular-nums">
              {event.all_day
                ? (boundaryLabel ?? (multiDay ? `${format(start, 'MMM d')} – ${format(displayEnd, 'MMM d')} · all day` : 'All day'))
                : (multiDay
                  ? (boundaryLabel ?? `${format(start, 'MMM d')} – ${format(displayEnd, 'MMM d')} · multi-day`)
                  : (isSameDay(start, end)
                    ? `${format(start, 'h:mm a')} – ${format(end, 'h:mm a')}`
                    : `${format(start, 'MMM d h:mm a')} – ${format(end, 'MMM d h:mm a')}`))}
            </span>
            {event.enrichment?.weather_at_event && (
              <WeatherIcon condition={event.enrichment.weather_at_event} size={12} />
            )}
            {showSyncState && (
              <span
                className={cn(
                  'inline-flex items-center gap-1 text-caption',
                  isGoogleSynced ? 'text-emerald-600' : 'text-casa-muted',
                )}
                title={isGoogleSynced ? 'Google sync confirmed' : 'Google sync pending'}
              >
                {isGoogleSynced ? <CheckCircle2 size={12} /> : <Clock3 size={12} />}
              </span>
            )}
            {event.location_name && (
              <span className="flex items-center gap-1 text-body-sm text-casa-muted min-w-0 break-words">
                {event.location_name}
              </span>
            )}
          </div>

          {event.enrichment?.departure_time && !happening && (
            <div className="flex items-center gap-1 mt-1.5 text-body-sm font-semibold text-casa-gold">
              <Navigation size={12} className="shrink-0" />
              Leave by {format(new Date(event.enrichment.departure_time), 'h:mm a')}
              {event.enrichment.drive_time_mins && ` · ${event.enrichment.drive_time_mins} min drive`}
            </div>
          )}
          {!event.enrichment?.departure_time && event.enrichment?.prep_notes && (
            <p className="text-body-sm text-casa-muted mt-1 line-clamp-1">{event.enrichment.prep_notes}</p>
          )}
        </div>
      </div>
    </div>
  )
}
