import { format } from 'date-fns'
import { Bell, Check, Clock3, TimerReset } from 'lucide-react'
import type { EventWithDetails } from '../../hooks/useCalendarEvents'
import { cn } from '../../utils/cn'

const REMINDER_ACCENT = '#C4893A'

interface ReminderEventCardProps {
  event: EventWithDetails
  timed: boolean
  className?: string
  onComplete?: () => void
  onSnooze?: () => void
}

function cleanEventTitle(title: string): string {
  const pipeIdx = title.indexOf(' | ')
  return pipeIdx !== -1 ? title.slice(pipeIdx + 3) : title
}

export default function ReminderEventCard({
  event,
  timed,
  className,
  onComplete,
  onSnooze,
}: ReminderEventCardProps) {
  const start = new Date(event.start_time)
  const end = new Date(event.end_time)
  const members = event.members ?? []
  const primary = members.find((m) => m.role === 'primary') ?? members[0]
  const others = members.filter((m) => m !== primary)

  return (
    <div
      className={cn(
        'min-w-0 rounded-pill border border-amber-300 bg-amber-50/90 text-amber-900',
        'inline-flex items-center gap-1.5 px-2 py-1',
        className,
      )}
      style={{ borderLeft: `3px solid ${REMINDER_ACCENT}` }}
    >
      <Bell size={12} className="shrink-0" style={{ color: REMINDER_ACCENT }} />
      <span className="rounded-pill border border-amber-300 bg-amber-50 px-1.5 py-0 text-caption font-semibold text-amber-700">
        Reminder
      </span>
      <span className="text-body-sm font-semibold truncate">{cleanEventTitle(event.title)}</span>
      <span className="text-casa-muted/70">•</span>
      <span className="text-body-sm text-casa-muted inline-flex items-center gap-1 shrink-0">
        <Clock3 size={11} />
        {timed ? `${format(start, 'h:mm a')}–${format(end, 'h:mm a')}` : 'All day'}
      </span>
      {members.length > 0 && (
        <div className="flex items-center gap-1 shrink-0">
          {primary && (
           <span
             className="px-1.5 py-0.5 rounded-full text-caption font-bold leading-none whitespace-nowrap text-white"
             style={{ backgroundColor: primary.family_member?.color_hex ?? '#888' }}
             title={primary.family_member?.name ?? ''}
           >
             {primary.family_member?.name}
           </span>
          )}
          {others.slice(0, 1).map((m) => (
           <span
             key={m.id}
             className="px-1.5 py-0.5 rounded-full text-caption font-bold leading-none whitespace-nowrap text-white"
             style={{ backgroundColor: m.family_member?.color_hex ?? '#888' }}
           >
             {m.family_member?.name}
           </span>
          ))}
        </div>
      )}
      {onComplete && (
        <button
          onClick={(e) => { e.stopPropagation(); onComplete() }}
          className="h-6 px-2 rounded-button border border-casa-border bg-casa-surface text-body-sm font-semibold text-casa-text hover:bg-casa-bg transition-colors inline-flex items-center gap-1 ml-1 shrink-0"
        >
          <Check size={11} />
          Done
        </button>
      )}
      {onSnooze && (
        <button
          onClick={(e) => { e.stopPropagation(); onSnooze() }}
          className="h-6 px-2 rounded-button border border-casa-border bg-casa-surface text-body-sm font-semibold text-casa-text hover:bg-casa-bg transition-colors inline-flex items-center gap-1 shrink-0"
        >
          <TimerReset size={11} />
          Snooze
        </button>
      )}
    </div>
  )
}
