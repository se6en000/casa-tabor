import { motion } from 'framer-motion'
import {
  Moon,
  Music,
  Check,
} from 'lucide-react'
import { cn } from '../../utils/cn'
import { useFamilyRoutineIntelligence } from '../../hooks/useFamilyRoutineIntelligence'
import { Card } from '../ui'

interface TomorrowPrepCardProps {
  now?: Date
  className?: string
}

export default function TomorrowPrepCard({
  now = new Date(),
  className,
}: TomorrowPrepCardProps) {
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
    <Card
      className={cn(
        'relative overflow-hidden rounded-2xl border transition-all duration-300',
        hasTomorrowExceptions
          ? 'border-casa-gold/40 bg-gradient-to-br from-casa-surface via-casa-surface to-amber-950/10'
          : 'border-casa-border bg-casa-surface',
        className,
      )}
    >
      {/* Ambient background glow for exception days */}
      {hasTomorrowExceptions && (
        <div className="absolute top-0 right-0 w-64 h-64 bg-casa-gold/10 rounded-full blur-3xl pointer-events-none" />
      )}

      <div className="p-4 sm:p-5 relative z-10 space-y-4">
        {/* ── Header ── */}
        <div className="flex items-center justify-between gap-3 border-b border-casa-divider/60 pb-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-casa-navy/10 flex items-center justify-center flex-shrink-0 text-casa-navy">
              <Moon size={16} strokeWidth={2} className="text-casa-gold" />
            </div>
            <div className="min-w-0">
              <div className="text-caption font-bold uppercase tracking-wider text-casa-gold leading-tight">
                Tomorrow Morning Readiness
              </div>
              <div className="text-body-sm font-semibold text-casa-navy font-serif">
                {tomorrowDayName}, {tomorrowFormattedDate}
              </div>
            </div>
          </div>

          {totalPrepCount > 0 && (
            <div className="flex items-center gap-1.5 shrink-0">
              <span
                className={cn(
                  'text-caption font-medium px-2.5 py-1 rounded-full border transition-colors',
                  allPrepCompleted
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700'
                    : 'bg-casa-navy/5 border-casa-border text-casa-muted',
                )}
              >
                {allPrepCompleted ? (
                  <span className="flex items-center gap-1 font-semibold">
                    <Check size={12} strokeWidth={3} className="text-emerald-600" />
                    All set
                  </span>
                ) : (
                  <span>{completedCount}/{totalPrepCount} prepped</span>
                )}
              </span>
            </div>
          )}
        </div>

        {/* ── Exception Spotlight (e.g. Early Strings) ── */}
        {primaryTomorrowException && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-3.5 rounded-xl bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent border border-amber-500/30 text-casa-navy relative overflow-hidden"
          >
            <div className="flex items-start gap-3">
              <div className="w-7 h-7 rounded-lg bg-amber-500/20 flex items-center justify-center shrink-0 text-amber-700 mt-0.5">
                <Music size={15} strokeWidth={2.2} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap mb-0.5">
                  <span className="text-caption font-bold uppercase tracking-wider text-amber-800 bg-amber-500/15 px-2 py-0.5 rounded">
                    {primaryTomorrowException.exceptionLabel || 'Special Schedule'}
                  </span>
                  <span className="text-caption font-semibold text-amber-900">
                    Leave by {primaryTomorrowException.leaveByTimeFormatted}
                  </span>
                </div>
                <div className="text-body-sm font-semibold text-casa-navy">
                  {primaryTomorrowException.childNamesFormatted} @ {primaryTomorrowException.venueName}
                </div>
                <div className="text-caption text-casa-muted mt-0.5">
                  Arrival window: {primaryTomorrowException.arrivalWindow} • Driver: <span className="font-semibold text-casa-navy">{primaryTomorrowException.driverName}</span>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* ── Departures Schedule Lineup ── */}
        <div className="space-y-2">
          <div className="text-caption font-bold uppercase tracking-wider text-casa-muted">
            Morning Departures
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {tomorrowDepartures.map((dep) => (
              <div
                key={dep.id}
                className={cn(
                  'p-3 rounded-xl border flex items-center justify-between gap-2.5 transition-colors',
                  dep.isException
                    ? 'border-amber-400/40 bg-amber-50/40'
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

        {/* ── Interactive Bedtime Prep Checklist ── */}
        {prepChecklist.length > 0 && (
          <div className="space-y-2 pt-1">
            <div className="text-caption font-bold uppercase tracking-wider text-casa-muted">
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
