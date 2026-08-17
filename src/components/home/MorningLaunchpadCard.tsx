import {
  Sun,
  Car,
  Check,
} from 'lucide-react'
import { cn } from '../../utils/cn'
import { useFamilyRoutineIntelligence } from '../../hooks/useFamilyRoutineIntelligence'
import { Card } from '../ui'

interface MorningLaunchpadCardProps {
  now?: Date
  className?: string
}

export default function MorningLaunchpadCard({
  now = new Date(),
  className,
}: MorningLaunchpadCardProps) {
  const {
    todayDayName,
    todayFormattedDate,
    todayDepartures,
    nextTodayDeparture,
    todayPrepChecklist,
    toggleTodayPrepItem,
  } = useFamilyRoutineIntelligence(now)

  if (todayDepartures.length === 0) {
    return null
  }

  const isImminent = nextTodayDeparture?.isPrepUrgent || nextTodayDeparture?.isLeaveNow

  return (
    <Card
      className={cn(
        'relative overflow-hidden rounded-2xl border transition-all duration-300',
        nextTodayDeparture?.isLeaveNow
          ? 'border-amber-500/60 bg-gradient-to-br from-casa-surface via-casa-surface to-amber-500/10 ring-1 ring-amber-400'
          : nextTodayDeparture?.isPrepUrgent
          ? 'border-amber-400/40 bg-gradient-to-br from-casa-surface via-casa-surface to-amber-500/5'
          : 'border-casa-border bg-casa-surface',
        className,
      )}
    >
      {/* Ambient glow */}
      {isImminent && (
        <div className="absolute top-0 right-0 w-64 h-64 bg-amber-400/10 rounded-full blur-3xl pointer-events-none" />
      )}

      <div className="p-4 sm:p-5 relative z-10 space-y-4">
        {/* ── Header ── */}
        <div className="flex items-center justify-between gap-3 border-b border-casa-divider/60 pb-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-amber-500/15 flex items-center justify-center flex-shrink-0 text-amber-700">
              <Sun size={17} strokeWidth={2.2} />
            </div>
            <div className="min-w-0">
              <div className="text-caption font-bold uppercase tracking-wider text-casa-gold leading-tight">
                Active Morning Departures
              </div>
              <div className="text-body-sm font-semibold text-casa-navy font-serif">
                {todayDayName}, {todayFormattedDate}
              </div>
            </div>
          </div>

          {nextTodayDeparture && (
            <div
              className={cn(
                'px-2.5 py-1 rounded-full text-caption font-bold tracking-wide border flex items-center gap-1.5 shrink-0 transition-colors',
                nextTodayDeparture.isLeaveNow
                  ? 'bg-amber-500/20 border-amber-500/40 text-amber-900 animate-pulse'
                  : nextTodayDeparture.isPrepUrgent
                  ? 'bg-amber-500/15 border-amber-400/30 text-amber-800'
                  : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700',
              )}
            >
              <span
                className={cn(
                  'w-2 h-2 rounded-full',
                  isImminent ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500',
                )}
              />
              <span>
                {nextTodayDeparture.isLeaveNow
                  ? 'TIME TO LEAVE'
                  : nextTodayDeparture.minutesUntilLeave > 0
                  ? `LEAVE IN ${nextTodayDeparture.minutesUntilLeave}M`
                  : `DEPARTED`}
              </span>
            </div>
          )}
        </div>

        {/* ── Primary Spotlight ── */}
        {nextTodayDeparture && (
          <div className="p-3.5 rounded-xl bg-casa-surface-subtle/80 border border-casa-border text-casa-navy space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-caption font-bold uppercase tracking-wider text-casa-gold">
                  Next Departure
                </span>
                {nextTodayDeparture.isException && (
                  <span className="text-3xs uppercase font-bold px-2 py-0.5 rounded bg-amber-500/15 text-amber-800 border border-amber-500/25">
                    {nextTodayDeparture.exceptionLabel || 'Special Schedule'}
                  </span>
                )}
              </div>
              <span className="text-caption font-mono font-bold text-casa-navy bg-white px-2 py-0.5 rounded border border-casa-border">
                Leave by {nextTodayDeparture.leaveByTimeFormatted}
              </span>
            </div>

            <div className="flex items-center justify-between gap-3 pt-0.5">
              <div>
                <div className="text-body font-semibold text-casa-navy leading-tight">
                  {nextTodayDeparture.childNamesFormatted}
                </div>
                <div className="text-caption text-casa-muted mt-0.5">
                  {nextTodayDeparture.venueName} · Arrival: {nextTodayDeparture.arrivalWindow}
                </div>
              </div>

              <div className="text-right shrink-0">
                <div className="text-caption text-casa-muted text-3xs uppercase font-medium">Driver</div>
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-casa-gold/15 border border-casa-gold/30 text-caption font-bold text-casa-gold">
                  <Car size={12} className="text-casa-gold shrink-0" />
                  <span>{nextTodayDeparture.driverName}</span>
                </span>
              </div>
            </div>
          </div>
        )}

        {/* ── Lineup ── */}
        <div className="space-y-2">
          <div className="text-caption font-bold uppercase tracking-wider text-casa-muted">
            All Morning Departures
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {todayDepartures.map((dep) => (
              <div
                key={dep.id}
                className={cn(
                  'p-3 rounded-xl border flex items-center justify-between gap-2.5 transition-colors',
                  dep.id === nextTodayDeparture?.id
                    ? 'border-casa-gold/40 bg-casa-gold/5'
                    : 'border-casa-border bg-casa-surface/60',
                )}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className="text-body-sm font-bold text-casa-navy font-mono">
                      {dep.leaveByTimeFormatted}
                    </span>
                    <span className="text-caption text-casa-muted">
                      ({dep.driveMinutes}m drive)
                    </span>
                  </div>
                  <div className="text-body-sm font-medium text-casa-navy truncate">
                    {dep.childNamesFormatted}
                  </div>
                  <div className="text-caption text-casa-muted truncate">
                    {dep.venueName}
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <div className="text-caption text-casa-muted text-3xs uppercase font-medium">Driver</div>
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-casa-navy/5 border border-casa-border text-caption font-semibold text-casa-navy">
                    {dep.driverName}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Morning Readiness Checklist ── */}
        {todayPrepChecklist.length > 0 && (
          <div className="space-y-2 pt-1">
            <div className="text-caption font-bold uppercase tracking-wider text-casa-muted">
              Morning Readiness Checklist
            </div>
            <div className="space-y-1.5">
              {todayPrepChecklist.map((item) => (
                <div
                  key={item.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => toggleTodayPrepItem(item.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      toggleTodayPrepItem(item.id)
                    }
                  }}
                  className={cn(
                    'w-full flex items-center gap-3 p-2.5 rounded-xl border text-left transition-all duration-150 cursor-pointer select-none active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-casa-gold',
                    item.completed
                      ? 'bg-emerald-50/50 border-emerald-500/30 text-casa-muted'
                      : 'bg-casa-surface border-casa-border text-casa-navy hover:border-casa-gold/50',
                  )}
                >
                  <div
                    className={cn(
                      'w-5 h-5 rounded-full border flex items-center justify-center shrink-0 transition-colors',
                      item.completed
                        ? 'bg-emerald-600 border-emerald-600 text-white'
                        : 'border-casa-border bg-white text-transparent',
                    )}
                  >
                    <Check size={12} strokeWidth={3} />
                  </div>
                  <span
                    className={cn(
                      'text-body-sm font-medium leading-tight flex-1',
                      item.completed && 'line-through text-casa-muted opacity-75',
                    )}
                  >
                    {item.label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Card>
  )
}
