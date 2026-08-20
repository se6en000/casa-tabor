import { useState, useRef, useCallback } from 'react'
import {
  format, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  addDays, isSameMonth, isToday,
} from 'date-fns'
import { AnimatePresence, motion } from 'framer-motion'
import { X, Clock, MapPin, Navigation } from 'lucide-react'
import { cn } from '../../utils/cn'
import { useCalendarStore } from '../../stores/calendarStore'
import { useAppStore } from '../../stores/appStore'
import { useMonthEvents } from '../../hooks/useCalendarEvents'
import type { EventWithDetails } from '../../hooks/useCalendarEvents'
import { isHoliday, holidayLabel, HOLIDAY_COLOR, isReminder, isAllDayReminder, REMINDER_COLOR } from '../../utils/holidays'
import { cleanEventTitle } from '../../utils/eventTitle'
import { eventOverlapsDay, getEventStartDate } from '../../utils/eventTime'
import { useCalendarQuickCreateGesture } from '../../hooks/useCalendarQuickCreateGesture'
import EventDetailPanel from './EventDetailPanel'
import QuickCreateSheet from '../shared/QuickCreateSheet'
import { Button, CalendarPill, IconButton } from '../ui'
import { EventSyncStatusDot } from './EventSyncStatusDot'

const SHARED_COLOR = 'var(--color-casa-gold)'

function getPrimaryColor(event: EventWithDetails): string {
  if (!event.members || event.members.length === 0) return SHARED_COLOR
  if (event.members.length >= 5) return SHARED_COLOR
  const primary = event.members.find(m => m.role === 'primary') ?? event.members[0]
  return primary.family_member?.color_hex || SHARED_COLOR
}

// Build the 6-week grid that fills the month calendar
function buildMonthGrid(selectedDate: Date): Date[] {
  const monthStart = startOfMonth(selectedDate)
  const monthEnd = endOfMonth(selectedDate)
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 0 })
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 0 })
  const days: Date[] = []
  let cur = gridStart
  while (cur <= gridEnd) {
    days.push(cur)
    cur = addDays(cur, 1)
  }
  return days
}

const DOW_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MAX_VISIBLE_EVENTS = 3

// ── Day cell popover ─────────────────────────────────────────────────────────

interface DayPopoverProps {
  day: Date
  events: EventWithDetails[]
  activeEventId: string | null
  onClose: () => void
  onSelectDay: (day: Date) => void
  onSelectEvent: (event: EventWithDetails) => void
}

