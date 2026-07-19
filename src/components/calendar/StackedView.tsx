import { useState, useCallback, useRef } from 'react'
import { format, addDays, isToday, startOfDay } from 'date-fns'
import { motion, AnimatePresence } from 'framer-motion'
import {
  MapPin, Clock, DollarSign, Phone, AlertTriangle,
  Pencil, Navigation, Share2, ChevronRight,
} from 'lucide-react'
import { cn } from '../../utils/cn'
import { cleanEventTitle } from '../../utils/eventTitle'
import { useCalendarStore } from '../../stores/calendarStore'
import { useRollingEvents } from '../../hooks/useCalendarEvents'
import { useFamilyMembers } from '../../hooks/useFamilyMembers'
import type { EventWithDetails } from '../../hooks/useCalendarEvents'
import { CATEGORY_LABEL } from './categoryFields'
import EventDetailPanel from './EventDetailPanel'
import EventEditSheet from './EventEditSheet'
import { isReminder, isAllDayReminder, isTimedReminder } from '../../utils/holidays'
import SwipeableReminderPill from '../shared/SwipeableReminderPill'
import EventContextMenu from '../shared/EventContextMenu'
import { WeatherIcon } from '../shared/WeatherIcon'
import BounceScroll from '../shared/BounceScroll'
import { eventOverlapsDay, getEventDisplayStartDay } from '../../utils/eventTime'
import type { FamilyMember } from '../../types'
import { deriveCalendarCardResponsibility } from '../../lib/calendarResponsibility'
import { useCalendarQuickCreateGesture } from '../../hooks/useCalendarQuickCreateGesture'
import QuickCreateSheet from '../shared/QuickCreateSheet'
import { Button, CalendarPill, Chip } from '../ui'
import { useReminderNeedsYouActions } from '../../hooks/useReminderNeedsYouActions'

const SHARED_COLOR = 'var(--color-casa-gold)'

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

function getGoingMembers(event: EventWithDetails): FamilyMember[] {
  const selected = event.members
    .filter((member) => {
      const role = member.role.toLowerCase()
      return role === 'assignee' || role === 'primary'
    })
    .map((member) => member.family_member)
    .filter((member): member is FamilyMember => Boolean(member))

  const deduped = new Map(selected.map((member) => [member.id, member]))
  return Array.from(deduped.values()).sort((a, b) => a.name.localeCompare(b.name))
}

function deriveResponsibilityChip(event: EventWithDetails, household: FamilyMember[]) {
  const responsibility = deriveCalendarCardResponsibility(event, household, new Date())
  if (!responsibility.responsible) return null
  return {
    label: responsibility.roleBadge === 'supervise' ? 'SUPERVISOR' : 'DRIVER',
    person: responsibility.responsible,
  }
}

