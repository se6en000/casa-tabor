import { format, parseISO } from 'date-fns'
import { Calendar, ChevronDown, ChevronUp, ChevronRight, Check } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import { cn } from '../../../utils/cn'
import { Button, PersonAvatarStack } from '../../ui'
import { TIER_CARD, TIER_ICON_CHIP, TIER_TITLE } from '../../ui/WidgetContainer'
import type { EventWithDetails } from '../../../hooks/useCalendarEvents'

interface TodaysScheduleWidgetProps {
  now: Date
  pastEvents: EventWithDetails[]
  upcomingAppointments: EventWithDetails[]
  collapsed: boolean
  onToggleCollapsed: () => void
  onExpandAll: () => void
  onOpenEvent: (event: EventWithDetails) => void
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
  collapsed,
  onToggleCollapsed,
  onExpandAll,
  onOpenEvent,
}: TodaysScheduleWidgetProps) {
  if (upcomingAppointments.length === 0 && pastEvents.length === 0) return null

  return (
    <div className={cn('rounded-container px-5 py-4 sm:px-6 sm:py-5', TIER_CARD.structural)}>
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
        className="w-full flex items-center justify-between px-1 py-1 -mx-1 rounded-xl hover:bg-casa-surface-subtle/70 transition-colors cursor-pointer select-none group min-h-[44px] mb-2"
        aria-expanded={!collapsed}
      >
        <div className="flex items-center gap-2.5">
          <div className={cn('w-7 h-7 rounded-lg flex items-center justify-center shrink-0', TIER_ICON_CHIP.structural)}>
            <Calendar size={15} />
          </div>
          <h3 className={cn('font-display text-heading font-semibold tracking-tight group-hover:text-casa-gold transition-colors', TIER_TITLE.structural)}>
            Today's Schedule
          </h3>
          {upcomingAppointments.length > 0 ? (
            <span className="px-2 py-0.5 rounded-full text-3xs font-semibold bg-casa-gold/15 text-casa-navy border border-casa-gold/30">
              {upcomingAppointments.length}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-3xs font-semibold uppercase tracking-wider bg-emerald-500/15 text-emerald-800 border border-emerald-500/25">
              <Check size={9} className="stroke-[3]" />
              <span>Completed</span>
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {upcomingAppointments.length > 0 && !collapsed && (
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation()
                onExpandAll()
              }}
              className="text-3xs font-semibold text-casa-gold uppercase tracking-wider hover:underline min-h-[30px] h-7 px-1.5"
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
            {/* Connecting timeline: a rail down the left edge ties every row
                together as one continuous day, not a plain divided list. */}
            <div className="relative pl-7">
              <div className="absolute left-[13px] top-2 bottom-2 w-px bg-casa-border" />

              {pastEvents.map((evt) => (
                <div
                  key={evt.id}
                  data-calendar-event
                  data-sidecar-loadable="true"
                  data-event-id={evt.id}
                  onClick={() => onOpenEvent(evt)}
                  className="relative flex items-center justify-between gap-3 py-2.5 pl-6 pr-2 -ml-7 rounded-xl opacity-55 hover:opacity-90 hover:bg-casa-surface-subtle/60 transition-all cursor-pointer group min-h-[44px]"
                >
                  <span className="absolute left-[6.5px] top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-casa-text-faint border-2 border-casa-surface" />
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    {evt.all_day ? (
                      <span className="font-sans text-caption font-semibold text-casa-muted shrink-0 w-16">All Day</span>
                    ) : (
                      <span className="font-mono text-caption font-bold text-casa-muted shrink-0 tabular-nums w-16">
                        {format(parseISO(evt.start_time), 'h:mm a')}
                      </span>
                    )}
                    <span className="text-body-sm truncate text-casa-muted group-hover:text-casa-navy transition-colors">
                      {evt.title}
                    </span>
                    {evt.location_name && (
                      <span className="text-caption text-casa-muted truncate hidden md:inline">
                        · {evt.location_name}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {evt.members.map((m) => (
                      <span
                        key={m.id}
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: m.family_member?.color_hex || 'var(--color-casa-muted)' }}
                        title={m.family_member?.name}
                      />
                    ))}
                  </div>
                </div>
              ))}

              {pastEvents.length > 0 && (
                <div className="relative flex items-center gap-2.5 py-2 pl-6 -ml-7" aria-hidden="true">
                  <span className="absolute left-[7px] top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-casa-gold border-2 border-casa-surface" />
                  <span className="text-3xs font-bold uppercase tracking-widest text-casa-gold-hover shrink-0">Now</span>
                  <span className="flex-1 h-px bg-casa-gold/40" />
                </div>
              )}

              {upcomingAppointments.map((evt) => {
                let isNow = false
                try {
                  const start = parseISO(evt.start_time).getTime()
                  const end = parseISO(evt.end_time).getTime()
                  const currentTime = now.getTime()
                  isNow = !evt.all_day && currentTime >= start && currentTime <= end
                } catch {
                  // Ignore parse errors
                }

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
                    className="relative flex items-center justify-between gap-4 py-3.5 pl-6 pr-2 -ml-7 rounded-xl transition-all duration-150 cursor-pointer group active:scale-[0.99] min-h-[56px] hover:bg-casa-surface-subtle/60"
                  >
                    <span
                      className={cn(
                        'absolute left-1.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full border-2 border-casa-surface',
                        isNow && 'shadow-[0_0_0_3px_rgba(39,174,96,0.18)]',
                        isNow ? 'bg-casa-success' : 'bg-casa-gold'
                      )}
                    />
                    <div className="flex items-center gap-4 min-w-0 flex-1">
                      {evt.all_day ? (
                        <span className="font-sans text-caption font-semibold text-casa-navy shrink-0 w-16">All Day</span>
                      ) : (
                        <span className={cn('font-mono text-body-sm font-bold shrink-0 tabular-nums w-16', isNow ? 'text-casa-success-strong' : 'text-casa-navy')}>
                          {format(parseISO(evt.start_time), 'h:mm a')}
                        </span>
                      )}
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-display text-body-lg font-semibold text-casa-navy truncate">
                            {evt.title}
                          </span>
                          {isNow && (
                            <span className="text-3xs font-bold uppercase tracking-wider text-casa-success-strong shrink-0">
                              Now
                            </span>
                          )}
                        </div>
                        {evt.location_name && (
                          <span className="text-caption text-casa-muted font-normal">{evt.location_name}</span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {driverMember?.family_member?.name && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-caption font-bold bg-white text-casa-navy border border-casa-border/60 shadow-2xs hidden sm:inline-flex">
                          <span
                            className="w-2 h-2 rounded-full shrink-0"
                            style={{ backgroundColor: driverMember.family_member.color_hex || 'var(--color-casa-navy)' }}
                          />
                          <span>{driverMember.family_member.name} drives</span>
                        </span>
                      )}
                      <PersonAvatarStack people={avatarPeople} size="sm" max={3} />
                      <ChevronRight
                        size={16}
                        className="text-casa-muted/40 group-hover:text-casa-navy transition-transform group-hover:translate-x-0.5"
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
