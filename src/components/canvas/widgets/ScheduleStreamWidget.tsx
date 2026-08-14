import { useMemo } from 'react'
import { Calendar, CheckCircle2 } from 'lucide-react'
import { AnimatePresence } from 'framer-motion'
import type { EventWithDetails } from '../../../hooks/useCalendarEvents'
import type { FamilyMember } from '../../../types'
import { useFamilyMembers } from '../../../hooks/useFamilyMembers'
import { useLiveClock } from '../../../hooks/useLiveClock'
import { useReminderNeedsYouActions } from '../../../hooks/useReminderNeedsYouActions'
import { getEventStartDate } from '../../../utils/eventTime'
import { DayEventCard } from '../../calendar/DayEventCard'

interface ScheduleStreamWidgetProps {
  todayEvents: EventWithDetails[]
  highlightedEventId: string | null
  setHighlightedEventId: (id: string | null) => void
  onOpenEvent: (event: EventWithDetails) => void
  now?: Date
  familyMembers?: FamilyMember[]
}

export default function ScheduleStreamWidget({
  todayEvents,
  highlightedEventId,
  setHighlightedEventId,
  onOpenEvent,
  now,
  familyMembers,
}: ScheduleStreamWidgetProps) {
  const hookNow = useLiveClock(15_000)
  const effectiveNow = now ?? hookNow
  const { data: hookFamily } = useFamilyMembers()
  const effectiveFamily = familyMembers ?? hookFamily ?? []
  const { completeReminder, snoozeReminderByDuration, moveReminderToNeedsYou } = useReminderNeedsYouActions()

  const sortedEvents = useMemo(() => {
    return [...todayEvents].sort((a, b) => {
      const aAllDay = Boolean(a.all_day)
      const bAllDay = Boolean(b.all_day)
      if (aAllDay && !bAllDay) return -1
      if (!aAllDay && bAllDay) return 1
      return getEventStartDate(a).getTime() - getEventStartDate(b).getTime()
    })
  }, [todayEvents])

  return (
    <div className="lg:col-span-4 flex flex-col rounded-3xl bg-casa-surface border border-casa-border/60 shadow-sm p-5 overflow-hidden">
      <div className="flex items-center justify-between pb-3 mb-3 border-b border-casa-border/40 shrink-0">
        <div className="flex items-center gap-2">
          <Calendar size={16} className="text-casa-navy" />
          <h2 className="font-display text-body-lg font-bold text-casa-navy">
            Today's Schedule
          </h2>
        </div>
        <span className="text-caption font-semibold px-2.5 py-0.5 rounded-full bg-casa-bg text-casa-navy">
          {todayEvents.length} Events
        </span>
      </div>

      <div className="flex-1 overflow-y-auto pr-1">
        {sortedEvents.length > 0 ? (
          <AnimatePresence initial={false}>
            <ol className="space-y-3">
              {sortedEvents.map((evt, idx) => (
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
                    void snoozeReminderByDuration(targetEvent, duration).catch((error) => {
                      console.error('ScheduleStreamWidget: failed to snooze reminder', error)
                    })
                  }}
                  onSendToNeedsYou={(targetEvent) => {
                    void moveReminderToNeedsYou(targetEvent).catch((error) => {
                      console.error('ScheduleStreamWidget: failed to move reminder to Needs you', error)
                    })
                  }}
                />
              ))}
            </ol>
          </AnimatePresence>
        ) : (
          <div className="flex flex-col items-center justify-center h-48 text-center">
            <CheckCircle2 size={32} className="text-emerald-500 mb-2" />
            <p className="text-body-sm font-semibold text-casa-navy">No Events Today</p>
            <p className="text-caption text-casa-muted mt-0.5">Your schedule is wide open.</p>
          </div>
        )}
      </div>
    </div>
  )
}