export default function StackedView() {
  const { visibleMembers } = useCalendarStore()
  const { data: householdData } = useFamilyMembers()
  const today = startOfDay(new Date())
  // 8 days: today → today+7
  const days  = Array.from({ length: 8 }, (_, i) => addDays(today, i))
  const row1  = days.slice(0, 4)
  const row2  = days.slice(4, 8)

  const { data: allEvents } = useRollingEvents(today)
  const household = householdData ?? []

  const [selectedEventId, setSelectedEventId] = useState<string | null>(null)
  const [editEventId,     setEditEventId]     = useState<string | null>(null)
  const [deleteIntentEventId, setDeleteIntentEventId] = useState<string | null>(null)
  const [contextMenu, setContextMenu] = useState<{ event: EventWithDetails; x: number; y: number } | null>(null)
  const [quickCreate, setQuickCreate] = useState<{ open: boolean; start?: Date }>({ open: false })
  const quickCreateGesture = useCalendarQuickCreateGesture<Date>({
    resolveStart: (day) => {
      const start = new Date(day)
      start.setHours(9, 0, 0, 0)
      return start
    },
    onCreate: (start) => setQuickCreate({ open: true, start }),
  })

  const events = (allEvents ?? []).filter(e =>
    isReminder(e) || visibleMembers.length === 0 || e.members.some(m => visibleMembers.includes(m.family_member?.id ?? ''))
  )

  const selectedEvent = selectedEventId ? (events.find(e => e.id === selectedEventId) ?? null) : null
  const editEvent     = editEventId     ? (events.find(e => e.id === editEventId)     ?? null) : null

  const { completeReminder } = useReminderNeedsYouActions()

  const deleteEvent = useCallback((ev: EventWithDetails) => {
    setDeleteIntentEventId(ev.id)
    setEditEventId(ev.id)
  }, [])

  return (
    <BounceScroll
      className="h-full"
      innerClassName="px-3 py-4 space-y-4"
      onClick={() => setSelectedEventId(null)}
    >
      {[row1, row2].map((rowDays, rowIdx) => (
        <div key={rowIdx} className="grid grid-cols-4 gap-2 min-h-[160px]">
          {rowDays.map(day => {
            const dayEvents = events
              .filter(e => eventOverlapsDay(e, day))
              .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())

            const dayAllDay = dayEvents.filter(e => e.all_day || isAllDayReminder(e))
            const dayTimed  = dayEvents.filter(isTimedReminder)
            const dayNormal = dayEvents.filter(e => !isReminder(e) && !e.all_day)
            const today_ = isToday(day)

            return (
              <div
                key={format(day, 'yyyy-MM-dd')}
                className={cn(
                  'flex flex-col rounded-xl border overflow-hidden transition-colors touch-pan-y',
                  today_
                    ? 'bg-casa-accent-subtle/70 border-casa-accent-subtle-border'
                    : 'bg-casa-bg-2/65 border-casa-divider',
                )}
                onPointerDown={(event) => quickCreateGesture.onPointerDown(event, day)}
                onPointerMove={quickCreateGesture.onPointerMove}
                onPointerUp={quickCreateGesture.onPointerUp}
                onPointerCancel={quickCreateGesture.onPointerCancel}
                onDoubleClick={(event) => quickCreateGesture.onDoubleClick(event, day)}
              >
                {/* Day header — compact inline layout */}
                <div className={cn(
                  'flex items-center justify-center gap-1.5 py-1.5 border-b border-casa-divider shrink-0',
                  today_ ? 'bg-casa-gold/20' : ''
                )}>
                  <span className={cn(
                    'text-caption font-semibold uppercase tracking-wide',
                    today_ ? 'text-casa-gold' : 'text-casa-muted'
                  )}>
                    {format(day, 'EEE')}
                  </span>
                  <span className={cn(
                    'text-body font-semibold leading-none',
                    today_ ? 'text-casa-gold' : 'text-casa-text'
                  )}>
                    {format(day, 'd')}
                  </span>
                </div>

                {/* Events */}
                <div className="flex-1 overflow-y-auto p-1.5 space-y-1.5">
                  {/* All-day reminders */}
                  {dayAllDay.map(r => (
                    isReminder(r) ? (
                      <div key={r.id} data-calendar-event>
                        <SwipeableReminderPill
                          id={r.id}
                          title={r.title}
                          members={r.members}
                          onClick={() => setSelectedEventId(r.id)}
                          onComplete={completeReminder}
                          onDismiss={completeReminder}
                        />
                      </div>
                    ) : (
                      <div key={r.id} data-calendar-event>
                        <Chip
                          onClick={(e) => { e.stopPropagation(); setSelectedEventId(r.id) }}
                          tone="accent"
                          size="sm"
                          className="w-full justify-between"
                        >
                          <span className="truncate text-caption font-semibold text-casa-navy">
                            {r.title}
                          </span>
                          <span className="shrink-0 text-caption font-semibold text-casa-gold">
                            All day
                          </span>
                        </Chip>
                      </div>
                    )
                  ))}

                  {/* Timed reminders + events merged by time */}
                  <AnimatePresence initial={false}>
                    {[...dayNormal, ...dayTimed]
                      .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
                      .map(event => isTimedReminder(event) ? (
                        <motion.div
                          key={event.id}
                          data-calendar-event
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
                            onDismiss={completeReminder}
                          />
                        </motion.div>
                      ) : (
                        <EventCard
                          key={event.id}
                          event={event}
                          household={household}
                          isSelected={selectedEventId === event.id}
                          onClick={() => setSelectedEventId(event.id)}
                          onDoubleClick={() => { setSelectedEventId(null); setEditEventId(event.id) }}
                          onLongPress={(ev, x, y) => setContextMenu({ event: ev, x, y })}
                        />
                      ))
                    }
                  </AnimatePresence>

                  {dayEvents.length === 0 && (
                    <p className="text-caption text-casa-muted/50 text-center pt-2">—</p>
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
          initialDelete={deleteIntentEventId === editEvent.id}
          onClose={() => {
            setEditEventId(null)
            setDeleteIntentEventId(null)
          }}
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
      <QuickCreateSheet
        open={quickCreate.open}
        initialStart={quickCreate.start}
        onClose={() => setQuickCreate({ open: false })}
      />
    </BounceScroll>
  )
}

/* ── Event Card ─────────────────────────────────────────────── */

interface EventCardProps {
  event: EventWithDetails
  household: FamilyMember[]
  isSelected: boolean
  onClick: () => void
  onDoubleClick: () => void
  onLongPress: (event: EventWithDetails, x: number, y: number) => void
}

function EventCard({ event, household, isSelected, onClick, onDoubleClick, onLongPress }: EventCardProps) {
  const color = getPrimaryColor(event)
  const enr = event.enrichment
  const snippet = getSnippet(event)
  const urgentAction = event.actions?.find(a => a.is_urgent && !a.completed)
  const category = enr?.category ? (CATEGORY_LABEL[enr.category] ?? enr.category) : null
  const hasMaps = event.location_name || event.address
  const mapsQuery = event.address
    ? (event.location_name ? `${event.location_name}, ${event.address}` : event.address)
    : (event.location_name ?? '')
  const mapsUrl = hasMaps
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapsQuery)}`
    : null

  const start = new Date(event.start_time)
  const end = new Date(event.end_time)
  const isAllDayEvent = event.all_day
  const displayStartDay = isAllDayEvent ? getEventDisplayStartDay(event) : null
  const goingMembers = getGoingMembers(event)
  const visibleGoingMembers = goingMembers.slice(0, 2)
  const goingOverflowCount = Math.max(0, goingMembers.length - visibleGoingMembers.length)
  const responsibilityChip = deriveResponsibilityChip(event, household)

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
      onKeyDown={(e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return
        e.preventDefault()
        onClick()
      }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      role="button"
      tabIndex={0}
      className={cn(
        'relative rounded-lg border bg-casa-surface cursor-pointer touch-pan-y',
        'hover:shadow-card-hover transition-all duration-200',
        isSelected ? 'border-casa-gold shadow-card' : 'border-casa-border'
      )}
      data-calendar-event
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
            <p className="text-caption font-semibold text-casa-muted tabular-nums leading-none">
              {isAllDayEvent ? format(displayStartDay!, 'MMM d') : `${format(start, 'h:mm')}–${format(end, 'h:mma')}`}
            </p>
            {event.location_name && (
              <WeatherIcon condition={event.enrichment?.weather_at_event} size={12} />
            )}
          </div>
          {urgentAction && <AlertTriangle size={11} className="text-amber-500 shrink-0" />}
        </div>

        {/* Title — 1-line clamp, larger + bolder */}
        {(() => {
          const cleanTitle = cleanEventTitle(event.title)
          const showGoingRow = visibleGoingMembers.length > 0
          const showResponsibilityRow = Boolean(responsibilityChip)
          const showRoleRows = showGoingRow || showResponsibilityRow
          return (
            <div className="flex items-start justify-between gap-1.5">
              <div className="min-w-0 flex-1">
                <p
                  className="stacked-event-title text-body-sm font-semibold text-casa-text leading-snug line-clamp-1"
                  style={{ color: 'var(--color-casa-text)' }}
                >
                  {cleanTitle}
                </p>
              </div>
              {showRoleRows && (
                <div className="flex flex-col items-end gap-1 shrink-0">
                  {showGoingRow && (
                    <div className="flex items-center justify-end gap-1">
                      <span className="text-caption font-semibold uppercase tracking-wide text-casa-muted/75 leading-none">Going</span>
                      {visibleGoingMembers.map((member) => (
                        <CalendarPill
                          key={member.id}
                          color={member.color_hex ?? 'var(--color-casa-muted)'}
                          className="shrink-0"
                        >
                          {member.name}
                        </CalendarPill>
                      ))}
                      {goingOverflowCount > 0 && (
                        <CalendarPill className="shrink-0">
                          +{goingOverflowCount}
                        </CalendarPill>
                      )}
                    </div>
                  )}
                  {showResponsibilityRow && responsibilityChip && (
                    <div className="flex items-center justify-end gap-1">
                      <span className="text-caption font-semibold uppercase tracking-wide text-casa-muted/75 leading-none">
                        {responsibilityChip.label}
                      </span>
                      <CalendarPill
                        color={responsibilityChip.person.color ?? 'var(--color-casa-muted)'}
                        className="shrink-0"
                      >
                        {responsibilityChip.person.name}
                      </CalendarPill>
                    </div>
                  )}
                </div>
              )}
            </div>
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
                <span className="flex items-center gap-1 text-caption text-casa-muted">
                  <MapPin size={10} className="text-casa-error shrink-0" />
                  <span className="truncate">{event.location_name}</span>
                </span>
              )}
              {category && (
                <CalendarPill>
                  {category}
                </CalendarPill>
              )}
              {snippet && (
                <div className="flex items-center gap-1 text-caption text-casa-muted">
                  <span className="text-casa-gold">{snippet.icon}</span>
                  <span className="line-clamp-2">{snippet.text}</span>
                </div>
              )}
              <div className="flex gap-1.5 pt-1">
                <Button
                  onClick={(e) => { e.stopPropagation(); onDoubleClick() }}
                  variant="secondary"
                  size="sm"
                  leadingIcon={<Pencil size={14} />}
                >
                  Edit
                </Button>
                {mapsUrl && (
                  <a
                    href={mapsUrl}
                    target="_blank"
                    rel="noreferrer"
                    onClick={e => e.stopPropagation()}
                    className="inline-flex min-h-control items-center gap-2 rounded-button border border-casa-border bg-casa-surface px-3 text-body-sm font-medium text-casa-navy transition-colors hover:bg-casa-bg"
                  >
                    <Navigation size={14} />
                    Directions
                  </a>
                )}
                <Button className="ml-auto" size="sm" leadingIcon={<Share2 size={14} />}>
                  Share
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
