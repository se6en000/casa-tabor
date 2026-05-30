import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import { format, startOfWeek, addDays, isToday, startOfDay } from 'date-fns'
import { useWeekEvents } from '../../hooks/useCalendarEvents'
import { useCalendarStore } from '../../stores/calendarStore'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import EventBlock from './EventBlock'
import EventDetailPanel from './EventDetailPanel'
import EventEditSheet from './EventEditSheet'
import QuickCreateSheet from '../shared/QuickCreateSheet'
import type { EventWithDetails } from '../../hooks/useCalendarEvents'
import { cn } from '../../utils/cn'
import { isHoliday, holidayLabel, HOLIDAY_COLOR, isReminder, REMINDER_COLOR } from '../../utils/holidays'

const HOUR_HEIGHT = 60
const START_HOUR = 6
const END_HOUR = 21
const HOURS = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i)
const MULTIDAY_ROW_H = 26 // px per multi-day event row
const SHARED_COLOR = '#C9A96E'

// ── Drag-to-reschedule types & helpers ──────────────────────────

interface DragState {
  event: EventWithDetails
  clientX: number
  clientY: number
  grabOffsetPx: number
  ghostWidth: number
  ghostHeight: number
}

function getEventHeight(event: EventWithDetails): number {
  const start = new Date(event.start_time)
  const end = new Date(event.end_time)
  const startH = start.getHours() + start.getMinutes() / 60
  const endH = end.getHours() + end.getMinutes() / 60
  return Math.max((endH - startH) * HOUR_HEIGHT, 28)
}

function computeDropInfo(d: DragState, gridEl: HTMLDivElement, days: Date[]) {
  const rect = gridEl.getBoundingClientRect()
  const colWidth = (rect.width - 60) / 7

  const dayIndex = Math.max(0, Math.min(6, Math.floor((d.clientX - rect.left - 60) / colWidth)))
  const targetDay = days[dayIndex]

  const gridY = d.clientY - rect.top + gridEl.scrollTop - d.grabOffsetPx
  const rawHour = START_HOUR + gridY / HOUR_HEIGHT
  const snapped = Math.round(rawHour * 4) / 4  // snap to 15-min
  const clampedHour = Math.max(START_HOUR, Math.min(END_HOUR - 0.25, snapped))

  const hours = Math.floor(clampedHour)
  const minutes = Math.round((clampedHour % 1) * 60)

  const durationMs = new Date(d.event.end_time).getTime() - new Date(d.event.start_time).getTime()
  const newStart = new Date(targetDay)
  newStart.setHours(hours, minutes, 0, 0)
  const newEnd = new Date(newStart.getTime() + durationMs)

  return { targetDay, newStart, newEnd, dayIndex }
}

function getPrimaryColor(event: EventWithDetails): string {
  if (!event.members || event.members.length === 0) return SHARED_COLOR
  if (event.members.length >= 5) return SHARED_COLOR
  const primary = event.members.find(m => m.role === 'primary') ?? event.members[0]
  return primary.family_member?.color_hex || SHARED_COLOR
}

