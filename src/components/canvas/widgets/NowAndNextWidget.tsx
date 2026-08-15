import { useMemo, useState } from 'react'
import { format, isBefore } from 'date-fns'
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
import { cn } from '../../../utils/cn'

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
  const { data: hookFamily } = useFamilyMembers()
  const effectiveFamily = familyMembers ?? hookFamily ?? []
  const { completeReminder, snoozeReminderByDuration, moveReminderToNeedsYou } =
    useReminderNeedsYouActions()

  const [activeDayTab, setActiveDayTab] = useState<'today' | 'tomorrow'>('today')
  const [showPastEvents, setShowPastEvents] = useState(false)

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

  return (
    <div className="w-full h-full flex flex-col bg-transparent overflow-hidden min-h-0">
      {/* ── Widget Header: Day Switcher & Quick Add Strip ── */}
      <div className="flex items-center justify-between gap-3 pb-3 mb-1 shrink-0 px-0.5">
        {/* Day Switcher Capsule */}
        <div className="inline-flex p-1 rounded-full bg-casa-surface border border-casa-border/80 shadow-xs">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setActiveDayTab('today')}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-full text-body-sm font-bold transition-all min-h-[44px]',
              activeDayTab === 'today'
                ? 'bg-casa-surface-subtle text-casa-navy shadow-2xs'
                : 'text-casa-muted hover:text-casa-navy'
            )}
          >
            <Sun size={15} className={activeDayTab === 'today' ? 'text-casa-navy' : 'text-casa-muted'} />
            <span>Today ({todayEvents.length})</span>
          </Button>

          <Button
            size="sm"
            variant="ghost"
            onClick={() => setActiveDayTab('tomorrow')}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-full text-body-sm font-medium transition-all min-h-[44px]',
              activeDayTab === 'tomorrow'
                ? 'bg-casa-surface-subtle text-casa-navy shadow-2xs font-bold'
                : 'text-casa-muted hover:text-casa-navy'
            )}
          >
            <Moon size={15} className={activeDayTab === 'tomorrow' ? 'text-casa-navy' : 'text-casa-muted'} />
            <span>Tomorrow ({tomorrowEvents.length})</span>
          </Button>
        </div>

        {/* Quick New Event Button */}
        {onQuickCreate && (
          <IconButton
            variant="primary"
            size="sm"
            onClick={onQuickCreate}
            className="w-12 h-12 rounded-2xl bg-casa-gold hover:brightness-105 text-white shadow-xs flex items-center justify-center transition-all shrink-0 active:scale-95 min-h-[48px] min-w-[48px]"
            aria-label="Create a new event"
            title="Create a new event"
            icon={<Plus size={22} strokeWidth={2.5} className="text-white" />}
          />
        )}
      </div>

      {/* ── Scrollable Schedule Stream ── */}
      <div className="flex-1 overflow-y-auto pr-1 space-y-3 min-h-0 touch-pan-y overscroll-contain pb-6">
        {activeDayTab === 'today' ? (
          <>
            {/* Collapsed Past Events Toggle */}
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

            {/* Upcoming / Current Events */}
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
              <div className="flex flex-col items-center justify-center h-40 text-center p-4 bg-casa-bg/50 rounded-2xl border border-casa-border/50">
                <CheckCircle2 size={30} className="text-emerald-500 mb-1.5" />
                <p className="text-body-sm font-bold text-casa-navy">No Remaining Events Today</p>
                <p className="text-caption text-casa-muted">All scheduled activities are wrapped up.</p>
              </div>
            )}
          </>
        ) : (
          /* Tomorrow Preview Stream */
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
              <div className="flex flex-col items-center justify-center h-48 text-center p-4 bg-casa-bg/50 rounded-2xl border border-casa-border/50">
                <Calendar size={30} className="text-casa-gold mb-1.5" />
                <p className="text-body-sm font-bold text-casa-navy">Tomorrow is Wide Open</p>
                <p className="text-caption text-casa-muted">No appointments or sports on the calendar yet.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
