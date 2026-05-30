import { useState, useRef, useCallback } from 'react'
import { format, isSameDay, parseISO } from 'date-fns'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Clock, MapPin, ChevronRight, Navigation,
  Calendar, AlertTriangle, ClipboardList, Bell,
} from 'lucide-react'
import { cn } from '../../utils/cn'
import { useCalendarStore } from '../../stores/calendarStore'
import { useWeekEvents } from '../../hooks/useCalendarEvents'
import type { EventWithDetails } from '../../hooks/useCalendarEvents'
import { usePrepItems, useDismissPrepItem, useSnoozePrepItem } from '../../hooks/usePrepItems'
import { useWeekConflicts, useResolveConflict } from '../../hooks/useConflicts'
import EventDetailPanel from './EventDetailPanel'
import EventEditSheet from './EventEditSheet'
import EventContextMenu from '../shared/EventContextMenu'
import { WeatherIcon } from '../shared/WeatherIcon'
import { differenceInDays } from 'date-fns'
import { isHoliday, holidayLabel, HOLIDAY_COLOR, isReminder, isAllDayReminder, isTimedReminder, REMINDER_COLOR } from '../../utils/holidays'
import { supabase } from '../../lib/supabase'
import { useQueryClient } from '@tanstack/react-query'

const SHARED_COLOR = '#C9A96E'

function getPrimaryColor(event: EventWithDetails): string {
  if (!event.members?.length || event.members.length >= 5) return SHARED_COLOR
  const primary = event.members.find(m => m.role === 'primary') ?? event.members[0]
  return primary.family_member?.color_hex || SHARED_COLOR
}

function formatTime(iso: string) {
  return format(parseISO(iso), 'h:mm a')
}

// ── Event card (stacked, not time-distributed) ─────────────────────

