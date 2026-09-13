import { memo } from 'react'
import { format, parseISO } from 'date-fns'
import { Calendar, ChevronDown, ChevronUp, ChevronRight, Car } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import { cn } from '../../../utils/cn'
import { Button, PersonAvatarStack } from '../../ui'
import { TIER_CARD, TIER_ICON_CHIP, TIER_TITLE } from '../../ui/WidgetContainer'
import type { EventWithDetails } from '../../../hooks/useCalendarEvents'

interface TomorrowPreviewWidgetProps {
  tomorrowEvents: EventWithDetails[]
  collapsed: boolean
  onToggleCollapsed: () => void
  onViewFullCalendar: () => void
  onOpenEvent: (event: EventWithDetails) => void
}

/**
 * Tomorrow's schedule preview -- a quiet, secondary card beside Today's
 * To-Dos and Ahead (see the "Equal-Weight Split" home-hierarchy mock,
 * 2026-09-11).
 */
function TomorrowPreviewWidget({
  tomorrowEvents,
  collapsed,
  onToggleCollapsed,
  onViewFullCalendar,
  onOpenEvent,
}: TomorrowPreviewWidgetProps) {
  return (
    <div className={cn('rounded-container px-5 py-4', TIER_CARD.structural)}>
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
        className="w-full flex items-center justify-between px-1 py-1.5 -mx-1 rounded-xl hover:bg-casa-surface-subtle/70 transition-colors cursor-pointer select-none group min-h-[44px]"
        aria-expanded={!collapsed}
      >
        <div className="flex items-center gap-2">
          <div className={cn('w-6 h-6 rounded-lg flex items-center justify-center shrink-0', TIER_ICON_CHIP.structural)}>
            <Calendar size={13} />
          </div>
          <h3 className={cn('font-sans text-body-sm font-bold tracking-tight', TIER_TITLE.structural)}>
            Tomorrow's Schedule
          </h3>
          <span className="px-1.5 py-0.5 rounded-full text-3xs font-semibold bg-casa-gold/15 text-casa-navy border border-casa-gold/30">
            {tomorrowEvents.length}
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
              className="text-3xs font-semibold text-casa-gold uppercase tracking-wider hover:underline min-h-[30px] h-7 px-1.5"
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
            {tomorrowEvents.length > 0 ? (
              <div className="space-y-0.5">
                {tomorrowEvents.map((evt) => {
                  const driverMember = evt.members.find(
                    (m) =>
                      m.family_member?.name &&
                      (evt.title.toLowerCase().includes(m.family_member.name.toLowerCase() + ' drives') ||
                        evt.title.toLowerCase().includes('picked up by ' + m.family_member.name.toLowerCase()) ||
                        m.role?.toLowerCase() === 'driver')
                  )

                  const avatarPeople = evt.members.map((m) => ({
                    id: m.family_member?.id || m.id,
                    name: m.family_member?.name || 'Member',
                    color: m.family_member?.color_hex || 'var(--color-casa-navy)',
                  }))

                  return (
                    <div
                      key={evt.id}
                      role="button"
                      tabIndex={0}
                      data-tactile="true"
                      data-calendar-event
                      data-sidecar-loadable="true"
                      data-event-id={evt.id}
                      onClick={() => onOpenEvent(evt)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          onOpenEvent(evt)
                        }
                      }}
                      className="w-full flex items-center justify-between py-1 px-2 rounded-xl transition-all duration-150 cursor-pointer group gap-2.5 hover:bg-casa-surface hover:shadow-2xs active:scale-[0.98] min-h-[36px]"
                    >
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        {evt.all_day ? (
                          <span className="font-sans text-caption font-semibold text-casa-muted/80 shrink-0">
                            All Day
                          </span>
                        ) : (
                          <span className="font-mono text-caption font-bold text-casa-navy shrink-0 tabular-nums">
                            {format(parseISO(evt.start_time), 'h:mm a')}
                          </span>
                        )}
                        <span className="text-body-sm font-normal text-casa-navy truncate group-hover:text-casa-navy transition-colors">
                          {evt.title}
                        </span>
                        {evt.location_name && (
                          <span className="text-caption text-casa-muted font-normal truncate hidden md:inline">
                            · {evt.location_name}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {driverMember?.family_member?.name && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-2xs font-semibold bg-white text-casa-navy border border-casa-border/60 shadow-2xs hidden sm:inline-flex">
                            <Car size={11} className="text-casa-gold-hover shrink-0" />
                            <span>{driverMember.family_member.name} drives</span>
                          </span>
                        )}
                        <PersonAvatarStack people={avatarPeople} size="sm" max={2} />
                        <ChevronRight
                          size={14}
                          className="text-casa-muted/40 group-hover:text-casa-navy transition-transform group-hover:translate-x-0.5"
                        />
                      </div>
                    </div>
                  )
                })}
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
