import { format, parseISO } from 'date-fns'
import { Sparkles, CloudSun } from 'lucide-react'
import { cn } from '../../../utils/cn'
import type { EventWithDetails } from '../../../hooks/useCalendarEvents'

interface BriefingWidgetProps {
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
  highlightedEventId: string | null
  setHighlightedEventId: (id: string | null) => void
  onOpenEvent: (event: EventWithDetails) => void
}

export default function BriefingWidget({
  now,
  todayEvents,
  householdNarrative,
  copilotTip,
  weather,
  highlightedEventId,
  setHighlightedEventId,
  onOpenEvent,
}: BriefingWidgetProps) {
  return (
    <div className="lg:col-span-4 flex flex-col rounded-3xl bg-casa-surface border border-casa-border/60 shadow-sm p-5 overflow-hidden">
      <div className="flex items-center justify-between pb-3 mb-3 border-b border-casa-border/40 shrink-0">
        <div className="flex items-center gap-2">
          <Sparkles size={16} className="text-casa-gold" />
          <h2 className="font-display text-body-lg font-bold text-casa-navy">
            Daily Briefing
          </h2>
        </div>
        <span className="text-caption text-casa-muted font-mono">
          {format(now, 'EEE, MMM d')}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto pr-1 space-y-4">
        {/* Narrative Overview Card */}
        <div className="rounded-2xl p-4 bg-gradient-to-br from-casa-navy/5 via-casa-surface to-casa-gold/5 border border-casa-gold/20">
          <p className="text-caption uppercase font-bold tracking-wider text-casa-gold mb-1">
            Household Status
          </p>
          <p className="text-body-sm text-casa-navy font-medium leading-relaxed">
            {householdNarrative}
          </p>
        </div>

        {/* Logistics Handoffs Card */}
        <div>
          <h3 className="text-caption font-bold uppercase tracking-wider text-casa-muted mb-2.5">
            Logistics & Handoffs
          </h3>
          <div className="space-y-2">
            {todayEvents
              .filter((e) => !e.all_day)
              .slice(0, 3)
              .map((evt) => (
                <div
                  key={evt.id}
                  role="button"
                  tabIndex={0}
                  data-tactile="true"
                  data-calendar-event
                  onMouseEnter={() => setHighlightedEventId(evt.id)}
                  onMouseLeave={() => setHighlightedEventId(null)}
                  onClick={() => onOpenEvent(evt)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      onOpenEvent(evt)
                    }
                  }}
                  className={cn(
                    'p-3.5 rounded-2xl border transition-all duration-150 cursor-pointer group min-h-[48px] flex flex-col justify-center active:scale-[0.97] active:opacity-75',
                    highlightedEventId === evt.id
                      ? 'border-casa-navy bg-casa-gold/15 shadow-sm'
                      : 'border-casa-border/50 bg-casa-bg/40 hover:bg-casa-surface'
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-caption font-bold text-casa-navy">
                      {format(parseISO(evt.start_time), 'h:mm a')}
                    </span>
                    <div className="flex items-center gap-1 flex-wrap">
                      {evt.members.map((m) => (
                        <span
                          key={m.id}
                          className="text-caption font-bold px-2 py-0.5 rounded-full border"
                          style={{
                            borderColor: m.family_member?.color_hex ?? 'var(--color-casa-gold)',
                            color: m.family_member?.color_hex ?? 'var(--color-casa-gold)',
                          }}
                        >
                          {m.family_member?.name}
                        </span>
                      ))}
                    </div>
                  </div>
                  <p className="text-body-sm font-semibold text-casa-navy group-hover:text-casa-gold transition-colors mt-1">
                    {evt.title}
                  </p>
                  {evt.location_name && (
                    <p className="text-caption text-casa-text-secondary truncate mt-0.5">
                      📍 {evt.location_name}
                    </p>
                  )}
                </div>
              ))}
          </div>
        </div>

        {/* AI Assistant Quick Suggestions */}
        <div className="p-3.5 rounded-2xl bg-casa-gold/10 border border-casa-gold/30">
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <div className="flex items-center gap-2">
              <Sparkles size={14} className="text-casa-gold" />
              <span className="text-caption font-bold text-casa-navy">Casa AI Insight</span>
            </div>
            {weather && (
              <span className="inline-flex items-center gap-1 text-caption text-casa-muted font-mono bg-casa-surface/60 px-2 py-0.5 rounded-full border border-casa-border/40">
                <CloudSun size={11} className="text-casa-gold" />
                {weather.temp}° {weather.condition}
              </span>
            )}
          </div>
          <p className="text-caption text-casa-text-secondary leading-relaxed">
            {copilotTip}
          </p>
        </div>
      </div>
    </div>
  )
}