function DayPopover({ day, events, activeEventId, onClose, onSelectDay, onSelectEvent }: DayPopoverProps) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95, y: 6 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95, y: 6 }}
      transition={{ duration: 0.15 }}
      className="absolute z-30 top-full left-0 mt-1 w-72 bg-casa-surface border border-casa-border rounded-card shadow-modal"
      onClick={e => e.stopPropagation()}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-casa-border">
        <Button
          onClick={() => { onSelectDay(day); onClose() }}
          variant="ghost"
          className="p-0 font-display text-heading text-casa-navy hover:bg-transparent hover:text-casa-gold"
        >
          {format(day, 'EEEE, MMMM d')}
        </Button>
        <IconButton onClick={onClose} aria-label="Close day preview" icon={<X size={14} />} />
      </div>

      {/* Event list */}
      <div className="divide-y divide-casa-divider max-h-64 overflow-y-auto">
        {events.length === 0 && (
          <p className="px-4 py-3 text-caption text-casa-muted italic">No events</p>
        )}
        {events.map(event => {
          const holiday = isHoliday(event)
          const reminder = !holiday && isReminder(event)
          const color = holiday ? HOLIDAY_COLOR : reminder ? REMINDER_COLOR : getPrimaryColor(event)
          const start = getEventStartDate(event)
          const isAllDay = event.all_day || isAllDayReminder(event)
          const isActive = activeEventId === event.id
          return (
            <div
              key={event.id}
              role="button"
              tabIndex={0}
              data-tactile="true"
              data-calendar-event
              data-sidecar-loadable="true"
              data-event-id={event.id}
              data-active={isActive ? 'true' : undefined}
              className={cn(
                'flex items-start gap-3 px-4 py-2.5 hover:bg-casa-surface cursor-pointer transition-all duration-150',
                isActive && 'ring-2 ring-casa-gold bg-casa-gold/10 font-bold'
              )}
              style={isActive ? {
                boxShadow: 'inset 0 0 0 2px var(--color-casa-gold)',
              } : undefined}
              onClick={() => { onSelectEvent(event); onClose() }}
            >
              <div
                className={cn(
                  'rounded-full shrink-0 mt-1.5 transition-transform',
                  isActive ? 'w-2 h-2 ring-1 ring-white' : 'w-1.5 h-1.5'
                )}
                style={{ backgroundColor: color }}
              />
              <div className="min-w-0 flex-1">
                <p className={cn(
                  'text-body-sm font-semibold truncate',
                  holiday ? 'text-red-700' : reminder ? 'text-amber-700' : 'text-casa-navy',
                  isActive && 'text-casa-navy font-bold'
                )}>
                  {holiday ? holidayLabel(event.title) : reminder ? `🔔 ${event.title}` : event.title}
                </p>
                {reminder && (
                  <span className="text-caption font-semibold uppercase tracking-wide text-casa-warning">Reminder</span>
                )}
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  {!isAllDay && !reminder && (
                    <span className="flex items-center gap-1 text-caption text-casa-muted">
                      <Clock size={10} />
                      {format(start, 'h:mm a')}
                    </span>
                  )}
                  {(() => {
                    const depIso = event.enrichment?.departure_time
                    const driveMins = event.enrichment?.drive_time_mins
                    const depDate = depIso
                      ? new Date(depIso)
                      : (driveMins && event.start_time
                        ? new Date(new Date(event.start_time).getTime() - (driveMins + 5) * 60_000)
                        : null)
                    if (!depDate || isAllDay || reminder) return null
                    return (
                      <span className="flex items-center gap-1 text-caption font-semibold text-casa-gold truncate">
                        <Navigation size={10} className="shrink-0" />
                        Leave by {format(depDate, 'h:mm a')}
                      </span>
                    )
                  })()}
                  {event.location_name && (
                    <span className="flex items-center gap-1 text-caption text-casa-muted truncate">
                      <MapPin size={10} />
                      {event.location_name}
                    </span>
                  )}
                </div>
                {event.members.length > 0 && (
                  <div className="flex gap-1 mt-1 flex-wrap">
                    {event.members.map(m => (
                      <CalendarPill
                        key={m.id}
                        color={m.family_member?.color_hex || SHARED_COLOR}
                      >
                        {m.family_member?.name?.split(' ')[0] ?? '?'}
                      </CalendarPill>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Drill-in link */}
      <div className="px-4 py-2.5 border-t border-casa-border">
        <Button
          onClick={() => { onSelectDay(day); onClose() }}
          variant="ghost"
          size="sm"
          className="min-h-0 p-0 text-caption text-casa-gold hover:bg-transparent hover:underline"
        >
          View full day →
        </Button>
      </div>
    </motion.div>
  )
}

// ── Day cell ─────────────────────────────────────────────────────────────────

interface DayCellProps {
  day: Date
  events: EventWithDetails[]
  isCurrentMonth: boolean
  isPopoverOpen: boolean
  isExpanded: boolean
  activeEventId: string | null
  onToggleExpand: () => void
  onOpen: () => void
  onClose: () => void
  onDrillIn: (day: Date) => void
  onSelectEvent: (event: EventWithDetails) => void
  onTouchStart: (e: React.TouchEvent) => void
  onTouchMove: (e: React.TouchEvent) => void
  onTouchEnd: () => void
  onMouseDown: (e: React.MouseEvent) => void
  onMouseUp: () => void
  onContextMenu: (e: React.MouseEvent) => void
  onDoubleClick: (e: React.MouseEvent) => void
}

function DayCell({
  day,
  events,
  isCurrentMonth,
  isPopoverOpen,
  isExpanded,
  activeEventId,
  onToggleExpand,
  onOpen,
  onClose,
  onDrillIn,
  onSelectEvent,
  onTouchStart,
  onTouchMove,
  onTouchEnd,
  onMouseDown,
  onMouseUp,
  onContextMenu,
  onDoubleClick,
}: DayCellProps) {
  const todayDay = isToday(day)
  const visible = isExpanded ? events : events.slice(0, MAX_VISIBLE_EVENTS)
  const overflow = events.length - MAX_VISIBLE_EVENTS

  return (
    <div className="relative">
      <div
        className={cn(
          'group min-h-[150px] p-2 border-b border-r border-casa-divider cursor-pointer transition-colors select-none flex flex-col',
          isCurrentMonth ? 'bg-casa-bg hover:bg-casa-surface' : 'bg-casa-divider/30',
        )}
        onClick={events.length > 0 ? onOpen : () => onDrillIn(day)}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onMouseDown={onMouseDown}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        onContextMenu={onContextMenu}
        onDoubleClick={onDoubleClick}
      >
        {/* Date number */}
        <div className="flex items-start justify-end mb-1 shrink-0">
          <span className={cn(
            'w-8 h-8 flex items-center justify-center rounded-full font-semibold leading-none',
            todayDay
              ? 'bg-casa-gold text-white'
              : isCurrentMonth
              ? 'text-casa-navy group-hover:text-casa-gold'
              : 'text-casa-muted/50',
          )}>
            {format(day, 'd')}
          </span>
        </div>

        {/* Event dots / pills */}
        <div className="space-y-1 flex-1">
          {visible.map(event => {
            const holiday = isHoliday(event)
            const reminder = !holiday && isReminder(event)
            const color = holiday ? HOLIDAY_COLOR : reminder ? REMINDER_COLOR : getPrimaryColor(event)
            const isActive = activeEventId === event.id
            return (
              <div
                key={event.id}
                data-event-pill
                data-calendar-event
                data-sidecar-loadable="true"
                data-event-id={event.id}
                data-active={isActive ? 'true' : undefined}
                className={cn(
                  'flex items-center gap-1.5 px-2 py-1 rounded-md text-body-sm font-medium leading-tight truncate cursor-pointer transition-all duration-150 relative select-none',
                  holiday && 'font-semibold tracking-tight',
                  reminder && 'font-semibold',
                  isActive
                    ? 'ring-2 ring-casa-gold font-bold shadow-sm z-10'
                    : 'border border-transparent hover:brightness-90',
                )}
                style={{
                  backgroundColor: isActive
                    ? (holiday ? 'var(--color-casa-surface)' : color + '33')
                    : color + '22',
                  color: holiday ? 'var(--color-casa-error)' : reminder ? 'var(--color-casa-warning)' : color,
                }}
                onClick={e => { e.stopPropagation(); onSelectEvent(event) }}
              >
                <span
                  className={cn(
                    'rounded-full shrink-0 transition-transform',
                    isActive ? 'w-2 h-2 ring-1 ring-white' : 'w-1.5 h-1.5'
                  )}
                  style={{ backgroundColor: color }}
                />
                <span className="truncate flex-1">{holiday ? holidayLabel(event.title) : reminder ? `🔔 ${event.title}` : cleanEventTitle(event.title)}</span>
                {!holiday && !reminder && <EventSyncStatusDot event={event} size="xs" className="shrink-0 ml-auto" />}
              </div>
            )
          })}

          {/* "+# more" expand button */}
          {!isExpanded && overflow > 0 && (
            <Button
              variant="ghost"
              size="sm"
              fullWidth
              align="between"
              className="pl-1.5 pr-1 py-0.5 min-h-[28px] mt-0.5 rounded text-body-sm font-bold text-casa-gold hover:text-amber-700 hover:bg-casa-gold/15 transition-all group/more cursor-pointer"
              onClick={e => {
                e.stopPropagation()
                onToggleExpand()
              }}
              title={`Show all ${events.length} events for ${format(day, 'MMMM d')}`}
              aria-label={`Show ${overflow} more events`}
            >
              <span>+{overflow} more</span>
              <span className="text-caption opacity-70 group-hover/more:translate-y-0.5 transition-transform" aria-hidden="true">▾</span>
            </Button>
          )}

          {/* "− Show less" collapse button */}
          {isExpanded && overflow > 0 && (
            <Button
              variant="ghost"
              size="sm"
              fullWidth
              align="between"
              className="pl-1.5 pr-1 py-0.5 min-h-[28px] mt-1 rounded text-caption font-bold text-casa-muted hover:text-casa-navy hover:bg-casa-divider/50 transition-all group/less cursor-pointer"
              onClick={e => {
                e.stopPropagation()
                onToggleExpand()
              }}
              title="Collapse to 3 events"
              aria-label="Collapse to 3 events"
            >
              <span>− Show less</span>
              <span className="text-caption opacity-70 group-hover/less:-translate-y-0.5 transition-transform" aria-hidden="true">▴</span>
            </Button>
          )}
        </div>
      </div>

      {/* Popover */}
      <AnimatePresence>
        {isPopoverOpen && (
          <DayPopover
            day={day}
            events={events}
            activeEventId={activeEventId}
            onClose={onClose}
            onSelectDay={onDrillIn}
            onSelectEvent={onSelectEvent}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

// ── Main MonthView ────────────────────────────────────────────────────────────

export default function MonthView() {
  const { selectedDate, setSelectedDate, setActiveView, visibleMembers } = useCalendarStore()
  const { selectedSidecarEventId, aiDrawerOpen, sidecarTab, openEventInSidecar } = useAppStore()
  const { data: allEvents } = useMonthEvents(selectedDate)
  const [openPopoverKey, setOpenPopoverKey] = useState<string | null>(null)
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null)
  const [expandedDayKeys, setExpandedDayKeys] = useState<Set<string>>(new Set())
  const [quickCreate, setQuickCreate] = useState<{ open: boolean; start?: Date }>({ open: false })

  const toggleDayExpanded = useCallback((dayKey: string) => {
    setExpandedDayKeys(prev => {
      const next = new Set(prev)
      if (next.has(dayKey)) next.delete(dayKey)
      else next.add(dayKey)
      return next
    })
  }, [])

  const quickCreateGesture = useCalendarQuickCreateGesture<Date>({
    resolveStart: (day) => {
      const start = new Date(day)
      start.setHours(9, 0, 0, 0)
      return start
    },
    onCreate: (start) => {
      setOpenPopoverKey(null)
      setQuickCreate({ open: true, start })
    },
    ignoreSelector: '[data-event-pill]',
  })

  // Long-press to create event — shared timer for both touch and mouse
  const lpTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lpOrigin = useRef<{ x: number; y: number; day: Date } | null>(null)

  const startLongPress = useCallback((clientX: number, clientY: number, day: Date) => {
    lpOrigin.current = { x: clientX, y: clientY, day }
    lpTimer.current = setTimeout(() => {
      lpTimer.current = null
      lpOrigin.current = null
      navigator.vibrate?.(30)
      // Default to 9 AM for month-view creates (no time slot info available)
      const start = new Date(day)
      start.setHours(9, 0, 0, 0)
      setOpenPopoverKey(null)
      setQuickCreate({ open: true, start })
    }, 500)
  }, [])

  const cancelLongPress = useCallback(() => {
    if (lpTimer.current) { clearTimeout(lpTimer.current); lpTimer.current = null }
    lpOrigin.current = null
  }, [])

  const handleCellTouchStart = useCallback((e: React.TouchEvent, day: Date) => {
    if ((e.target as Element).closest('[data-event-pill]')) return
    const t = e.touches[0]
    startLongPress(t.clientX, t.clientY, day)
  }, [startLongPress])

  const handleCellTouchMove = useCallback((e: React.TouchEvent) => {
    if (!lpOrigin.current) return
    const t = e.touches[0]
    if (Math.hypot(t.clientX - lpOrigin.current.x, t.clientY - lpOrigin.current.y) > 10) cancelLongPress()
  }, [cancelLongPress])

  const handleCellMouseDown = useCallback((e: React.MouseEvent, day: Date) => {
    if (e.button !== 0) return
    if ((e.target as Element).closest('[data-event-pill]')) return
    startLongPress(e.clientX, e.clientY, day)
  }, [startLongPress])

  const handleCellContextMenu = useCallback((e: React.MouseEvent) => {
    if ((e.target as Element).closest('[data-event-pill]')) return
    e.preventDefault()
  }, [])

  const grid = buildMonthGrid(selectedDate)

  const events = (allEvents ?? []).filter(e =>
    isHoliday(e) ||
    isReminder(e) ||
    visibleMembers.length === 0 ||
    e.members.length === 0 ||
    e.members.some(m => visibleMembers.includes(m.family_member?.id ?? '')) ||
    (Boolean(e.source_member_id) && visibleMembers.includes(e.source_member_id!))
  )

  const activeEventId = aiDrawerOpen && sidecarTab === 'event' ? selectedSidecarEventId : null
  const selectedEvent = selectedEventId ? (events.find(e => e.id === selectedEventId) ?? null) : null

  function eventsForDay(day: Date): EventWithDetails[] {
    return events.filter(e => eventOverlapsDay(e, day))
      .sort((a, b) => getEventStartDate(a).getTime() - getEventStartDate(b).getTime())
  }

  function drillIntoDay(day: Date) {
    setSelectedDate(day)
    setActiveView('today')
  }

  return (
    <div
      className="h-full flex flex-col overflow-hidden"
      onClick={() => { setOpenPopoverKey(null); setSelectedEventId(null) }}
    >
      {/* Day-of-week header */}
      <div className="grid grid-cols-7 border-b border-casa-border shrink-0">
        {DOW_LABELS.map(label => (
          <div
            key={label}
            className="py-2.5 text-center text-body-sm font-semibold text-casa-muted uppercase tracking-wide border-r border-casa-divider last:border-r-0"
          >
            {label}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="flex-1 overflow-y-auto pb-36 md:pb-0">
        <div className="grid grid-cols-7 border-l border-t border-casa-divider">
          {grid.map(day => {
            const key = format(day, 'yyyy-MM-dd')
            const dayEvents = eventsForDay(day)
            return (
              <DayCell
                key={key}
                day={day}
                events={dayEvents}
                isCurrentMonth={isSameMonth(day, selectedDate)}
                isPopoverOpen={openPopoverKey === key}
                isExpanded={expandedDayKeys.has(key)}
                activeEventId={activeEventId}
                onToggleExpand={() => toggleDayExpanded(key)}
                onOpen={() => setOpenPopoverKey(key)}
                onClose={() => setOpenPopoverKey(null)}
                onDrillIn={drillIntoDay}
                onSelectEvent={ev => {
                  openEventInSidecar(ev.id)
                  setSelectedEventId(ev.id)
                  setOpenPopoverKey(null)
                }}
                onTouchStart={e => handleCellTouchStart(e, day)}
                onTouchMove={handleCellTouchMove}
                onTouchEnd={cancelLongPress}
                onMouseDown={e => handleCellMouseDown(e, day)}
                onMouseUp={cancelLongPress}
                onContextMenu={handleCellContextMenu}
                onDoubleClick={(event) => quickCreateGesture.onDoubleClick(event, day)}
              />
            )
          })}
        </div>
      </div>

      {/* Detail panel fallback gateway */}
      <div onClick={e => e.stopPropagation()}>
        <EventDetailPanel
          event={selectedEvent}
          onClose={() => setSelectedEventId(null)}
        />
      </div>

      {/* Quick create (long-press empty cell) */}
      <QuickCreateSheet
        open={quickCreate.open}
        initialStart={quickCreate.start}
        onClose={() => setQuickCreate({ open: false })}
      />
    </div>
  )
}
