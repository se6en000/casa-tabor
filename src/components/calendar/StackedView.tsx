import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { format, addDays, isToday, startOfDay, isBefore, isAfter, differenceInMinutes } from 'date-fns'
import { motion, AnimatePresence } from 'framer-motion'
import {
  MapPin, AlertTriangle,
  Navigation, Bell,
  CalendarDays, ArrowRight,
} from 'lucide-react'
import { cn } from '../../utils/cn'
import { cleanEventTitle, isBirthdayEvent } from '../../utils/eventTitle'
import { useCalendarStore } from '../../stores/calendarStore'
import { useRollingEvents } from '../../hooks/useCalendarEvents'
import { useFamilyMembers } from '../../hooks/useFamilyMembers'
import type { EventWithDetails } from '../../hooks/useCalendarEvents'
import EventDetailPanel from './EventDetailPanel'
import EventEditSheet from './EventEditSheet'
import { isReminder, isAllDayReminder, isTimedReminder } from '../../utils/holidays'
import EventContextMenu from '../shared/EventContextMenu'
import { WeatherIcon } from '../shared/WeatherIcon'
import { BirthdayCardDecoration } from '../shared/BirthdayCardDecoration'
import { eventOverlapsDay, getEventDisplayStartDay, getEventEndDate, getEventStartDate } from '../../utils/eventTime'
import { PersonAvatarStack, CalendarPill, Button } from '../ui'
import type { FamilyMember } from '../../types'
import { deriveCalendarCardResponsibility } from '../../lib/calendarResponsibility'
import { resolveEventMode } from '../../lib/eventPlanOverrides'
import { useCalendarQuickCreateGesture } from '../../hooks/useCalendarQuickCreateGesture'
import QuickCreateSheet from '../shared/QuickCreateSheet'
import { useReminderNeedsYouActions } from '../../hooks/useReminderNeedsYouActions'

const SHARED_COLOR = 'var(--color-casa-gold)'
const IDLE_RESET_TIMEOUT_MS = 30_000 // 30 seconds idle before returning to Today

function formatCompactDuration(minutes: number): string {
  if (minutes <= 0 || minutes >= 1440) return ''
  if (minutes < 60) return `${minutes}m`
  if (minutes % 60 === 0) return `${minutes / 60}h`
  const hours = (minutes / 60).toFixed(1).replace('.0', '')
  return `${hours}h`
}

function DrivingBadgeIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="8.5" stroke="white" strokeWidth="2" strokeLinecap="round" />
      <circle cx="12" cy="2" stroke="white" strokeWidth="2" />
      <path d="M12 3.5v6M5.8 16.6l4.1-2.7M18.2 16.6l-4.1-2.7" stroke="white" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

function SupervisingBadgeIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M12 3l7 2.6v5.2c0 4.3-3 7.3-7 8.4-4-1.1-7-4.1-7-8.4V5.6z" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function getPrimaryColor(event: EventWithDetails): string {
  if (!event.members || event.members.length === 0) return SHARED_COLOR
  if (event.members.length >= 5) return SHARED_COLOR
  const primary = event.members.find(m => m.role === 'primary') ?? event.members[0]
  return primary?.family_member?.color_hex || SHARED_COLOR
}

export function getGoingMembers(event: EventWithDetails): FamilyMember[] {
  // Every member row in event.members represents someone attending the event -
  // there's no separate "not going" role, and the attendee editor always saves
  // new/edited members with role 'attendee' (there's no "primary" distinction
  // for attendees anymore). Keep 'assignee'/'primary' for older/legacy rows so
  // nothing regresses for events written before this change.
  const selected = (event.members ?? [])
    .filter((member) => {
      const role = member?.role?.toLowerCase() ?? ''
      return role === 'attendee' || role === 'assignee' || role === 'primary'
    })
    .map((member) => member?.family_member)
    .filter((member): member is FamilyMember => Boolean(member))

  const deduped = new Map(selected.map((member) => [member.id, member]))
  return Array.from(deduped.values()).sort((a, b) => (a?.name ?? '').localeCompare(b?.name ?? ''))
}

