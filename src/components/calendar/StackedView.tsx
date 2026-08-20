import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { format, addDays, isToday, isSameDay, startOfDay, isBefore, isAfter, differenceInMinutes } from 'date-fns'
import { motion, AnimatePresence } from 'framer-motion'
import {
  MapPin, AlertTriangle,
  Navigation, Bell,
  CalendarDays, ArrowRight, Plus,
} from 'lucide-react'
import { cn } from '../../utils/cn'
import { cleanEventTitle, isBirthdayEvent } from '../../utils/eventTitle'
import { useCalendarStore } from '../../stores/calendarStore'
import { useAppStore } from '../../stores/appStore'
import { useRollingEvents } from '../../hooks/useCalendarEvents'
import { useFamilyMembers } from '../../hooks/useFamilyMembers'
import type { EventWithDetails } from '../../hooks/useCalendarEvents'
import EventEditSheet from './EventEditSheet'
import { isReminder, isAllDayReminder, isTimedReminder } from '../../utils/holidays'
import EventContextMenu from '../shared/EventContextMenu'
import { WeatherIcon } from '../shared/WeatherIcon'
import { BirthdayCardDecoration } from '../shared/BirthdayCardDecoration'
import { eventOverlapsDay, isEventMultiDay, getEventEndDate, getEventStartDate } from '../../utils/eventTime'
import { PersonAvatarStack, CalendarPill, Button } from '../ui'
import { MemberJewelPill, MemberJewelStack } from '../ui/MemberJewelPill'
import { EventProvenanceBadge } from './EventProvenanceBadge'
import { EventSyncStatusDot } from './EventSyncStatusDot'
import type { FamilyMember } from '../../types'
import { deriveCalendarCardResponsibility } from '../../lib/calendarResponsibility'
import { resolveEventMode } from '../../lib/eventPlanOverrides'
import { useCalendarQuickCreateGesture } from '../../hooks/useCalendarQuickCreateGesture'
import QuickCreateSheet from '../shared/QuickCreateSheet'
import PalmBeachFolioCard from './PalmBeachFolioCard'
import { useReminderNeedsYouActions } from '../../hooks/useReminderNeedsYouActions'

const SHARED_COLOR = 'var(--color-casa-gold)'
const _UnusedCalendarPill = () => <CalendarPill className="hidden">pill</CalendarPill>
void _UnusedCalendarPill

function formatCompactDuration(minutes: number): string {
  if (minutes <= 0 || minutes >= 1440) return ''
  if (minutes < 60) return `${minutes}m`
  if (minutes % 60 === 0) return `${minutes / 60}h`
  const hours = (minutes / 60).toFixed(1).replace('.0', '')
  return `${hours}h`
}

function getPrimaryColor(event: EventWithDetails): string {
  if (!event.members || event.members.length === 0) return SHARED_COLOR
  if (event.members.length >= 5) return SHARED_COLOR
  const primary = event.members.find(m => m.role === 'primary') ?? event.members[0]
  return primary?.family_member?.color_hex || SHARED_COLOR
}

