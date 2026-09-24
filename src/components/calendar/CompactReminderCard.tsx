import { format, isBefore } from 'date-fns'
import { Bell } from 'lucide-react'
import { cn } from '../../utils/cn'
import { cleanEventTitle } from '../../utils/eventTitle'
import { isTimedReminder } from '../../utils/holidays'
import { getEventEndDate, getEventStartDate } from '../../utils/eventTime'
import { CalendarPill } from '../ui'
import { MemberJewelStack } from '../ui/MemberJewelPill'
import type { EventWithDetails } from '../../hooks/useCalendarEvents'

// The single card used for every reminder in the calendar's stacking view
// (StackedView.tsx / DayView.tsx). Since 2026-09-24, also used by the
// living-canvas Today's Schedule / Tomorrow's Schedule widgets for timed
// reminders due today/tomorrow (see [[casa_tabor_reminder_ux_todo]]) --
// deliberately lighter-weight than EventCard: a reminder is a self-note, not
// a hard-scheduled commitment with location/duration/attendees, so it keeps
// its own amber-toned treatment rather than borrowing EventCard's look.

export interface CompactReminderCardProps {
  event: EventWithDetails
  now?: Date
  isHighlighted?: boolean
  onClick: () => void
}

export default function CompactReminderCard({ event, now = new Date(), isHighlighted = false, onClick }: CompactReminderCardProps) {
  const start = getEventStartDate(event)
  const end = getEventEndDate(event)
  const past = isBefore(end, now)
  const isTimed = isTimedReminder(event)
  const cleanTitle = cleanEventTitle(event.title)
  const members = event.members ?? []

  if (past) {
    return (
      <div
        onClick={(e) => { e.stopPropagation(); onClick() }}
        onKeyDown={(e) => {
          if (e.key !== 'Enter' && e.key !== ' ') return
          e.preventDefault()
          onClick()
        }}
        role="button"
        tabIndex={0}
        className={cn(
          'relative w-full rounded-xl border border-amber-300/60 bg-amber-50/40 shadow-xs cursor-pointer touch-pan-y overflow-hidden',
          'hover:opacity-85 hover:border-amber-400/80 transition-all duration-200 min-h-[38px] px-2.5 py-1.5 flex items-center justify-between gap-2',
          'border-l-4 border-l-amber-400',
          isHighlighted ? 'border-2 border-casa-gold shadow-md opacity-100 font-bold' : 'opacity-45'
        )}
        data-calendar-event
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <span className="font-mono text-caption font-bold text-amber-950 tabular-nums shrink-0">
            {isTimed ? format(start, 'h:mm a') : 'ALL DAY'}
          </span>
          <span className="text-amber-300 shrink-0">•</span>
          <span className="text-caption sm:text-body-sm font-semibold text-casa-navy truncate">
            {cleanTitle}
          </span>
        </div>
        {members.length > 0 && (
          <div className="flex items-center gap-1 shrink-0">
            {members.slice(0, 2).map((m) => (
              <CalendarPill
                key={m.id}
                color={m.family_member?.color_hex ?? 'var(--color-casa-gold)'}
                className="!text-2xs !py-0 !px-1.5"
              >
                {m.family_member?.name}
              </CalendarPill>
            ))}
          </div>
        )}
      </div>
    )
  }

  if (!isTimed) {
    return (
      <div
        onClick={(e) => { e.stopPropagation(); onClick() }}
        onKeyDown={(e) => {
          if (e.key !== 'Enter' && e.key !== ' ') return
          e.preventDefault()
          onClick()
        }}
        role="button"
        tabIndex={0}
        className={cn(
          'relative w-full rounded-xl border bg-amber-50/30 shadow-2xs cursor-pointer touch-pan-y overflow-hidden transition-all duration-200 px-3 py-2.5 flex items-center justify-between gap-2.5 min-h-[44px]',
          isHighlighted ? 'border-2 border-amber-400 shadow-md font-bold' : 'border-amber-200/70 hover:shadow-card-hover hover:border-amber-300',
        )}
        data-calendar-event
        data-sidecar-loadable="true"
        data-event-id={event.id}
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <span className="shrink-0 px-2 py-0.5 rounded-md bg-amber-100/90 text-amber-900 border border-amber-300/80 text-3xs font-extrabold tracking-wider uppercase flex items-center gap-1 leading-none">
            <Bell size={10} className="text-amber-800 shrink-0" />
            <span>Reminder</span>
          </span>
          <span className="text-body-sm font-semibold text-casa-navy truncate">
            {cleanTitle}
          </span>
        </div>
        {members.length > 0 && (
          <MemberJewelStack members={members} max={2} size="sm" />
        )}
      </div>
    )
  }

  return (
    <div
      onClick={(e) => { e.stopPropagation(); onClick() }}
      onKeyDown={(e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return
        e.preventDefault()
        onClick()
      }}
      role="button"
      tabIndex={0}
      className={cn(
        'relative w-full rounded-widget border bg-amber-50/40 shadow-card cursor-pointer touch-pan-x touch-pan-y overflow-hidden',
        'hover:shadow-card-hover hover:border-amber-400/80 transition-[box-shadow,border-color,opacity] duration-150 min-h-control',
        'grid grid-cols-[5.75rem_1fr]',
        isHighlighted ? 'border-2 border-casa-gold shadow-md' : 'border-amber-300/60',
        past && !isHighlighted && 'opacity-45'
      )}
      data-calendar-event
      data-sidecar-loadable="true"
      data-event-id={event.id}
    >
      {/* Straight Amber Left Pillar */}
      <div className="p-2.5 bg-amber-100/70 text-amber-950 flex flex-col justify-between items-start border-r border-amber-200/60 border-l-4 border-l-amber-400 min-w-0 overflow-hidden">
        <div className="w-full min-w-0">
          <span className="font-mono text-body font-bold text-amber-950 tabular-nums leading-none block">
            {format(start, 'h:mm')}
          </span>
          <span className="font-mono text-caption uppercase text-amber-900/70 font-semibold leading-none mt-1 block">
            {format(start, 'a')}
          </span>
        </div>
        <Bell size={11} className="text-amber-800 shrink-0 mt-1" />
      </div>

      {/* Content Deck */}
      <div className="p-2.5 flex flex-col justify-between gap-1.5 bg-casa-surface/50 min-w-0">
        <p className="text-body font-bold text-casa-navy line-clamp-2 leading-snug">
          {cleanTitle}
        </p>
        {members.length > 0 && (
          <div className="flex items-center gap-1 flex-wrap pt-0.5">
            <MemberJewelStack members={members} max={2} size="sm" />
          </div>
        )}
      </div>
    </div>
  )
}
