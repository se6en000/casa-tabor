import { Check, TimerReset } from 'lucide-react'
import { useState } from 'react'
import type { EventWithDetails } from '../../hooks/useCalendarEvents'
import { cn } from '../../utils/cn'
import { cleanEventTitle } from '../../utils/eventTitle'
import { Button, Chip } from '../ui'

interface ReminderEventCardProps {
  event: EventWithDetails
  className?: string
  onClick?: () => void
  onComplete?: () => void | Promise<void>
  onSnooze?: () => void | Promise<void>
}

export default function ReminderEventCard({
  event,
  className,
  onClick,
  onComplete,
  onSnooze,
}: ReminderEventCardProps) {
  const [isAnimatingOut, setIsAnimatingOut] = useState(false)
  const members = event.members ?? []
  const primary = members.find((m) => m.role === 'primary') ?? members[0]
  const others = members.filter((m) => m !== primary)

  const handleComplete = async (e: React.MouseEvent) => {
    e.stopPropagation()
    setIsAnimatingOut(true)
    await new Promise(resolve => setTimeout(resolve, 220))
    await onComplete?.()
  }

  const handleSnooze = async (e: React.MouseEvent) => {
    e.stopPropagation()
    setIsAnimatingOut(true)
    await new Promise(resolve => setTimeout(resolve, 220))
    await onSnooze?.()
    // Timed reminders remain in the same list; reset so they can reappear at the new time.
    await new Promise(resolve => setTimeout(resolve, 220))
    setIsAnimatingOut(false)
  }

  return (
    <div
      onClick={(e) => {
        e.stopPropagation()
        onClick?.()
      }}
      onKeyDown={(e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return
        e.preventDefault()
        onClick?.()
      }}
      role="button"
      tabIndex={0}
      className={cn(
        'min-w-0 bg-amber-50/60 rounded-card border border-amber-200',
        'flex items-center gap-3 px-3 py-2.5 transition-all duration-300',
        'cursor-pointer',
        isAnimatingOut && 'opacity-0 scale-95 -translate-x-2 pointer-events-none',
        className,
      )}
    >
      {/* Simple divider */}
      <div className="w-0.5 rounded-full self-stretch bg-amber-300/80 shrink-0" />

      {/* Title */}
      <p className="font-semibold text-body-sm text-casa-text truncate min-w-0">
        {cleanEventTitle(event.title)}
      </p>

      {/* Action buttons (next to title) */}
      <div className="flex items-center gap-1 shrink-0">
        {onComplete && (
          <Button
           onClick={handleComplete}
           variant="secondary"
           size="sm"
           leadingIcon={<Check size={14} />}
          >
           Done
          </Button>
        )}
        {onSnooze && (
          <Button
           onClick={handleSnooze}
           variant="secondary"
           size="sm"
           leadingIcon={<TimerReset size={14} />}
          >
           Snooze
          </Button>
        )}
      </div>

      {/* Spacer to push owners to right */}
      <div className="flex-1" />

      {/* Owner pills (right side) */}
      {members.length > 0 && (
        <div className="flex items-center gap-1 shrink-0">
          {primary && (
           <Chip
             size="sm"
             className="border-transparent text-white"
             style={{ backgroundColor: primary.family_member?.color_hex ?? '#888' }}
             title={primary.family_member?.name ?? ''}
           >
             {primary.family_member?.name}
           </Chip>
          )}
          {others.slice(0, 1).map((m) => (
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
  )
}
