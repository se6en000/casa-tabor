import { format, parseISO, isBefore, startOfDay } from 'date-fns'
import { Check, ChevronDown, ChevronUp, ChevronRight, Clock, CheckCircle2 } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import { cn } from '../../../utils/cn'
import { getEventStartDate } from '../../../utils/eventTime'
import { Button, IconButton, PersonAvatarStack } from '../../ui'
import { TIER_CARD, TIER_ICON_CHIP, TIER_TITLE } from '../../ui/WidgetContainer'
import type { EventWithDetails } from '../../../hooks/useCalendarEvents'

interface TodaysTodosWidgetProps {
  now: Date
  todayReminders: EventWithDetails[]
  openReminders: EventWithDetails[]
  overdueReminders: EventWithDetails[]
  activeReminders: EventWithDetails[]
  completedReminders: EventWithDetails[]
  collapsed: boolean
  onToggleCollapsed: () => void
  showOverdue: boolean
  onToggleOverdue: () => void
  expanded: boolean
  onToggleExpanded: () => void
  completedCollapsed: boolean
  onToggleCompleted: () => void
  onToggleReminder: (id: string) => void | Promise<void>
  onOpenEvent: (event: EventWithDetails) => void
}

/**
 * Today's to-do list -- a quiet, secondary card next to Ahead and Tomorrow's
 * Schedule (see the "Equal-Weight Split" home-hierarchy mock, 2026-09-11).
 * Deliberately stays small/plain: the whole point of that layout is that
 * Today's Schedule (a separate, promoted widget) carries the visual weight.
 */