export default function WeekView() {
  const { selectedDate, visibleMembers } = useCalendarStore()
  const weekStart = startOfWeek(selectedDate, { weekStartsOn: 0 })
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
  const weekEnd = addDays(weekStart, 6)

  const { data: allEvents, isLoading } = useWeekEvents(selectedDate)
  const events = useMemo(() => {
    if (!allEvents) return []
    if (visibleMembers.length === 0) return allEvents
    return allEvents.filter((ev) =>
      isHoliday(ev) || isReminder(ev) || ev.members?.some((m) => visibleMembers.includes(m.family_member.id)),
    )
  }, [allEvents, visibleMembers])

  const [selectedEventId, setSelectedEventId] = useState<string | null>(null)
  const [editEventId, setEditEventId] = useState<string | null>(null)
  const selectedEvent = selectedEventId ? (events?.find(e => e.id === selectedEventId) ?? null) : null
  const editEvent = editEventId ? (events?.find(e => e.id === editEventId) ?? null) : null

  // ── Quick create (long-press empty slot) ─────────────────────
  const [quickCreate, setQuickCreate] = useState<{ open: boolean; start?: Date }>({ open: false })
  const slotLongPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const slotLongPressOrigin = useRef<{ x: number; y: number; day: Date } | null>(null)

  const handleSlotTouchStart = useCallback((e: React.TouchEvent, day: Date) => {
    // Don't fire if user is touching an event block
    if ((e.target as Element).closest('[data-event-block]')) return
    const t = e.touches[0]
    slotLongPressOrigin.current = { x: t.clientX, y: t.clientY, day }
    slotLongPressTimer.current = setTimeout(() => {
      slotLongPressTimer.current = null
      const origin = slotLongPressOrigin.current
      if (!origin || !gridScrollRef.current) return
      slotLongPressOrigin.current = null
      // Compute the hour from Y position
      const rect = gridScrollRef.current.getBoundingClientRect()
      const gridY = origin.y - rect.top + gridScrollRef.current.scrollTop
      const rawHour = START_HOUR + gridY / HOUR_HEIGHT
      const snapped = Math.round(rawHour * 2) / 2  // snap to 30-min
      const hours = Math.floor(Math.max(START_HOUR, Math.min(END_HOUR - 0.5, snapped)))
      const minutes = snapped % 1 === 0.5 ? 30 : 0
      const start = new Date(origin.day)
      start.setHours(hours, minutes, 0, 0)
      navigator.vibrate?.(30)
      setQuickCreate({ open: true, start })
    }, 500)
  }, [])

  const handleSlotTouchMove = useCallback((e: React.TouchEvent) => {
    if (!slotLongPressTimer.current || !slotLongPressOrigin.current) return
    const t = e.touches[0]
    const dist = Math.hypot(t.clientX - slotLongPressOrigin.current.x, t.clientY - slotLongPressOrigin.current.y)
    if (dist > 10) {
      clearTimeout(slotLongPressTimer.current)
      slotLongPressTimer.current = null
      slotLongPressOrigin.current = null
    }
  }, [])

  const handleSlotTouchEnd = useCallback(() => {
    if (slotLongPressTimer.current) {
      clearTimeout(slotLongPressTimer.current)
      slotLongPressTimer.current = null
    }
    slotLongPressOrigin.current = null
  }, [])

  // ── Drag to reschedule ───────────────────────────────────────
  const qc = useQueryClient()
  const [drag, setDrag] = useState<DragState | null>(null)
  const dragRef = useRef<DragState | null>(null)
  const daysRef = useRef(days)
  const gridScrollRef = useRef<HTMLDivElement>(null)
  // Keep daysRef current so native handlers don't capture stale days
  daysRef.current = days

  const commitDrop = useCallback(async (d: DragState, finalX: number, finalY: number) => {
    const gridEl = gridScrollRef.current
    if (!gridEl) return
    const finalDrag = { ...d, clientX: finalX, clientY: finalY }
    const { newStart, newEnd } = computeDropInfo(finalDrag, gridEl, daysRef.current)
    // No-op if time didn't actually change
    if (newStart.getTime() === new Date(d.event.start_time).getTime()) return
    await supabase.from('events').update({
      start_time: newStart.toISOString(),
      end_time: newEnd.toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', d.event.id)
    qc.invalidateQueries({ queryKey: ['events'] })
    supabase.functions.invoke('push-to-google', { body: { event_id: d.event.id } }).catch(() => {})
  }, [qc])

  // Non-passive native touch listeners so we can preventDefault during drag
  useEffect(() => {
    const el = gridScrollRef.current
    if (!el) return
    const onMove = (e: TouchEvent) => {
      if (!dragRef.current) return
      e.preventDefault()   // block page scroll while dragging
      e.stopPropagation()  // prevent CalendarPage swipe from firing
      const t = e.touches[0]
      const updated = { ...dragRef.current, clientX: t.clientX, clientY: t.clientY }
      dragRef.current = updated
      setDrag({ ...updated })
    }
    const onEnd = (e: TouchEvent) => {
      if (!dragRef.current) return
      e.stopPropagation()  // prevent CalendarPage swipe nav
      const d = dragRef.current
      dragRef.current = null
      setDrag(null)
      const t = e.changedTouches[0]
      commitDrop(d, t.clientX, t.clientY)
    }
    el.addEventListener('touchmove', onMove, { passive: false })
    el.addEventListener('touchend', onEnd, { passive: false })
    return () => {
      el.removeEventListener('touchmove', onMove)
      el.removeEventListener('touchend', onEnd)
    }
  }, [commitDrop])

  const startDrag = useCallback((
    event: EventWithDetails,
    clientX: number,
    clientY: number,
    grabOffsetPx: number,
  ) => {
    const gridEl = gridScrollRef.current
    if (!gridEl) return
    const colWidth = (gridEl.getBoundingClientRect().width - 60) / 7
    const height = getEventHeight(event)
    const newDrag: DragState = {
      event,
      clientX,
      clientY,
      grabOffsetPx: Math.max(0, Math.min(grabOffsetPx, height - 8)),
      ghostWidth: colWidth * 0.88,
      ghostHeight: height,
    }
    dragRef.current = newDrag
    setDrag(newDrag)
    setSelectedEventId(null)
  }, [])

  // ── Separate multi-day vs single-day events ──
  const { multiDayEvents, singleDayEvents } = useMemo(() => {
    const multi: EventWithDetails[] = []
    const single: EventWithDetails[] = []
    for (const ev of events) {
      const sDay = format(new Date(ev.start_time), 'yyyy-MM-dd')
      const eDay = format(new Date(ev.end_time), 'yyyy-MM-dd')
      if (sDay !== eDay) multi.push(ev)
      else single.push(ev)
    }
    return { multiDayEvents: multi, singleDayEvents: single }
  }, [events])

  // Column span for a multi-day event (0–6, clamped to visible week)
  function getMultiDaySpan(ev: EventWithDetails): { startCol: number; endCol: number } | null {
    const evStart = startOfDay(new Date(ev.start_time))
    const evEnd = startOfDay(new Date(ev.end_time))
    if (evEnd < weekStart || evStart > weekEnd) return null
    const clampStart = evStart < weekStart ? weekStart : evStart
    const clampEnd = evEnd > weekEnd ? weekEnd : evEnd
    const startCol = Math.round((clampStart.getTime() - weekStart.getTime()) / 86400000)
    const endCol = Math.round((clampEnd.getTime() - weekStart.getTime()) / 86400000)
    return { startCol, endCol }
  }

  // Group single-day events by day key
  const eventsByDay = useMemo(() => {
    const grouped: Record<string, EventWithDetails[]> = {}
    for (const event of singleDayEvents) {
      const dayKey = format(new Date(event.start_time), 'yyyy-MM-dd')
      if (!grouped[dayKey]) grouped[dayKey] = []
      grouped[dayKey].push(event)
    }
    return grouped
  }, [singleDayEvents])

  // Event count per day (single + multi-day that span that day)
  function getDayEventCount(day: Date): number {
    const dayKey = format(day, 'yyyy-MM-dd')
    const single = eventsByDay[dayKey]?.length ?? 0
    const colIdx = Math.round((startOfDay(day).getTime() - weekStart.getTime()) / 86400000)
    const multi = multiDayEvents.filter(ev => {
      const s = getMultiDaySpan(ev)
      return s ? colIdx >= s.startCol && colIdx <= s.endCol : false
    }).length
    return single + multi
  }

  // Detect overlaps within a day (single-day events only)
  function getOverlapInfo(dayEvents: EventWithDetails[]) {
    const sorted = [...dayEvents].sort(
      (a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
    )
    const result: Map<string, { columnCount: number; columnIndex: number }> = new Map()
    for (let i = 0; i < sorted.length; i++) {
      const current = sorted[i]
      const currentEnd = new Date(current.end_time).getTime()
      const overlapGroup = [current]
      for (let j = i + 1; j < sorted.length; j++) {
        const next = sorted[j]
        if (new Date(next.start_time).getTime() < currentEnd) overlapGroup.push(next)
      }
      const columnCount = Math.max(overlapGroup.length, result.get(current.id)?.columnCount || 1)
      overlapGroup.forEach((ev, idx) => {
        if (!result.has(ev.id)) result.set(ev.id, { columnCount, columnIndex: idx })
      })
    }
    return result
  }

  // Are there any visible multi-day events this week?
  const visibleMultiDay = multiDayEvents.filter(ev => getMultiDaySpan(ev))

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <span className="text-casa-muted text-body animate-breathe">Loading events...</span>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* ── Day headers ──────────────────────────────────────────── */}
      <div
        className="grid grid-cols-[60px_repeat(7,1fr)] border-b border-casa-border sticky top-0 bg-casa-bg z-10"
        onClick={() => setSelectedEventId(null)}
      >
        <div />
        {days.map((day) => {
          const count = getDayEventCount(day)
          const today = isToday(day)
          return (
            <div key={format(day, 'yyyy-MM-dd')} className="text-center py-3 border-l border-casa-divider">
              <p className="text-overline font-body font-semibold text-casa-muted uppercase">
                {format(day, 'EEE')}
              </p>
              <p className={cn(
                'font-display text-display-md mt-1',
                today
                  ? 'w-10 h-10 mx-auto rounded-full bg-casa-gold text-white flex items-center justify-center'
                  : 'text-casa-navy'
              )}>
                {format(day, 'd')}
              </p>
              {count > 0 && (
                <p className="text-caption text-casa-muted mt-0.5">
                  {count} event{count !== 1 ? 's' : ''}
                </p>
              )}
            </div>
          )
        })}
      </div>

      {/* ── Multi-day event banner ────────────────────────────────── */}
      {visibleMultiDay.length > 0 && (
        <div
          className="grid grid-cols-[60px_repeat(7,1fr)] border-b border-casa-border bg-casa-bg sticky z-[9]"
          style={{ top: 0 }}
          onClick={() => setSelectedEventId(null)}
        >
          {/* "all‑day" label */}
          <div className="text-[9px] text-casa-muted text-right pr-2 pt-2 leading-tight select-none">
            all‑day
          </div>

          {/* Events span container */}
          <div
            className="col-span-7 relative py-1"
            style={{ minHeight: `${visibleMultiDay.length * MULTIDAY_ROW_H + 4}px` }}
          >
            {visibleMultiDay.map((ev, rowIdx) => {
              const span = getMultiDaySpan(ev)
              if (!span) return null
              const holiday = isHoliday(ev)
              const reminder = !holiday && isReminder(ev)
              const color = holiday ? HOLIDAY_COLOR : reminder ? REMINDER_COLOR : getPrimaryColor(ev)
              const leftPct = (span.startCol / 7) * 100
              const widthPct = ((span.endCol - span.startCol + 1) / 7) * 100
              const isSelected = selectedEventId === ev.id

              return (
                <button
                  key={ev.id}
                  onClick={(e) => { e.stopPropagation(); setSelectedEventId(ev.id) }}
                  onDoubleClick={(e) => { e.stopPropagation(); setSelectedEventId(null); setEditEventId(ev.id) }}
                  title={`${ev.title} — click to view, double-click to edit`}
                  className={cn(
                    'absolute flex items-center px-2 rounded text-[11px] font-semibold truncate transition-all',
                    'text-white',
                    isSelected ? 'brightness-110 ring-2 ring-white/60' : 'hover:brightness-110',
                  )}
                  style={{
                    left: `calc(${leftPct}% + 2px)`,
                    width: `calc(${widthPct}% - 4px)`,
                    top: `${rowIdx * MULTIDAY_ROW_H + 2}px`,
                    height: `${MULTIDAY_ROW_H - 2}px`,
                    backgroundColor: color,
                  }}
                >
                  {holiday ? holidayLabel(ev.title) : reminder ? `🔔 ${ev.title}` : (() => {
                    const pipeIdx = ev.title.indexOf(' | ')
                    return pipeIdx !== -1 ? ev.title.slice(pipeIdx + 3) : ev.title
                  })()}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Time grid ────────────────────────────────────────────── */}
      <div
        ref={gridScrollRef}
        className={cn('flex-1 overflow-y-auto', drag ? 'cursor-grabbing select-none' : '')}
      >
        <div className="grid grid-cols-[60px_repeat(7,1fr)]" style={{ height: `${HOURS.length * HOUR_HEIGHT}px` }}>
          {/* Hour labels */}
          <div className="relative">
            {HOURS.map((hour) => (
              <div
                key={hour}
                className="absolute w-full text-right pr-3 text-caption text-casa-muted font-body"
                style={{ top: `${(hour - START_HOUR) * HOUR_HEIGHT}px` }}
              >
                {format(new Date(2026, 0, 1, hour), 'h a')}
              </div>
            ))}
          </div>

          {/* Day columns */}
          {days.map((day, colIdx) => {
            const dayKey = format(day, 'yyyy-MM-dd')
            const dayEvents = eventsByDay[dayKey] || []
            const overlapInfo = getOverlapInfo(dayEvents)

            // Compute drop target info for this column
            const dropInfo = drag && gridScrollRef.current
              ? computeDropInfo(drag, gridScrollRef.current, days)
              : null
            const isDropTarget = dropInfo?.dayIndex === colIdx

            return (
              <div
                key={dayKey}
                className={cn(
                  'relative border-l border-casa-divider touch-pan-y',
                  isDropTarget ? 'bg-casa-gold/5' : '',
                )}
                onClick={() => setSelectedEventId(null)}
                onTouchStart={e => handleSlotTouchStart(e, day)}
                onTouchMove={handleSlotTouchMove}
                onTouchEnd={handleSlotTouchEnd}
              >
                {HOURS.map((hour) => (
                  <div
                    key={hour}
                    className="absolute w-full border-t border-casa-divider"
                    style={{ top: `${(hour - START_HOUR) * HOUR_HEIGHT}px` }}
                  />
                ))}

                {/* Drop placeholder — dashed outline at target time slot */}
                {isDropTarget && dropInfo && drag && (
                  <div
                    className="absolute pointer-events-none rounded-lg border-2 border-dashed border-casa-gold/70 bg-casa-gold/10"
                    style={{
                      top: `${(dropInfo.newStart.getHours() + dropInfo.newStart.getMinutes() / 60 - START_HOUR) * HOUR_HEIGHT}px`,
                      height: `${drag.ghostHeight}px`,
                      left: '3%',
                      width: '94%',
                    }}
                  />
                )}

                {dayEvents.map((event) => {
                  const overlap = overlapInfo.get(event.id) || { columnCount: 1, columnIndex: 0 }
                  return (
                    <EventBlock
                      key={event.id}
                      event={event}
                      onClick={() => setSelectedEventId(event.id)}
                      onDoubleClick={() => { setSelectedEventId(null); setEditEventId(event.id) }}
                      columnCount={overlap.columnCount}
                      columnIndex={overlap.columnIndex}
                      onDragStart={startDrag}
                      isDragging={drag?.event.id === event.id}
                    />
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Drag ghost (fixed overlay, follows the touch) ────────── */}
      {drag && (() => {
        const dropInfo = gridScrollRef.current
          ? computeDropInfo(drag, gridScrollRef.current, days)
          : null
        const origDayKey = format(new Date(drag.event.start_time), 'yyyy-MM-dd')
        const dropDayKey = dropInfo ? format(dropInfo.targetDay, 'yyyy-MM-dd') : origDayKey
        return (
          <div
            className="fixed pointer-events-none z-[200] rounded-lg px-2.5 py-1.5 text-white shadow-2xl ring-2 ring-white/40"
            style={{
              left: drag.clientX - drag.ghostWidth / 2,
              top: drag.clientY - drag.grabOffsetPx,
              width: drag.ghostWidth,
              height: drag.ghostHeight,
              backgroundColor: getPrimaryColor(drag.event),
              transform: 'scale(1.05)',
              opacity: 0.95,
            }}
          >
            <p className="font-body font-semibold text-body-sm truncate leading-tight">{drag.event.title}</p>
            {dropInfo && (
              <>
                <p className="text-[11px] font-body opacity-85 mt-0.5">
                  {format(dropInfo.newStart, 'h:mm a')} – {format(dropInfo.newEnd, 'h:mm a')}
                </p>
                {dropDayKey !== origDayKey && (
                  <p className="text-[10px] font-body opacity-70 mt-0.5">
                    → {format(dropInfo.targetDay, 'EEE, MMM d')}
                  </p>
                )}
              </>
            )}
          </div>
        )
      })()}

      {/* Detail panel */}
      <EventDetailPanel
        event={selectedEvent}
        onClose={() => setSelectedEventId(null)}
      />

      {/* Edit sheet */}
      {editEvent && (
        <EventEditSheet
          event={editEvent}
          open={!!editEvent}
          onClose={() => setEditEventId(null)}
        />
      )}

      {/* Quick create (long-press empty slot) */}
      <QuickCreateSheet
        open={quickCreate.open}
        initialStart={quickCreate.start}
        onClose={() => setQuickCreate({ open: false })}
      />
    </div>
  )
}