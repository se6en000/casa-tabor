import {
  Sun,
  Moon,
  Car,
  Check,
} from 'lucide-react'
import { cn } from '../../utils/cn'
import { useFamilyRoutineIntelligence } from '../../hooks/useFamilyRoutineIntelligence'
import { useHeroTheme } from '../../hooks/useHeroTheme'
import { Card, Button } from '../ui'

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
    hasTodayDepartures,
    allTodayDeparturesCompleted,
    isMorning,
  } = useFamilyRoutineIntelligence(now)

  const { heroTheme, toggleHeroTheme } = useHeroTheme(now)
  const isNavy = heroTheme === 'navy'

  if (!hasTodayDepartures || allTodayDeparturesCompleted || !isMorning) {
    return null
  }

  const isImminent = nextTodayDeparture?.isPrepUrgent || nextTodayDeparture?.isLeaveNow

  return (
    <Card
      className={cn(
        'relative overflow-hidden rounded-2xl border transition-all duration-300',
        isNavy
          ? 'bg-gradient-to-br from-slate-900 via-slate-900 to-slate-950 border-white/10 text-white shadow-hero-dark'
          : nextTodayDeparture?.isLeaveNow
          ? 'border-amber-500/60 bg-gradient-to-br from-casa-surface via-casa-surface to-amber-500/10 ring-1 ring-amber-400 text-casa-navy'
          : nextTodayDeparture?.isPrepUrgent
          ? 'border-amber-400/40 bg-gradient-to-br from-casa-surface via-casa-surface to-amber-500/5 text-casa-navy'
          : 'border-casa-border bg-casa-surface text-casa-navy',
        className,
      )}
    >
      {/* Ambient glow */}
      {isImminent && (
        <div className="absolute top-0 right-0 w-64 h-64 bg-amber-400/10 rounded-full blur-3xl pointer-events-none" />
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
                  : 'bg-amber-500/15 text-amber-700',
              )}
            >
              <Sun size={17} strokeWidth={2.2} />
            </div>
            <div className="min-w-0">
              <div
                className={cn(
                  'text-caption font-bold uppercase tracking-wider leading-tight',
                  isNavy ? 'text-amber-400' : 'text-casa-gold',
                )}
              >
                Active Morning Departures
              </div>
              <div
                className={cn(
                  'text-body-sm font-semibold font-serif',
                  isNavy ? 'text-white' : 'text-casa-navy',
                )}
              >
                {todayDayName}, {todayFormattedDate}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {nextTodayDeparture && (
              <div
                className={cn(
                  'px-2.5 py-1 rounded-full text-caption font-bold tracking-wide border flex items-center gap-1.5 shrink-0 transition-colors',
                  isNavy
                    ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
                    : nextTodayDeparture.isLeaveNow
                    ? 'bg-amber-500/20 border-amber-500/40 text-amber-900 animate-pulse'
                    : nextTodayDeparture.isPrepUrgent
                    ? 'bg-amber-500/15 border-amber-400/30 text-amber-800'
                    : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700',
                )}
              >
                <span
                  className={cn(
                    'w-2 h-2 rounded-full',
                    isImminent ? 'bg-amber-500 animate-pulse' : 'bg-emerald-400',
                  )}
                />
                <span>
                  {nextTodayDeparture.isLeaveNow
                    ? 'TIME TO LEAVE'
                    : nextTodayDeparture.minutesUntilLeave > 0
                    ? `LEAVE IN ${nextTodayDeparture.minutesUntilLeave}M`
                    : `DEPARTED · ${nextTodayDeparture.leaveByTimeFormatted}`}
                </span>
              </div>
            )}

            {/* 1-Tap Theme Quick Switcher Capsule (Quiet, zero noisy banner) */}
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

        {/* ── Primary Spotlight (First Departure) ── */}
        {nextTodayDeparture && (
          <div
            className={cn(
              'p-3.5 rounded-xl border space-y-1.5 transition-colors',
              isNavy
                ? 'bg-slate-800/80 border-white/10 text-white'
                : 'bg-casa-surface-subtle/80 border-casa-border text-casa-navy',
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    'text-caption font-bold uppercase tracking-wider',
                    isNavy ? 'text-amber-400' : 'text-casa-gold',
                  )}
                >
                  First Departure
                </span>
                {nextTodayDeparture.isException && (
                  <span
                    className={cn(
                      'text-3xs uppercase font-bold px-2 py-0.5 rounded border',
                      isNavy
                        ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                        : 'bg-amber-500/15 text-amber-800 border-amber-500/25',
                    )}
                  >
                    {nextTodayDeparture.exceptionLabel || 'Special Schedule'}
                  </span>
                )}
              </div>
              <span
                className={cn(
                  'text-caption font-mono font-bold px-2 py-0.5 rounded border',
                  isNavy
                    ? 'bg-slate-700 border-white/10 text-slate-100'
                    : 'bg-white border-casa-border text-casa-navy',
                )}
              >
                Leave by {nextTodayDeparture.leaveByTimeFormatted}
              </span>
            </div>

            <div className="flex items-center justify-between gap-3 pt-0.5">
              <div>
                <div
                  className={cn(
                    'text-body font-semibold leading-tight',
                    isNavy ? 'text-white' : 'text-casa-navy',
                  )}
                >
                  {nextTodayDeparture.childNamesFormatted}
                </div>
                <div
                  className={cn(
                    'text-caption mt-0.5',
                    isNavy ? 'text-slate-400' : 'text-casa-muted',
                  )}
                >
                  {nextTodayDeparture.venueName} · Arrival window: {nextTodayDeparture.arrivalWindow}
                </div>
              </div>

              <div className="text-right shrink-0">
                <div
                  className={cn(
                    'text-caption text-3xs uppercase font-medium',
                    isNavy ? 'text-slate-400' : 'text-casa-muted',
                  )}
                >
                  Assigned Driver
                </div>
                <span
                  className={cn(
                    'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border text-caption font-bold',
                    isNavy
                      ? 'bg-white/10 border-white/15 text-amber-300'
                      : 'bg-casa-gold/15 border-casa-gold/30 text-casa-gold',
                  )}
                >
                  <Car size={12} className={isNavy ? 'text-amber-400' : 'text-casa-gold'} />
                  <span>{nextTodayDeparture.driverName}</span>
                </span>
              </div>
            </div>
          </div>
        )}

        {/* ── Lineup (Household Departure Queue) ── */}
        <div className="space-y-2">
          <div
            className={cn(
              'text-caption font-bold uppercase tracking-wider',
              isNavy ? 'text-slate-400' : 'text-casa-muted',
            )}
          >
            Household Departure Queue
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {todayDepartures.map((dep) => (
              <div
                key={dep.id}
                className={cn(
                  'p-3 rounded-xl border flex items-center justify-between gap-2.5 transition-colors',
                  isNavy
                    ? 'bg-slate-800/80 border-white/10 text-white hover:bg-slate-700/80'
                    : dep.id === nextTodayDeparture?.id
                    ? 'border-casa-gold/40 bg-casa-gold/5 text-casa-navy'
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
                    <span
                      className={cn(
                        'text-caption',
                        isNavy ? 'text-slate-400' : 'text-casa-muted',
                      )}
                    >
                      ({dep.driveMinutes}m drive)
                    </span>
                  </div>
                  <div
                    className={cn(
                      'text-body-sm font-medium truncate',
                      isNavy ? 'text-white' : 'text-casa-navy',
                    )}
                  >
                    {dep.childNamesFormatted}
                  </div>
                  <div
                    className={cn(
                      'text-caption truncate',
                      isNavy ? 'text-slate-400' : 'text-casa-muted',
                    )}
                  >
                    {dep.venueName}
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
        </div>

        {/* ── Morning Readiness Checklist ── */}
        {todayPrepChecklist.length > 0 && (
          <div className="space-y-2 pt-1">
            <div
              className={cn(
                'text-caption font-bold uppercase tracking-wider',
                isNavy ? 'text-slate-400' : 'text-casa-muted',
              )}
            >
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
