import { useMemo, useState, useRef } from 'react'
import { addDays, format, isBefore } from 'date-fns'
import {
  Calendar,
  CheckCircle2,
  Clock,
  Sun,
  Moon,
  Plus,
} from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import type { EventWithDetails } from '../../../hooks/useCalendarEvents'
import type { FamilyMember } from '../../../types'
import { useFamilyMembers } from '../../../hooks/useFamilyMembers'
import { useLiveClock } from '../../../hooks/useLiveClock'
import { useReminderNeedsYouActions } from '../../../hooks/useReminderNeedsYouActions'
import { getEventStartDate, getEventEndDate } from '../../../utils/eventTime'
import { DayEventCard } from '../../calendar/DayEventCard'
import { Button, IconButton } from '../../ui'

interface NowAndNextWidgetProps {
  now: Date
  todayEvents: EventWithDetails[]
  tomorrowEvents: EventWithDetails[]
  familyMembers?: FamilyMember[]
  highlightedEventId: string | null
  setHighlightedEventId: (id: string | null) => void
  onOpenEvent: (event: EventWithDetails) => void
  onQuickCreate?: () => void
}

export default function NowAndNextWidget({
  now,
  todayEvents,
  tomorrowEvents,
  familyMembers,
  highlightedEventId,
  setHighlightedEventId,
  onOpenEvent,
  onQuickCreate,
}: NowAndNextWidgetProps) {
  const hookNow = useLiveClock(15_000)
  const effectiveNow = now ?? hookNow
  const tomorrowDate = useMemo(() => addDays(effectiveNow, 1), [effectiveNow])
  const { data: hookFamily } = useFamilyMembers()
  const effectiveFamily = familyMembers ?? hookFamily ?? []
  const { completeReminder, snoozeReminderByDuration, moveReminderToNeedsYou } =
    useReminderNeedsYouActions()

  const [showPastEvents, setShowPastEvents] = useState(false)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const tomorrowRef = useRef<HTMLDivElement>(null)

  // Sort Today Events
  const sortedTodayEvents = useMemo(() => {
    return [...todayEvents].sort((a, b) => {
      const aAllDay = Boolean(a.all_day)
      const bAllDay = Boolean(b.all_day)
      if (aAllDay && !bAllDay) return -1
      if (!aAllDay && bAllDay) return 1
      return getEventStartDate(a).getTime() - getEventStartDate(b).getTime()
    })
  }, [todayEvents])

  // Sort Tomorrow Events
  const sortedTomorrowEvents = useMemo(() => {
    return [...tomorrowEvents].sort((a, b) => {
      const aAllDay = Boolean(a.all_day)
      const bAllDay = Boolean(b.all_day)
      if (aAllDay && !bAllDay) return -1
      if (!aAllDay && bAllDay) return 1
      return getEventStartDate(a).getTime() - getEventStartDate(b).getTime()
    })
  }, [tomorrowEvents])

  // Split Today into Past vs Now & Next
  const { pastEvents, currentAndUpcomingEvents } = useMemo(() => {
    const past: EventWithDetails[] = []
    const upcoming: EventWithDetails[] = []

    sortedTodayEvents.forEach((evt) => {
      if (evt.all_day) {
        upcoming.push(evt)
        return
      }
      const end = getEventEndDate(evt)
      if (isBefore(end, effectiveNow)) {
        past.push(evt)
      } else {
        upcoming.push(evt)
      }
    })

    return { pastEvents: past, currentAndUpcomingEvents: upcoming }
  }, [sortedTodayEvents, effectiveNow])

  const totalUpcomingCount = currentAndUpcomingEvents.length + sortedTomorrowEvents.length

  const scrollToTop = () => {
    scrollContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const scrollToTomorrow = () => {
    if (tomorrowRef.current) {
      tomorrowRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  return (
    <div className="w-full h-full flex flex-col bg-transparent overflow-hidden min-h-0">
      {/* ── Widget Header: Unified Rolling Horizon & Jump Anchors Strip ── */}
      <div className="flex items-center justify-between gap-3 pb-3 mb-1 shrink-0 px-0.5">
        {/* Left: Horizon Title & Jump Anchors */}
        <div className="flex items-center gap-2">
          {/* Quick-Jump Anchors Capsule */}
          <div className="inline-flex p-1 rounded-full bg-casa-surface border border-casa-border/80 shadow-xs items-center gap-1">
            <Button
              size="sm"
              variant="ghost"
              onClick={scrollToTop}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-caption font-bold text-casa-navy hover:bg-casa-surface-subtle transition-all min-h-[38px]"
              title="Jump to today's schedule"
            >
              <Sun size={14} className="text-casa-gold" />
              <span>Today ({currentAndUpcomingEvents.length})</span>
            </Button>

            <Button
              size="sm"
              variant="ghost"
              onClick={scrollToTomorrow}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-caption font-semibold text-casa-muted hover:text-casa-navy hover:bg-casa-surface-subtle transition-all min-h-[38px]"
              title="Jump to tomorrow's schedule"
            >
              <Moon size={14} className="text-casa-navy" />
              <span>Tomorrow ({sortedTomorrowEvents.length})</span>
            </Button>
          </div>

          <span className="hidden sm:inline-flex px-2 py-0.5 rounded-full bg-casa-surface border border-casa-border/60 text-caption font-mono font-bold text-casa-muted">
            {totalUpcomingCount} next 24h
          </span>
        </div>

        {/* Quick New Event Button */}
        {onQuickCreate && (
          <IconButton
            variant="primary"
            size="sm"
            onClick={onQuickCreate}
            className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-casa-gold hover:brightness-105 text-white shadow-xs flex items-center justify-center transition-all shrink-0 active:scale-95 min-h-[44px] min-w-[44px] sm:min-h-[48px] sm:min-w-[48px]"
            aria-label="Create a new event"
            title="Create a new event"
            icon={<Plus size={22} strokeWidth={2.5} className="text-white" />}
          />
        )}
      </div>

      {/* ── Continuous Scrollable Schedule Stream ── */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto pr-1 space-y-3 min-h-0 touch-pan-y overscroll-contain pb-6 scroll-smooth"
      >
        {/* Collapsed Past Events Toggle (Earlier Today) */}
        {pastEvents.length > 0 && (
          <div className="space-y-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setShowPastEvents((p) => !p)}
              className="w-full flex items-center justify-between p-2.5 rounded-xl bg-casa-bg/80 hover:bg-casa-bg border border-casa-border/50 text-caption font-semibold text-casa-muted transition-colors min-h-[44px]"
            >
              <span className="flex items-center gap-1.5">
                <Clock size={13} />
                <span>
                  {pastEvents.length} earlier event{pastEvents.length === 1 ? '' : 's'} concluded
                </span>
              </span>
              <span className="text-2xs uppercase font-bold text-casa-navy">
                {showPastEvents ? 'Hide' : 'Show'}
              </span>
            </Button>

            <AnimatePresence>
              {showPastEvents && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="space-y-2 opacity-75"
                >
                  {pastEvents.map((evt, idx) => (
                    <DayEventCard
                      key={evt.id}
                      event={evt}
                      now={effectiveNow}
                      index={idx}
                      household={effectiveFamily}
                      isHighlighted={highlightedEventId === evt.id}
                      onMouseEnter={() => setHighlightedEventId(evt.id)}
                      onMouseLeave={() => setHighlightedEventId(null)}
                      onOpen={() => onOpenEvent(evt)}
                      onComplete={completeReminder}
                      onSnooze={(targetEvent, duration) => {
                        void snoozeReminderByDuration(targetEvent, duration)
                      }}
                      onSendToNeedsYou={(targetEvent) => {
                        void moveReminderToNeedsYou(targetEvent)
                      }}
                    />
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* Glowing NOW Indicator */}
        <div className="flex items-center gap-3 py-2 px-1">
          <div className="px-4 py-1 rounded-full bg-amber-500 text-white text-caption font-mono font-bold tracking-wider shadow-xs uppercase inline-flex items-center justify-center shrink-0">
            <span>NOW  ·  {format(effectiveNow, 'h:mm a')}</span>
          </div>
          <div className="flex-1 h-[1.5px] bg-amber-500/60" />
        </div>

        {/* ── Today's Upcoming / Current Events ── */}
        {currentAndUpcomingEvents.length > 0 ? (
          <AnimatePresence initial={false}>
            <ol className="space-y-2.5">
              {currentAndUpcomingEvents.map((evt, idx) => (
                <DayEventCard
                  key={evt.id}
                  event={evt}
                  now={effectiveNow}
                  index={idx}
                  household={effectiveFamily}
                  isHighlighted={highlightedEventId === evt.id}
                  onMouseEnter={() => setHighlightedEventId(evt.id)}
                  onMouseLeave={() => setHighlightedEventId(null)}
                  onOpen={() => onOpenEvent(evt)}
                  onComplete={completeReminder}
                  onSnooze={(targetEvent, duration) => {
                    void snoozeReminderByDuration(targetEvent, duration)
                  }}
                  onSendToNeedsYou={(targetEvent) => {
                    void moveReminderToNeedsYou(targetEvent)
                  }}
                />
              ))}
            </ol>
          </AnimatePresence>
        ) : (
          <div className="flex items-center gap-2.5 py-3 px-4 rounded-xl bg-casa-surface/70 border border-casa-border/50 text-caption font-medium text-casa-muted">
            <CheckCircle2 size={16} className="text-emerald-500 shrink-0" />
            <span>No remaining activities for today</span>
          </div>
        )}

        {/* ── Tomorrow Date Break Divider ── */}
        <div
          ref={tomorrowRef}
          className="flex items-center gap-3 pt-4 pb-1 shrink-0"
        >
          <div className="flex-1 h-[1px] bg-casa-border/80" />
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-casa-surface border border-casa-border/80 shadow-2xs">
            <Moon size={13} className="text-casa-navy" />
            <span className="text-caption font-bold text-casa-navy uppercase tracking-wider">
              Tomorrow · {format(tomorrowDate, 'EEE, MMM d')}
            </span>
            <span className="px-1.5 py-0.2 rounded-full bg-casa-bg border border-casa-border/60 text-3xs font-mono font-bold text-casa-navy">
              {sortedTomorrowEvents.length}
            </span>
          </div>
          <div className="flex-1 h-[1px] bg-casa-border/80" />
        </div>

        {/* ── Tomorrow Preview Stream ── */}
        <div className="space-y-2.5">
          {sortedTomorrowEvents.length > 0 ? (
            <AnimatePresence initial={false}>
              <ol className="space-y-2.5">
                {sortedTomorrowEvents.map((evt, idx) => (
                  <DayEventCard
                    key={evt.id}
                    event={evt}
                    now={effectiveNow}
                    index={idx}
                    household={effectiveFamily}
                    isHighlighted={highlightedEventId === evt.id}
                    onMouseEnter={() => setHighlightedEventId(evt.id)}
                    onMouseLeave={() => setHighlightedEventId(null)}
                    onOpen={() => onOpenEvent(evt)}
                    onComplete={completeReminder}
                    onSnooze={(targetEvent, duration) => {
                      void snoozeReminderByDuration(targetEvent, duration)
                    }}
                    onSendToNeedsYou={(targetEvent) => {
                      void moveReminderToNeedsYou(targetEvent)
                    }}
                  />
                ))}
              </ol>
            </AnimatePresence>
          ) : (
            <div className="flex flex-col items-center justify-center py-6 px-4 text-center bg-casa-surface/40 rounded-2xl border border-dashed border-casa-border/60">
              <Calendar size={24} className="text-casa-gold mb-1" />
              <p className="text-body-sm font-bold text-casa-navy">Tomorrow is Wide Open</p>
              <p className="text-caption text-casa-muted">No appointments or activities scheduled yet.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