export function deriveResponsibilityChip(event: EventWithDetails, household: FamilyMember[]) {
  const responsibility = deriveCalendarCardResponsibility(event, household, new Date())
  if (!responsibility.responsible) return null
  return {
    label: responsibility.roleBadge === 'supervise' ? 'SUPERVISOR' : 'DRIVER',
    person: responsibility.responsible,
  }
}

export default function StackedView() {
  const { visibleMembers, selectedDate, setActiveView } = useCalendarStore()
  const { data: householdData } = useFamilyMembers()
  // Anchor the 8-day window to the shared calendar selectedDate
  const anchor = startOfDay(selectedDate)
  // 8 days in a single horizontal ribbon: anchor → anchor+7
  const days = useMemo(() => Array.from({ length: 8 }, (_, i) => addDays(anchor, i)), [anchor])

  const { data: allEvents } = useRollingEvents(anchor)
  const household = householdData ?? []

  const [selectedEventId, setSelectedEventId] = useState<string | null>(null)
  const [editEventId,     setEditEventId]     = useState<string | null>(null)
  const [deleteIntentEventId, setDeleteIntentEventId] = useState<string | null>(null)
  const [contextMenu, setContextMenu] = useState<{ event: EventWithDetails; x: number; y: number } | null>(null)
  const [quickCreate, setQuickCreate] = useState<{ open: boolean; start?: Date }>({ open: false })

  const ribbonRef = useRef<HTMLDivElement>(null)
  const columnScrollRefs = useRef<(HTMLDivElement | null)[]>([])
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Reset ribbon & column vertical scrolls back to Today/Anchor
  const resetToToday = useCallback(() => {
    if (ribbonRef.current) {
      ribbonRef.current.scrollTo({ left: 0, behavior: 'smooth' })
    }
    columnScrollRefs.current.forEach(colEl => {
      colEl?.scrollTo({ top: 0, behavior: 'smooth' })
    })
  }, [])

  // Inactivity / Idle reset logic
  const handleUserActivity = useCallback(() => {
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current)
    }
    idleTimerRef.current = setTimeout(() => {
      resetToToday()
    }, IDLE_RESET_TIMEOUT_MS)
  }, [resetToToday])

  // Reset to today on mount and when anchor/selectedDate changes
  useEffect(() => {
    if (ribbonRef.current) {
      ribbonRef.current.scrollTo({ left: 0, behavior: 'instant' })
    }
    columnScrollRefs.current.forEach(colEl => {
      colEl?.scrollTo({ top: 0, behavior: 'instant' })
    })
    handleUserActivity()
    return () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current)
    }
  }, [anchor, handleUserActivity])

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
    <div
      className="relative h-full w-full overflow-hidden flex flex-col select-none"
      onClick={() => setSelectedEventId(null)}
      onPointerDown={handleUserActivity}
      onTouchStart={handleUserActivity}
    >
      {/* ── Single-Row 8-Day Horizontal Ribbon with Crisp Outer Padding ── */}
      <div
        ref={ribbonRef}
        onScroll={handleUserActivity}
        className="flex-1 overflow-x-auto overflow-y-hidden overscroll-x-contain touch-pan-x scrollbar-none"
      >
        <div className="flex flex-row gap-4 px-6 py-2 w-max min-w-full h-full items-stretch">
          {days.map((day, idx) => {
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
                className="flex flex-col flex-shrink-0 w-[20rem] sm:w-[22rem] md:w-[23rem] lg:w-[24rem] xl:w-[25rem] h-full touch-pan-y"
                onPointerDown={(event) => quickCreateGesture.onPointerDown(event, day)}
                onPointerMove={quickCreateGesture.onPointerMove}
                onPointerUp={quickCreateGesture.onPointerUp}
                onPointerCancel={quickCreateGesture.onPointerCancel}
                onDoubleClick={(event) => quickCreateGesture.onDoubleClick(event, day)}
              >
                {/* Day Header (Sticky at top of each column) */}
                <div className={cn(
                  'flex items-baseline justify-between pb-1.5 mb-1.5 border-b shrink-0',
                  today_ ? 'border-casa-gold' : 'border-casa-divider'
                )}>
                  <div className="flex items-baseline gap-1.5">
                    <span className={cn(
                      'text-caption font-bold uppercase tracking-wider',
                      today_ ? 'text-casa-gold' : 'text-casa-muted'
                    )}>
                      {format(day, 'EEE')}
                    </span>
                    <span className={cn(
                      'text-body font-bold leading-none',
                      today_ ? 'text-casa-gold' : 'text-casa-text'
                    )}>
                      {format(day, 'd')}
                    </span>
                  </div>
                  {today_ && (
                    <span className="text-caption font-bold px-2 py-0.5 rounded-full bg-casa-gold/15 text-casa-gold uppercase tracking-wider leading-none">
                      Today
                    </span>
                  )}
                </div>

                {/* Scrollable Events container for busy days (Vertical Scroll) */}
                <div
                  ref={el => { columnScrollRefs.current[idx] = el }}
                  onScroll={handleUserActivity}
                  className="flex-1 overflow-y-auto overscroll-y-contain space-y-2 pr-0.5 pb-28 md:pb-8 scrollbar-none"
                >
                  {/* All-day reminders & all-day events */}
                  {dayAllDay.map(r => (
                    isReminder(r) ? (
                      <div key={r.id} data-calendar-event>
                        <CompactReminderCard
                          event={r}
                          now={new Date()}
                          onClick={() => setSelectedEventId(r.id)}
                          onDoubleClick={() => { setSelectedEventId(null); setEditEventId(r.id) }}
                          onLongPress={(ev, x, y) => setContextMenu({ event: ev, x, y })}
                        />
                      </div>
                    ) : (
                      <div key={r.id} data-calendar-event>
                        <EventCard
                          event={r}
                          household={household}
                          now={new Date()}
                          onClick={() => setSelectedEventId(r.id)}
                          onDoubleClick={() => { setSelectedEventId(null); setEditEventId(r.id) }}
                          onLongPress={(ev, x, y) => setContextMenu({ event: ev, x, y })}
                        />
                      </div>
                    )
                  ))}

                  {/* Timed reminders + normal events merged by time */}
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
                          <CompactReminderCard
                            event={event}
                            now={new Date()}
                            onClick={() => setSelectedEventId(event.id)}
                            onDoubleClick={() => { setSelectedEventId(null); setEditEventId(event.id) }}
                            onLongPress={(ev, x, y) => setContextMenu({ event: ev, x, y })}
                          />
                        </motion.div>
                      ) : (
                        <EventCard
                          key={event.id}
                          event={event}
                          household={household}
                          now={new Date()}
                          onClick={() => setSelectedEventId(event.id)}
                          onDoubleClick={() => { setSelectedEventId(null); setEditEventId(event.id) }}
                          onLongPress={(ev, x, y) => setContextMenu({ event: ev, x, y })}
                        />
                      ))
                    }
                  </AnimatePresence>

                  {dayEvents.length === 0 && (
                    <p className="text-caption text-casa-muted/50 text-center pt-4">—</p>
                  )}
                </div>
              </div>
            )
          })}

          {/* ── 8-Day Horizon Endcap Card ── */}
          <div className="flex flex-col flex-shrink-0 w-[16rem] sm:w-[18rem] h-full justify-center items-center rounded-widget border-2 border-dashed border-casa-border/80 bg-casa-surface/40 p-6 text-center text-casa-muted space-y-4 select-none">
            <div className="w-12 h-12 rounded-full bg-casa-gold/15 text-casa-gold flex items-center justify-center shadow-2xs">
              <CalendarDays size={22} />
            </div>
            <div className="space-y-1">
              <p className="text-body font-bold text-casa-navy">8-Day Horizon</p>
              <p className="text-caption text-casa-muted leading-relaxed">
                You're caught up for the next 8 days.
              </p>
            </div>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setActiveView('month')}
              className="mt-1 font-bold text-casa-navy hover:text-casa-gold"
              trailingIcon={<ArrowRight size={13} />}
            >
              View Month
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={resetToToday}
              className="text-caption font-semibold text-casa-muted hover:text-casa-navy"
            >
              ← Back to Today
            </Button>
          </div>
        </div>
      </div>

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
    </div>
  )
}

