import { motion } from 'framer-motion'
import {
  Moon,
  Sun,
  Music,
  Check,
  Sparkles,
} from 'lucide-react'
import { cn } from '../../utils/cn'
import { useFamilyRoutineIntelligence } from '../../hooks/useFamilyRoutineIntelligence'
import { useHeroTheme } from '../../hooks/useHeroTheme'
import { Card, Button } from '../ui'

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
    isTomorrowWeekend,
    tomorrowDepartures,
    hasTomorrowExceptions,
    primaryTomorrowException,
    prepChecklist,
    togglePrepItem,
    completedCount,
    totalPrepCount,
    allPrepCompleted,
  } = useFamilyRoutineIntelligence(now)

  const { heroTheme, toggleHeroTheme } = useHeroTheme(now)
  const isNavy = heroTheme === 'navy'

  return (
    <Card
      className={cn(
        'relative overflow-hidden rounded-2xl border transition-all duration-300',
        isNavy
          ? 'bg-gradient-to-br from-slate-900 via-slate-900 to-slate-950 border-white/10 text-white shadow-hero-dark'
          : hasTomorrowExceptions
          ? 'border-casa-gold/40 bg-gradient-to-br from-casa-surface via-casa-surface to-amber-950/10 text-casa-navy'
          : 'border-casa-border bg-casa-surface text-casa-navy',
        className,
      )}
    >
      {/* Ambient background glow for exception days */}
      {hasTomorrowExceptions && (
        <div className="absolute top-0 right-0 w-64 h-64 bg-casa-gold/10 rounded-full blur-3xl pointer-events-none" />
      )}

      <div className="p-4 sm:p-5 relative z-10 space-y-4">
        {/* ── Header ── */}
        <div
          className={cn(
            'flex items-center justify-between gap-3 border-b pb-3',
            isNavy ? 'border-white/10' : 'border-casa-divider/60',
          )}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className={cn(
                'w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0',
                isNavy
                  ? 'bg-white/10 border border-white/15 text-amber-400'
                  : 'bg-casa-navy/10 text-casa-navy',
              )}
            >
              {isTomorrowWeekend ? (
                <Sparkles size={16} strokeWidth={2} className={isNavy ? 'text-amber-400' : 'text-casa-gold'} />
              ) : (
                <Moon size={16} strokeWidth={2} className={isNavy ? 'text-amber-400' : 'text-casa-gold'} />
              )}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    'text-caption font-bold uppercase tracking-wider leading-tight',
                    isNavy ? 'text-amber-400' : 'text-casa-gold',
                  )}
                >
                  {isTomorrowWeekend ? 'Weekend Readiness' : 'Tomorrow Morning Readiness'}
                </span>
                <span
                  className={cn(
                    'text-3xs uppercase font-bold px-2 py-0.5 rounded-full border',
                    isTomorrowWeekend
                      ? isNavy
                        ? 'bg-amber-400/10 border-amber-400/25 text-amber-300'
                        : 'bg-amber-500/10 border-amber-500/25 text-amber-800'
                      : isNavy
                      ? 'bg-white/10 border-white/15 text-slate-300'
                      : 'bg-casa-navy/5 border-casa-border text-casa-navy',
                  )}
                >
                  {isTomorrowWeekend ? 'Weekend' : 'School Day'}
                </span>
              </div>
              <div
                className={cn(
                  'text-body-sm font-semibold font-serif mt-0.5',
                  isNavy ? 'text-white' : 'text-casa-navy',
                )}
              >
                {tomorrowDayName}, {tomorrowFormattedDate}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {totalPrepCount > 0 && (
              <div className="flex items-center gap-1.5 shrink-0">
                <span
                  className={cn(
                    'text-caption font-medium px-2.5 py-1 rounded-full border transition-colors',
                    allPrepCompleted
                      ? isNavy
                        ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
                        : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700'
                      : isNavy
                      ? 'bg-white/10 border-white/15 text-slate-300'
                      : 'bg-casa-navy/5 border-casa-border text-casa-muted',
                  )}
                >
                  {allPrepCompleted ? (
                    <span className="flex items-center gap-1 font-semibold">
                      <Check size={12} strokeWidth={3} className={isNavy ? 'text-emerald-400' : 'text-emerald-600'} />
                      All set
                    </span>
                  ) : (
                    <span>{completedCount}/{totalPrepCount} prepped</span>
                  )}
                </span>
              </div>
            )}

            {/* 1-Tap Theme Quick Switcher */}
            <Button
              variant="secondary"
              size="sm"
              onClick={toggleHeroTheme}
              aria-label={`Switch hero finish to ${isNavy ? 'Belgian Linen' : 'Obsidian Navy'}`}
              className={cn(
                'rounded-full text-caption font-semibold flex items-center gap-1.5 transition-all px-2.5 py-1 min-h-0 h-auto',
                isNavy
                  ? 'bg-white/10 hover:bg-white/15 border-white/15 text-slate-300 hover:text-white'
                  : 'bg-casa-navy/5 hover:bg-casa-navy/10 border-casa-border text-casa-muted hover:text-casa-navy',
              )}
            >
              {isNavy ? (
                <>
                  <Moon size={13} strokeWidth={2} className="text-amber-400" />
                  <span className="text-3xs uppercase tracking-wider font-bold">Navy</span>
                </>
              ) : (
                <>
                  <Sun size={13} strokeWidth={2} className="text-casa-gold" />
                  <span className="text-3xs uppercase tracking-wider font-bold">Linen</span>
                </>
              )}
            </Button>
          </div>
        </div>

        {/* ── Exception Spotlight (e.g. Early Strings) ── */}
        {primaryTomorrowException && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className={cn(
              'p-3.5 rounded-xl border relative overflow-hidden',
              isNavy
                ? 'bg-slate-800/80 border-amber-500/30 text-white'
                : 'bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent border-amber-500/30 text-casa-navy',
            )}
          >
            <div className="flex items-start gap-3">
              <div
                className={cn(
                  'w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5',
                  isNavy ? 'bg-amber-500/25 text-amber-300' : 'bg-amber-500/20 text-amber-700',
                )}
              >
                <Music size={15} strokeWidth={2.2} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap mb-0.5">
                  <span
                    className={cn(
                      'text-caption font-bold uppercase tracking-wider px-2 py-0.5 rounded',
                      isNavy
                        ? 'text-amber-300 bg-amber-500/20'
                        : 'text-amber-800 bg-amber-500/15',
                    )}
                  >
                    {primaryTomorrowException.exceptionLabel || 'Special Schedule'}
                  </span>
                  <span
                    className={cn(
                      'text-caption font-semibold',
                      isNavy ? 'text-amber-200' : 'text-amber-900',
                    )}
                  >
                    Leave by {primaryTomorrowException.leaveByTimeFormatted}
                  </span>
                </div>
                <div
                  className={cn(
                    'text-body-sm font-semibold',
                    isNavy ? 'text-white' : 'text-casa-navy',
                  )}
                >
                  {primaryTomorrowException.childNamesFormatted} @ {primaryTomorrowException.venueName}
                </div>
                <div
                  className={cn(
                    'text-caption mt-0.5',
                    isNavy ? 'text-slate-400' : 'text-casa-muted',
                  )}
                >
                  Arrival window: {primaryTomorrowException.arrivalWindow} • Driver: <span className={cn('font-semibold', isNavy ? 'text-white' : 'text-casa-navy')}>{primaryTomorrowException.driverName}</span>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* ── Departures & Commitments Lineup ── */}
        <div className="space-y-2">
          <div
            className={cn(
              'text-caption font-bold uppercase tracking-wider',
              isNavy ? 'text-slate-400' : 'text-casa-muted',
            )}
          >
            {isTomorrowWeekend
              ? tomorrowDepartures.length > 0
                ? "Tomorrow's Activities & Commitments"
                : 'Morning Schedule'
              : 'Morning Departures'}
          </div>

          {tomorrowDepartures.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {tomorrowDepartures.map((dep) => (
                <div
                  key={dep.id}
                  className={cn(
                    'p-3 rounded-xl border flex items-center justify-between gap-2.5 transition-colors',
                    isNavy
                      ? dep.isException
                        ? 'bg-slate-800/80 border-amber-500/30 text-white'
                        : 'bg-slate-800/80 border-white/10 text-white hover:bg-slate-700/80'
                      : dep.isException
                      ? 'border-amber-400/40 bg-amber-50/40 text-casa-navy'
                      : 'border-casa-border bg-casa-surface/60 text-casa-navy',
                  )}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span
                        className={cn(
                          'text-body-sm font-bold font-mono',
                          isNavy ? 'text-white' : 'text-casa-navy',
                        )}
                      >
                        {dep.leaveByTimeFormatted}
                      </span>
                      {dep.driveMinutes > 0 && dep.leaveByTimeFormatted !== 'Flexible' && (
                        <span
                          className={cn(
                            'text-caption',
                            isNavy ? 'text-slate-400' : 'text-casa-muted',
                          )}
                        >
                          ({dep.driveMinutes}m drive)
                        </span>
                      )}
                    </div>
                    <div
                      className={cn(
                        'text-body-sm font-semibold truncate',
                        isNavy ? 'text-white' : 'text-casa-navy',
                      )}
                    >
                      {dep.isWeekendActivity && dep.title ? dep.title : dep.childNamesFormatted}
                    </div>
                    <div
                      className={cn(
                        'text-caption truncate',
                        isNavy ? 'text-slate-400' : 'text-casa-muted',
                      )}
                    >
                      {dep.isWeekendActivity && dep.title
                        ? `${dep.childNamesFormatted} @ ${dep.venueName}`
                        : dep.venueName}
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <div
                      className={cn(
                        'text-caption text-3xs uppercase font-medium',
                        isNavy ? 'text-slate-400' : 'text-casa-muted',
                      )}
                    >
                      Driver
                    </div>
                    <span
                      className={cn(
                        'inline-flex items-center px-2 py-0.5 rounded-full border text-caption font-semibold',
                        isNavy
                          ? 'bg-white/10 border-white/15 text-slate-200'
                          : 'bg-casa-navy/5 border-casa-border text-casa-navy',
                      )}
                    >
                      {dep.driverName}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div
              className={cn(
                'p-3.5 rounded-xl border flex items-center gap-3 transition-colors',
                isNavy
                  ? 'bg-slate-800/80 border-white/10 text-white'
                  : 'bg-casa-surface-subtle border-casa-border text-casa-navy',
              )}
            >
              <div
                className={cn(
                  'w-8 h-8 rounded-lg flex items-center justify-center shrink-0',
                  isNavy ? 'bg-emerald-500/20 text-emerald-400' : 'bg-emerald-50 text-emerald-600',
                )}
              >
                <Check size={16} strokeWidth={2.5} />
              </div>
              <div className="min-w-0">
                <div className="text-body-sm font-semibold leading-tight">
                  No Early Departures Tomorrow
                </div>
                <div
                  className={cn(
                    'text-caption mt-0.5',
                    isNavy ? 'text-slate-400' : 'text-casa-muted',
                  )}
                >
                  Weekend / open morning schedule · Ready for family activities &amp; relaxation
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── Interactive Bedtime & Weekend Readiness Checklist ── */}
        {prepChecklist.length > 0 && (
          <div className="space-y-2 pt-1">
            <div
              className={cn(
                'text-caption font-bold uppercase tracking-wider',
                isNavy ? 'text-slate-400' : 'text-casa-muted',
              )}
            >
              {isTomorrowWeekend ? 'Weekend Readiness Checklist' : 'Bedtime Prep Checklist'}
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
                    isNavy
                      ? item.completed
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-slate-400'
                        : 'bg-white/5 border-white/10 text-slate-200 hover:border-amber-400/50'
                      : item.completed
                      ? 'bg-emerald-50/50 border-emerald-500/30 text-casa-muted'
                      : 'bg-casa-surface border-casa-border text-casa-navy hover:border-casa-gold/50',
                  )}
                >
                  <div
                    className={cn(
                      'w-5 h-5 rounded-full border flex items-center justify-center shrink-0 transition-colors',
                      isNavy
                        ? item.completed
                          ? 'bg-emerald-500 border-emerald-500 text-white'
                          : 'border-slate-500 bg-transparent text-transparent'
                        : item.completed
                        ? 'bg-emerald-600 border-emerald-600 text-white'
                        : 'border-casa-border bg-white text-transparent',
                    )}
                  >
                    <Check size={12} strokeWidth={3} />
                  </div>
                  <span
                    className={cn(
                      'text-body-sm font-medium leading-tight flex-1',
                      item.completed && (isNavy ? 'line-through text-slate-400 opacity-75' : 'line-through text-casa-muted opacity-75'),
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
