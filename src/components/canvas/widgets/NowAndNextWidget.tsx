import { useMemo, useState } from 'react'
import { format, isBefore, addDays } from 'date-fns'
import {
  Calendar,
  Sparkles,
  CloudSun,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Sun,
  Moon,
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
  householdNarrative: string
  copilotTip: string
  weather?: {
    temp: number
    condition: string
    precipProbability?: number
    city?: string
  } | null
  familyMembers?: FamilyMember[]
  highlightedEventId: string | null
  setHighlightedEventId: (id: string | null) => void
  onOpenEvent: (event: EventWithDetails) => void
}

export default function NowAndNextWidget({
  now,
  todayEvents,
  tomorrowEvents,
  householdNarrative,
  copilotTip,
  weather,
  familyMembers,
  highlightedEventId,
  setHighlightedEventId,
  onOpenEvent,
}: NowAndNextWidgetProps) {
  const hookNow = useLiveClock(15_000)
  const effectiveNow = now ?? hookNow
  const { data: hookFamily } = useFamilyMembers()
  const effectiveFamily = familyMembers ?? hookFamily ?? []
  const { completeReminder, snoozeReminderByDuration, moveReminderToNeedsYou } =
    useReminderNeedsYouActions()

  const [activeDayTab, setActiveDayTab] = useState<'today' | 'tomorrow'>('today')
  const [showPastEvents, setShowPastEvents] = useState(false)
  const [isBriefingExpanded, setIsBriefingExpanded] = useState(true)

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

  const tomorrowDate = useMemo(() => addDays(effectiveNow, 1), [effectiveNow])

  return (
    <div className="lg:col-span-5 xl:col-span-5 flex flex-col rounded-3xl bg-casa-surface border border-casa-border/70 shadow-sm p-4 sm:p-5 overflow-hidden min-h-0">
      {/* ── Header: Tab Switcher & Ambient Info ── */}
      <div className="pb-3 mb-3 border-b border-casa-border/40 shrink-0 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          {/* Segmented Day Switcher */}
          <div className="inline-flex p-1 rounded-2xl bg-casa-bg border border-casa-border/60">
            <Button
              size="sm"
              variant={activeDayTab === 'today' ? 'primary' : 'ghost'}
              onClick={() => setActiveDayTab('today')}
              className={cn(
                'flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-caption font-bold transition-all min-h-[44px]',
                activeDayTab === 'today'
                  ? 'bg-casa-surface text-casa-navy shadow-xs border border-casa-border/60'
                  : 'text-casa-muted hover:text-casa-navy'
              )}
            >
              <Sun size={14} className="text-amber-500" />
              <span>Today ({todayEvents.length})</span>
            </Button>

            <Button
              size="sm"
              variant={activeDayTab === 'tomorrow' ? 'primary' : 'ghost'}
              onClick={() => setActiveDayTab('tomorrow')}
              className={cn(
                'flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-caption font-bold transition-all min-h-[44px]',
                activeDayTab === 'tomorrow'
                  ? 'bg-casa-surface text-casa-navy shadow-xs border border-casa-border/60'
                  : 'text-casa-muted hover:text-casa-navy'
              )}
            >
              <Moon size={14} className="text-indigo-500" />
              <span>Tomorrow ({tomorrowEvents.length})</span>
            </Button>
          </div>

          <div className="flex items-center gap-1.5">
            {weather && (
              <span className="hidden sm:inline-flex items-center gap-1 text-caption text-casa-navy font-mono bg-casa-bg px-2.5 py-1 rounded-xl border border-casa-border/50">
                <CloudSun size={13} className="text-casa-gold" />
                <span className="font-bold">{weather.temp}°F</span>
              </span>
            )}

            <IconButton
              variant="ghost"
              size="sm"
              aria-label={isBriefingExpanded ? 'Collapse briefing banner' : 'Expand briefing banner'}
              title={isBriefingExpanded ? 'Hide briefing' : 'Show briefing'}
              onClick={() => setIsBriefingExpanded((prev) => !prev)}
              className="min-h-[44px] min-w-[44px] text-casa-muted hover:text-casa-navy"
              icon={isBriefingExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            />
          </div>
        </div>

        <div className="flex items-center justify-between text-caption text-casa-muted font-mono px-1">
          <span>
            {activeDayTab === 'today'
              ? format(effectiveNow, 'EEEE, MMMM d')
              : format(tomorrowDate, 'EEEE, MMMM d')}
          </span>
          {activeDayTab === 'today' && (
            <span className="text-2xs uppercase tracking-wider font-sans font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200/60">
              Live Horizon
            </span>
          )}
        </div>
      </div>

      {/* ── Collapsible Ambient Briefing & Copilot Banner ── */}
      <AnimatePresence initial={false}>
        {isBriefingExpanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden shrink-0 mb-3 space-y-2"
          >
            {/* Household Status Narrative */}
            <div className="rounded-2xl p-3 bg-gradient-to-br from-casa-navy/5 via-casa-surface to-casa-gold/5 border border-casa-gold/25">
              <div className="flex items-center gap-1.5 mb-1">
                <Sparkles size={13} className="text-casa-gold shrink-0" />
                <span className="text-2xs uppercase font-bold tracking-wider text-casa-gold">
                  Household Briefing
                </span>
              </div>
              <p className="text-caption text-casa-navy font-medium leading-relaxed">
                {householdNarrative}
              </p>
            </div>

            {/* Proactive Copilot Insight */}
            {copilotTip && (
              <div className="p-2.5 rounded-2xl bg-casa-gold/10 border border-casa-gold/30 flex items-start gap-2">
                <Sparkles size={13} className="text-casa-gold shrink-0 mt-0.5" />
                <p className="text-2xs text-casa-navy leading-relaxed font-medium">
                  <span className="font-bold text-casa-navy mr-1">Copilot Insight:</span>
                  {copilotTip}
                </p>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Scrollable Schedule Stream ── */}
      <div className="flex-1 overflow-y-auto pr-1 space-y-3 min-h-0">
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
            <div className="flex items-center gap-2 py-1">
              <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-500 text-white text-2xs font-bold font-mono tracking-wider shadow-xs">
                <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping" />
                <span>NOW · {format(effectiveNow, 'h:mm a')}</span>
              </div>
              <div className="flex-1 h-[1.5px] bg-gradient-to-r from-amber-500/80 via-amber-300/40 to-transparent" />
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
