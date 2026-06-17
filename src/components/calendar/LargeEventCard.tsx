import { format } from 'date-fns'
import { Navigation } from 'lucide-react'
import type { EventWithDetails } from '../../hooks/useCalendarEvents'
import { cn } from '../../utils/cn'
import { WeatherIcon } from '../shared/WeatherIcon'

interface LargeEventCardProps {
  event: EventWithDetails
  color: string
  now?: Date
  selected?: boolean
  className?: string
}

function cleanEventTitle(title: string): string {
  const pipeIdx = title.indexOf(' | ')
  return pipeIdx !== -1 ? title.slice(pipeIdx + 3) : title
}

export default function LargeEventCard({
  event,
  color,
  now = new Date(),
  selected = false,
  className,
}: LargeEventCardProps) {
  const start = new Date(event.start_time)
  const end = new Date(event.end_time)
  const happening = start <= now && end >= now
  const members = event.members ?? []
  const primary = members.find((m) => m.role === 'primary') ?? members[0]
  const others = members.filter((m) => m !== primary)
  const ownerName = primary?.family_member?.name ?? ''
  const cleanTitle = cleanEventTitle(event.title)

  return (
    <div
      className={cn(
        'min-w-0 bg-casa-card rounded-card border border-casa-border shadow-card overflow-hidden',
        happening && 'animate-pulse-gold',
        selected && 'ring-1 ring-casa-gold/60 shadow-card-hover',
        className,
      )}
      style={{ borderLeft: `6px solid ${color}` }}
    >
      <div className="grid grid-cols-[96px_1fr] min-h-[98px]">
        <div className="grid content-start justify-items-end pr-3 pl-2 pt-3 border-r border-casa-divider/70">
          <p className="text-display-sm font-display font-bold text-casa-navy tabular-nums leading-none text-right">
            {format(start, 'h:mm')}
          </p>
          <p className="text-caption text-casa-muted font-semibold uppercase mt-1 text-right">
            {format(start, 'a')}
          </p>
        </div>

        <div className="px-4 py-3 min-w-0">
          <div className="flex items-start justify-between gap-3">
            <p className="font-body font-semibold text-casa-text text-heading leading-snug truncate">{cleanTitle}</p>
            {members.length > 0 && (
              <div className="flex items-center gap-1 shrink-0 pt-0.5">
                {primary && (
                  <span
                    className="px-2 py-0.5 rounded-full text-caption font-bold leading-none whitespace-nowrap text-white"
                    style={{ backgroundColor: primary.family_member?.color_hex ?? '#888' }}
                    title={ownerName}
                  >
                    {ownerName}
                  </span>
                )}
                {others.slice(0, 3).map((m) => (
                  <span
                    key={m.id}
                    className="px-2 py-0.5 rounded-full text-caption font-bold leading-none whitespace-nowrap text-white"
                    style={{ backgroundColor: m.family_member?.color_hex ?? '#888' }}
                  >
                    {m.family_member?.name}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center flex-wrap gap-x-3 gap-y-0.5 mt-1 min-w-0">
            <span className="flex items-center gap-1 text-body-sm text-casa-muted tabular-nums">
              {format(start, 'h:mm a')} – {format(end, 'h:mm a')}
            </span>
            {event.enrichment?.weather_at_event && (
              <WeatherIcon condition={event.enrichment.weather_at_event} size={12} />
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
