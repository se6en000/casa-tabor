import { useState, useCallback, useRef } from 'react'
import { format, addDays, isToday, isSameDay, startOfDay } from 'date-fns'
import { motion, AnimatePresence } from 'framer-motion'
import {
  MapPin, Clock, DollarSign, Phone, AlertTriangle,
  Pencil, Navigation, Share2, ChevronRight,
} from 'lucide-react'
import { cn } from '../../utils/cn'
import { useCalendarStore } from '../../stores/calendarStore'
import { useRollingEvents } from '../../hooks/useCalendarEvents'
import type { EventWithDetails } from '../../hooks/useCalendarEvents'
import { CATEGORY_LABEL } from './categoryFields'
import EventDetailPanel from './EventDetailPanel'
import EventEditSheet from './EventEditSheet'
import { isReminder, isAllDayReminder, isTimedReminder } from '../../utils/holidays'
import SwipeableReminderPill from '../shared/SwipeableReminderPill'
import EventContextMenu from '../shared/EventContextMenu'
import { WeatherIcon } from '../shared/WeatherIcon'
import { supabase } from '../../lib/supabase'
import { useQueryClient } from '@tanstack/react-query'

const SHARED_COLOR = '#C9A96E'

function getPrimaryColor(event: EventWithDetails): string {
  if (!event.members || event.members.length === 0) return SHARED_COLOR
  if (event.members.length >= 5) return SHARED_COLOR
  const primary = event.members.find(m => m.role === 'primary') ?? event.members[0]
  return primary.family_member?.color_hex || SHARED_COLOR
}

function getSnippet(event: EventWithDetails): { icon: React.ReactNode; text: string } | null {
  const enr = event.enrichment
  if (!enr) return null
  if (enr.departure_time) return { icon: <Clock size={12} />, text: `Leave by ${format(new Date(enr.departure_time), 'h:mm a')}` }
  if (enr.cost_estimate) return { icon: <DollarSign size={12} />, text: String(enr.cost_estimate) }
  if (enr.contact_name || enr.contact_phone) return { icon: <Phone size={12} />, text: enr.contact_name ?? enr.contact_phone ?? '' }
  if (enr.prep_notes) return { icon: <ChevronRight size={12} />, text: enr.prep_notes.slice(0, 80) + (enr.prep_notes.length > 80 ? '…' : '') }
  return null
}

