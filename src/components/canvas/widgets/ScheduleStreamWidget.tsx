import { format, parseISO } from 'date-fns'
import { Calendar, CheckCircle2, MapPin } from 'lucide-react'
import { motion } from 'framer-motion'
import { cn } from '../../../utils/cn'
import type { EventWithDetails } from '../../../hooks/useCalendarEvents'

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
            return (
              <motion.div
                key={evt.id}
                onMouseEnter={() => setHighlightedEventId(evt.id)}
                onMouseLeave={() => setHighlightedEventId(null)}
                onClick={() => onOpenEvent(evt)}
                layout
                className={cn(
                  'p-4 rounded-2xl border transition-all cursor-pointer relative group min-h-[52px] flex flex-col justify-center',
                  isHighlighted
                    ? 'border-casa-navy bg-casa-navy text-white shadow-md'
                    : 'border-casa-border/50 bg-casa-bg/50 hover:border-casa-gold hover:bg-casa-surface'
                )}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span
                    className={cn(
                      'font-mono text-caption font-semibold',
                      isHighlighted ? 'text-casa-gold' : 'text-casa-muted'
                    )}
                  >
                    {evt.all_day
                      ? 'All Day'
                      : `${format(parseISO(evt.start_time), 'h:mm a')} – ${format(
                          parseISO(evt.end_time),
                          'h:mm a'
                        )}`}
                  </span>

                  <div className="flex items-center gap-1.5">
                    {evt.members.map((m) => (
                      <span
                        key={m.id}
                        className="w-2.5 h-2.5 rounded-full"
                        style={{
                          backgroundColor: m.family_member?.color_hex ?? 'var(--color-casa-gold)',
                        }}
                        title={m.family_member?.name}
                      />
                    ))}
                  </div>
                </div>

                <h4
                  className={cn(
                    'text-body-sm font-bold truncate leading-snug',
                    isHighlighted ? 'text-white' : 'text-casa-navy group-hover:text-casa-gold'
                  )}
                >
                  {evt.title}
                </h4>

                {evt.location_name && (
                  <div
                    className={cn(
                      'flex items-center gap-1 text-caption truncate mt-1',
                      isHighlighted ? 'text-white/70' : 'text-casa-text-secondary'
                    )}
                  >
                    <MapPin size={12} className="shrink-0" />
                    <span className="truncate">{evt.location_name}</span>
                  </div>
                )}
              </motion.div>
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
