import { memo, useMemo } from 'react'
import { Calendar, ChevronDown, ChevronUp } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import { cn } from '../../../utils/cn'
import { Button } from '../../ui'
import { TIER_ICON_CHIP, TIER_TITLE } from '../../ui/WidgetContainer'
import { getEventStartDate } from '../../../utils/eventTime'
import type { EventWithDetails } from '../../../hooks/useCalendarEvents'
import type { FamilyMember } from '../../../types'
import EventCard from '../../calendar/EventCard'
import CompactReminderCard from '../../calendar/CompactReminderCard'

interface TomorrowPreviewWidgetProps {
  now: Date
  tomorrowEvents: EventWithDetails[]
  /** Reminders due tomorrow with a real time -- rendered inline, chronologically
   * with events, same as TodaysScheduleWidget. */
  reminders: EventWithDetails[]
  household: FamilyMember[]
  activeEventId: string | null
  collapsed: boolean
  onToggleCollapsed: () => void
  onViewFullCalendar: () => void
  onOpenEvent: (event: EventWithDetails) => void
}

/**
 * Tomorrow's schedule preview -- a quiet, secondary card beside Today's
 * To-Dos and Ahead (see the "Equal-Weight Split" home-hierarchy mock,
 * 2026-09-11). Real events render via the shared calendar EventCard, timed
 * reminders via CompactReminderCard, same as TodaysScheduleWidget --
 * see 2026-09-24.
 */
function TomorrowPreviewWidget({
  now,
  tomorrowEvents,
  reminders,
  household,
  activeEventId,
  collapsed,
  onToggleCollapsed,
  onViewFullCalendar,
  onOpenEvent,
}: TomorrowPreviewWidgetProps) {
  const items = useMemo(
    () => [...tomorrowEvents, ...reminders].sort(
      (a, b) => getEventStartDate(a).getTime() - getEventStartDate(b).getTime(),
    ),
    [tomorrowEvents, reminders],
  )
  return (
    // No outer card background, on purpose -- see TodaysScheduleWidget's matching
    // 2026-09-24 note.
    <div>
      <div
        role="button"
        tabIndex={0}
        onClick={onToggleCollapsed}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onToggleCollapsed()
          }
        }}
        className="w-full flex items-center justify-between px-1.5 py-1.5 -mx-1.5 rounded-xl hover:bg-casa-surface-subtle/70 transition-colors cursor-pointer select-none group min-h-[44px]"
        aria-expanded={!collapsed}
      >
        <div className="flex items-center gap-2">
          <div className={cn('w-6 h-6 rounded-lg flex items-center justify-center shrink-0', TIER_ICON_CHIP.structural)}>
            <Calendar size={13} />
          </div>
          <h3 className={cn('font-display text-body-lg font-bold tracking-tight', TIER_TITLE.structural)}>
            Tomorrow's Schedule
          </h3>
          <span className="px-1.5 py-0.5 rounded-full text-caption font-semibold bg-casa-gold/15 text-casa-navy border border-casa-gold/30">
            {items.length}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {!collapsed && (
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation()
                onViewFullCalendar()
              }}
              className="text-caption font-semibold text-casa-gold uppercase tracking-wider hover:underline min-h-[30px] h-7 px-1.5"
            >
              Full Calendar
            </Button>
          )}
          <div className="w-6 h-6 rounded-lg flex items-center justify-center text-casa-muted group-hover:text-casa-navy transition-transform">
            {collapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
          </div>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {!collapsed && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden space-y-1"
          >
            {items.length > 0 ? (
              <div className="space-y-2">
                <AnimatePresence initial={false}>
                  {items.map((evt) =>
                    evt.event_type === 'reminder' ? (
                      <CompactReminderCard
                        key={evt.id}
                        event={evt}
                        now={now}
                        isHighlighted={activeEventId === evt.id}
                        onClick={() => onOpenEvent(evt)}
                      />
                    ) : (
                      <EventCard
                        key={evt.id}
                        event={evt}
                        household={household}
                        now={now}
                        isHighlighted={activeEventId === evt.id}
                        onClick={() => onOpenEvent(evt)}
                      />
                    )
                  )}
                </AnimatePresence>
              </div>
            ) : (
              <div className="py-2.5 px-3 text-center text-caption text-casa-muted">
                No appointments scheduled for tomorrow.
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// tomorrowEvents only changes when tomorrow's actual data changes, not on
// the home screen's every-10-second clock tick -- memoized so it doesn't
// re-render along with everything else on ticks that don't touch it
// (2026-09-13; see the matching HouseholdDispatchCard change).
export default memo(TomorrowPreviewWidget)
