import { useState, useRef, useCallback } from 'react'
import { addDays, addMinutes, format, isSameDay, parseISO, startOfDay } from 'date-fns'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Clock, MapPin, Navigation,
  Calendar, AlertTriangle, ClipboardList,
} from 'lucide-react'
import { cn } from '../../utils/cn'
import { useCalendarStore } from '../../stores/calendarStore'
import { useTodayEvents } from '../../hooks/useCalendarEvents'
import type { EventWithDetails } from '../../hooks/useCalendarEvents'
import { usePrepItems, useDismissPrepItem, useSnoozePrepItem } from '../../hooks/usePrepItems'
import { useWeekConflicts, useResolveConflict } from '../../hooks/useConflicts'
import EventDetailPanel from './EventDetailPanel'
import EventEditSheet from './EventEditSheet'
import EventContextMenu from '../shared/EventContextMenu'
import { differenceInDays } from 'date-fns'
import { isHoliday, holidayLabel, HOLIDAY_COLOR, isReminder, isTimedReminder } from '../../utils/holidays'
import { supabase } from '../../lib/supabase'
import { useQueryClient } from '@tanstack/react-query'
import BounceScroll from '../shared/BounceScroll'
import LargeEventCard from './LargeEventCard'
import ReminderEventCard from './ReminderEventCard'

const SHARED_COLOR = '#C9A96E'

function getPrimaryColor(event: EventWithDetails): string {
  if (!event.members?.length || event.members.length >= 5) return SHARED_COLOR
  const primary = event.members.find(m => m.role === 'primary') ?? event.members[0]
  return primary.family_member?.color_hex || SHARED_COLOR
}

// ── Event card (stacked, not time-distributed) ─────────────────────

function DayEventCard({
  event,
  selected,
  onSelect,
  onEdit,
  onLongPress,
  onCompleteReminder,
  onSnoozeReminder,
}: {
  event: EventWithDetails
  selected: boolean
  onSelect: () => void
  onEdit: () => void
  onLongPress: (event: EventWithDetails, x: number, y: number) => void
  onCompleteReminder: (event: EventWithDetails) => void
  onSnoozeReminder: (event: EventWithDetails) => void
}) {
  const holiday = isHoliday(event)
  const reminder = !holiday && isReminder(event)
  const color = holiday ? HOLIDAY_COLOR : getPrimaryColor(event)

  // Long-press detection
  const lpTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lpOrigin = useRef<{ x: number; y: number } | null>(null)
  const handleTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0]
    lpOrigin.current = { x: t.clientX, y: t.clientY }
    lpTimer.current = setTimeout(() => {
      lpTimer.current = null
      if (!lpOrigin.current) return
      navigator.vibrate?.(30)
      onLongPress(event, lpOrigin.current.x, lpOrigin.current.y)
      lpOrigin.current = null
    }, 500)
  }
  const handleTouchMove = (e: React.TouchEvent) => {
    if (!lpTimer.current || !lpOrigin.current) return
    const t = e.touches[0]
    if (Math.hypot(t.clientX - lpOrigin.current.x, t.clientY - lpOrigin.current.y) > 10) {
      clearTimeout(lpTimer.current); lpTimer.current = null; lpOrigin.current = null
    }
  }
  const handleTouchEnd = () => {
    if (lpTimer.current) { clearTimeout(lpTimer.current); lpTimer.current = null }
    lpOrigin.current = null
  }

  if (holiday) {
    return (
      <motion.div
        layout
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -4 }}
        transition={{ duration: 0.18 }}
        className="flex items-center gap-3 px-4 py-2.5 rounded-card border border-red-200 bg-red-50 text-red-800"
        style={{ borderLeftColor: HOLIDAY_COLOR, borderLeftWidth: 4 }}
      >
        <span className="font-display text-heading leading-none">{holidayLabel(event.title).split(' ')[0]}</span>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-body-sm text-red-800 leading-snug">{event.title}</p>
          <p className="text-caption font-semibold text-red-400 uppercase tracking-wide mt-0.5">Federal Holiday</p>
        </div>
        <span className="text-caption font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-600 shrink-0">
          All day
        </span>
      </motion.div>
    )
  }

  if (reminder) {
    const timed = isTimedReminder(event)
    const start = new Date(event.start_time)
    
    return (
      <motion.div
        layout
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -4 }}
        transition={{ duration: 0.18 }}
        className="grid grid-cols-[96px_1fr] min-h-[80px]"
      >
        {/* Time column */}
        {timed ? (
          <div className="grid content-start justify-items-end pr-3 pl-2 pt-3 border-r border-casa-divider/70">
            <p className="text-display-sm font-display font-bold text-casa-navy tabular-nums leading-none text-right">
              {format(start, 'h:mm')}
            </p>
            <p className="text-caption text-casa-muted font-semibold uppercase mt-1 text-right">
              {format(start, 'a')}
            </p>
          </div>
        ) : (
          <div className="grid content-start justify-items-end pr-3 pl-2 pt-3 border-r border-casa-divider/70">
            <p className="text-caption font-semibold text-casa-muted text-right">All day</p>
          </div>
        )}

        {/* Reminder card */}
        <ReminderEventCard
          event={event}
          onClick={() => onSelect()}
          onComplete={() => onCompleteReminder(event)}
          onSnooze={() => onSnoozeReminder(event)}
        />
      </motion.div>
    )
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.18 }}
      onClick={e => { e.stopPropagation(); onSelect() }}
      onDoubleClick={e => { e.stopPropagation(); onEdit() }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      className={cn(
        'cursor-pointer transition-all touch-pan-y',
        'hover:shadow-card',
      )}
    >
      <LargeEventCard event={event} color={color} selected={selected} />
    </motion.div>
  )
}

