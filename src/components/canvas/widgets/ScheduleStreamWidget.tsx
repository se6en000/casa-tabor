import { format, parseISO } from 'date-fns'
import { Calendar, CheckCircle2 } from 'lucide-react'
import type { EventWithDetails } from '../../../hooks/useCalendarEvents'
import { ScheduleStreamItem } from '../../ui'

interface ScheduleStreamWidgetProps {
  todayEvents: EventWithDetails[]
  highlightedEventId: string | null
  setHighlightedEventId: (id: string | null) => void
  onOpenEvent: (event: EventWithDetails) => void
}

export default function ScheduleStreamWidget({
  todayEvents,
  highlightedEventId,
  setHighlightedEventId,
  onOpenEvent,
}: ScheduleStreamWidgetProps) {
  return (
    <div className="lg:col-span-4 flex flex-col rounded-3xl bg-casa-surface border border-casa-border/60 shadow-sm p-5 overflow-hidden">
      <div className="flex items-center justify-between pb-3 mb-3 border-b border-casa-border/40 shrink-0">
        <div className="flex items-center gap-2">
          <Calendar size={16} className="text-casa-navy" />
          <h2 className="font-display text-body-lg font-bold text-casa-navy">
            Today's Schedule
          </h2>
        </div>
        <span className="text-caption font-semibold px-2.5 py-0.5 rounded-full bg-casa-bg text-casa-navy">
          {todayEvents.length} Events
        </span>
      </div>

      <div className="flex-1 overflow-y-auto pr-1 space-y-2.5">
        {todayEvents.length > 0 ? (
          todayEvents.map((evt) => {
            const isHighlighted = highlightedEventId === evt.id
            const timeText = evt.all_day
              ? 'All Day'
              : `${format(parseISO(evt.start_time), 'h:mm a')} – ${format(
                  parseISO(evt.end_time),
                  'h:mm a'
                )}`

            return (
              <ScheduleStreamItem
                key={evt.id}
                timeText={timeText}
                title={evt.title}
                location={evt.location_name || undefined}
                isHighlighted={isHighlighted}
                members={evt.members.map((m) => ({
                  id: m.id,
                  name: m.family_member?.name,
                  color: m.family_member?.color_hex ?? 'var(--color-casa-gold)',
                }))}
                onMouseEnter={() => setHighlightedEventId(evt.id)}
                onMouseLeave={() => setHighlightedEventId(null)}
                onClick={() => onOpenEvent(evt)}
              />
            )
          })
        ) : (
          <div className="flex flex-col items-center justify-center h-48 text-center">
            <CheckCircle2 size={32} className="text-emerald-500 mb-2" />
            <p className="text-body-sm font-semibold text-casa-navy">No Events Today</p>
            <p className="text-caption text-casa-muted mt-0.5">Your schedule is wide open.</p>
          </div>
        )}
      </div>
    </div>
  )
}