function DayEventCard({
  event,
  selected,
  onSelect,
  onEdit,
  onLongPress,
}: {
  event: EventWithDetails
  selected: boolean
  onSelect: () => void
  onEdit: () => void
  onLongPress: (event: EventWithDetails, x: number, y: number) => void
}) {
  const holiday = isHoliday(event)
  const reminder = !holiday && isReminder(event)
  const color = holiday ? HOLIDAY_COLOR : reminder ? REMINDER_COLOR : getPrimaryColor(event)
  const enr = event.enrichment
  const d = new Date(event.start_time)
  const isAllDay = holiday || isAllDayReminder(event) || !event.start_time.includes('T') ||
    (d.getHours() === 0 && d.getMinutes() === 0 && event.end_time && (() => { const e = new Date(event.end_time!); return e.getHours() === 23 && e.getMinutes() === 59 })())

  const primary = event.members.find(m => m.role === 'primary')
  const otherMembers = event.members.filter(m => m.role !== 'primary')
  const pipeIdx = event.title.indexOf(' | ')
  const cleanTitle = pipeIdx !== -1 ? event.title.slice(pipeIdx + 3) : event.title

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
        <span className="text-lg leading-none">{holidayLabel(event.title).split(' ')[0]}</span>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-body-sm text-red-800 leading-snug">{event.title}</p>
          <p className="text-[10px] font-semibold text-red-400 uppercase tracking-wide mt-0.5">Federal Holiday</p>
        </div>
        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-600 shrink-0">
          All day
        </span>
      </motion.div>
    )
  }

  if (reminder) {
    const timed = isTimedReminder(event)
    if (timed) {
      // Slim pill for timed reminders in the timeline
      return (
        <motion.div
          layout
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.18 }}
          onClick={e => { e.stopPropagation(); onSelect() }}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full cursor-pointer hover:opacity-80 transition-opacity"
          style={{ border: '1.5px solid #C4893A', backgroundColor: '#FDFAF4' }}
        >
          <Bell size={13} style={{ color: '#C4893A' }} className="shrink-0" />
          <span className="text-[11px] font-semibold" style={{ color: '#7A5520' }}>{event.title}</span>
          <span className="text-[10px] ml-1" style={{ color: '#C4893A' }}>
            {format(new Date(event.start_time), 'h:mm a')}
          </span>
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
        className="flex items-center gap-3 px-4 py-2.5 rounded-card border border-amber-200 bg-amber-50 cursor-pointer hover:bg-amber-100 transition-colors"
        style={{ borderLeftColor: REMINDER_COLOR, borderLeftWidth: 4 }}
      >
        <Bell size={18} className="text-casa-gold shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-body-sm text-amber-800 leading-snug">{cleanTitle}</p>
          {primary && <p className="text-[10px] text-amber-600 mt-0.5">{primary.family_member?.name}</p>}
        </div>
        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-600 shrink-0">
          Reminder
        </span>
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
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      className={cn(
        'group relative flex gap-3 px-4 py-3.5 rounded-card border cursor-pointer transition-all touch-pan-y',
        'bg-casa-surface border-casa-border hover:shadow-card',
        selected && 'shadow-card-hover border-l-4',
      )}
      style={selected ? { borderLeftColor: color } : {}}
    >
      {/* Color strip */}
      <div className="w-1 rounded-full shrink-0 self-stretch" style={{ background: color }} />

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p className="font-semibold text-body-sm text-casa-navy leading-snug">{cleanTitle}</p>
          {!isAllDay && (
            <span className="flex items-center gap-1 text-caption text-casa-muted shrink-0 tabular-nums">
              {formatTime(event.start_time)}
              {event.end_time ? ` – ${formatTime(event.end_time)}` : ''}
              {event.location_name && (
                <WeatherIcon condition={enr?.weather_at_event} size={12} />
              )}
            </span>
          )}
          {isAllDay && (
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-casa-divider text-casa-muted shrink-0">
              All day
            </span>
          )}
        </div>

        <div className="flex flex-wrap gap-x-2 gap-y-1 mt-1 items-center">
          {/* Owner as full pill */}
          {primary && (
            <span
              className="px-2 py-0.5 rounded-full text-white text-[10px] font-bold leading-none whitespace-nowrap"
              style={{ backgroundColor: primary.family_member?.color_hex ?? '#888' }}
            >
              {primary.family_member?.name}
            </span>
          )}
          {/* Other attendees as initials */}
          {otherMembers.slice(0, 3).map(m => (
            <span
              key={m.id}
              className="w-4 h-4 rounded-full text-white text-[9px] font-bold flex items-center justify-center shrink-0"
              style={{ backgroundColor: m.family_member?.color_hex ?? '#888' }}
              title={m.family_member?.name}
            >
              {m.family_member?.name?.[0] ?? '?'}
            </span>
          ))}
          {event.location_name && (
            <span className="flex items-center gap-1 text-caption text-casa-muted">
              <MapPin size={11} />
              {event.location_name}
            </span>
          )}
          {enr?.departure_time && (
            <span className="flex items-center gap-1 text-caption text-amber-700 font-medium">
              <Navigation size={11} />
              Leave by {format(parseISO(enr.departure_time), 'h:mm a')}
            </span>
          )}
        </div>

        {enr?.prep_notes && (
          <p className="text-caption text-casa-muted mt-1 line-clamp-2">{enr.prep_notes}</p>
        )}
      </div>

      {/* Edit on hover */}
      <button
        onClick={e => { e.stopPropagation(); onEdit() }}
        className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0 self-start mt-0.5 text-casa-muted hover:text-casa-navy"
        title="Edit event"
      >
        <ChevronRight size={16} />
      </button>
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
    <div className="w-80 shrink-0 border-l border-casa-border bg-casa-bg overflow-y-auto">
      <div className="p-4 space-y-4">

        {/* Logistics */}
        {awayEvents.length > 0 && (
          <div>
            <p className="text-caption font-semibold uppercase tracking-wide text-casa-muted mb-2 flex items-center gap-1.5">
              <Navigation size={12} /> Logistics
            </p>
            <div className="space-y-2">
              {awayEvents.map(e => (
                <div key={e.id} className="px-3 py-2.5 rounded-lg bg-amber-50 border border-amber-200">
                  <p className="text-body-sm font-medium text-casa-navy leading-snug">{e.title}</p>
                  <p className="text-caption text-amber-700 font-medium mt-0.5 flex items-center gap-1">
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
                <div key={c.id} className="px-3 py-2.5 rounded-lg bg-red-50 border border-red-200">
                  <p className="text-body-sm text-red-800 leading-snug">{c.description}</p>
                  <button
                    onClick={() => resolveConflict(c.id, 'dismissed from day view')}
                    className="text-[11px] text-red-500 hover:text-red-700 mt-1 transition-colors"
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
                      'px-3 py-2.5 rounded-lg border',
                      item.priority === 3 ? 'bg-red-50 border-red-200' :
                      item.priority === 2 ? 'bg-amber-50 border-amber-200' :
                      'bg-blue-50 border-blue-100'
                    )}
                  >
                    <div className="flex items-start gap-2">
                      <span className="text-base leading-none shrink-0 mt-0.5">{item.emoji}</span>
                      <p className="text-body-sm text-casa-navy leading-snug flex-1">{item.description}</p>
                    </div>
                    {daysLabel && (
                      <p className="text-caption text-casa-muted mt-1 ml-6">{daysLabel}</p>
                    )}
                    <div className="flex gap-2 mt-2 ml-6">
                      <button
                        onClick={() => snooze(item.id)}
                        className="text-[11px] text-casa-muted hover:text-casa-navy transition-colors"
                      >
                        Snooze
                      </button>
                      <span className="text-casa-border text-xs">|</span>
                      <button
                        onClick={() => dismiss(item.id)}
                        className="text-[11px] text-casa-muted hover:text-red-600 transition-colors"
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
      </div>
    </div>
  )
}

// ── Main DayView ──────────────────────────────────────────────────

export default function DayView() {
  const { selectedDate, visibleMembers } = useCalendarStore()

  // Use the week that contains the selected date to get events
  const { data: weekEvents } = useWeekEvents(selectedDate)
  const qc = useQueryClient()

  const [selectedEventId, setSelectedEventId] = useState<string | null>(null)
  const [editEventId, setEditEventId] = useState<string | null>(null)
  const [contextMenu, setContextMenu] = useState<{ event: EventWithDetails; x: number; y: number } | null>(null)

  const allEvents = (weekEvents ?? []).filter(e =>
    isHoliday(e) || isReminder(e) || visibleMembers.length === 0 || e.members.some(m => visibleMembers.includes(m.family_member?.id ?? ''))
  )

  // Events for the currently selected day
  const dayEvents = allEvents
    .filter(e => {
      const start = parseISO(e.start_time)
      const end = e.end_time ? parseISO(e.end_time) : start
      return isSameDay(start, selectedDate) ||
        (start <= selectedDate && end >= selectedDate)
    })
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

  return (
    <div className="flex h-full overflow-hidden" onClick={() => setSelectedEventId(null)}>

      {/* ── Main column ─────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Events list */}
        <div
          className="flex-1 overflow-y-auto px-5 py-4"
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
                    onSelect={() => setSelectedEventId(prev => prev === event.id ? null : event.id)}
                    onEdit={() => setEditEventId(event.id)}
                    onLongPress={(ev, x, y) => setContextMenu({ event: ev, x, y })}
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
        </div>
      </div>

      {/* ── Sidecar ─────────────────────────────────── */}
      <DaySidecar dayEvents={dayEvents} selectedDate={selectedDate} />

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
