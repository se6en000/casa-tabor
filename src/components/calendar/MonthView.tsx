import { useState, useRef, useCallback } from 'react'
import {
  format, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  addDays, isSameMonth, isToday,
} from 'date-fns'
import { AnimatePresence, motion } from 'framer-motion'
import { X, Clock, MapPin } from 'lucide-react'
import { cn } from '../../utils/cn'
import { useCalendarStore } from '../../stores/calendarStore'
import { useMonthEvents } from '../../hooks/useCalendarEvents'
import type { EventWithDetails } from '../../hooks/useCalendarEvents'
import { isHoliday, holidayLabel, HOLIDAY_COLOR, isReminder, REMINDER_COLOR } from '../../utils/holidays'
import { eventOverlapsDay, getEventDisplayEnd, isEventMultiDay } from '../../utils/eventTime'
import EventDetailPanel from './EventDetailPanel'
import QuickCreateSheet from '../shared/QuickCreateSheet'

const SHARED_COLOR = '#C9A96E'

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
  onClose: () => void
  onSelectDay: (day: Date) => void
  onSelectEvent: (event: EventWithDetails) => void
}

function DayPopover({ day, events, onClose, onSelectDay, onSelectEvent }: DayPopoverProps) {
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
        <button
          onClick={() => { onSelectDay(day); onClose() }}
          className="font-display text-heading text-casa-navy hover:text-casa-gold transition-colors"
        >
          {format(day, 'EEEE, MMMM d')}
        </button>
        <button onClick={onClose} className="p-1 rounded hover:bg-casa-divider transition-colors text-casa-muted">
          <X size={14} />
        </button>
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
          const start = new Date(event.start_time)
          const displayEnd = getEventDisplayEnd(event)
          const isAllDay = event.all_day
          const multiDay = isEventMultiDay(event)
          return (
            <div
              key={event.id}
              className="flex items-start gap-3 px-4 py-2.5 hover:bg-casa-surface cursor-pointer transition-colors"
              onClick={() => { onSelectEvent(event); onClose() }}
            >
              <div
                className="w-1.5 h-1.5 rounded-full shrink-0 mt-1.5"
                style={{ backgroundColor: color }}
              />
              <div className="min-w-0 flex-1">
                <p className={cn(
                  'text-body-sm font-semibold truncate',
                  holiday ? 'text-red-700' : reminder ? 'text-amber-700' : 'text-casa-navy',
                )}>
                  {holiday ? holidayLabel(event.title) : reminder ? `🔔 ${event.title}` : event.title}
                </p>
                {multiDay && !holiday && !reminder && (
                  <span className="inline-flex mt-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide bg-casa-navy/10 text-casa-navy">
                    Multi-day
                  </span>
                )}
                {reminder && (
                  <span className="text-[9px] font-semibold text-amber-500 uppercase tracking-wide">Reminder</span>
                )}
                <div className="flex items-center gap-3 mt-0.5">
                  {!isAllDay && !reminder && !multiDay && (
                    <span className="flex items-center gap-1 text-caption text-casa-muted">
                      <Clock size={10} />
                      {format(start, 'h:mm a')}
                    </span>
                  )}
                  {isAllDay && !multiDay && !reminder && (
                    <span className="text-caption font-semibold text-casa-muted">All day</span>
                  )}
                  {multiDay && !reminder && (
                    <span className="text-caption font-semibold text-casa-gold">
                      {isAllDay
                        ? `${format(start, 'MMM d')} – ${format(displayEnd, 'MMM d')} · All day`
                        : `${format(start, 'MMM d')} – ${format(displayEnd, 'MMM d')} · Multi-day`}
                    </span>
                  )}
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
                      <span
                        key={m.id}
                        className="px-1.5 py-0.5 rounded text-[9px] font-semibold text-white leading-none"
                        style={{ backgroundColor: m.family_member?.color_hex || SHARED_COLOR }}
                      >
                        {m.family_member?.name?.split(' ')[0] ?? '?'}
                      </span>
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
        <button
          onClick={() => { onSelectDay(day); onClose() }}
          className="text-caption text-casa-gold font-semibold hover:underline"
        >
          View full day →
        </button>
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
}

function DayCell({ day, events, isCurrentMonth, isPopoverOpen, onOpen, onClose, onDrillIn, onSelectEvent, onTouchStart, onTouchMove, onTouchEnd, onMouseDown, onMouseUp, onContextMenu }: DayCellProps) {
  const todayDay = isToday(day)
  const visible = events.slice(0, MAX_VISIBLE_EVENTS)
  const overflow = events.length - MAX_VISIBLE_EVENTS

  return (
    <div className="relative">
      <div
        className={cn(
          'group min-h-[150px] p-2 border-b border-r border-casa-divider cursor-pointer transition-colors select-none',
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
      >
        {/* Date number */}
        <div className="flex items-start justify-end mb-1">
          <span className={cn(
            'w-8 h-8 flex items-center justify-center rounded-full font-semibold leading-none',
            todayDay
              ? 'bg-casa-gold text-white'
              : isCurrentMonth
              ? 'text-casa-navy group-hover:text-casa-gold'
              : 'text-casa-muted/50',
          )} style={{ fontSize: '17px' }}>
            {format(day, 'd')}
          </span>
        </div>

        {/* Event dots / pills */}
        <div className="space-y-1">
          {visible.map(event => {
            const holiday = isHoliday(event)
            const reminder = !holiday && isReminder(event)
            const color = holiday ? HOLIDAY_COLOR : reminder ? REMINDER_COLOR : getPrimaryColor(event)
            const multiDay = isEventMultiDay(event)
            return (
              <div
                key={event.id}
                data-event-pill
                className={cn(
                  'flex items-center gap-1 px-1.5 py-0.5 rounded text-body-sm font-medium leading-tight truncate cursor-pointer hover:brightness-90 transition-all',
                  holiday && 'font-semibold tracking-tight',
                  reminder && 'font-semibold',
                )}
                style={{ backgroundColor: color + '22', color, fontSize: '15px', lineHeight: '1.5' }}
                onClick={e => { e.stopPropagation(); onSelectEvent(event) }}
              >
                <span
                  className="w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ backgroundColor: color }}
                />
                {multiDay && !holiday && !reminder && (
                  <span className="shrink-0 px-1 py-0.5 rounded-full text-[9px] font-semibold uppercase tracking-wide bg-casa-navy/10 text-casa-navy">
                    Multi
                  </span>
                )}
                <span className="truncate">{holiday ? holidayLabel(event.title) : reminder ? `🔔 ${event.title}` : event.title.includes(' | ') ? event.title.split(' | ').slice(1).join(' | ') : event.title}</span>
              </div>
            )
          })}
          {overflow > 0 && (
            <div className="text-casa-muted pl-1" style={{ fontSize: '15px' }}>+{overflow} more</div>
          )}
        </div>
      </div>

      {/* Popover */}
      <AnimatePresence>
        {isPopoverOpen && (
          <DayPopover
            day={day}
            events={events}
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
  const { data: allEvents } = useMonthEvents(selectedDate)
  const [openPopoverKey, setOpenPopoverKey] = useState<string | null>(null)
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null)
  const [quickCreate, setQuickCreate] = useState<{ open: boolean; start?: Date }>({ open: false })

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
    isHoliday(e) || isReminder(e) || visibleMembers.length === 0 || e.members.some(m => visibleMembers.includes(m.family_member?.id ?? ''))
  )

  const selectedEvent = selectedEventId ? (events.find(e => e.id === selectedEventId) ?? null) : null

  function eventsForDay(day: Date): EventWithDetails[] {
    return events.filter(e => eventOverlapsDay(e, day))
      .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
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
      <div className="flex-1 overflow-y-auto">
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
                onOpen={() => setOpenPopoverKey(key)}
                onClose={() => setOpenPopoverKey(null)}
                onDrillIn={drillIntoDay}
                onSelectEvent={ev => { setSelectedEventId(ev.id); setOpenPopoverKey(null) }}
                onTouchStart={e => handleCellTouchStart(e, day)}
                onTouchMove={handleCellTouchMove}
                onTouchEnd={cancelLongPress}
                onMouseDown={e => handleCellMouseDown(e, day)}
                onMouseUp={cancelLongPress}
                onContextMenu={handleCellContextMenu}
              />
            )
          })}
        </div>
      </div>

      {/* Detail panel */}
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