/* ── Compact Reminder Card (Path 2 Proportional Pillar System) ─────── */

interface CompactReminderCardProps {
  event: EventWithDetails
  now?: Date
  onClick: () => void
  onDoubleClick?: () => void
  onLongPress?: (event: EventWithDetails, x: number, y: number) => void
}

function CompactReminderCard({ event, now = new Date(), onClick, onDoubleClick, onLongPress }: CompactReminderCardProps) {
  const start = getEventStartDate(event)
  const end = getEventEndDate(event)
  const past = isBefore(end, now)
  const isTimed = isTimedReminder(event)
  const cleanTitle = cleanEventTitle(event.title)
  const members = event.members ?? []

  // Long-press detection
  const lpTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lpOrigin = useRef<{ x: number; y: number } | null>(null)

  const handleTouchStart = (e: React.TouchEvent) => {
    if (!onLongPress) return
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

  if (past) {
    return (
      <div
        onClick={(e) => { e.stopPropagation(); onClick() }}
        onDoubleClick={(e) => { e.stopPropagation(); onDoubleClick?.() }}
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
          'relative w-full rounded-xl border border-amber-300/60 bg-amber-50/40 shadow-xs cursor-pointer touch-pan-y overflow-hidden',
          'hover:opacity-85 hover:border-amber-400/80 transition-all duration-200 min-h-[38px] px-2.5 py-1.5 flex items-center justify-between gap-2',
          'border-l-4 border-l-amber-400 opacity-45'
        )}
        data-calendar-event
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <span className="font-mono text-caption font-bold text-amber-950 tabular-nums shrink-0">
            {isTimed ? format(start, 'h:mm a') : 'ALL DAY'}
          </span>
          <span className="text-amber-300 shrink-0">•</span>
          <span className="text-caption sm:text-body-sm font-semibold text-casa-navy truncate">
            {cleanTitle}
          </span>
        </div>
        {members.length > 0 && (
          <div className="flex items-center gap-1 shrink-0">
            {members.slice(0, 2).map((m) => (
              <CalendarPill
                key={m.id}
                color={m.family_member?.color_hex ?? 'var(--color-casa-gold)'}
                className="!text-2xs !py-0 !px-1.5"
              >
                {m.family_member?.name}
              </CalendarPill>
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div
      onClick={(e) => { e.stopPropagation(); onClick() }}
      onDoubleClick={(e) => { e.stopPropagation(); onDoubleClick?.() }}
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
        'relative w-full rounded-widget border border-amber-300/60 bg-amber-50/40 shadow-card cursor-pointer touch-pan-y overflow-hidden',
        'hover:shadow-card-hover hover:border-amber-400/80 transition-all duration-200 min-h-control',
        'grid grid-cols-[5.75rem_1fr]',
        past && 'opacity-45'
      )}
      data-calendar-event
    >
      {/* Straight Amber Left Pillar */}
      <div className="p-2.5 bg-amber-100/70 text-amber-950 flex flex-col justify-between items-start border-r border-amber-200/60 border-l-4 border-l-amber-400 min-w-0 overflow-hidden">
        <div className="w-full min-w-0">
          <span className="font-mono text-body font-bold text-amber-950 tabular-nums leading-none block">
            {isTimed ? format(start, 'h:mm') : 'ALL DAY'}
          </span>
          <span className="font-mono text-caption uppercase text-amber-900/70 font-semibold leading-none mt-1 block">
            {isTimed ? format(start, 'a') : 'REMIND'}
          </span>
        </div>
        <Bell size={11} className="text-amber-800 shrink-0 mt-1" />
      </div>

      {/* Content Deck */}
      <div className="p-2.5 flex flex-col justify-between gap-1.5 bg-casa-surface/50 min-w-0">
        <p className="text-body font-bold text-casa-navy line-clamp-2 leading-snug">
          {cleanTitle}
        </p>
        {members.length > 0 && (
          <div className="flex items-center gap-1 flex-wrap pt-0.5">
            {members.slice(0, 2).map((m) => (
              <CalendarPill
                key={m.id}
                color={m.family_member?.color_hex ?? 'var(--color-casa-gold)'}
              >
                {m.family_member?.name}
              </CalendarPill>
            ))}
            {members.length > 2 && (
              <span className="text-caption text-casa-muted font-bold">
                +{members.length - 2}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

/* ── Compact Event Card (Path 2 Proportional Pillar System) ─────────── */

interface EventCardProps {
  event: EventWithDetails
  household: FamilyMember[]
  now?: Date
  onClick: () => void
  onDoubleClick: () => void
  onLongPress: (event: EventWithDetails, x: number, y: number) => void
}

function EventCard({ event, household, now = new Date(), onClick, onDoubleClick, onLongPress }: EventCardProps) {
  const color = getPrimaryColor(event)
  const enr = event.enrichment
  const urgentAction = event.actions?.find(a => a.is_urgent && !a.completed)
  const start = getEventStartDate(event)
  const end = getEventEndDate(event)
  const past = isBefore(end, now)
  const happening = isBefore(start, now) && isAfter(end, now)
  const isHeroState = happening || Boolean(urgentAction)
  const isAllDayEvent = event.all_day
  const displayStartDay = isAllDayEvent ? getEventDisplayStartDay(event) : null
  const mode = resolveEventMode(event)
  const isHosted = mode === 'hosted'
  const isBirthday = isBirthdayEvent(event)
  const cleanTitle = cleanEventTitle(event.title)

  // Re-derive driver/attendee responsibility whenever overrides change
  const [overrideVersion, setOverrideVersion] = useState(0)
  useEffect(() => {
    function handleOverridesUpdated(e: Event) {
      const detail = (e as CustomEvent<{ eventId?: string }>).detail
      if (!detail?.eventId || detail.eventId === event.id) {
        setOverrideVersion((v) => v + 1)
      }
    }
    window.addEventListener('casa:overrides-updated', handleOverridesUpdated)
    return () => window.removeEventListener('casa:overrides-updated', handleOverridesUpdated)
  }, [event.id])

  const responsibility = useMemo(
    () => deriveCalendarCardResponsibility(event, household, new Date()),
    [event, household, now, overrideVersion]
  )

  const departureTime = enr?.departure_time ? new Date(enr.departure_time) : null
  const durationMins = differenceInMinutes(end, start)
  const durationStr = formatCompactDuration(durationMins)

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

  if (past && !isHeroState) {
    return (
      <motion.div
        layout
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 0.45, y: 0 }}
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
          'relative rounded-xl border border-casa-border/60 bg-casa-surface/90 shadow-xs cursor-pointer touch-pan-y overflow-hidden',
          'hover:opacity-85 hover:border-casa-gold/60 transition-all duration-200 min-h-[38px] px-2.5 py-1.5 flex items-center justify-between gap-2',
          'border-l-4'
        )}
        style={{ borderLeftColor: color }}
        data-calendar-event
      >
        {/* Left: Time + Divider + Title */}
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <span className="font-mono text-caption font-bold text-casa-navy tabular-nums shrink-0">
            {isAllDayEvent
              ? (displayStartDay ? format(displayStartDay, 'MMM d') : 'ALL DAY')
              : format(start, 'h:mm a')}
          </span>
          <span className="text-casa-divider shrink-0">•</span>
          <span className="text-caption sm:text-body-sm font-semibold text-casa-navy truncate">
            {isBirthday && <span className="mr-1" aria-hidden="true">🎂</span>}
            {cleanTitle}
          </span>
        </div>

        {/* Right: Driver/Supervisor Tag + Mini Avatar Stack */}
        <div className="flex items-center gap-1.5 shrink-0">
          {responsibility.responsible && (
            <div
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-casa-bg border border-casa-border/70 text-caption font-medium"
              title={`${responsibility.responsible.name} ${responsibility.roleBadge === 'drive' ? 'driver assigned' : isHosted ? 'hosting' : 'supervising'}`}
            >
              <span
                className="flex size-3.5 shrink-0 items-center justify-center rounded-full text-caption font-extrabold text-white"
                style={{ backgroundColor: responsibility.responsible.color ?? 'var(--color-casa-gold)' }}
              >
                {responsibility.responsible.initial ?? responsibility.responsible.name?.[0]?.toUpperCase() ?? '?'}
              </span>
              <span className="text-caption font-semibold text-casa-navy hidden xs:inline">
                {responsibility.roleBadge === 'drive' ? 'Drives' : isHosted ? 'Hosting' : 'Supervising'}
              </span>
            </div>
          )}

          {responsibility.attendees.length > 0 && (
            <PersonAvatarStack
              people={responsibility.attendees.map((m) => ({
                id: m.id,
                name: m.family_member?.name ?? '?',
                color: m.family_member?.color_hex ?? SHARED_COLOR,
              }))}
              max={3}
              size="xs"
            />
          )}
        </div>
      </motion.div>
    )
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: past ? 0.45 : 1, y: 0 }}
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
        'relative rounded-widget border cursor-pointer touch-pan-y shadow-card overflow-hidden transition-all duration-200 min-h-control',
        'grid grid-cols-[5.75rem_1fr]',
        isHeroState
          ? 'bg-casa-navy text-white border-casa-navy ring-1 ring-casa-gold/60 shadow-card-hover'
          : isBirthday
            ? 'bg-gradient-to-br from-casa-accent-subtle via-casa-surface to-casa-bg border-casa-border/80 hover:shadow-card-hover hover:border-casa-gold/50'
            : 'bg-casa-surface text-casa-navy border-casa-border/70 hover:shadow-card-hover hover:border-casa-gold/50'
      )}
      data-calendar-event
    >
      {isBirthday && <BirthdayCardDecoration />}

      {/* ── Straight Left Pillar: Architectural Time Anchor ── */}
      <div
        className={cn(
          'p-2.5 flex flex-col justify-between items-start border-r relative border-l-4 min-w-0 overflow-hidden',
          isHeroState
            ? 'bg-white/5 border-r-white/15 text-white'
            : 'bg-casa-bg/80 border-r-casa-divider text-casa-navy'
        )}
        style={{ borderLeftColor: color }}
      >
        <div className="w-full min-w-0">
          <div
            className={cn(
              'font-mono text-body font-bold tabular-nums leading-none',
              isHeroState ? 'text-casa-gold' : 'text-casa-navy'
            )}
          >
            {isAllDayEvent
              ? (displayStartDay ? format(displayStartDay, 'MMM d') : 'ALL DAY')
              : format(start, 'h:mm')}
          </div>
          {!isAllDayEvent && (
            <div
              className={cn(
                'font-mono text-caption uppercase font-semibold mt-1 leading-tight flex flex-wrap items-baseline gap-x-1',
                isHeroState ? 'text-white/70' : 'text-casa-muted'
              )}
            >
              <span>{format(start, 'a')}</span>
              {durationStr && <span>· {durationStr}</span>}
            </div>
          )}
        </div>

        {/* Pillar bottom indicators: Leave-by / Weather / Alert (Pure SVG) */}
        <div className="w-full pt-1.5 flex flex-col gap-1 min-w-0">
          {departureTime && !happening && !isHosted && (
            <span
              className={cn(
                'flex items-center gap-0.5 text-caption font-bold leading-none truncate max-w-full',
                isHeroState ? 'text-casa-gold' : 'text-casa-gold'
              )}
              title={`Leave by ${format(departureTime, 'h:mm a')}`}
            >
              <Navigation size={9} className="shrink-0 text-casa-gold" />
              <span className="text-caption font-semibold truncate">{format(departureTime, 'h:mm')}</span>
            </span>
          )}
          <div className="flex items-center justify-between w-full">
            {event.location_name && (
              <WeatherIcon condition={event.enrichment?.weather_at_event} size={11} />
            )}
            {urgentAction && <AlertTriangle size={11} className="text-amber-400 shrink-0 ml-auto" />}
          </div>
        </div>
      </div>

      {/* ── Right Content Deck ── */}
      <div
        className={cn(
          'p-3 flex flex-col justify-between gap-2 min-w-0',
          isHeroState ? 'bg-casa-navy' : 'bg-casa-surface'
        )}
      >
        <div className="space-y-1 min-w-0">
          {/* Title — Same crisp font as reminder titles */}
          <p
            className={cn(
              'stacked-event-title font-bold text-body leading-snug line-clamp-2',
              isHeroState ? 'text-white' : 'text-casa-navy'
            )}
          >
            {cleanTitle}
          </p>

          {/* Location / Mode (Pure SVG icon) */}
          {(event.location_name || isHosted) && (
            <div
              className={cn(
                'flex items-center gap-1 text-caption min-w-0',
                isHeroState ? 'text-white/70' : 'text-casa-muted'
              )}
            >
              {isHosted ? (
                <span className="text-caption font-semibold uppercase tracking-wide">At home</span>
              ) : (
                <span className="flex items-center gap-1 truncate text-caption">
                  <MapPin size={10} className="shrink-0 text-casa-gold" />
                  <span className="truncate">{event.location_name}</span>
                </span>
              )}
            </div>
          )}
        </div>

        {/* Footer: Driver / Supervisor Capsule + Attendee Stack (Pure SVG) */}
        {(responsibility.responsible || responsibility.attendees.length > 0) && (
          <div
            className={cn(
              'pt-1.5 border-t flex items-center justify-between gap-1',
              isHeroState ? 'border-white/15' : 'border-casa-divider'
            )}
          >
            {responsibility.responsible ? (
              <div
                className={cn(
                  'inline-flex min-w-0 max-w-[70%] items-center gap-1 px-1.5 py-0.5 rounded-full border text-caption font-semibold',
                  isHeroState
                    ? 'bg-white/10 border-white/20 text-white'
                    : 'bg-casa-bg border-casa-border/80 text-casa-navy'
                )}
                title={`${responsibility.responsible.name} ${responsibility.roleBadge === 'drive' ? 'driver assigned' : isHosted ? 'hosting' : 'supervising'}`}
              >
                <span
                  className="flex size-4 shrink-0 items-center justify-center rounded-full text-caption font-extrabold leading-none text-white"
                  style={{ backgroundColor: responsibility.responsible.color ?? 'var(--color-casa-gold)' }}
                >
                  {responsibility.responsible.initial ?? responsibility.responsible.name?.[0]?.toUpperCase() ?? '?'}
                </span>
                <span className="truncate font-medium max-w-[50px]">
                  {responsibility.responsible.name ? responsibility.responsible.name.split(' ')[0] : ''}
                </span>
                <span className={cn(
                  'text-caption font-bold px-1 rounded flex items-center gap-0.5',
                  responsibility.roleBadge === 'drive'
                    ? isHeroState ? 'bg-casa-gold/25 text-casa-gold' : 'bg-casa-gold/15 text-casa-gold'
                    : isHeroState ? 'bg-emerald-400/25 text-emerald-300' : 'bg-casa-success/15 text-casa-success-strong'
                )}>
                  {responsibility.roleBadge === 'drive' ? (
                    <>
                      <span className="w-2.5 h-2.5 bg-casa-navy rounded-full inline-flex items-center justify-center shrink-0">
                        <DrivingBadgeIcon />
                      </span>
                      <span className="text-caption font-bold">Drives</span>
                    </>
                  ) : (
                    <>
                      <span className="w-2.5 h-2.5 bg-casa-success-strong rounded-full inline-flex items-center justify-center shrink-0">
                        <SupervisingBadgeIcon />
                      </span>
                      <span className="text-caption font-bold">{isHosted ? 'Hosting' : 'Supervising'}</span>
                    </>
                  )}
                </span>
              </div>
            ) : (
              <span className={cn('text-caption font-semibold truncate', isHeroState ? 'text-casa-gold' : isHosted ? 'text-casa-success-strong' : 'text-casa-gold')}>
                {responsibility.summary}
              </span>
            )}

            {responsibility.attendees.length > 0 && (
              <div className="ml-auto shrink-0">
                <PersonAvatarStack
                  people={responsibility.attendees.map((m) => ({
                    id: m.id,
                    name: m.family_member?.name ?? '?',
                    color: m.family_member?.color_hex ?? SHARED_COLOR,
                  }))}
                  max={3}
                  size="sm"
                />
              </div>
            )}
          </div>
        )}
      </div>
    </motion.div>
  )
}
