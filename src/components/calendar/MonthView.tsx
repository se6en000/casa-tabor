import { useState } from 'react'
import {
  format, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  addDays, isSameMonth, isSameDay, isToday, parseISO,
} from 'date-fns'
import { AnimatePresence, motion } from 'framer-motion'
import { X, Clock, MapPin } from 'lucide-react'
import { cn } from '../../utils/cn'
import { useCalendarStore } from '../../stores/calendarStore'
import { useMonthEvents } from '../../hooks/useCalendarEvents'
import type { EventWithDetails } from '../../hooks/useCalendarEvents'

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
}

function DayPopover({ day, events, onClose, onSelectDay }: DayPopoverProps) {
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
          const color = getPrimaryColor(event)
          const start = parseISO(event.start_time)
          const isAllDay = event.start_time.endsWith('00:00:00+00:00') && event.end_time?.endsWith('00:00:00+00:00')
          return (
            <div key={event.id} className="flex items-start gap-3 px-4 py-2.5">
              <div
                className="w-1.5 h-1.5 rounded-full shrink-0 mt-1.5"
                style={{ backgroundColor: color }}
              />
              <div className="min-w-0 flex-1">
                <p className="text-body-sm font-semibold text-casa-navy truncate">{event.title}</p>
                <div className="flex items-center gap-3 mt-0.5">
                  {!isAllDay && (
                    <span className="flex items-center gap-1 text-caption text-casa-muted">
                      <Clock size={10} />
                      {format(start, 'h:mm a')}
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
}

function DayCell({ day, events, isCurrentMonth, isPopoverOpen, onOpen, onClose, onDrillIn }: DayCellProps) {
  const todayDay = isToday(day)
  const visible = events.slice(0, MAX_VISIBLE_EVENTS)
  const overflow = events.length - MAX_VISIBLE_EVENTS

  return (
    <div className="relative">
      <div
        className={cn(
          'group min-h-[88px] p-1.5 border-b border-r border-casa-divider cursor-pointer transition-colors',
          isCurrentMonth ? 'bg-casa-bg hover:bg-casa-surface' : 'bg-casa-divider/30',
        )}
        onClick={events.length > 0 ? onOpen : () => onDrillIn(day)}
      >
        {/* Date number */}
        <div className="flex items-start justify-end mb-1">
          <span className={cn(
            'w-6 h-6 flex items-center justify-center rounded-full text-[11px] font-semibold leading-none',
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
        <div className="space-y-0.5">
          {visible.map(event => {
            const color = getPrimaryColor(event)
            return (
              <div
                key={event.id}
                className="flex items-center gap-1 px-1 py-0.5 rounded text-[9px] font-medium leading-none truncate"
                style={{ backgroundColor: color + '22', color }}
              >
                <span
                  className="w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ backgroundColor: color }}
                />
                <span className="truncate">{event.title}</span>
              </div>
            )
          })}
          {overflow > 0 && (
            <div className="text-[9px] text-casa-muted pl-1">+{overflow} more</div>
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

  const grid = buildMonthGrid(selectedDate)

  const events = (allEvents ?? []).filter(e =>
    visibleMembers.length === 0 || e.members.some(m => visibleMembers.includes(m.family_member?.id ?? ''))
  )

  function eventsForDay(day: Date): EventWithDetails[] {
    return events.filter(e => isSameDay(parseISO(e.start_time), day))
      .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
  }

  function drillIntoDay(day: Date) {
    setSelectedDate(day)
    setActiveView('today')
  }

  return (
    <div
      className="h-full flex flex-col overflow-hidden"
      onClick={() => setOpenPopoverKey(null)}
    >
      {/* Day-of-week header */}
      <div className="grid grid-cols-7 border-b border-casa-border shrink-0">
        {DOW_LABELS.map(label => (
          <div
            key={label}
            className="py-2 text-center text-caption font-semibold text-casa-muted uppercase tracking-wide border-r border-casa-divider last:border-r-0"
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
              />
            )
          })}
        </div>
      </div>
    </div>
  )
}
