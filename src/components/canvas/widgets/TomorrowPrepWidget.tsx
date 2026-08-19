import {
  Moon,
  Sun,
  Music,
  Check,
} from 'lucide-react'
import { cn } from '../../../utils/cn'
import { useFamilyRoutineIntelligence } from '../../../hooks/useFamilyRoutineIntelligence'

import { Button } from '../../ui'

interface TomorrowPrepWidgetProps {
  now?: Date
  onToggleTodayView?: () => void
  showViewToggle?: boolean
  className?: string
}

export default function TomorrowPrepWidget({
  now = new Date(),
  onToggleTodayView,
  showViewToggle = false,
  className,
}: TomorrowPrepWidgetProps) {
  const {
    tomorrowDayName,
    tomorrowFormattedDate,
    tomorrowDepartures,
    hasTomorrowExceptions,
    primaryTomorrowException,
    prepChecklist,
    togglePrepItem,
    completedCount,
    totalPrepCount,
    allPrepCompleted,
  } = useFamilyRoutineIntelligence(now)

  if (tomorrowDepartures.length === 0) {
    return null
  }

  return (
    <div
      className={cn(
        'w-full rounded-3xl p-6 sm:p-7 bg-gradient-to-br from-casa-navy via-slate-900 to-slate-950 text-white border border-white/10 shadow-xl relative overflow-hidden flex flex-col justify-between space-y-5',
        hasTomorrowExceptions && 'ring-1 ring-amber-400/40',
        className,
      )}
    >
      {/* Background ambient glow */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-casa-gold/10 rounded-full blur-3xl pointer-events-none" />

      {/* ── Header ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-3 relative z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-white/10 flex items-center justify-center text-casa-gold border border-white/10">
            <Moon size={20} strokeWidth={2} />
          </div>
          <div>
            <div className="text-caption font-bold uppercase tracking-widest text-casa-gold">
              Tomorrow's Readiness
            </div>
            <div className="text-body font-serif font-semibold text-white">
              {tomorrowDayName}, {tomorrowFormattedDate}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* 1-Tap Toggle to jump back to today */}
          {showViewToggle && onToggleTodayView && (
            <div className="inline-flex items-center p-1 rounded-full bg-white/10 border border-white/15 shadow-2xs">
              <Button
                variant="ghost"
                size="sm"
                onClick={onToggleTodayView}
                className="px-3 py-1 rounded-full text-caption font-bold text-white/80 hover:text-white transition-all min-h-[32px] flex items-center gap-1.5"
              >
                <Sun size={12} />
                <span>Today's Flow</span>
              </Button>
              <Button
                variant="secondary"
                size="sm"
                className="px-3 py-1 rounded-full text-caption font-bold bg-casa-gold text-casa-navy shadow-2xs min-h-[32px] flex items-center gap-1.5"
              >
                <Moon size={12} />
                <span>Tomorrow</span>
              </Button>
            </div>
          )}

          {totalPrepCount > 0 && (
            <div
              className={cn(
                'px-3 py-1 rounded-full text-caption font-bold tracking-wide border flex items-center gap-1.5 transition-colors',
                allPrepCompleted
                  ? 'bg-emerald-500/20 border-emerald-400/50 text-emerald-300'
                  : 'bg-white/10 border-white/15 text-white/80',
              )}
            >
              {allPrepCompleted ? (
                <>
                  <Check size={14} strokeWidth={3} className="text-emerald-400" />
                  <span>ALL SET</span>
                </>
              ) : (
                <span>{completedCount}/{totalPrepCount} READY</span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Exception Highlight Card ── */}
      {primaryTomorrowException && (
        <div className="p-4 rounded-2xl bg-amber-500/15 border border-amber-400/40 relative z-10 space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-lg bg-amber-400/20 flex items-center justify-center text-amber-300">
                <Music size={14} strokeWidth={2.5} />
              </div>
              <span className="text-caption font-bold uppercase tracking-wider text-amber-300">
                {primaryTomorrowException.exceptionLabel || 'Special Schedule'}
              </span>
            </div>
            <span className="text-caption font-mono font-bold text-amber-200 bg-amber-400/20 px-2.5 py-0.5 rounded-full">
              Leave by {primaryTomorrowException.leaveByTimeFormatted}
            </span>
          </div>

          <div className="text-body-sm font-semibold text-white">
            {primaryTomorrowException.childNamesFormatted} @ {primaryTomorrowException.venueName}
          </div>
          <div className="text-caption text-white/70">
            Arrival: {primaryTomorrowException.arrivalWindow} • Driver: <span className="font-semibold text-white">{primaryTomorrowException.driverName}</span>
          </div>
        </div>
      )}

      {/* ── Departures Lineup ── */}
      <div className="space-y-2 relative z-10">
        <div className="text-caption font-bold uppercase tracking-widest text-white/60">
          Morning Departures
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {tomorrowDepartures.map((dep) => (
            <div
              key={dep.id}
              className={cn(
                'p-3.5 rounded-2xl border flex items-center justify-between gap-2.5 transition-colors',
                dep.isException
                  ? 'border-amber-400/40 bg-amber-500/10 text-white'
                  : 'border-white/10 bg-white/5 text-white',
              )}
            >
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span className="text-body font-mono font-bold text-white">
                    {dep.leaveByTimeFormatted}
                  </span>
                  <span className="text-caption text-white/60">
                    ({dep.driveMinutes}m)
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
                <div className="text-3xs uppercase font-medium text-white/50 mb-0.5">Driver</div>
                <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-white/15 border border-white/10 text-caption font-bold text-white">
                  {dep.driverName}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Interactive Bedtime Prep Checklist ── */}
      {prepChecklist.length > 0 && (
        <div className="space-y-2 pt-1 relative z-10">
          <div className="text-caption font-bold uppercase tracking-widest text-white/60">
            Bedtime Prep Checklist
          </div>
          <div className="space-y-1.5">
            {prepChecklist.map((item) => (
              <div
                key={item.id}
                role="button"
                tabIndex={0}
                onClick={() => togglePrepItem(item.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    togglePrepItem(item.id)
                  }
                }}
                className={cn(
                  'w-full flex items-center gap-3 p-3 rounded-2xl border text-left transition-all duration-150 cursor-pointer select-none active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-casa-gold',
                  item.completed
                    ? 'bg-emerald-950/30 border-emerald-500/30 text-white/60'
                    : 'bg-white/5 border-white/10 text-white hover:border-casa-gold/50',
                )}
              >
                <div
                  className={cn(
                    'w-5 h-5 rounded-full border flex items-center justify-center shrink-0 transition-colors',
                    item.completed
                      ? 'bg-emerald-500 border-emerald-500 text-white'
                      : 'border-white/30 bg-transparent text-transparent',
                  )}
                >
                  <Check size={12} strokeWidth={3} />
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
