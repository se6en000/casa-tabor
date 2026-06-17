import { format } from 'date-fns'
import { Bell, Check, Clock3, X } from 'lucide-react'
import type { EventWithDetails } from '../../hooks/useCalendarEvents'
import { cn } from '../../utils/cn'

const REMINDER_ACCENT = '#C4893A'

interface ReminderEventCardProps {
  event: EventWithDetails
  timed: boolean
  selected?: boolean
  className?: string
  onClick?: () => void
  onComplete?: () => void
  onSnooze?: () => void
  onDismiss?: () => void
}

function cleanEventTitle(title: string): string {
  const pipeIdx = title.indexOf(' | ')
  return pipeIdx !== -1 ? title.slice(pipeIdx + 3) : title
}

export default function ReminderEventCard({
  event,
  timed,
  selected = false,
  className,
  onClick,
  onComplete,
  onSnooze,
  onDismiss,
}: ReminderEventCardProps) {
  const start = new Date(event.start_time)
  const end = new Date(event.end_time)
  const members = event.members ?? []
  const primary = members.find((m) => m.role === 'primary') ?? members[0]
  const others = members.filter((m) => m !== primary)

  return (
    <div
      onClick={onClick}
      className={cn(
        'min-w-0 bg-casa-card rounded-card border border-casa-border shadow-card overflow-hidden',
        'cursor-pointer transition-all hover:shadow-card-hover',
        selected && 'ring-1 ring-casa-gold/60 shadow-card-hover',
        className,
      )}
      style={{ borderLeft: `6px solid ${REMINDER_ACCENT}` }}
    >
      <div className="grid grid-cols-[96px_1fr] min-h-[92px]">
        <div className="grid content-center justify-items-end pr-3 pl-2 border-r border-casa-divider/70">
          {timed ? (
            <>
              <p className="text-display-sm font-display text-casa-navy tabular-nums leading-none text-right">
                {format(start, 'h:mm')}
              </p>
              <p className="text-caption text-casa-muted font-semibold uppercase mt-1 text-right">
                {format(start, 'a')}
              </p>
            </>
          ) : (
            <>
              <p className="text-body-sm font-semibold text-casa-muted uppercase leading-none text-right">All</p>
              <p className="text-caption text-casa-muted font-semibold uppercase mt-1 text-right">day</p>
            </>
          )}
        </div>

        <div className="px-4 py-3 min-w-0">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-body font-semibold text-casa-text text-heading leading-snug truncate flex items-center gap-1.5">
                <Bell size={14} className="shrink-0" style={{ color: REMINDER_ACCENT }} />
                <span className="truncate">{cleanEventTitle(event.title)}</span>
              </p>
              <div className="mt-1 inline-flex items-center rounded-pill border border-amber-300 bg-amber-50 px-2 py-0.5 text-caption font-semibold text-amber-700">
                Reminder
              </div>
            </div>
            {members.length > 0 && (
              <div className="flex items-center gap-1 shrink-0 pt-0.5">
                {primary && (
                  <span
                    className="px-2 py-0.5 rounded-full text-caption font-bold leading-none whitespace-nowrap text-white"
                    style={{ backgroundColor: primary.family_member?.color_hex ?? '#888' }}
                    title={primary.family_member?.name ?? ''}
                  >
                    {primary.family_member?.name}
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

          <div className="flex items-center gap-2 mt-1 text-body-sm text-casa-muted">
            <Clock3 size={12} className="shrink-0" />
            {timed ? `${format(start, 'h:mm a')} – ${format(end, 'h:mm a')}` : 'All day reminder'}
          </div>

          {selected && (onComplete || onSnooze || onDismiss) && (
            <div className="mt-2.5 flex items-center gap-1.5">
              {onComplete && (
                <button
                  onClick={(e) => { e.stopPropagation(); onComplete() }}
                  className="h-8 px-2.5 rounded-button border border-casa-border bg-casa-surface text-body-sm font-semibold text-casa-text hover:bg-casa-bg transition-colors inline-flex items-center gap-1"
                >
                  <Check size={12} />
                  Done
                </button>
              )}
              {onSnooze && (
                <button
                  onClick={(e) => { e.stopPropagation(); onSnooze() }}
                  className="h-8 px-2.5 rounded-button border border-casa-border bg-casa-surface text-body-sm font-semibold text-casa-text hover:bg-casa-bg transition-colors"
                >
                  Snooze
                </button>
              )}
              {onDismiss && (
                <button
                  onClick={(e) => { e.stopPropagation(); onDismiss() }}
                  className="h-8 px-2.5 rounded-button border border-red-200 bg-red-50 text-body-sm font-semibold text-red-700 hover:bg-red-100 transition-colors inline-flex items-center gap-1 ml-auto"
                >
                  <X size={12} />
                  Dismiss
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