export function getGoingMembers(event: EventWithDetails): FamilyMember[] {
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
  const { selectedSidecarEventId, aiDrawerOpen, sidecarTab, openEventInSidecar } = useAppStore()
  const { data: householdData } = useFamilyMembers()
  // Anchor the 8-day window to the shared calendar selectedDate
  const anchorTime = startOfDay(selectedDate).getTime()
  const anchor = useMemo(() => new Date(anchorTime), [anchorTime])
  // 8 days in a single horizontal ribbon: anchor → anchor+7
  const days = useMemo(() => Array.from({ length: 8 }, (_, i) => addDays(anchor, i)), [anchor])

  const { data: allEvents } = useRollingEvents(anchor)
  const household = householdData ?? []

  const activeEventId = aiDrawerOpen && sidecarTab === 'event' ? selectedSidecarEventId : null
  const [editEventId,     setEditEventId]     = useState<string | null>(null)
  const [deleteIntentEventId, setDeleteIntentEventId] = useState<string | null>(null)
  const [contextMenu, setContextMenu] = useState<{ event: EventWithDetails; x: number; y: number } | null>(null)
  const [inlineCreateDay, setInlineCreateDay] = useState<Date | null>(null)

  const ribbonRef = useRef<HTMLDivElement>(null)
  const columnScrollRefs = useRef<(HTMLDivElement | null)[]>([])

  // Reset ribbon & column vertical scrolls back to Today/Anchor (manual user action only)
  const resetToToday = useCallback(() => {
    if (ribbonRef.current) {
      ribbonRef.current.scrollTo({ left: 0, behavior: 'smooth' })
    }
    columnScrollRefs.current.forEach(colEl => {
      colEl?.scrollTo({ top: 0, behavior: 'smooth' })
    })
  }, [])

  const quickCreateGesture = useCalendarQuickCreateGesture<Date>({
    resolveStart: (day) => {
      const start = new Date(day)
      start.setHours(9, 0, 0, 0)
      return start
    },
    onCreate: (start) => setInlineCreateDay(start),
  })

  const events = (allEvents ?? []).filter(e =>
    isReminder(e) ||
    visibleMembers.length === 0 ||
    e.members.length === 0 ||
    e.members.some(m => visibleMembers.includes(m.family_member?.id ?? '')) ||
    (Boolean(e.source_member_id) && visibleMembers.includes(e.source_member_id!))
  )

  const editEvent = editEventId ? (events.find(e => e.id === editEventId) ?? null) : null

  const { completeReminder } = useReminderNeedsYouActions()

  const deleteEvent = useCallback((ev: EventWithDetails) => {
    setDeleteIntentEventId(ev.id)
    setEditEventId(ev.id)
  }, [])

  return (
    <div className="relative h-full w-full overflow-hidden flex flex-col select-none">
      {/* ── Single-Row 8-Day Horizontal Ribbon with Crisp Outer Padding ── */}
      <div
        ref={ribbonRef}
        className="flex-1 overflow-x-auto overflow-y-hidden overscroll-x-contain touch-pan-x scrollbar-none"
      >
        <div className="flex flex-row gap-4 px-6 py-2 w-max min-w-full h-full items-stretch">
          {days.map((day, idx) => {
            const dayEvents = events
              .filter(e => eventOverlapsDay(e, day))
              .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())

            const dayAllDay = dayEvents
              .filter(e => e.all_day || isAllDayReminder(e))
              .sort((a, b) => {
                const aIsReminder = isReminder(a)
                const bIsReminder = isReminder(b)
                if (!aIsReminder && bIsReminder) return -1 // All-Day Events FIRST
                if (aIsReminder && !bIsReminder) return 1  // All-Day Reminders SECOND
                return a.title.localeCompare(b.title)
              })
            const dayTimed  = dayEvents.filter(isTimedReminder)
            const dayNormal = dayEvents.filter(e => !isReminder(e) && !e.all_day)
            const today_ = isToday(day)
            const isCreatingHere = inlineCreateDay && isSameDay(inlineCreateDay, day)

            return (
              <div
                key={format(day, 'yyyy-MM-dd')}
                className="group/col flex flex-col flex-shrink-0 w-[20rem] sm:w-[22rem] md:w-[23rem] lg:w-[24rem] xl:w-[25rem] h-full touch-pan-y"
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
                  className="flex-1 overflow-y-auto overscroll-y-contain space-y-2 pr-0.5 pb-36 md:pb-8 scrollbar-none"
                >
                  {/* Inline Folio Card when creating on this day */}
                  <AnimatePresence>
                    {isCreatingHere && (
                      <div className="pb-2">
                        <PalmBeachFolioCard
                          contextDate={day}
                          initialStart={inlineCreateDay ?? day}
                          mode="inline"
                          onClose={() => setInlineCreateDay(null)}
                        />
                      </div>
                    )}
                  </AnimatePresence>

                  {/* All-day reminders & all-day events */}
                  {dayAllDay.map(r => (
                    isReminder(r) ? (
                      <div key={r.id} data-calendar-event>
                        <CompactReminderCard
                          event={r}
                          now={new Date()}
                          isHighlighted={activeEventId === r.id}
                          onClick={() => openEventInSidecar(r.id)}
                          onDoubleClick={() => setEditEventId(r.id)}
                          onLongPress={(ev, x, y) => setContextMenu({ event: ev, x, y })}
                        />
                      </div>
                    ) : (
                      <div key={r.id} data-calendar-event>
                        <CompactAllDayCard
                          event={r}
                          household={household}
                          day={day}
                          isHighlighted={activeEventId === r.id}
                          onClick={() => openEventInSidecar(r.id)}
                          onDoubleClick={() => setEditEventId(r.id)}
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
                            isHighlighted={activeEventId === event.id}
                            onClick={() => openEventInSidecar(event.id)}
                            onDoubleClick={() => setEditEventId(event.id)}
                            onLongPress={(ev, x, y) => setContextMenu({ event: ev, x, y })}
                          />
                        </motion.div>
                      ) : (
                        <EventCard
                          key={event.id}
                          event={event}
                          household={household}
                          now={new Date()}
                          isHighlighted={activeEventId === event.id}
                          onClick={() => openEventInSidecar(event.id)}
                          onDoubleClick={() => setEditEventId(event.id)}
                          onLongPress={(ev, x, y) => setContextMenu({ event: ev, x, y })}
                        />
                      ))
                    }
                  </AnimatePresence>

                  {dayEvents.length === 0 && !isCreatingHere && (
                    <p className="text-caption text-casa-muted/50 text-center pt-2">—</p>
                  )}

                    {/* Desktop Hover / Kiosk Touch Add Plinth Target */}
                    {!isCreatingHere && (
                      <div className="pt-2 px-0.5" data-quick-create-trigger>
                        <Button
                          type="button"
                          variant="secondary"
                          fullWidth
                          onClick={(e) => {
                            e.stopPropagation()
                            const start = new Date(day)
                            start.setHours(9, 0, 0, 0)
                            setInlineCreateDay(start)
                          }}
                          leadingIcon={<Plus size={14} className="text-casa-gold" />}
                          className="min-h-[46px] sm:min-h-[48px] py-2.5 px-3 rounded-xl border border-dashed border-casa-border hover:border-casa-gold/80 bg-casa-surface/40 hover:bg-casa-gold/10 text-casa-muted hover:text-casa-navy font-bold text-caption shadow-2xs"
                        >
                          Add to {format(day, 'EEE')}
                        </Button>
                      </div>
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
      <QuickCreateSheet open={false} onClose={() => {}} />
    </div>
  )
}

/* ── Compact Reminder Card (Path 2 Proportional Pillar System) ─────── */

interface CompactReminderCardProps {
  event: EventWithDetails
  now?: Date
  isHighlighted?: boolean
  onClick: () => void
  onDoubleClick?: () => void
  onLongPress?: (event: EventWithDetails, x: number, y: number) => void
}

function CompactReminderCard({ event, now = new Date(), isHighlighted = false, onClick, onDoubleClick, onLongPress }: CompactReminderCardProps) {
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
          'border-l-4 border-l-amber-400',
          isHighlighted ? 'border-2 border-casa-gold shadow-md opacity-100 font-bold' : 'opacity-45'
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

  if (!isTimed) {
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
          'relative w-full rounded-xl border bg-amber-50/30 shadow-2xs cursor-pointer touch-pan-y overflow-hidden transition-all duration-200 px-3 py-2.5 flex items-center justify-between gap-2.5 min-h-[44px]',
          isHighlighted ? 'border-2 border-amber-400 shadow-md font-bold' : 'border-amber-200/70 hover:shadow-card-hover hover:border-amber-300',
        )}
        data-calendar-event
        data-sidecar-loadable="true"
        data-event-id={event.id}
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <span className="shrink-0 px-2 py-0.5 rounded-md bg-amber-100/90 text-amber-900 border border-amber-300/80 text-3xs font-extrabold tracking-wider uppercase flex items-center gap-1 leading-none">
            <Bell size={10} className="text-amber-800 shrink-0" />
            <span>Reminder</span>
          </span>
          <span className="text-body-sm font-semibold text-casa-navy truncate">
            {cleanTitle}
          </span>
        </div>
        {members.length > 0 && (
          <MemberJewelStack members={members} max={2} size="sm" />
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
        'relative w-full rounded-widget border bg-amber-50/40 shadow-card cursor-pointer touch-pan-y overflow-hidden',
        'hover:shadow-card-hover hover:border-amber-400/80 transition-all duration-200 min-h-control',
        'grid grid-cols-[5.75rem_1fr]',
        isHighlighted ? 'border-2 border-casa-gold shadow-md' : 'border-amber-300/60',
        past && !isHighlighted && 'opacity-45'
      )}
      data-calendar-event
      data-sidecar-loadable="true"
      data-event-id={event.id}
    >
      {/* Straight Amber Left Pillar */}
      <div className="p-2.5 bg-amber-100/70 text-amber-950 flex flex-col justify-between items-start border-r border-amber-200/60 border-l-4 border-l-amber-400 min-w-0 overflow-hidden">
        <div className="w-full min-w-0">
          <span className="font-mono text-body font-bold text-amber-950 tabular-nums leading-none block">
            {format(start, 'h:mm')}
          </span>
          <span className="font-mono text-caption uppercase text-amber-900/70 font-semibold leading-none mt-1 block">
            {format(start, 'a')}
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
            <MemberJewelStack members={members} max={2} size="sm" />
          </div>
        )}
      </div>
    </div>
  )
}

/* ── Compact All-Day Event Card ─────────────────────────────────────── */

interface CompactAllDayCardProps {
  event: EventWithDetails
  household: FamilyMember[]
  day?: Date
  isHighlighted?: boolean
  onClick: () => void
  onDoubleClick: () => void
  onLongPress: (event: EventWithDetails, x: number, y: number) => void
}

function CompactAllDayCard({
  event,
  household,
  isHighlighted = false,
  onClick,
  onDoubleClick,
  onLongPress,
}: CompactAllDayCardProps) {
  const cleanTitle = cleanEventTitle(event.title)
  const isBirthday = isBirthdayEvent(event)
  const isMultiDay = isEventMultiDay(event)

  const responsibility = useMemo(
    () => deriveCalendarCardResponsibility(event, household, new Date()),
    [event, household],
  )

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
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      whileTap={{ scale: 0.98, opacity: 0.8 }}
      transition={{ duration: 0.15 }}
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
        'relative w-full rounded-xl border bg-white/95 shadow-2xs cursor-pointer touch-pan-y overflow-hidden transition-all duration-200 px-3 py-2.5 flex items-center justify-between gap-2.5 min-h-[44px]',
        isHighlighted
          ? 'border-2 border-casa-gold shadow-md font-bold'
          : 'border-casa-gold/30 hover:shadow-card-hover hover:border-casa-gold',
      )}
      data-calendar-event
      data-sidecar-loadable="true"
      data-event-id={event.id}
    >
      {/* Left Content: [All Day] tag + Clean Title + optional location */}
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <span className="shrink-0 px-2 py-0.5 rounded-md bg-amber-50/90 text-amber-900 border border-amber-200/80 text-3xs font-extrabold tracking-wider uppercase leading-none">
          {isMultiDay ? 'Multi-Day' : 'All Day'}
        </span>
        <span className="text-body-sm font-semibold text-casa-navy truncate">
          {isBirthday && <span className="mr-1" aria-hidden="true">🎂</span>}
          {cleanTitle}
        </span>
        {event.location_name && (
          <span className="text-caption text-casa-muted truncate shrink-0 hidden sm:inline">
            • {event.location_name}
          </span>
        )}
      </div>

      {/* Right: Driver/Supervisor Pill (if any) + Attendee Manifest Stack + Sync dot */}
      <div className="flex items-center gap-1.5 shrink-0 ml-auto">
        {responsibility.responsible && (
          <MemberJewelPill
            member={responsibility.responsible}
            role={responsibility.roleBadge === 'drive' ? 'driver' : 'supervise'}
            size="sm"
          />
        )}

        {responsibility.attendees.length > 0 && (
          <PersonAvatarStack
            people={responsibility.attendees.map((m) => ({
              id: m.id,
              name: m.family_member?.name ?? '?',
              color: m.family_member?.color_hex ?? SHARED_COLOR,
            }))}
            max={2}
            size="sm"
            showNames
          />
        )}

        <EventSyncStatusDot event={event} size="xs" />
      </div>
    </motion.div>
  )
}

