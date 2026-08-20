import { useState, useMemo } from 'react'
import {
  format,
  addDays,
  differenceInMinutes,
  endOfDay,
  startOfDay,
  isBefore,
  isSameDay,
} from 'date-fns'
import {
  ChevronRight,
  Check,
  CheckCircle2,
  CheckSquare,
} from 'lucide-react'
import { useRollingEvents, type EventWithDetails } from '../../hooks/useCalendarEvents'
import { getEventStartDate, getEventEndDate, eventOverlapsDay } from '../../utils/eventTime'
import { useLiveClock } from '../../hooks/useLiveClock'
import { inferEventMode, inferEventPlanKind } from '../../lib/eventCommandCenter'
import { isReminderOrChore } from '../../lib/heroFocus.mjs'
import { openEventDetails } from '../../utils/openEventDetails'
import { useReminderNeedsYouActions } from '../../hooks/useReminderNeedsYouActions'
import GmailSyncStatusIndicator from '../shared/GmailSyncStatusIndicator'
import { EventSyncStatusDot } from '../calendar/EventSyncStatusDot'
import { IconButton } from '../ui'
import { cn } from '../../utils/cn'

export function isHeroTravel(ev: EventWithDetails | null | undefined): boolean {
  if (!ev || ev.all_day || ev.event_type === 'reminder') return false
  const mode = inferEventMode(ev)
  const kind = inferEventPlanKind(ev, mode)
  if (kind !== 'travel') return false
  const loc = (ev.location_name || '').trim().toLowerCase()
  if (loc === 'home' || loc.includes('at home')) return false
  return Boolean(
    (ev.address && ev.address.trim().length > 0) ||
    (ev.location_name && ev.location_name.trim().length > 0)
  )
}

function getMemberColorClass(colorHex?: string): string {
  if (!colorHex) return 'bg-casa-gold'
  const lower = colorHex.toLowerCase()
  if (lower.includes('c9a96e') || lower.includes('gold')) return 'bg-casa-gold'
  if (lower.includes('10b981') || lower.includes('34d399') || lower.includes('emerald') || lower.includes('green')) return 'bg-emerald-500'
  if (lower.includes('3b82f6') || lower.includes('2563eb') || lower.includes('blue')) return 'bg-blue-500'
  if (lower.includes('8b5cf6') || lower.includes('a855f7') || lower.includes('purple')) return 'bg-purple-500'
  if (lower.includes('f43f5e') || lower.includes('ef4444') || lower.includes('rose') || lower.includes('red')) return 'bg-rose-500'
  if (lower.includes('f59e0b') || lower.includes('amber')) return 'bg-amber-500'
  return 'bg-casa-gold'
}

interface MobileTodayViewProps {
  onOpenQuickCreate?: () => void
}

