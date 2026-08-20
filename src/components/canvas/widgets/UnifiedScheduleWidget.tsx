import { useMemo, useState } from 'react'
import { format } from 'date-fns'
import { Calendar, Sparkles, CloudSun, CheckCircle2, ChevronDown, ChevronUp } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import type { EventWithDetails } from '../../../hooks/useCalendarEvents'
import type { FamilyMember } from '../../../types'
import { useFamilyMembers } from '../../../hooks/useFamilyMembers'
import { useLiveClock } from '../../../hooks/useLiveClock'
import { useReminderNeedsYouActions } from '../../../hooks/useReminderNeedsYouActions'
import { getEventStartDate } from '../../../utils/eventTime'
import { DayEventCard } from '../../calendar/DayEventCard'
import { IconButton } from '../../ui'

interface UnifiedScheduleWidgetProps {
  now: Date
  todayEvents: EventWithDetails[]
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

export default function UnifiedScheduleWidget({
  now,
  todayEvents,
  householdNarrative,
  copilotTip,
  weather,
  familyMembers,
  highlightedEventId,
  setHighlightedEventId,
  onOpenEvent,
}: UnifiedScheduleWidgetProps) {
  const hookNow = useLiveClock(15_000)
  const effectiveNow = now ?? hookNow
  const { data: hookFamily } = useFamilyMembers()
  const effectiveFamily = familyMembers ?? hookFamily ?? []
  const { completeReminder, snoozeReminderByDuration, moveReminderToNeedsYou } = useReminderNeedsYouActions()
  const [isBriefingExpanded, setIsBriefingExpanded] = useState(true)

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
    <div className="lg:col-span-7 xl:col-span-8 flex flex-col rounded-3xl bg-casa-surface border border-casa-border/60 shadow-sm p-5 overflow-hidden min-h-0">
      {/* ── Widget Header ── */}
      <div className="flex items-center justify-between pb-3 mb-3 border-b border-casa-border/40 shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-xl bg-casa-gold/15 text-casa-navy">
            <Calendar size={18} className="text-casa-gold" />
          </div>
          <div>
            <h2 className="font-display text-body-lg font-bold text-casa-navy leading-tight">
              Today's Schedule & Operations
            </h2>
            <p className="text-caption text-casa-muted font-mono">
              {format(effectiveNow, 'EEEE, MMMM d')}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-caption font-bold px-2.5 py-1 rounded-full bg-casa-bg text-casa-navy border border-casa-border/60">
            {todayEvents.length} {todayEvents.length === 1 ? 'Event' : 'Events'}
          </span>
          <IconButton
            variant="ghost"
            size="sm"
            aria-label={isBriefingExpanded ? 'Collapse daily briefing banner' : 'Expand daily briefing banner'}
            title={isBriefingExpanded ? 'Hide briefing banner' : 'Show briefing banner'}
            onClick={() => setIsBriefingExpanded((prev) => !prev)}
            className="min-h-[44px] min-w-[44px] text-casa-muted hover:text-casa-navy"
            icon={isBriefingExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          />
        </div>
      </div>

      {/* ── Collapsible Ambient Daily Briefing & Copilot Banner ── */}
      <AnimatePresence initial={false}>
        {isBriefingExpanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden shrink-0 mb-4 space-y-2.5"
          >
            {/* Household Status Narrative */}
            <div className="rounded-2xl p-4 bg-gradient-to-br from-casa-navy/5 via-casa-surface to-casa-gold/5 border border-casa-gold/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 mb-1">
                  <Sparkles size={14} className="text-casa-gold shrink-0" />
                  <span className="text-caption uppercase font-bold tracking-wider text-casa-gold">
                    Household Briefing
                  </span>
                </div>
                <p className="text-body-sm text-casa-navy font-medium leading-relaxed">
                  {householdNarrative}
                </p>
              </div>

              {weather && (
                <div className="inline-flex items-center gap-1.5 text-caption text-casa-navy font-mono bg-casa-surface px-3 py-1.5 rounded-xl border border-casa-border/60 shadow-xs shrink-0 self-start sm:self-center">
                  <CloudSun size={14} className="text-casa-gold shrink-0" />
                  <span className="font-semibold">{weather.temp}°F</span>
                  <span className="text-casa-muted">· {weather.condition}</span>
                </div>
              )}
            </div>

            {/* Proactive Copilot Insight */}
            {copilotTip && (
              <div className="p-3 rounded-2xl bg-casa-gold/10 border border-casa-gold/30 flex items-start gap-2.5">
                <Sparkles size={14} className="text-casa-gold shrink-0 mt-0.5" />
                <p className="text-caption text-casa-navy leading-relaxed font-medium">
                  <span className="font-bold text-casa-navy mr-1">Copilot Insight:</span>
                  {copilotTip}
                </p>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Unified Scrollable Event Stream ── */}
      <div className="flex-1 overflow-y-auto pr-1 min-h-0">
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
                      console.error('UnifiedScheduleWidget: failed to snooze reminder', error)
                    })
                  }}
                  onSendToNeedsYou={(targetEvent) => {
                    void moveReminderToNeedsYou(targetEvent).catch((error) => {
                      console.error('UnifiedScheduleWidget: failed to move reminder to Needs you', error)
                    })
                  }}
                />
              ))}
            </ol>
          </AnimatePresence>
        ) : (
          <div className="flex flex-col items-center justify-center h-56 text-center">
            <CheckCircle2 size={36} className="text-emerald-500 mb-2" />
            <p className="text-body-sm font-semibold text-casa-navy">No Events Scheduled Today</p>
            <p className="text-caption text-casa-muted mt-0.5">The family schedule is wide open.</p>
          </div>
        )}
      </div>
    </div>
  )
}
