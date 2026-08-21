import {
  Sun,
  Car,
  Check,
} from 'lucide-react'
import { cn } from '../../../utils/cn'
import { useFamilyRoutineIntelligence } from '../../../hooks/useFamilyRoutineIntelligence'

interface MorningLaunchpadWidgetProps {
  now?: Date
  className?: string
}

export default function MorningLaunchpadWidget({
  now = new Date(),
  className,
}: MorningLaunchpadWidgetProps) {
  const {
    todayDayName,
    todayFormattedDate,
    todayDepartures,
    nextTodayDeparture,
    todayPrepChecklist,
    toggleTodayPrepItem,
    hasTodayDepartures,
    allTodayDeparturesCompleted,
    isMorning,
  } = useFamilyRoutineIntelligence(now)

  if (!hasTodayDepartures || allTodayDeparturesCompleted || !isMorning) {
    return null
  }

  const isImminent = nextTodayDeparture?.isPrepUrgent || nextTodayDeparture?.isLeaveNow

  return (
    <div
      className={cn(
        'w-full rounded-3xl p-6 sm:p-7 bg-gradient-to-br from-casa-navy via-slate-900 to-slate-950 text-white border border-white/10 shadow-xl relative overflow-hidden flex flex-col justify-between space-y-5 transition-all duration-300',
        nextTodayDeparture?.isLeaveNow
          ? 'ring-2 ring-amber-400/60 shadow-glow-gold'
          : nextTodayDeparture?.isPrepUrgent
          ? 'ring-1 ring-amber-400/40'
          : '',
        className,
      )}
    >
      {/* Background ambient glow */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-casa-gold/10 rounded-full blur-3xl pointer-events-none" />

      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-3 relative z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-white/10 flex items-center justify-center text-casa-gold border border-white/10">
            <Sun size={20} strokeWidth={2.2} />
          </div>
          <div>
            <div className="text-caption font-bold uppercase tracking-widest text-casa-gold">
              Active Morning Departures
            </div>
            <div className="text-body font-serif font-semibold text-white">
              {todayDayName}, {todayFormattedDate}
            </div>
          </div>
        </div>

        {nextTodayDeparture && (
          <div
            className={cn(
              'px-3.5 py-1.5 rounded-full text-caption font-bold tracking-wide border flex items-center gap-2 transition-colors',
              nextTodayDeparture.isLeaveNow
                ? 'bg-amber-500/25 border-amber-400 text-amber-300 animate-pulse'
                : nextTodayDeparture.isPrepUrgent
                ? 'bg-amber-500/20 border-amber-400/50 text-amber-300 animate-pulse'
                : 'bg-emerald-500/15 border-emerald-400/40 text-emerald-300',
            )}
          >
            <span
              className={cn(
                'w-2 h-2 rounded-full',
                isImminent ? 'bg-amber-400 animate-pulse' : 'bg-emerald-400',
              )}
            />
            <span>
              {nextTodayDeparture.isLeaveNow
                ? 'TIME TO LEAVE NOW'
                : nextTodayDeparture.minutesUntilLeave > 0
                ? `LEAVE IN ${nextTodayDeparture.minutesUntilLeave} MIN · ${nextTodayDeparture.leaveByTimeFormatted}`
                : `DEPARTED · ${nextTodayDeparture.leaveByTimeFormatted}`}
            </span>
          </div>
        )}
      </div>

      {/* ── Primary Next Departure Spotlight ── */}
      {nextTodayDeparture && (
        <div className="p-4 rounded-2xl bg-white/5 border border-white/15 relative z-10 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-caption font-bold uppercase tracking-wider text-casa-gold">
                First Departure
              </span>
              {nextTodayDeparture.isException && (
                <span className="text-3xs uppercase font-bold px-2 py-0.5 rounded bg-amber-400/20 text-amber-300 border border-amber-400/30">
                  {nextTodayDeparture.exceptionLabel || 'Special Schedule'}
                </span>
              )}
            </div>
            <span className="text-caption font-mono font-bold text-white bg-white/10 px-2.5 py-0.5 rounded-full border border-white/10">
              Leave by {nextTodayDeparture.leaveByTimeFormatted}
            </span>
          </div>

          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-heading font-semibold text-white leading-tight">
                {nextTodayDeparture.childNamesFormatted}
              </div>
              <div className="text-caption text-white/70 mt-0.5">
                {nextTodayDeparture.venueName} · Arrival window: {nextTodayDeparture.arrivalWindow}
              </div>
            </div>

            <div className="text-right shrink-0">
              <div className="text-caption text-white/50 text-3xs uppercase font-bold">Assigned Driver</div>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-casa-gold/20 border border-casa-gold/40 text-body-sm font-bold text-casa-gold">
                <Car size={13} className="text-casa-gold shrink-0" />
                <span>{nextTodayDeparture.driverName}</span>
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ── All Today's Departures Lineup ── */}
      <div className="space-y-2 relative z-10">
        <div className="text-caption font-bold uppercase tracking-widest text-white/60">
          Household Departure Queue
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {todayDepartures.map((dep) => (
            <div
              key={dep.id}
              className={cn(
                'p-3.5 rounded-2xl border flex items-center justify-between gap-2 transition-all',
                dep.id === nextTodayDeparture?.id
                  ? 'bg-white/10 border-white/20 ring-1 ring-casa-gold/30'
                  : 'bg-white/5 border-white/10',
              )}
            >
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span className="text-body font-bold text-white font-mono">
                    {dep.leaveByTimeFormatted}
                  </span>
                  <span className="text-caption text-white/60">
                    ({dep.driveMinutes}m drive)
                  </span>
                </div>
                <div className="text-body-sm font-semibold text-white truncate">
                  {dep.childNamesFormatted}
                </div>
                <div className="text-caption text-white/60 truncate">
                  {dep.venueName}
                </div>
              </div>

              <div className="text-right shrink-0">
                <div className="text-caption text-white/50 text-3xs uppercase font-semibold">Driver</div>
                <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-white/10 border border-white/15 text-caption font-bold text-white">
                  {dep.driverName}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Morning Readiness Checklist ── */}
      {todayPrepChecklist.length > 0 && (
        <div className="space-y-2 relative z-10 pt-1">
          <div className="text-caption font-bold uppercase tracking-widest text-white/60">
            Morning Readiness Checklist
          </div>
          <div className="space-y-2">
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
                  'w-full flex items-center gap-3 p-3 rounded-2xl border text-left transition-all duration-150 cursor-pointer select-none active:scale-[0.99] min-h-[48px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-casa-gold',
                  item.completed
                    ? 'bg-emerald-950/30 border-emerald-500/40 text-emerald-200/80'
                    : 'bg-white/5 border-white/10 text-white hover:border-white/30 hover:bg-white/10',
                )}
              >
                <div
                  className={cn(
                    'w-6 h-6 rounded-full border flex items-center justify-center shrink-0 transition-colors',
                    item.completed
                      ? 'bg-emerald-500 border-emerald-500 text-white'
                      : 'border-white/30 bg-white/5 text-transparent',
                  )}
                >
                  <Check size={14} strokeWidth={3} />
                </div>
                <span
                  className={cn(
                    'text-body-sm font-medium leading-tight flex-1',
                    item.completed && 'line-through text-white/50',
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
  )
}