export default function MobileTodayView({ onOpenQuickCreate: _onOpenQuickCreate }: MobileTodayViewProps) {
  const now = useLiveClock(30_000)
  const { data: rollingEvents = [] } = useRollingEvents(now)
  const { completeReminder } = useReminderNeedsYouActions()

  const [completedTodoIds, setCompletedTodoIds] = useState<Set<string>>(new Set())

  // Toggle To-Do completion with haptic feedback
  const handleToggleTodo = async (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation()
    try {
      navigator.vibrate?.(10)
    } catch {
      // Haptics optional
    }

    setCompletedTodoIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })

    try {
      await completeReminder(id)
    } catch (err) {
      console.error('Failed to complete to-do:', err)
    }
  }

  // To-Do items: Filtered strictly to Due Today and Missed/Overdue uncompleted items
  const todoItems = useMemo(() => {
    const todayEnd = endOfDay(now)
    return rollingEvents
      .filter((ev) => {
        if (!isReminderOrChore(ev) && ev.event_type !== 'reminder') return false
        const startDate = getEventStartDate(ev)
        // Only include if due today or in the past (missed/overdue)
        return isBefore(startDate, todayEnd) || isSameDay(startDate, now)
      })
      .sort((a, b) => getEventStartDate(a).getTime() - getEventStartDate(b).getTime())
  }, [rollingEvents, now])

  const pendingTodos = useMemo(() => {
    return todoItems.filter((t) => !completedTodoIds.has(t.id))
  }, [todoItems, completedTodoIds])

  // Next 7 Days Horizon (Day 0 = Today, Day 1 = Tomorrow, ..., Day 6)
  const next7Days = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => addDays(now, i))
  }, [now])

  const appointmentsByDay = useMemo(() => {
    return next7Days.map((dayDate, index) => {
      const dayEvents = rollingEvents
        .filter((ev) => eventOverlapsDay(ev, dayDate) && !isReminderOrChore(ev) && ev.event_type !== 'reminder')
        .sort((a, b) => getEventStartDate(a).getTime() - getEventStartDate(b).getTime())

      let label = format(dayDate, 'EEEE · MMM d')
      if (index === 0) {
        label = `Today · ${format(dayDate, 'EEEE, MMM d')}`
      } else if (index === 1) {
        label = `Tomorrow · ${format(dayDate, 'EEEE')}`
      }

      return {
        date: dayDate,
        dayIndex: index,
        label,
        events: dayEvents,
      }
    })
  }, [next7Days, rollingEvents])

  return (
    <div className="w-full flex flex-col gap-4 px-4 pt-3 pb-36 overflow-y-auto overscroll-contain">
      {/* ── Gmail Sync Health Warning Banner ── */}
      <GmailSyncStatusIndicator variant="compact" />

      {/* ══════════════════════════════════════════════════════════════
          1. TO DO'S SECTION
         ══════════════════════════════════════════════════════════════ */}
      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <CheckSquare size={15} className="text-casa-gold shrink-0" />
            <span className="text-caption font-bold uppercase tracking-wider text-casa-muted">
              To Do's
            </span>
          </div>
          <span className="text-caption text-casa-muted font-medium">
            {pendingTodos.length} {pendingTodos.length === 1 ? 'task' : 'tasks'}
          </span>
        </div>

        {todoItems.length === 0 ? (
          <div className="flex items-center justify-center gap-2 p-3 rounded-xl bg-casa-surface/60 border border-casa-border/60 text-center text-caption text-casa-muted">
            <CheckCircle2 size={15} className="text-emerald-500 shrink-0" />
            <span>All to-do's complete · Great job!</span>
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {todoItems.map((todo) => {
              const isCompleted = completedTodoIds.has(todo.id)
              const memberName = todo.members?.[0]?.family_member?.name || null
              const memberColorClass = getMemberColorClass(todo.members?.[0]?.family_member?.color_hex)
              const startDate = getEventStartDate(todo)
              const isMissed = isBefore(startDate, startOfDay(now)) && !isCompleted
              const isToday = isSameDay(startDate, now)

              return (
                <div
                  key={todo.id}
                  role="button"
                  tabIndex={0}
                  data-tactile="true"
                  onClick={() => openEventDetails(todo.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      openEventDetails(todo.id)
                    }
                  }}
                  className={cn(
                    'flex items-center gap-3 p-3 rounded-xl bg-casa-surface border border-casa-border shadow-2xs hover:border-casa-gold active:scale-[0.98] transition-all duration-150 cursor-pointer',
                    isCompleted && 'opacity-60 bg-casa-surface/50'
                  )}
                >
                  {/* Accessible Checkbox Toggle */}
                  <IconButton
                    variant={isCompleted ? 'primary' : 'ghost'}
                    size="sm"
                    icon={<Check size={14} strokeWidth={3} className={isCompleted ? 'text-white' : 'text-casa-muted/60'} />}
                    aria-label={`Mark ${todo.title} as ${isCompleted ? 'incomplete' : 'complete'}`}
                    onClick={(e) => void handleToggleTodo(todo.id, e)}
                    className={cn(
                      'rounded-full shrink-0 transition-all duration-150',
                      isCompleted ? 'bg-emerald-500 text-white' : 'border border-casa-border hover:border-casa-gold bg-casa-bg'
                    )}
                  />

                  {/* To-Do Title and Metadata */}
                  <div className="min-w-0 flex-1">
                    <div
                      className={cn(
                        'text-body-sm font-semibold text-casa-navy truncate transition-all duration-150',
                        isCompleted && 'line-through text-casa-muted'
                      )}
                    >
                      {todo.title}
                    </div>
                    <div className="flex items-center gap-2 text-2xs text-casa-muted mt-0.5 truncate">
                      {isMissed ? (
                        <span className="text-3xs font-semibold px-1.5 py-0.5 rounded bg-rose-50 border border-rose-200 text-rose-700 shrink-0">
                          Missed ({format(startDate, 'MMM d')})
                        </span>
                      ) : isToday ? (
                        <span className="text-casa-navy/90 font-medium">Today</span>
                      ) : (
                        <span>{format(startDate, 'EEE, MMM d')}</span>
                      )}
                      {memberName && (
                        <span className="flex items-center gap-1">
                          <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', memberColorClass)} />
                          <span>{memberName}</span>
                        </span>
                      )}
                    </div>
                  </div>

                  <ChevronRight size={14} className="text-casa-muted shrink-0" />
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* ══════════════════════════════════════════════════════════════
          2. NEXT 7 DAYS APPOINTMENTS
         ══════════════════════════════════════════════════════════════ */}
      {appointmentsByDay.map((day) => {
        const isToday = day.dayIndex === 0
        const hasEvents = day.events.length > 0

        // If a future day has no appointments, we can skip or show a very compact placeholder
        // Skipping days with 0 events past tomorrow keeps the 7-day feed clean & high density!
        if (!isToday && day.dayIndex > 1 && !hasEvents) {
          return null
        }

        return (
          <section key={day.label} className="flex flex-col gap-2 mt-1">
            {/* Day Header */}
            <div className="flex items-center justify-between">
              <span className="text-caption font-bold uppercase tracking-wider text-casa-muted">
                {day.label}
              </span>
              <span className="text-caption text-casa-muted font-medium">
                {day.events.length} {day.events.length === 1 ? 'scheduled' : 'scheduled'}
              </span>
            </div>

            {/* Real-Time Now Line on Today */}
            {isToday && (
              <div className="flex items-center gap-2 py-1 select-none pointer-events-none">
                <span className="w-2 h-2 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.7)] animate-pulse shrink-0" />
                <div className="flex-1 h-px bg-red-400/40" />
                <span className="text-2xs font-mono font-bold text-red-500 shrink-0">
                  NOW {format(now, 'h:mm a')}
                </span>
                <div className="flex-1 h-px bg-red-400/40" />
              </div>
            )}

            {/* Appointments List */}
            {!hasEvents ? (
              <div className="p-3.5 rounded-xl bg-casa-surface border border-casa-border text-center text-caption text-casa-muted">
                {isToday ? "No appointments on today's schedule." : 'No appointments scheduled.'}
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {day.events.map((ev) => {
                  const start = getEventStartDate(ev)
                  const end = getEventEndDate(ev)
                  const durationMins = Math.max(15, differenceInMinutes(end, start))
                  const memberNames = ev.members?.map((m) => m.family_member.name).join(', ') || 'Family'
                  const memberColorClass = getMemberColorClass(ev.members?.[0]?.family_member?.color_hex)

                  return (
                    <div
                      key={ev.id}
                      role="button"
                      tabIndex={0}
                      data-tactile="true"
                      data-calendar-event
                      data-sidecar-loadable="true"
                      data-event-id={ev.id}
                      onClick={() => openEventDetails(ev.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          openEventDetails(ev.id)
                        }
                      }}
                      className="flex items-center gap-3 p-3 rounded-xl bg-casa-surface border border-casa-border shadow-2xs hover:border-casa-gold active:scale-[0.97] active:opacity-75 transition-all duration-150 cursor-pointer"
                    >
                      {/* Time & Duration Badge */}
                      <div className="flex flex-col items-center justify-center min-w-[48px] text-center shrink-0">
                        <span className="text-body-sm font-mono font-bold text-casa-navy leading-none">
                          {format(start, 'h:mm')}
                        </span>
                        <span className="text-3xs text-casa-muted mt-1 font-medium">
                          {durationMins >= 60 ? `${(durationMins / 60).toFixed(1).replace('.0', '')}h` : `${durationMins}m`}
                        </span>
                      </div>

                      {/* Vertical Member Color Bar */}
                      <div className={cn('w-1 h-8 rounded-full shrink-0', memberColorClass)} />

                      {/* Event Title & Subtitle */}
                      <div className="min-w-0 flex-1">
                        <div className="text-body-sm font-semibold text-casa-navy truncate">
                          {ev.title}
                        </div>
                        <div className="flex items-center gap-1.5 text-2xs text-casa-muted mt-0.5 truncate">
                          <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', memberColorClass)} />
                          <span>{memberNames}</span>
                          {ev.location_name && (
                            <span>· {ev.location_name}</span>
                          )}
                        </div>
                      </div>

                      <EventSyncStatusDot event={ev} size="xs" className="shrink-0" />
                    </div>
                  )
                })}
              </div>
            )}
          </section>
        )
      })}
    </div>
  )
}