// ── Sidecar: Prep items for this day's events ──────────────────────

function DaySidecar({ dayEvents, selectedDate }: { dayEvents: EventWithDetails[]; selectedDate: Date }) {
  const { data: allPrep } = usePrepItems()
  const { data: allConflicts } = useWeekConflicts()
  const dismiss = useDismissPrepItem()
  const snooze = useSnoozePrepItem()
  const resolveConflict = useResolveConflict()

  const dayEventIds = new Set(dayEvents.map(e => e.id))

  // Prep items tied to today's events
  const dayPrep = (allPrep ?? []).filter(p => p.event_id && dayEventIds.has(p.event_id))

  // Conflicts tied to today
  const dayConflicts = (allConflicts ?? []).filter(c => {
    const eventDate = c.event_a?.start_time ? parseISO(c.event_a.start_time) : null
    return eventDate && isSameDay(eventDate, selectedDate)
  })

  // Logistics hints for today's away events
  const awayEvents = dayEvents.filter(e => e.location_name && e.enrichment?.departure_time)

  const hasAnything = dayPrep.length > 0 || dayConflicts.length > 0 || awayEvents.length > 0

  return (
    <div className="w-80 shrink-0 border-l border-casa-border bg-casa-bg overflow-hidden">
      <BounceScroll className="h-full" innerClassName="p-4 space-y-4">

        {/* Logistics */}
        {awayEvents.length > 0 && (
          <div>
            <p className="text-caption font-semibold uppercase tracking-wide text-casa-muted mb-2 flex items-center gap-1.5">
              <Navigation size={12} /> Logistics
            </p>
            <div className="space-y-2">
              {awayEvents.map(e => (
                <div key={e.id} className="px-3 py-2.5 rounded-lg bg-casa-surface border border-casa-border">
                  <p className="text-body-sm font-medium text-casa-text leading-snug">{e.title}</p>
                  <p className="text-caption text-casa-gold font-semibold mt-0.5 flex items-center gap-1">
                    <Clock size={11} />
                    Leave by {format(parseISO(e.enrichment!.departure_time!), 'h:mm a')}
                    {e.enrichment?.drive_time_mins && ` · ${e.enrichment.drive_time_mins} min drive`}
                  </p>
                  {e.location_name && (
                    <p className="text-caption text-casa-muted mt-0.5 flex items-center gap-1">
                      <MapPin size={11} /> {e.location_name}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Conflicts */}
        {dayConflicts.length > 0 && (
          <div>
            <p className="text-caption font-semibold uppercase tracking-wide text-casa-muted mb-2 flex items-center gap-1.5">
              <AlertTriangle size={12} /> Conflicts
            </p>
            <div className="space-y-2">
              {dayConflicts.map(c => (
                <div key={c.id} className="px-3 py-2.5 rounded-lg bg-casa-surface border border-casa-border border-l-4 border-l-casa-error">
                  <p className="text-body-sm text-casa-text leading-snug">{c.description}</p>
                  <button
                    onClick={() => resolveConflict(c.id, 'dismissed from day view')}
                    className="text-caption text-casa-muted hover:text-red-500 mt-1 transition-colors"
                  >
                    Dismiss
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Prep items */}
        {dayPrep.length > 0 && (
          <div>
            <p className="text-caption font-semibold uppercase tracking-wide text-casa-muted mb-2 flex items-center gap-1.5">
              <ClipboardList size={12} /> Prep Needed
            </p>
            <div className="space-y-2">
              {dayPrep.map(item => {
                const days = item.event_date
                  ? differenceInDays(parseISO(item.event_date), new Date())
                  : null
                const daysLabel = days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : days !== null ? `In ${days} days` : ''
                return (
                  <div
                    key={item.id}
                    className={cn(
                      'px-3 py-2.5 rounded-lg border border-l-4 bg-casa-surface border-casa-border',
                      item.priority === 3 ? 'border-l-casa-error' :
                      item.priority === 2 ? 'border-l-casa-gold' :
                      'border-l-blue-500'
                    )}
                  >
                    <div className="flex items-start gap-2">
                      <span className="text-base leading-none shrink-0 mt-0.5">{item.emoji}</span>
                      <p className="text-body-sm text-casa-text leading-snug flex-1">{item.description}</p>
                    </div>
                    {daysLabel && (
                      <p className="text-caption text-casa-muted mt-1 ml-6">{daysLabel}</p>
                    )}
                    <div className="flex gap-2 mt-2 ml-6">
                      <button
                        onClick={() => snooze(item.id)}
                        className="text-caption text-casa-muted hover:text-casa-text transition-colors"
                      >
                        Snooze
                      </button>
                      <span className="text-casa-border text-caption">|</span>
                      <button
                        onClick={() => dismiss(item.id)}
                        className="text-caption text-casa-muted hover:text-red-600 transition-colors"
                      >
                        Dismiss
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {!hasAnything && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Calendar size={28} className="text-casa-divider mb-3" />
            <p className="text-body-sm text-casa-muted font-medium">All clear</p>
            <p className="text-caption text-casa-muted mt-1">No conflicts or prep needed for this day</p>
          </div>
        )}
      </BounceScroll>
    </div>
  )
}

// ── Main DayView ──────────────────────────────────────────────────

export default function DayView() {
  const { selectedDate, visibleMembers } = useCalendarStore()

  const { data: dayRangeEvents } = useTodayEvents(selectedDate)
  const qc = useQueryClient()

  const [selectedEventId, setSelectedEventId] = useState<string | null>(null)
  const [editEventId, setEditEventId] = useState<string | null>(null)
  const [contextMenu, setContextMenu] = useState<{ event: EventWithDetails; x: number; y: number } | null>(null)

  const allEvents = (dayRangeEvents ?? []).filter(e =>
    isHoliday(e) || isReminder(e) || visibleMembers.length === 0 || e.members.some(m => visibleMembers.includes(m.family_member?.id ?? ''))
  )

  // Events for the currently selected day
  const dayEvents = allEvents
    .sort((a, b) => {
      const aAllDay = a.start_time.endsWith('00:00:00+00:00')
      const bAllDay = b.start_time.endsWith('00:00:00+00:00')
      if (aAllDay && !bAllDay) return -1
      if (!aAllDay && bAllDay) return 1
      return new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
    })

  const selectedEvent = selectedEventId ? (dayEvents.find(e => e.id === selectedEventId) ?? null) : null
  const editEvent = editEventId ? (allEvents.find(e => e.id === editEventId) ?? null) : null

  const deleteEvent = useCallback(async (ev: EventWithDetails) => {
    if (!confirm(`Delete "${ev.title}"?`)) return
    await supabase.from('events').delete().eq('id', ev.id)
    qc.invalidateQueries({ queryKey: ['events'] })
  }, [qc])

  const completeEvent = useCallback(async (ev: EventWithDetails) => {
    await supabase.from('events').update({ status: 'cancelled' }).eq('id', ev.id)
    qc.invalidateQueries({ queryKey: ['events'] })
  }, [qc])

  const completeReminder = useCallback(async (ev: EventWithDetails) => {
    await supabase.from('events').update({ status: 'cancelled' }).eq('id', ev.id)
    qc.invalidateQueries({ queryKey: ['events'] })
  }, [qc])

  const snoozeReminder = useCallback(async (ev: EventWithDetails) => {
    const start = new Date(ev.start_time)
    const end = new Date(ev.end_time)
    const durationMs = Math.max(15 * 60_000, end.getTime() - start.getTime())
    const timed = isTimedReminder(ev)
    const nextStart = timed
      ? addMinutes(start, 30)
      : startOfDay(addDays(start, 1))
    const nextEnd = new Date(nextStart.getTime() + durationMs)
    await supabase
      .from('events')
      .update({ start_time: nextStart.toISOString(), end_time: nextEnd.toISOString(), updated_at: new Date().toISOString() })
      .eq('id', ev.id)
    qc.invalidateQueries({ queryKey: ['events'] })
  }, [qc])

  return (
    <div className="flex h-full overflow-hidden" onClick={() => setSelectedEventId(null)}>

      {/* ── Main column ─────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Events list */}
        <BounceScroll
          className="flex-1"
          innerClassName="px-5 py-4"
          onClick={() => setSelectedEventId(null)}
        >
          {dayEvents.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-casa-muted gap-2">
              <Calendar size={32} className="text-casa-divider" />
              <p className="text-body font-semibold">Nothing scheduled</p>
              <p className="text-caption">
                {'No events on this day.'}
              </p>
            </div>
          ) : (
            <AnimatePresence initial={false}>
              <div className="space-y-2.5" onClick={e => e.stopPropagation()}>
                {dayEvents.map(event => (
                  <DayEventCard
                    key={event.id}
                    event={event}
                    selected={selectedEventId === event.id}
                    onSelect={() => {
                      setSelectedEventId(prev => prev === event.id ? null : event.id)
                    }}
                    onEdit={() => setEditEventId(event.id)}
                    onLongPress={(ev, x, y) => setContextMenu({ event: ev, x, y })}
                    onCompleteReminder={completeReminder}
                    onSnoozeReminder={snoozeReminder}
                  />
                ))}
              </div>
            </AnimatePresence>
          )}

          {/* Detail panel inline below list */}
          <AnimatePresence>
            {selectedEvent && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2 }}
                className="mt-4 overflow-hidden"
                onClick={e => e.stopPropagation()}
              >
                <EventDetailPanel
                  event={selectedEvent}
                  onClose={() => setSelectedEventId(null)}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </BounceScroll>
      </div>

      {/* ── Sidecar ─────────────────────────────────── */}
      <div className="hidden md:block">
        <DaySidecar dayEvents={dayEvents} selectedDate={selectedDate} />
      </div>

      {/* Edit sheet */}
      <AnimatePresence>
        {editEvent && (
          <EventEditSheet
            event={editEvent}
            open={!!editEventId}
            onClose={() => setEditEventId(null)}
          />
        )}
      </AnimatePresence>

      {/* Long-press context menu */}
      <EventContextMenu
        event={contextMenu?.event ?? null}
        x={contextMenu?.x ?? 0}
        y={contextMenu?.y ?? 0}
        onClose={() => setContextMenu(null)}
        onEdit={ev => { setContextMenu(null); setEditEventId(ev.id) }}
        onDelete={deleteEvent}
        onComplete={completeEvent}
      />
    </div>
  )
}
