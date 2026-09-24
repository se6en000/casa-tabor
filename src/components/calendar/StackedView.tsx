import { useState, useCallback, useRef, useMemo } from 'react'
import { format, addDays, isToday, isSameDay, startOfDay, isBefore } from 'date-fns'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Bell,
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
import { eventOverlapsDay, isEventMultiDay, getEventEndDate, getEventStartDate } from '../../utils/eventTime'
import { PersonAvatarStack, CalendarPill, Button } from '../ui'
import { MemberJewelPill, MemberJewelStack } from '../ui/MemberJewelPill'
import { EventSyncStatusDot } from './EventSyncStatusDot'
import type { FamilyMember } from '../../types'
import { deriveCalendarCardResponsibility } from '../../lib/calendarResponsibility'
import { useCalendarQuickCreateGesture } from '../../hooks/useCalendarQuickCreateGesture'
import QuickCreateSheet from '../shared/QuickCreateSheet'
import PalmBeachFolioCard from './PalmBeachFolioCard'
import { EventCardSkeletonStack, CompactCardSkeleton } from './EventCardSkeleton'
import { useReminderNeedsYouActions } from '../../hooks/useReminderNeedsYouActions'
import EventCard, { SHARED_COLOR } from './EventCard'

export default function StackedView() {
  const { visibleMembers, selectedDate, setActiveView } = useCalendarStore()
  const { selectedSidecarEventId, aiDrawerOpen, sidecarTab, openEventInSidecar } = useAppStore()
  const { data: householdData } = useFamilyMembers()
  // Anchor the 8-day window to the shared calendar selectedDate
  const anchorTime = startOfDay(selectedDate).getTime()
  const anchor = useMemo(() => new Date(anchorTime), [anchorTime])
  // 8 days in a single horizontal ribbon: anchor → anchor+7
  const days = useMemo(() => Array.from({ length: 8 }, (_, i) => addDays(anchor, i)), [anchor])

  const { data: allEvents, isLoading: eventsLoading } = useRollingEvents(anchor)
  const household = householdData ?? []

  const activeEventId = aiDrawerOpen && sidecarTab === 'event' ? selectedSidecarEventId : null
  const [editEventId,     setEditEventId]     = useState<string | null>(null)
  const [deleteIntentEventId, setDeleteIntentEventId] = useState<string | null>(null)
  const [inlineCreateDay, setInlineCreateDay] = useState<Date | null>(null)
  const [quickCreate, setQuickCreate] = useState<{ open: boolean; start?: Date }>({ open: false })

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
  void completeReminder

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
                className="group/col flex flex-col flex-shrink-0 w-[20rem] sm:w-[22rem] md:w-[23rem] lg:w-[24rem] xl:w-[25rem] h-full touch-pan-x touch-pan-y"
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
                  className="flex-1 overflow-y-auto overscroll-y-contain space-y-2 pr-0.5 pb-36 md:pb-8 scrollbar-none touch-pan-x touch-pan-y"
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
                        />
                      ))
                    }
                  </AnimatePresence>

                  {eventsLoading && (!allEvents || allEvents.length === 0) ? (
                    today_ ? <EventCardSkeletonStack count={2} /> : <CompactCardSkeleton />
                  ) : dayEvents.length === 0 && !isCreatingHere ? (
                    <p className="text-caption text-casa-muted/50 text-center pt-2">—</p>
                  ) : null}

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
  isHighlighted?: boolean
  onClick: () => void
}

function CompactReminderCard({ event, now = new Date(), isHighlighted = false, onClick }: CompactReminderCardProps) {
  const start = getEventStartDate(event)
  const end = getEventEndDate(event)
  const past = isBefore(end, now)
  const isTimed = isTimedReminder(event)
  const cleanTitle = cleanEventTitle(event.title)
  const members = event.members ?? []

  if (past) {
    return (
      <div
        onClick={(e) => { e.stopPropagation(); onClick() }}
        onKeyDown={(e) => {
          if (e.key !== 'Enter' && e.key !== ' ') return
          e.preventDefault()
          onClick()
        }}
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
        onKeyDown={(e) => {
          if (e.key !== 'Enter' && e.key !== ' ') return
          e.preventDefault()
          onClick()
        }}
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
      onKeyDown={(e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return
        e.preventDefault()
        onClick()
      }}
      role="button"
      tabIndex={0}
      className={cn(
        'relative w-full rounded-widget border bg-amber-50/40 shadow-card cursor-pointer touch-pan-x touch-pan-y overflow-hidden',
        'hover:shadow-card-hover hover:border-amber-400/80 transition-[box-shadow,border-color,opacity] duration-150 min-h-control',
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
}

function CompactAllDayCard({
  event,
  household,
  isHighlighted = false,
  onClick,
}: CompactAllDayCardProps) {
  const cleanTitle = cleanEventTitle(event.title)
  const isBirthday = isBirthdayEvent(event)
  const isMultiDay = isEventMultiDay(event)

  const responsibility = useMemo(
    () => deriveCalendarCardResponsibility(event, household, new Date()),
    [event, household],
  )

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      whileTap={{ scale: 0.98, opacity: 0.8 }}
      transition={{ duration: 0.15 }}
      onClick={(e) => { e.stopPropagation(); onClick() }}
      onKeyDown={(e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return
        e.preventDefault()
        onClick()
      }}
      role="button"
      tabIndex={0}
      className={cn(
        'relative w-full rounded-xl border bg-white/95 shadow-2xs cursor-pointer touch-pan-x touch-pan-y overflow-hidden transition-[box-shadow,border-color,opacity] duration-150 px-3 py-2.5 flex items-center justify-between gap-2.5 min-h-[44px]',
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

