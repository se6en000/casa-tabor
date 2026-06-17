import { Check, TimerReset } from 'lucide-react'
import type { EventWithDetails } from '../../hooks/useCalendarEvents'
import { cn } from '../../utils/cn'

interface ReminderEventCardProps {
  event: EventWithDetails
  className?: string
  onClick?: () => void
  onComplete?: () => void
  onSnooze?: () => void
}

function cleanEventTitle(title: string): string {
  const pipeIdx = title.indexOf(' | ')
  return pipeIdx !== -1 ? title.slice(pipeIdx + 3) : title
}

export default function ReminderEventCard({
  event,
  className,
  onClick,
  onComplete,
  onSnooze,
}: ReminderEventCardProps) {
  const members = event.members ?? []
  const primary = members.find((m) => m.role === 'primary') ?? members[0]
  const others = members.filter((m) => m !== primary)

  return (
    <div
      onClick={onClick}
      className={cn(
        'min-w-0 bg-amber-50/60 rounded-card border border-amber-200',
        'inline-flex items-start gap-3 px-3 py-2.5',
        'cursor-pointer',
        className,
      )}
    >
      {/* Simple divider */}
      <div className="w-0.5 rounded-full self-stretch bg-amber-300/80 shrink-0 mt-0.5" />

      <div className="min-w-0 flex-1">
        <p className="font-semibold text-body-sm text-casa-text truncate">{cleanEventTitle(event.title)}</p>
        
        {/* Owner pills */}
        {members.length > 0 && (
          <div className="flex items-center gap-1 mt-1.5 shrink-0">
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
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-1 shrink-0">
        {onComplete && (
          <button
           onClick={(e) => { e.stopPropagation(); onComplete() }}
           className="h-6 px-2 rounded-button border border-casa-border bg-casa-surface text-body-sm font-semibold text-casa-text hover:bg-casa-bg transition-colors inline-flex items-center gap-1"
          >
           <Check size={11} />
           Done
          </button>
        )}
        {onSnooze && (
          <button
           onClick={(e) => { e.stopPropagation(); onSnooze() }}
           className="h-6 px-2 rounded-button border border-casa-border bg-casa-surface text-body-sm font-semibold text-casa-text hover:bg-casa-bg transition-colors inline-flex items-center gap-1"
          >
           <TimerReset size={11} />
           Snooze
          </button>
        )}
      </div>
    </div>
  )
}