/* ── Compact Event Card (Path 2 Proportional Pillar System) ─────────── */

interface EventCardProps {
  event: EventWithDetails
  household: FamilyMember[]
  now?: Date
  isHighlighted?: boolean
  onClick: () => void
  onDoubleClick: () => void
  onLongPress: (event: EventWithDetails, x: number, y: number) => void
}

function EventCard({ event, household, now = new Date(), isHighlighted = false, onClick, onDoubleClick, onLongPress }: EventCardProps) {
  const color = getPrimaryColor(event)
  const enr = event.enrichment
  const urgentAction = event.actions?.find(a => a.is_urgent && !a.completed)
  const start = getEventStartDate(event)
  const end = getEventEndDate(event)
  const past = isBefore(end, now)
  const isAllDayEvent = Boolean(event.all_day)
  const happening = !isAllDayEvent && isBefore(start, now) && isAfter(end, now)
  const isHeroState = happening || Boolean(urgentAction)
  const isMultiDay = isEventMultiDay(event)
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

  const hasNoRide = Boolean(event.plan_override?.transportation_plan && Array.isArray(event.plan_override.transportation_plan.legs) && event.plan_override.transportation_plan.legs.length === 0)
  const departureTime = useMemo(() => {
    if (event.all_day || hasNoRide) return null
    if (enr?.departure_time) return new Date(enr.departure_time)
    if (enr?.drive_time_mins && event.start_time && !isHosted) {
      return new Date(new Date(event.start_time).getTime() - (enr.drive_time_mins + 5) * 60_000)
    }
    return null
  }, [enr?.departure_time, enr?.drive_time_mins, event.start_time, isHosted, event.all_day, hasNoRide])
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
        animate={{ opacity: isHighlighted ? 1 : 0.45, y: 0 }}
        exit={{ opacity: 0, y: -4 }}
        whileTap={{ scale: 0.97, opacity: 0.75 }}
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
          'relative rounded-xl border bg-casa-surface/90 shadow-xs cursor-pointer touch-pan-y overflow-hidden transition-all duration-200 min-h-[38px] px-2.5 py-1.5 flex items-center justify-between gap-2',
          'border-l-4',
          isHighlighted ? 'border-2 border-casa-gold shadow-md opacity-100 font-bold' : 'border-casa-border/60 hover:opacity-85 hover:border-casa-gold/60 opacity-45'
        )}
        style={{ borderLeftColor: color }}
        data-calendar-event
        data-sidecar-loadable="true"
        data-event-id={event.id}
      >
        {/* Left: Time + Divider + Title */}
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <span className="font-mono text-caption font-bold text-casa-navy tabular-nums shrink-0">
            {isAllDayEvent
              ? (isMultiDay ? `${format(start, 'MMM d')} – ${format(end, 'MMM d')}` : 'ALL DAY')
              : format(start, 'h:mm a')}
          </span>
          <span className="text-casa-divider shrink-0">•</span>
          <EventProvenanceBadge sourceType={event.source_type} isHeroState={isHeroState} />
          <span className="text-caption sm:text-body-sm font-semibold text-casa-navy truncate">
            {isBirthday && <span className="mr-1" aria-hidden="true">🎂</span>}
            {cleanTitle}
          </span>
        </div>

        {/* Right: Driver/Supervisor Pill (if any) + Attendee Manifest Stack + Sync dot */}
        <div className="flex items-center gap-1.5 shrink-0 ml-auto">
          {responsibility.responsible && (
            <MemberJewelPill
              member={responsibility.responsible}
              role={responsibility.roleBadge === 'drive' ? 'driver' : 'supervise'}
              size="sm"
            />
          )}

          {responsibility.attendees.length > 0 && (
            <PersonAvatarStack
              people={responsibility.attendees.map((m) => ({
                id: m.id,
                name: m.family_member?.name ?? '?',
                color: m.family_member?.color_hex ?? SHARED_COLOR,
              }))}
              max={2}
              size="sm"
              showNames
            />
          )}
          <EventSyncStatusDot event={event} size="xs" />
        </div>
      </motion.div>
    )
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: past && !isHighlighted ? 0.45 : 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      whileTap={{ scale: 0.97, opacity: 0.75 }}
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
        isHighlighted
          ? 'border-2 border-casa-gold shadow-md'
          : isHeroState
            ? 'bg-casa-navy text-white border-casa-navy shadow-card-hover'
            : isBirthday
              ? 'bg-gradient-to-br from-casa-accent-subtle via-casa-surface to-casa-bg border-casa-border/80 hover:shadow-card-hover hover:border-casa-gold/50'
              : 'bg-casa-surface text-casa-navy border-casa-border/70 hover:shadow-card-hover hover:border-casa-gold/50'
      )}
      data-calendar-event
      data-sidecar-loadable="true"
      data-event-id={event.id}
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
              ? (isMultiDay ? `${format(start, 'MMM d')} – ${format(end, 'MMM d')}` : 'ALL DAY')
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

        {/* Pillar bottom indicators: Weather / Alert (Pure SVG) */}
        <div className="w-full pt-1 flex items-center justify-between min-w-0">
          {event.location_name ? (
            <WeatherIcon condition={event.enrichment?.weather_at_event} size={12} />
          ) : (
            <span />
          )}
          {urgentAction && <AlertTriangle size={11} className="text-amber-400 shrink-0 ml-auto" />}
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
          {/* Title, Provenance & Sync Status */}
          <div className="flex items-center justify-between gap-1.5 flex-wrap">
            <div className="flex items-center gap-1.5 flex-wrap min-w-0 flex-1">
              <EventProvenanceBadge sourceType={event.source_type} isHeroState={isHeroState} />
              <p
                className={cn(
                  'stacked-event-title font-bold text-body leading-snug line-clamp-2',
                  isHeroState ? 'text-white' : 'text-casa-navy'
                )}
              >
                {cleanTitle}
              </p>
            </div>
            <EventSyncStatusDot event={event} size="xs" className="shrink-0" />
          </div>

          {/* Location / Mode / Leave by */}
          {(event.location_name || isHosted) && (
            <div
              className={cn(
                'flex items-center gap-1.5 text-caption min-w-0 flex-wrap',
                isHeroState ? 'text-white/70' : 'text-casa-muted'
              )}
            >
              {isHosted ? (
                <span className="text-caption font-semibold uppercase tracking-wide">At home</span>
              ) : (
                <>
                  <span className="flex items-center gap-1 truncate text-caption">
                    <MapPin size={10} className="shrink-0 text-casa-gold" />
                    <span className="truncate">{event.location_name}</span>
                  </span>
                  {departureTime && !happening && (
                    <span className={cn(
                      'inline-flex items-center gap-1 font-semibold text-caption shrink-0',
                      isHeroState ? 'text-casa-gold' : 'text-casa-gold'
                    )}>
                      <span className="opacity-40">•</span>
                      <Navigation size={10} className="shrink-0" />
                      <span>Leave by {format(departureTime, 'h:mm a')}</span>
                    </span>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {/* Footer: Driver / Supervisor Capsule + Attendee Manifest Stack */}
        {(responsibility.responsible || responsibility.attendees.length > 0) && (
          <div
            className={cn(
              'pt-1.5 border-t flex items-center justify-between gap-1.5 min-w-0',
              isHeroState ? 'border-white/15' : 'border-casa-divider'
            )}
          >
            {responsibility.responsible ? (
              <MemberJewelPill
                member={responsibility.responsible}
                role={responsibility.roleBadge === 'drive' ? 'driver' : 'supervise'}
                size="sm"
                className={isHeroState ? '!bg-white/10 !border-white/20 !text-white [&_span]:!text-white' : ''}
              />
            ) : (
              <span />
            )}

            {responsibility.attendees.length > 0 && (
              <div className="ml-auto shrink-0">
                <PersonAvatarStack
                  people={responsibility.attendees.map((m) => ({
                    id: m.id,
                    name: m.family_member?.name ?? '?',
                    color: m.family_member?.color_hex ?? SHARED_COLOR,
                  }))}
                  max={2}
                  size="sm"
                  showNames
                  className={isHeroState ? '[&_div]:!bg-white/10 [&_div]:!border-white/20 [&_span]:!text-white' : ''}
                />
              </div>
            )}
          </div>
        )}
      </div>
    </motion.div>
  )
}
