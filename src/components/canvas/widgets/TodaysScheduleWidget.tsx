import { useMemo } from 'react'
import { isBefore } from 'date-fns'
import { Calendar, ChevronDown, ChevronUp, Check } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import { cn } from '../../../utils/cn'
import { Button } from '../../ui'
import { TIER_ICON_CHIP, TIER_TITLE } from '../../ui/WidgetContainer'
import { getEventEndDate, getEventStartDate } from '../../../utils/eventTime'
import type { EventWithDetails } from '../../../hooks/useCalendarEvents'
import type { FamilyMember } from '../../../types'
import EventCard from '../../calendar/EventCard'
import CompactReminderCard from '../../calendar/CompactReminderCard'

interface TodaysScheduleWidgetProps {
  now: Date
  pastEvents: EventWithDetails[]
  upcomingAppointments: EventWithDetails[]
  /** Reminders with a real due time today -- rendered inline, chronologically
   * with events, via the calendar's own (lighter-weight) reminder card. A
   * date-less or all-day reminder never reaches this prop -- it stays in
   * Today's To-Dos only. */
  reminders: EventWithDetails[]
  household: FamilyMember[]
  activeEventId: string | null
  collapsed: boolean
  onToggleCollapsed: () => void
  onExpandAll: () => void
  onOpenEvent: (event: EventWithDetails) => void
}

function byStartTime(a: EventWithDetails, b: EventWithDetails) {
  return getEventStartDate(a).getTime() - getEventStartDate(b).getTime()
}

/**
 * Today's full schedule, promoted to a full-width timeline (equal billing
 * with the Hero card, not squeezed into the narrow rail) -- see the
 * "Equal-Weight Split" home-hierarchy mock approved 2026-09-11.
 *
 * Past events always show, dimmed but not struck through, with a "Now"
 * divider marking where today actually is -- per live feedback 2026-09-12,
 * hiding them behind a toggle just meant the toggle was always left open.
 */
export default function TodaysScheduleWidget({
  now,
  pastEvents,
  upcomingAppointments,
  reminders,
  household,
  activeEventId,
  collapsed,
  onToggleCollapsed,
  onExpandAll,
  onOpenEvent,
}: TodaysScheduleWidgetProps) {
  const pastItems = useMemo(
    () => [...pastEvents, ...reminders.filter((r) => isBefore(getEventEndDate(r), now))].sort(byStartTime),
    [pastEvents, reminders, now],
  )
  const upcomingItems = useMemo(
    () => [...upcomingAppointments, ...reminders.filter((r) => !isBefore(getEventEndDate(r), now))].sort(byStartTime),
    [upcomingAppointments, reminders, now],
  )

  if (upcomingItems.length === 0 && pastItems.length === 0) return null

  return (
    // No outer card background, on purpose -- with real per-event EventCards inside,
    // a white section box around them just read as cards-within-a-card. The header
    // floats directly on the page; see 2026-09-24 follow-up.
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
        className="w-full flex items-center justify-between px-1.5 py-1.5 -mx-1.5 rounded-xl hover:bg-casa-surface-subtle/70 transition-colors cursor-pointer select-none group min-h-[44px] mb-2.5"
        aria-expanded={!collapsed}
      >
        <div className="flex items-center gap-2.5">
          <div className={cn('w-7 h-7 rounded-lg flex items-center justify-center shrink-0', TIER_ICON_CHIP.structural)}>
            <Calendar size={15} />
          </div>
          <h3 className={cn('font-display text-body-lg font-bold tracking-tight group-hover:text-casa-gold transition-colors', TIER_TITLE.structural)}>
            Today's Schedule
          </h3>
          {upcomingItems.length > 0 ? (
            <span className="px-2 py-0.5 rounded-full text-caption font-semibold bg-casa-gold/15 text-casa-navy border border-casa-gold/30">
              {upcomingItems.length}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-caption font-semibold uppercase tracking-wider bg-emerald-500/15 text-emerald-800 border border-emerald-500/25">
              <Check size={11} className="stroke-[3]" />
              <span>Completed</span>
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {upcomingItems.length > 0 && !collapsed && (
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation()
                onExpandAll()
              }}
              className="text-caption font-semibold text-casa-gold uppercase tracking-wider hover:underline min-h-[30px] h-7 px-1.5"
            >
              Expand All
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
            className="overflow-hidden"
          >
            {/* Real events render as the calendar's own stacking-view EventCard
                (self-selects the dimmed compact treatment for past events, the
                navy "hero" fill for whatever's happening right now) so this
                widget and the calendar look and behave identically -- see
                2026-09-24. The connecting rail this used to draw is gone with
                it; EventCard is a plain vertical stack, same as StackedView. */}
            <div className="space-y-2">
              <AnimatePresence initial={false}>
                {pastItems.map((evt) =>
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

              {pastItems.length > 0 && upcomingItems.length > 0 && (
                <div className="flex items-center gap-2.5 py-1" aria-hidden="true">
                  <span className="w-2 h-2 rounded-full bg-casa-gold shrink-0" />
                  <span className="text-caption font-bold uppercase tracking-widest text-casa-gold-hover shrink-0">Now</span>
                  <span className="flex-1 h-px bg-casa-gold/40" />
                </div>
              )}

              <AnimatePresence initial={false}>
                {upcomingItems.map((evt) =>
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
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