export default function StackedView() {
  const { visibleMembers } = useCalendarStore()
  const today = startOfDay(new Date())
  // 8 days: today → today+7
  const days  = Array.from({ length: 8 }, (_, i) => addDays(today, i))
  const row1  = days.slice(0, 4)
  const row2  = days.slice(4, 8)

  const { data: allEvents } = useRollingEvents(today)

  const [selectedEventId, setSelectedEventId] = useState<string | null>(null)
  const [editEventId,     setEditEventId]     = useState<string | null>(null)
  const [contextMenu, setContextMenu] = useState<{ event: EventWithDetails; x: number; y: number } | null>(null)

  const events = (allEvents ?? []).filter(e =>
    isReminder(e) || visibleMembers.length === 0 || e.members.some(m => visibleMembers.includes(m.family_member?.id ?? ''))
  )

  const selectedEvent = selectedEventId ? (events.find(e => e.id === selectedEventId) ?? null) : null
  const editEvent     = editEventId     ? (events.find(e => e.id === editEventId)     ?? null) : null

  const qc = useQueryClient()

  const completeReminder = useCallback(async (id: string) => {
    await supabase.from('events').update({ status: 'cancelled' }).eq('id', id)
    qc.invalidateQueries({ queryKey: ['events'] })
  }, [qc])

  const dismissReminder = useCallback(async (id: string) => {
    await supabase.from('events').update({ status: 'cancelled' }).eq('id', id)
    qc.invalidateQueries({ queryKey: ['events'] })
  }, [qc])

  const deleteEvent = useCallback(async (ev: EventWithDetails) => {
    if (!confirm(`Delete "${ev.title}"?`)) return
    await supabase.from('events').delete().eq('id', ev.id)
    qc.invalidateQueries({ queryKey: ['events'] })
  }, [qc])

  return (
    <div
      className="h-full overflow-y-auto px-3 py-4 space-y-4"
      onClick={() => setSelectedEventId(null)}
    >
      {[row1, row2].map((rowDays, rowIdx) => (
        <div key={rowIdx} className="grid grid-cols-4 gap-2 min-h-[160px]">
          {rowDays.map(day => {
            const dayEvents = events
              .filter(e => isSameDay(new Date(e.start_time), day))
              .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())

            const dayAllDay = dayEvents.filter(isAllDayReminder)
            const dayTimed  = dayEvents.filter(isTimedReminder)
            const dayNormal = dayEvents.filter(e => !isReminder(e))
            const today_ = isToday(day)

            return (
              <div
                key={format(day, 'yyyy-MM-dd')}
                className="flex flex-col bg-casa-surface/40 rounded-xl border border-casa-border overflow-hidden"
              >
                {/* Day header — compact inline layout */}
                <div className={cn(
                  'flex items-center justify-center gap-1.5 py-1.5 border-b border-casa-divider shrink-0',
                  today_ ? 'bg-casa-gold/20' : ''
                )}>
                  <span className={cn(
                    'text-[11px] font-semibold uppercase tracking-wide',
                    today_ ? 'text-casa-gold' : 'text-casa-muted'
                  )}>
                    {format(day, 'EEE')}
                  </span>
                  <span className={cn(
                    'text-[15px] font-bold leading-none',
                    today_ ? 'text-casa-gold' : 'text-casa-navy'
                  )}>
                    {format(day, 'd')}
                  </span>
                </div>

                {/* Events */}
                <div className="flex-1 overflow-y-auto p-1.5 space-y-1.5">
                  {/* All-day reminders */}
                  {dayAllDay.map(r => (
                    <SwipeableReminderPill
                      key={r.id}
                      id={r.id}
                      title={r.title}
                      members={r.members}
                      onClick={() => setSelectedEventId(r.id)}
                      onComplete={completeReminder}
                      onDismiss={dismissReminder}
                    />
                  ))}

                  {/* Timed reminders + events merged by time */}
                  <AnimatePresence initial={false}>
                    {[...dayNormal, ...dayTimed]
                      .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
                      .map(event => isTimedReminder(event) ? (
                        <motion.div
                          key={event.id}
                          layout
                          initial={{ opacity: 0, y: 4 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -4 }}
                          transition={{ duration: 0.15 }}
                        >
                          <SwipeableReminderPill
                            id={event.id}
                            title={`${event.title} · ${format(new Date(event.start_time), 'h:mm a')}`}
                            members={event.members}
                            onClick={() => setSelectedEventId(event.id)}
                            onComplete={completeReminder}
                            onDismiss={dismissReminder}
                          />
                        </motion.div>
                      ) : (
                        <EventCard
                          key={event.id}
                          event={event}
                          isSelected={selectedEventId === event.id}
                          onClick={() => setSelectedEventId(event.id)}
                          onDoubleClick={() => { setSelectedEventId(null); setEditEventId(event.id) }}
                          onLongPress={(ev, x, y) => setContextMenu({ event: ev, x, y })}
                        />
                      ))
                    }
                  </AnimatePresence>

                  {dayEvents.length === 0 && (
                    <p className="text-[10px] text-casa-muted/50 text-center pt-2">—</p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      ))}

      {/* Detail panel */}
      <EventDetailPanel event={selectedEvent} onClose={() => setSelectedEventId(null)} />

      {editEvent && (
        <EventEditSheet
          event={editEvent}
          open={!!editEvent}
          onClose={() => setEditEventId(null)}
        />
      )}

      <EventContextMenu
        event={contextMenu?.event ?? null}
        x={contextMenu?.x ?? 0}
        y={contextMenu?.y ?? 0}
        onClose={() => setContextMenu(null)}
        onEdit={ev => setEditEventId(ev.id)}
        onDelete={deleteEvent}
        onComplete={ev => completeReminder(ev.id)}
      />
    </div>
  )
}

/* ── Event Card ─────────────────────────────────────────────── */

interface EventCardProps {
  event: EventWithDetails
  isSelected: boolean
  onClick: () => void
  onDoubleClick: () => void
  onLongPress: (event: EventWithDetails, x: number, y: number) => void
}

function EventCard({ event, isSelected, onClick, onDoubleClick, onLongPress }: EventCardProps) {
  const color = getPrimaryColor(event)
  const enr = event.enrichment
  const snippet = getSnippet(event)
  const urgentAction = event.actions?.find(a => a.is_urgent && !a.completed)
  const category = enr?.category ? (CATEGORY_LABEL[enr.category] ?? enr.category) : null
  const hasMaps = event.location_name || event.address
  const mapsUrl = hasMaps
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(event.address ?? event.location_name ?? '')}`
    : null

  const start = new Date(event.start_time)
  const end = new Date(event.end_time)

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

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
      onClick={(e) => { e.stopPropagation(); onClick() }}
      onDoubleClick={(e) => { e.stopPropagation(); onDoubleClick() }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      className={cn(
        'relative rounded-lg border bg-casa-surface cursor-pointer touch-pan-y',
        'hover:shadow-card-hover transition-all duration-200',
        isSelected ? 'border-casa-gold shadow-card' : 'border-casa-border'
      )}
    >
      {/* Left color bar */}
      <div
        className="absolute left-0 top-0 bottom-0 w-1 rounded-l-lg"
        style={{ backgroundColor: color }}
      />

      {/* ── Compact default view ── */}
      <div className="pl-3 pr-2 py-1.5">
        {/* Time + weather + urgent dot */}
        <div className="flex items-center justify-between gap-1 mb-0.5">
          <div className="flex items-center gap-1">
            <p className="text-[11px] font-semibold text-casa-muted tabular-nums leading-none">
              {format(start, 'h:mm')}–{format(end, 'h:mma')}
            </p>
            {event.location_name && (
              <WeatherIcon condition={event.enrichment?.weather_at_event} size={12} />
            )}
          </div>
          {urgentAction && <AlertTriangle size={11} className="text-amber-500 shrink-0" />}
        </div>

        {/* Title — 1-line clamp, larger + bolder */}
        {(() => {
          const primary = event.members.find(m => m.role === 'primary')
          const others = event.members.filter(m => m.role !== 'primary')
          const pipeIdx = event.title.indexOf(' | ')
          const cleanTitle = pipeIdx !== -1 ? event.title.slice(pipeIdx + 3) : event.title
          return (
            <>
              <h3 className="text-[14px] font-bold text-casa-navy leading-snug line-clamp-1 mb-1">
                {cleanTitle}
              </h3>
              {/* Member pills/dots */}
              <div className="flex items-center gap-1 flex-wrap">
                {primary && (
                  <span
                    className="px-1.5 py-0.5 rounded-full text-white text-[9px] font-bold leading-none whitespace-nowrap"
                    style={{ backgroundColor: primary.family_member?.color_hex ?? '#888' }}
                  >
                    {primary.family_member?.name ?? '?'}
                  </span>
                )}
                {others.slice(0, 3).map(m => (
                  <span
                    key={m.id}
                    title={m.family_member?.name}
                    className="inline-flex items-center justify-center w-4 h-4 rounded-full text-white text-[9px] font-bold shrink-0"
                    style={{ backgroundColor: m.family_member?.color_hex ?? '#888' }}
                  >
                    {m.family_member?.name?.[0] ?? '?'}
                  </span>
                ))}
              </div>
            </>
          )
        })()}
      </div>

      {/* ── Expanded details (tap to reveal) ── */}
      <AnimatePresence>
        {isSelected && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden"
          >
            <div className="pl-3 pr-2 pb-2 space-y-1.5 border-t border-casa-divider pt-2">
              {event.location_name && (
                <span className="flex items-center gap-1 text-[10px] text-casa-muted">
                  <MapPin size={10} className="text-casa-error shrink-0" />
                  <span className="truncate">{event.location_name}</span>
                </span>
              )}
              {category && (
                <span className="text-[10px] text-casa-muted px-1.5 py-0.5 bg-casa-bg rounded-full border border-casa-border">
                  {category}
                </span>
              )}
              {snippet && (
                <div className="flex items-center gap-1 text-[10px] text-casa-muted">
                  <span className="text-casa-gold">{snippet.icon}</span>
                  <span className="line-clamp-2">{snippet.text}</span>
                </div>
              )}
              <div className="flex gap-1.5 pt-1">
                <button
                  onClick={(e) => { e.stopPropagation(); onDoubleClick() }}
                  className="flex items-center gap-1 px-2 py-1 rounded border border-casa-border text-[10px] font-semibold text-casa-navy hover:bg-casa-bg transition-colors"
                >
                  <Pencil size={10} />
                  Edit
                </button>
                {mapsUrl && (
                  <a
                    href={mapsUrl}
                    target="_blank"
                    rel="noreferrer"
                    onClick={e => e.stopPropagation()}
                    className="flex items-center gap-1 px-2 py-1 rounded border border-casa-border text-[10px] font-semibold text-casa-navy hover:bg-casa-bg transition-colors"
                  >
                    <Navigation size={10} />
                    Directions
                  </a>
                )}
                <button className="flex items-center gap-1 px-2 py-1 rounded bg-casa-gold text-white text-[10px] font-semibold hover:brightness-110 transition-all ml-auto">
                  <Share2 size={10} />
                  Share
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
