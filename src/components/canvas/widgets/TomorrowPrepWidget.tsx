import {
  Moon,
  Sun,
  Music,
  Check,
  Sparkles,
} from 'lucide-react'
import { cn } from '../../../utils/cn'
import { useFamilyRoutineIntelligence, type DepartureItem } from '../../../hooks/useFamilyRoutineIntelligence'
import { useHeroTheme } from '../../../hooks/useHeroTheme'
import { openEventDetails } from '../../../utils/openEventDetails'
import { Button } from '../../ui'

interface TomorrowPrepWidgetProps {
  now?: Date
  onToggleTodayView?: () => void
  onOpenEvent?: (event: any) => void
  showViewToggle?: boolean
  className?: string
}

export default function TomorrowPrepWidget({
  now = new Date(),
  onToggleTodayView,
  onOpenEvent,
  showViewToggle = false,
  className,
}: TomorrowPrepWidgetProps) {
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

  const { heroTheme } = useHeroTheme(now)
  const isNavy = heroTheme === 'navy'

  const handleOpenDeparture = (dep: DepartureItem) => {
    if (onOpenEvent && dep.rawEvent) {
      onOpenEvent(dep.rawEvent)
    }
    const targetId = dep.eventId || dep.id
    openEventDetails(targetId)
  }

  return (
    <div
      className={cn(
        'w-full rounded-3xl p-6 sm:p-7 relative overflow-hidden flex flex-col justify-between space-y-5 transition-all duration-300',
        isNavy
          ? 'bg-gradient-to-br from-casa-navy via-slate-900 to-slate-950 text-white border border-white/10 shadow-xl'
          : hasTomorrowExceptions
          ? 'border border-casa-gold/40 bg-gradient-to-br from-casa-surface via-casa-surface to-amber-950/5 text-casa-navy shadow-card'
          : 'border border-casa-border bg-casa-surface text-casa-navy shadow-card',
        hasTomorrowExceptions && isNavy && 'ring-1 ring-amber-400/40',
        className,
      )}
    >
      {/* Background ambient glow */}
      {isNavy ? (
        <div className="absolute top-0 right-0 w-96 h-96 bg-casa-gold/10 rounded-full blur-3xl pointer-events-none" />
      ) : hasTomorrowExceptions ? (
        <div className="absolute top-0 right-0 w-80 h-80 bg-casa-gold/10 rounded-full blur-3xl pointer-events-none" />
      ) : null}

      {/* ── Header ── */}
      <div
        className={cn(
          'flex flex-wrap items-center justify-between gap-3 pb-3 relative z-10 border-b',
          isNavy ? 'border-white/10' : 'border-casa-divider/60',
        )}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div
            className={cn(
              'w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 border transition-colors',
              isNavy
                ? 'bg-white/10 text-casa-gold border-white/10'
                : 'bg-casa-navy/10 text-casa-navy border-casa-border/60',
            )}
          >
            {isTomorrowWeekend ? (
              <Sparkles size={20} strokeWidth={2} className={isNavy ? 'text-amber-400' : 'text-casa-gold'} />
            ) : (
              <Moon size={20} strokeWidth={2} className={isNavy ? 'text-amber-400' : 'text-casa-gold'} />
            )}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className={cn(
                  'text-caption font-bold uppercase tracking-widest leading-tight',
                  isNavy ? 'text-amber-400' : 'text-casa-gold',
                )}
              >
                {isTomorrowWeekend ? 'Weekend Readiness' : "Tomorrow's Readiness"}
              </span>
              <span
                className={cn(
                  'text-3xs uppercase font-bold px-2 py-0.5 rounded-full border',
                  isTomorrowWeekend
                    ? isNavy
                      ? 'bg-amber-400/10 border-amber-400/25 text-amber-300'
                      : 'bg-amber-500/10 border-amber-500/25 text-amber-800'
                    : isNavy
                    ? 'bg-white/10 border-white/15 text-white/70'
                    : 'bg-casa-navy/5 border-casa-border text-casa-navy',
                )}
              >
                {isTomorrowWeekend ? 'Weekend' : 'School Day'}
              </span>
            </div>
            <div
              className={cn(
                'text-body font-serif font-semibold mt-0.5',
                isNavy ? 'text-white' : 'text-casa-navy',
              )}
            >
              {tomorrowDayName}, {tomorrowFormattedDate}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {totalPrepCount > 0 && (
            <span
              className={cn(
                'hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-caption font-semibold shadow-2xs border',
                isNavy
                  ? 'bg-white/10 border-white/10 text-white/80'
                  : 'bg-casa-surface-subtle border-casa-border/60 text-casa-text-secondary',
              )}
            >
              {allPrepCompleted ? (
                <>
                  <Check size={14} strokeWidth={3} className={isNavy ? 'text-emerald-400' : 'text-emerald-600'} />
                  <span>ALL SET</span>
                </>
              ) : (
                <>
                  <Sparkles size={13} className={isNavy ? 'text-amber-400' : 'text-casa-gold'} />
                  <span>{completedCount}/{totalPrepCount} Ready</span>
                </>
              )}
            </span>
          )}

          {/* 1-Tap Mode Toggle (Today vs Tomorrow) */}
          {showViewToggle && onToggleTodayView && (
            <div
              className={cn(
                'inline-flex items-center p-1 rounded-full border shadow-2xs',
                isNavy ? 'bg-white/5 border-white/10' : 'bg-casa-surface-subtle border-casa-border',
              )}
            >
              <Button
                variant="ghost"
                size="sm"
                onClick={onToggleTodayView}
                className={cn(
                  'px-3.5 py-1.5 rounded-full text-caption font-bold transition-all min-h-[36px] flex items-center gap-1.5',
                  isNavy
                    ? 'text-white/60 hover:text-white'
                    : 'text-casa-muted hover:text-casa-navy',
                )}
              >
                <Sun size={13} />
                <span>Today's Flow</span>
              </Button>
              <Button
                variant="primary"
                size="sm"
                className={cn(
                  'px-3.5 py-1.5 rounded-full text-caption font-bold transition-all min-h-[36px] flex items-center gap-1.5',
                  isNavy
                    ? 'bg-casa-gold text-casa-navy shadow-2xs'
                    : 'bg-casa-navy text-white shadow-2xs',
                )}
              >
                <Moon size={13} />
                <span>
                  Tomorrow ({completedCount}/{totalPrepCount || (isTomorrowWeekend ? 2 : 3)} Ready)
                </span>
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* ── Exception Highlight Card ── */}
      {primaryTomorrowException && (
        <div
          role="button"
          tabIndex={0}
          onClick={() => handleOpenDeparture(primaryTomorrowException)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              handleOpenDeparture(primaryTomorrowException)
            }
          }}
          title="Tap to view departure route and details in sidecar"
          aria-label={`View details for ${primaryTomorrowException.childNamesFormatted} departure to ${primaryTomorrowException.venueName}`}
          className={cn(
            'p-4 rounded-2xl border relative z-10 space-y-1.5 transition-all cursor-pointer select-none active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-casa-gold',
            isNavy
              ? 'bg-amber-500/15 border-amber-400/40 text-white hover:bg-amber-500/25 hover:border-amber-400/60 hover:shadow-lg'
              : 'bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent border-amber-500/30 text-casa-navy hover:bg-white hover:border-casa-gold/60 hover:shadow-md',
          )}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div
                className={cn(
                  'w-6 h-6 rounded-lg flex items-center justify-center',
                  isNavy ? 'bg-amber-400/20 text-amber-300' : 'bg-amber-500/20 text-amber-700',
                )}
              >
                <Music size={14} strokeWidth={2.5} />
              </div>
              <span
                className={cn(
                  'text-caption font-bold uppercase tracking-wider',
                  isNavy ? 'text-amber-300' : 'text-amber-800',
                )}
              >
                {primaryTomorrowException.exceptionLabel || 'Special Schedule'}
              </span>
            </div>
            <span
              className={cn(
                'text-caption font-mono font-bold px-2.5 py-0.5 rounded-full',
                isNavy
                  ? 'text-amber-200 bg-amber-400/20'
                  : 'text-amber-900 bg-amber-500/15',
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
              'text-caption',
              isNavy ? 'text-white/70' : 'text-casa-muted',
            )}
          >
            Arrival: {primaryTomorrowException.arrivalWindow} • Driver:{' '}
            <span className={cn('font-semibold', isNavy ? 'text-white' : 'text-casa-navy')}>
              {primaryTomorrowException.driverName}
            </span>
          </div>
        </div>
      )}

      {/* ── Commitments & Departures Lineup ── */}
      <div className="space-y-2 relative z-10">
        <div
          className={cn(
            'text-caption font-bold uppercase tracking-widest',
            isNavy ? 'text-white/60' : 'text-casa-muted',
          )}
        >
          {isTomorrowWeekend
            ? tomorrowDepartures.length > 0
              ? "Tomorrow's Activities & Commitments"
              : 'Morning Schedule'
            : 'Morning Departures'}
        </div>
        {tomorrowDepartures.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {tomorrowDepartures.map((dep) => (
              <div
                key={dep.id}
                role="button"
                tabIndex={0}
                onClick={() => handleOpenDeparture(dep)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    handleOpenDeparture(dep)
                  }
                }}
                title="Tap to view departure route and details in sidecar"
                aria-label={`View details for ${dep.childNamesFormatted} departure to ${dep.venueName}`}
                className={cn(
                  'p-3.5 rounded-2xl border flex items-center justify-between gap-2.5 transition-all cursor-pointer select-none active:scale-[0.98] min-h-[48px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-casa-gold',
                  isNavy
                    ? dep.isException
                      ? 'border-amber-400/40 bg-amber-500/10 text-white hover:bg-amber-500/20 hover:border-amber-400/60'
                      : 'border-white/10 bg-white/5 text-white hover:bg-white/10 hover:border-white/25'
                    : dep.isException
                    ? 'border-amber-400/40 bg-amber-50/50 text-casa-navy hover:bg-white hover:border-casa-gold/60 hover:shadow-sm'
                    : 'border-casa-border bg-casa-surface-subtle/80 text-casa-navy hover:bg-white hover:border-casa-gold/50 hover:shadow-sm',
                )}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span
                      className={cn(
                        'text-body font-mono font-bold',
                        isNavy ? 'text-white' : 'text-casa-navy',
                      )}
                    >
                      {dep.leaveByTimeFormatted}
                    </span>
                    {dep.driveMinutes > 0 && dep.leaveByTimeFormatted !== 'Flexible' && (
                      <span
                        className={cn(
                          'text-caption',
                          isNavy ? 'text-white/60' : 'text-casa-muted',
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
                      isNavy ? 'text-white/60' : 'text-casa-muted',
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
                      'text-3xs uppercase font-medium mb-0.5',
                      isNavy ? 'text-white/50' : 'text-casa-muted',
                    )}
                  >
                    Driver
                  </div>
                  <span
                    className={cn(
                      'inline-flex items-center px-2.5 py-1 rounded-full border text-caption font-bold',
                      isNavy
                        ? 'bg-white/15 border-white/10 text-white'
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
              'p-4 rounded-2xl border flex items-center gap-3 transition-colors',
              isNavy
                ? 'bg-white/5 border-white/10 text-white'
                : 'bg-casa-surface-subtle border-casa-border text-casa-navy',
            )}
          >
            <div
              className={cn(
                'w-8 h-8 rounded-xl flex items-center justify-center shrink-0',
                isNavy
                  ? 'bg-emerald-500/20 text-emerald-400'
                  : 'bg-emerald-50 text-emerald-600',
              )}
            >
              <Check size={16} strokeWidth={2.5} />
            </div>
            <div className="min-w-0">
              <div
                className={cn(
                  'text-body-sm font-semibold leading-tight',
                  isNavy ? 'text-white' : 'text-casa-navy',
                )}
              >
                No Early Departures Tomorrow
              </div>
              <div
                className={cn(
                  'text-caption mt-0.5',
                  isNavy ? 'text-white/60' : 'text-casa-muted',
                )}
              >
                Weekend / open morning flow · Check your agenda for daytime activities
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Interactive Bedtime & Weekend Prep Checklist ── */}
      {prepChecklist.length > 0 && (
        <div className="space-y-2 pt-1 relative z-10">
          <div
            className={cn(
              'text-caption font-bold uppercase tracking-widest',
              isNavy ? 'text-white/60' : 'text-casa-muted',
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
                  'w-full flex items-center gap-3 p-3 rounded-2xl border text-left transition-all duration-150 cursor-pointer select-none active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-casa-gold',
                  isNavy
                    ? item.completed
                      ? 'bg-emerald-950/30 border-emerald-500/30 text-white/60'
                      : 'bg-white/5 border-white/10 text-white hover:border-casa-gold/50'
                    : item.completed
                    ? 'bg-emerald-50/50 border-emerald-500/30 text-casa-muted'
                    : 'bg-casa-surface-subtle border-casa-border text-casa-navy hover:border-casa-gold/50',
                )}
              >
                <div
                  className={cn(
                    'w-5 h-5 rounded-full border flex items-center justify-center shrink-0 transition-colors',
                    isNavy
                      ? item.completed
                        ? 'bg-emerald-500 border-emerald-500 text-white'
                        : 'border-white/30 bg-transparent text-transparent'
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
                    item.completed && (isNavy ? 'line-through text-white/50' : 'line-through text-casa-muted'),
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
