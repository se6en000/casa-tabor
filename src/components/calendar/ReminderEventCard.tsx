import { format } from 'date-fns'
import { Bell, Check, ChevronDown, ChevronUp, Clock3 } from 'lucide-react'
import type { EventWithDetails } from '../../hooks/useCalendarEvents'
import { cn } from '../../utils/cn'

const REMINDER_ACCENT = '#C4893A'

interface ReminderEventCardProps {
  event: EventWithDetails
  timed: boolean
  expanded?: boolean
  className?: string
  onToggleExpand?: () => void
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
  expanded = false,
  className,
  onToggleExpand,
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
      onClick={onToggleExpand}
      className={cn(
        'min-w-0 rounded-card border border-casa-border shadow-card overflow-hidden',
        'cursor-pointer transition-all hover:shadow-card-hover',
        expanded && 'ring-1 ring-casa-gold/50 shadow-card-hover',
        className,
      )}
      style={{
        borderLeft: `4px solid ${REMINDER_ACCENT}`,
        backgroundColor: '#FCF8EF',
      }}
    >
      <div className="grid grid-cols-[74px_1fr] min-h-[58px]">
        <div className="grid content-center justify-items-end pr-2 pl-1.5 border-r border-casa-divider/60">
          {timed ? (
            <>
              <p className="text-heading font-display text-casa-navy tabular-nums leading-none text-right">
                {format(start, 'h:mm')}
              </p>
              <p className="text-caption text-casa-muted font-semibold uppercase mt-0.5 text-right">
                {format(start, 'a')}
              </p>
            </>
          ) : (
            <>
              <p className="text-body-sm font-semibold text-casa-muted uppercase leading-none text-right">All</p>
              <p className="text-caption text-casa-muted font-semibold uppercase mt-0.5 text-right">day</p>
            </>
          )}
        </div>

        <div className="px-3 py-2 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="font-body font-semibold text-casa-text text-heading leading-tight truncate flex items-center gap-1.5">
                <Bell size={12} className="shrink-0" style={{ color: REMINDER_ACCENT }} />
                <span className="truncate">{cleanEventTitle(event.title)}</span>
              </p>
              <div className="mt-0.5 inline-flex items-center rounded-pill border border-amber-300/90 bg-amber-50/80 px-1.5 py-0 text-caption font-semibold text-amber-700">
                Reminder
              </div>
            </div>
            <div className="flex items-start gap-1 shrink-0">
              {members.length > 0 && (
                <div className="flex items-center gap-1 pt-0.5">
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
              <button
                onClick={(e) => { e.stopPropagation(); onToggleExpand?.() }}
                className="h-7 w-7 rounded-button border border-casa-border/80 bg-casa-surface/70 text-casa-muted hover:text-casa-text transition-colors inline-flex items-center justify-center"
                aria-label={expanded ? 'Collapse reminder actions' : 'Expand reminder actions'}
              >
                {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>
              </div>
          </div>

          <div className="flex items-center gap-1.5 mt-0.5 text-body-sm text-casa-muted">
            <Clock3 size={12} className="shrink-0" />
            {timed ? `${format(start, 'h:mm a')} – ${format(end, 'h:mm a')}` : 'All day reminder'}
          </div>

          {expanded && (onComplete || onSnooze) && (
            <div className="mt-2 flex items-center gap-1.5 pt-1 border-t border-amber-200/70">
              {onComplete && (
                <button
                  onClick={(e) => { e.stopPropagation(); onComplete() }}
                  className="h-7 px-2.5 rounded-button border border-casa-border bg-casa-surface text-body-sm font-semibold text-casa-text hover:bg-casa-bg transition-colors inline-flex items-center gap-1"
                >
                  <Check size={12} />
                  Done
                </button>
              )}
              {onSnooze && (
                <button
                  onClick={(e) => { e.stopPropagation(); onSnooze() }}
                  className="h-7 px-2.5 rounded-button border border-casa-border bg-casa-surface text-body-sm font-semibold text-casa-text hover:bg-casa-bg transition-colors"
                >
                  Snooze
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
