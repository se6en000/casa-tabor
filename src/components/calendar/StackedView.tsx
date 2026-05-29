import { useState, useEffect, useRef } from 'react'
import { format, startOfWeek, addDays, isToday, isSameDay } from 'date-fns'
import { motion, AnimatePresence } from 'framer-motion'
import {
  MapPin, Clock, DollarSign, Phone, AlertTriangle,
  Pencil, Navigation, Share2, ChevronRight,
} from 'lucide-react'
import { cn } from '../../utils/cn'
import { useCalendarStore } from '../../stores/calendarStore'
import { useWeekEvents } from '../../hooks/useCalendarEvents'
import type { EventWithDetails } from '../../hooks/useCalendarEvents'
import { CATEGORY_LABEL } from './categoryFields'
import EventDetailPanel from './EventDetailPanel'
import EventEditSheet from './EventEditSheet'

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
  const { selectedDate, visibleMembers } = useCalendarStore()
  const weekStart = startOfWeek(selectedDate, { weekStartsOn: 0 })
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
  const { data: allEvents } = useWeekEvents(selectedDate)

  const [selectedEventId, setSelectedEventId] = useState<string | null>(null)
  const [editEventId, setEditEventId] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const events = (allEvents ?? []).filter(e =>
    visibleMembers.length === 0 || e.members.some(m => visibleMembers.includes(m.family_member?.id ?? ''))
  )

  const selectedEvent = selectedEventId ? (events.find(e => e.id === selectedEventId) ?? null) : null
  const editEvent = editEventId ? (events.find(e => e.id === editEventId) ?? null) : null

  // Group events by day
  const byDay = days.map(day => ({
    day,
    events: events
      .filter(e => isSameDay(new Date(e.start_time), day))
      .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime()),
  }))

  const hasAnyEvents = byDay.some(d => d.events.length > 0)

  // Scroll to today's section when the view mounts or events load
  useEffect(() => {
    const todayEl = scrollRef.current?.querySelector('#stacked-today')
    if (todayEl) {
      todayEl.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [allEvents])

  return (
    <div
      ref={scrollRef}
      className="h-full overflow-y-auto px-4 py-4 space-y-6"
      onClick={() => setSelectedEventId(null)}
    >
      {!hasAnyEvents && (
        <div className="flex flex-col items-center justify-center h-48 text-casa-muted gap-2">
          <p className="text-body font-semibold">No events this week</p>
          <p className="text-caption">Events from Google Calendar will appear here once synced.</p>
        </div>
      )}

      {byDay.map(({ day, events: dayEvents }) => {
        if (dayEvents.length === 0) return null
        const today = isToday(day)

        return (
          <section key={format(day, 'yyyy-MM-dd')} id={today ? 'stacked-today' : undefined}>
            {/* Day header */}
            <div className="flex items-center gap-3 mb-3">
              <div className={cn(
                'flex flex-col items-center justify-center w-12 h-12 rounded-full shrink-0',
                today ? 'bg-casa-gold text-white' : 'bg-casa-surface border border-casa-border text-casa-navy'
              )}>
                <span className="text-[10px] font-semibold uppercase tracking-wide leading-none">
                  {format(day, 'EEE')}
                </span>
                <span className="font-display text-display-md leading-none mt-0.5">
                  {format(day, 'd')}
                </span>
              </div>
              <div className="h-px flex-1 bg-casa-divider" />
              <span className="text-caption text-casa-muted shrink-0">
                {dayEvents.length} event{dayEvents.length !== 1 ? 's' : ''}
              </span>
            </div>

            {/* Event cards */}
            <div className="space-y-3 pl-2">
              <AnimatePresence initial={false}>
                {dayEvents.map(event => (
                  <EventCard
                    key={event.id}
                    event={event}
                    isSelected={selectedEventId === event.id}
                    onClick={() => setSelectedEventId(event.id)}
                    onDoubleClick={() => { setSelectedEventId(null); setEditEventId(event.id) }}
                  />
                ))}
              </AnimatePresence>
            </div>
          </section>
        )
      })}

      {/* Detail panel */}
      <EventDetailPanel
        event={selectedEvent}
        onClose={() => setSelectedEventId(null)}
      />

      {/* Direct edit sheet (double-click) */}
      {editEvent && (
        <EventEditSheet
          event={editEvent}
          open={!!editEvent}
          onClose={() => setEditEventId(null)}
        />
      )}
    </div>
  )
}

/* ── Event Card ─────────────────────────────────────────────── */

interface EventCardProps {
  event: EventWithDetails
  isSelected: boolean
  onClick: () => void
  onDoubleClick: () => void
}

function EventCard({ event, isSelected, onClick, onDoubleClick }: EventCardProps) {
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

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
      onClick={(e) => { e.stopPropagation(); onClick() }}
      onDoubleClick={(e) => { e.stopPropagation(); onDoubleClick() }}
      className={cn(
        'relative rounded-xl border bg-casa-surface cursor-pointer',
        'hover:shadow-card-hover transition-all duration-200',
        isSelected ? 'border-casa-gold shadow-card' : 'border-casa-border'
      )}
    >
      {/* Left color bar */}
      <div
        className="absolute left-0 top-0 bottom-0 w-1 rounded-l-xl"
        style={{ backgroundColor: color }}
      />

      <div className="pl-5 pr-4 py-4">
        {/* Row 1: time + urgent indicator */}
        <div className="flex items-start justify-between gap-2 mb-1.5">
          <p className="text-caption font-semibold text-casa-muted tabular-nums">
            {format(start, 'h:mm a')} – {format(end, 'h:mm a')}
          </p>
          {urgentAction && (
            <span className="flex items-center gap-1 text-caption text-amber-600 font-semibold shrink-0">
              <AlertTriangle size={12} />
              Action needed
            </span>
          )}
        </div>

        {/* Row 2: Title */}
        <h3 className="font-display text-heading text-casa-navy leading-tight mb-2">
          {event.title}
        </h3>

        {/* Row 3: Members — primary first, no role label */}
        {event.members.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {[...event.members]
              .sort((a, b) => (a.role === 'primary' ? -1 : b.role === 'primary' ? 1 : 0))
              .map(m => (
              <span
                key={m.id}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-white text-[11px] font-semibold"
                style={{ backgroundColor: m.family_member?.color_hex ?? '#888' }}
              >
                {m.family_member?.name}
              </span>
            ))}
          </div>
        )}

        {/* Row 4: Location + Category */}
        <div className="flex items-center flex-wrap gap-x-4 gap-y-1">
          {event.location_name && (
            <span className="flex items-center gap-1 text-caption text-casa-muted">
              <MapPin size={12} className="text-casa-error shrink-0" />
              <span className="truncate max-w-[200px]">{event.location_name}</span>
            </span>
          )}
          {category && (
            <span className="text-caption text-casa-muted px-2 py-0.5 bg-casa-bg rounded-full border border-casa-border">
              {category}
            </span>
          )}
        </div>

        {/* Row 5: Snippet (most relevant enrichment detail) */}
        {snippet && (
          <div className="mt-2 flex items-center gap-1.5 text-caption text-casa-muted">
            <span className="text-casa-gold">{snippet.icon}</span>
            <span>{snippet.text}</span>
          </div>
        )}

        {/* Row 6: Quick-action buttons (only when selected) */}
        <AnimatePresence>
          {isSelected && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.18 }}
              className="overflow-hidden"
            >
              <div className="flex gap-2 mt-3 pt-3 border-t border-casa-divider">
                <button
                  onClick={(e) => { e.stopPropagation(); onClick() }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-button border border-casa-border text-caption font-semibold text-casa-navy hover:bg-casa-bg transition-colors"
                >
                  <Pencil size={13} />
                  Edit
                </button>
                {mapsUrl && (
                  <a
                    href={mapsUrl}
                    target="_blank"
                    rel="noreferrer"
                    onClick={e => e.stopPropagation()}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-button border border-casa-border text-caption font-semibold text-casa-navy hover:bg-casa-bg transition-colors"
                  >
                    <Navigation size={13} />
                    Directions
                  </a>
                )}
                <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-button bg-casa-gold text-white text-caption font-semibold hover:brightness-110 transition-all ml-auto">
                  <Share2 size={13} />
                  Share
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  )
}