export default function TodaysTodosWidget({
  now,
  todayReminders,
  openReminders,
  overdueReminders,
  activeReminders,
  completedReminders,
  collapsed,
  onToggleCollapsed,
  showOverdue,
  onToggleOverdue,
  expanded,
  onToggleExpanded,
  completedCollapsed,
  onToggleCompleted,
  onToggleReminder,
  onOpenEvent,
}: TodaysTodosWidgetProps) {
  if (todayReminders.length === 0) return null

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
            <Check size={13} strokeWidth={2.5} />
          </div>
          <h3 className={cn('font-sans text-body-sm font-bold tracking-tight group-hover:text-casa-gold transition-colors', TIER_TITLE.structural)}>
            Today's To-Dos
          </h3>
          <span className="px-1.5 py-0.5 rounded-full text-3xs font-semibold bg-casa-gold/15 text-casa-navy border border-casa-gold/30">
            {completedReminders.length > 0
              ? `${openReminders.length} left · ${completedReminders.length} done`
              : `${todayReminders.length}`}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {!collapsed && (
            <span className="text-3xs text-casa-muted/80 font-medium uppercase tracking-wider hidden sm:inline">1-tap to complete</span>
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
            {overdueReminders.length > 0 && (() => {
              const hasPastDayOverdue = overdueReminders.some((evt) => isBefore(getEventStartDate(evt), startOfDay(now)))
              return (
                <div className="mb-1.5">
                  <Button
                    variant="ghost"
                    size="sm"
                    fullWidth
                    align="between"
                    onClick={onToggleOverdue}
                    className="min-h-[32px] h-8 py-0.5 px-2.5 rounded-lg bg-casa-warning-soft hover:bg-casa-warning/20 text-caption text-casa-warning-strong border border-casa-warning/30 transition-colors shadow-2xs"
                  >
                    <span className="inline-flex items-center gap-1.5 font-semibold text-caption text-casa-warning-strong">
                      <Clock size={12} className="text-casa-warning-strong shrink-0" />
                      <span>
                        {hasPastDayOverdue
                          ? `${overdueReminders.length} overdue ${overdueReminders.length === 1 ? 'item' : 'items'} pending`
                          : `${overdueReminders.length} ${overdueReminders.length === 1 ? 'item' : 'items'} pending from earlier today`}
                      </span>
                    </span>
                    {showOverdue ? <ChevronUp size={12} className="text-casa-warning-strong shrink-0" /> : <ChevronDown size={12} className="text-casa-warning-strong shrink-0" />}
                  </Button>

                  <AnimatePresence initial={false}>
                    {showOverdue && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                        className="space-y-1 pt-1 overflow-hidden"
                      >
                        {overdueReminders.map((evt) => {
                          const avatarPeople = evt.members.map((m) => ({
                            id: m.family_member?.id || m.id,
                            name: m.family_member?.name || 'Member',
                            color: m.family_member?.color_hex || 'var(--color-casa-navy)',
                          }))
                          const startDate = getEventStartDate(evt)
                          const isPastDay = isBefore(startDate, startOfDay(now))

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
                              className="w-full flex items-center justify-between py-1.5 px-2.5 rounded-xl transition-all duration-150 cursor-pointer group gap-2.5 select-none active:scale-[0.99] min-h-[38px] bg-casa-warning-soft border border-casa-warning/25 hover:bg-casa-warning/15 hover:border-casa-warning/40 shadow-2xs"
                            >
                              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                <IconButton
                                  size="sm"
                                  variant="ghost"
                                  onClick={async (e) => {
                                    e.stopPropagation()
                                    try {
                                      navigator.vibrate?.(10)
                                    } catch {
                                      // ignore — vibrate not supported
                                    }
                                    await onToggleReminder(evt.id)
                                  }}
                                  className="rounded-full shrink-0 transition-all duration-150 text-casa-muted hover:text-casa-navy hover:bg-casa-surface-subtle h-6 w-6 min-h-0 p-0"
                                  aria-label={`Mark ${evt.title} done`}
                                  icon={
                                    <div className="w-4.5 h-4.5 rounded-full border-[1.5px] border-casa-warning hover:border-casa-navy bg-white shadow-2xs group-hover:scale-105 transition-transform" />
                                  }
                                />

                                {isPastDay ? (
                                  <span className="font-mono text-caption font-bold text-casa-warning-strong shrink-0 tabular-nums">
                                    {evt.all_day ? format(startDate, 'MMM d') : format(startDate, 'MMM d · h:mm a')}
                                  </span>
                                ) : (
                                  <span className="font-mono text-caption font-bold text-casa-warning-strong shrink-0 tabular-nums">
                                    {format(parseISO(evt.start_time), 'h:mm a')}
                                  </span>
                                )}

                                <span className={cn(
                                  'px-1.5 py-0.5 rounded text-3xs font-bold uppercase tracking-wider shrink-0',
                                  isPastDay
                                    ? 'bg-rose-500/20 text-rose-950 border border-rose-500/30'
                                    : 'bg-casa-warning/20 text-casa-warning-strong border border-casa-warning/40'
                                )}>
                                  {isPastDay ? 'Missed' : 'Overdue'}
                                </span>

                                <span className="text-body-sm font-semibold text-casa-navy truncate transition-colors flex-1 group-hover:text-casa-warning-strong">
                                  {evt.title}
                                </span>
                              </div>

                              <div className="flex items-center gap-1.5 shrink-0">
                                {avatarPeople.length > 0 && <PersonAvatarStack people={avatarPeople} size="sm" max={2} />}
                                <ChevronRight
                                  size={14}
                                  className="text-casa-muted/40 group-hover:text-casa-navy transition-transform group-hover:translate-x-0.5"
                                />
                              </div>
                            </div>
                          )
                        })}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )
            })()}

            {activeReminders.length > 0 && (
              <div className="space-y-0.5">
                {(expanded ? activeReminders : activeReminders.slice(0, 3)).map((evt) => {
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
                      className="w-full flex items-center justify-between py-1 px-2 rounded-xl transition-all duration-150 cursor-pointer group gap-2.5 select-none active:scale-[0.99] min-h-[36px] hover:bg-casa-surface hover:shadow-2xs"
                    >
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <IconButton
                          size="sm"
                          variant="ghost"
                          onClick={async (e) => {
                            e.stopPropagation()
                            try {
                              navigator.vibrate?.(10)
                            } catch {
                              // ignore — vibrate not supported
                            }
                            await onToggleReminder(evt.id)
                          }}
                          className="rounded-full shrink-0 transition-all duration-150 h-6 w-6 min-h-0 p-0 text-casa-muted hover:text-casa-navy hover:bg-casa-surface-subtle"
                          aria-label={`Mark ${evt.title} done`}
                          icon={
                            <div className="w-4.5 h-4.5 rounded-full border-[1.5px] border-slate-300 hover:border-casa-navy bg-white shadow-2xs transition-colors" />
                          }
                        />

                        {evt.all_day ? (
                          <span className="font-sans text-caption font-semibold text-casa-muted/80 shrink-0">
                            All Day
                          </span>
                        ) : (
                          <span className="font-mono text-caption font-bold text-casa-navy shrink-0 tabular-nums">
                            {format(parseISO(evt.start_time), 'h:mm a')}
                          </span>
                        )}

                        <span className="text-body-sm font-normal text-casa-navy group-hover:text-casa-navy truncate transition-colors flex-1">
                          {evt.title}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {avatarPeople.length > 0 && <PersonAvatarStack people={avatarPeople} size="sm" max={2} />}
                        <ChevronRight
                          size={14}
                          className="text-casa-muted/40 group-hover:text-casa-navy transition-transform group-hover:translate-x-0.5"
                        />
                      </div>
                    </div>
                  )
                })}

                {activeReminders.length > 3 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={onToggleExpanded}
                    className="w-full flex items-center justify-center gap-1 py-1 text-caption font-medium text-casa-muted hover:text-casa-navy transition-colors min-h-[30px] h-7 rounded-lg hover:bg-casa-surface-subtle mt-0.5"
                  >
                    {expanded ? (
                      <>
                        <span>Show less</span>
                        <ChevronUp size={13} />
                      </>
                    ) : (
                      <>
                        <span>+ {activeReminders.length - 3} more to-dos</span>
                        <ChevronDown size={13} />
                      </>
                    )}
                  </Button>
                )}
              </div>
            )}

            {completedReminders.length > 0 && (
              <div className="pt-2 border-t border-casa-border/40 mt-1.5">
                <div
                  role="button"
                  tabIndex={0}
                  onClick={onToggleCompleted}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      onToggleCompleted()
                    }
                  }}
                  className="w-full flex items-center justify-between py-1 px-1.5 rounded-lg hover:bg-casa-surface-subtle/70 transition-colors cursor-pointer select-none group min-h-[32px] text-casa-muted mb-0.5"
                  aria-expanded={!completedCollapsed}
                >
                  <div className="flex items-center gap-1.5">
                    <CheckCircle2 size={13} className="text-emerald-600 shrink-0" />
                    <span className="text-caption font-semibold text-casa-muted group-hover:text-casa-navy transition-colors">
                      Completed Today ({completedReminders.length})
                    </span>
                  </div>
                  <div className="w-5 h-5 rounded flex items-center justify-center text-casa-muted group-hover:text-casa-navy transition-transform">
                    {completedCollapsed ? <ChevronDown size={13} /> : <ChevronUp size={13} />}
                  </div>
                </div>

                <AnimatePresence initial={false}>
                  {!completedCollapsed && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                      className="space-y-0.5 overflow-hidden"
                    >
                      {completedReminders.map((evt) => {
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
                            className="w-full flex items-center justify-between py-1 px-2 rounded-xl transition-all duration-150 cursor-pointer group gap-2.5 select-none active:scale-[0.99] min-h-[36px] bg-emerald-500/[0.04] border border-emerald-500/15 hover:bg-emerald-500/[0.08]"
                          >
                            <div className="flex items-center gap-2.5 min-w-0 flex-1">
                              <IconButton
                                size="sm"
                                variant="ghost"
                                onClick={async (e) => {
                                  e.stopPropagation()
                                  try {
                                    navigator.vibrate?.(10)
                                  } catch {
                                    // ignore — vibrate not supported
                                  }
                                  await onToggleReminder(evt.id)
                                }}
                                className="rounded-full shrink-0 transition-all duration-150 text-emerald-700 hover:text-emerald-900 bg-emerald-100/70 hover:bg-emerald-200 h-6 w-6 min-h-0 p-0"
                                aria-label={`Mark ${evt.title} incomplete`}
                                icon={<CheckCircle2 size={16} className="text-emerald-600" />}
                              />

                              {evt.all_day ? (
                                <span className="font-sans text-caption font-semibold text-casa-muted/70 shrink-0">
                                  All Day
                                </span>
                              ) : (
                                <span className="font-mono text-caption font-semibold text-casa-muted/70 shrink-0 tabular-nums">
                                  {format(parseISO(evt.start_time), 'h:mm a')}
                                </span>
                              )}

                              <span className="text-body-sm truncate transition-colors flex-1 line-through text-casa-muted/70">
                                {evt.title}
                              </span>
                            </div>

                            <div className="flex items-center gap-1.5 shrink-0 opacity-60 group-hover:opacity-100 transition-opacity">
                              {avatarPeople.length > 0 && <PersonAvatarStack people={avatarPeople} size="sm" max={2} />}
                              <ChevronRight
                                size={14}
                                className="text-casa-muted/40 group-hover:text-casa-navy transition-transform group-hover:translate-x-0.5"
                              />
                            </div>
                          </div>
                        )
                      })}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
