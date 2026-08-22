import {
  Sun,
  Moon,
  Car,
  Check,
} from 'lucide-react'
import { cn } from '../../../utils/cn'
import { useFamilyRoutineIntelligence, type DepartureItem } from '../../../hooks/useFamilyRoutineIntelligence'
import { useHeroTheme } from '../../../hooks/useHeroTheme'
import { openEventDetails } from '../../../utils/openEventDetails'
import { Button } from '../../ui'

interface MorningLaunchpadWidgetProps {
  now?: Date
  onOpenEvent?: (event: any) => void
  className?: string
}

export default function MorningLaunchpadWidget({
  now = new Date(),
  onOpenEvent,
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

  const { heroTheme, toggleHeroTheme } = useHeroTheme(now)
  const isNavy = heroTheme === 'navy'

  const handleOpenDeparture = (dep: DepartureItem) => {
    if (onOpenEvent && dep.rawEvent) {
      onOpenEvent(dep.rawEvent)
    }
    const targetId = dep.eventId || dep.id
    openEventDetails(targetId)
  }

  if (!hasTodayDepartures || allTodayDeparturesCompleted || !isMorning) {
    return null
  }

  const isImminent = nextTodayDeparture?.isPrepUrgent || nextTodayDeparture?.isLeaveNow

  return (
    <div
      className={cn(
        'w-full rounded-3xl p-6 sm:p-7 relative overflow-hidden flex flex-col justify-between space-y-5 transition-all duration-300',
        isNavy
          ? 'bg-gradient-to-br from-casa-navy via-slate-900 to-slate-950 text-white border border-white/10 shadow-xl'
          : nextTodayDeparture?.isLeaveNow
          ? 'border border-amber-500/60 bg-gradient-to-br from-casa-surface via-casa-surface to-amber-500/10 ring-1 ring-amber-400 text-casa-navy shadow-card'
          : nextTodayDeparture?.isPrepUrgent
          ? 'border border-amber-400/40 bg-gradient-to-br from-casa-surface via-casa-surface to-amber-500/5 text-casa-navy shadow-card'
          : 'border border-casa-border bg-casa-surface text-casa-navy shadow-card',
        isNavy && nextTodayDeparture?.isLeaveNow && 'ring-2 ring-amber-400/60 shadow-glow-gold',
        isNavy && nextTodayDeparture?.isPrepUrgent && !nextTodayDeparture?.isLeaveNow && 'ring-1 ring-amber-400/40',
        className,
      )}
    >
      {/* Background ambient glow */}
      {isNavy ? (
        <div className="absolute top-0 right-0 w-96 h-96 bg-casa-gold/10 rounded-full blur-3xl pointer-events-none" />
      ) : isImminent ? (
        <div className="absolute top-0 right-0 w-80 h-80 bg-amber-400/10 rounded-full blur-3xl pointer-events-none" />
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
                : 'bg-amber-500/15 text-amber-700 border-amber-400/30',
            )}
          >
            <Sun size={20} strokeWidth={2.2} />
          </div>
          <div className="min-w-0">
            <div
              className={cn(
                'text-caption font-bold uppercase tracking-widest leading-tight',
                isNavy ? 'text-amber-400' : 'text-casa-gold',
              )}
            >
              Active Morning Departures
            </div>
            <div
              className={cn(
                'text-body font-serif font-semibold mt-0.5',
                isNavy ? 'text-white' : 'text-casa-navy',
              )}
            >
              {todayDayName}, {todayFormattedDate}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {nextTodayDeparture && (
            <div
              className={cn(
                'px-3.5 py-1.5 rounded-full text-caption font-bold tracking-wide border flex items-center gap-2 transition-colors',
                isNavy
                  ? nextTodayDeparture.isLeaveNow
                    ? 'bg-amber-500/25 border-amber-400 text-amber-300 animate-pulse'
                    : nextTodayDeparture.isPrepUrgent
                    ? 'bg-amber-500/20 border-amber-400/50 text-amber-300 animate-pulse'
                    : 'bg-emerald-500/15 border-emerald-400/40 text-emerald-300'
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

          {/* 1-Tap Theme Quick Switcher Capsule */}
          <Button
            variant="secondary"
            size="sm"
            onClick={toggleHeroTheme}
            aria-label={`Switch hero finish to ${isNavy ? 'Belgian Linen' : 'Obsidian Navy'}`}
            title={`Switch hero finish to ${isNavy ? 'Belgian Linen' : 'Obsidian Navy'}`}
            className={cn(
              'rounded-full text-caption font-semibold flex items-center gap-1.5 transition-all px-3 py-1 min-h-[32px] sm:min-h-[36px]',
              isNavy
                ? 'bg-white/10 hover:bg-white/15 border-white/15 text-slate-200 hover:text-white'
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

      {/* ── Primary Next Departure Spotlight ── */}
      {nextTodayDeparture && (
        <div
          role="button"
          tabIndex={0}
          onClick={() => handleOpenDeparture(nextTodayDeparture)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              handleOpenDeparture(nextTodayDeparture)
            }
          }}
          title="Tap to view departure route and details in sidecar"
          aria-label={`View details for ${nextTodayDeparture.childNamesFormatted} departure to ${nextTodayDeparture.venueName}`}
          className={cn(
            'p-4 rounded-2xl border relative z-10 space-y-2 transition-all cursor-pointer select-none active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-casa-gold',
            isNavy
              ? 'bg-white/5 border-white/15 text-white hover:bg-white/10 hover:border-white/30 hover:shadow-lg'
              : 'bg-casa-surface-subtle/80 border-casa-border text-casa-navy hover:bg-white hover:border-casa-gold/60 hover:shadow-md',
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
                      ? 'bg-amber-400/20 text-amber-300 border-amber-400/30'
                      : 'bg-amber-500/15 text-amber-800 border-amber-500/25',
                  )}
                >
                  {nextTodayDeparture.exceptionLabel || 'Special Schedule'}
                </span>
              )}
            </div>
            <span
              className={cn(
                'text-caption font-mono font-bold px-2.5 py-0.5 rounded-full border transition-colors',
                isNavy
                  ? 'text-white bg-white/10 border-white/10'
                  : 'text-casa-navy bg-white border-casa-border',
              )}
            >
              Leave by {nextTodayDeparture.leaveByTimeFormatted}
            </span>
          </div>

          <div className="flex items-center justify-between gap-3">
            <div>
              <div
                className={cn(
                  'text-heading font-semibold leading-tight',
                  isNavy ? 'text-white' : 'text-casa-navy',
                )}
              >
                {nextTodayDeparture.childNamesFormatted}
              </div>
              <div
                className={cn(
                  'text-caption mt-0.5',
                  isNavy ? 'text-white/70' : 'text-casa-muted',
                )}
              >
                {nextTodayDeparture.venueName} · Arrival window: {nextTodayDeparture.arrivalWindow}
              </div>
            </div>

            <div className="text-right shrink-0">
              <div
                className={cn(
                  'text-caption text-3xs uppercase font-bold',
                  isNavy ? 'text-white/50' : 'text-casa-muted',
                )}
              >
                Assigned Driver
              </div>
              <span
                className={cn(
                  'inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-body-sm font-bold transition-transform',
                  isNavy
                    ? 'bg-casa-gold/20 border-casa-gold/40 text-casa-gold'
                    : 'bg-casa-gold/15 border-casa-gold/30 text-casa-gold',
                )}
              >
                <Car size={13} className={isNavy ? 'text-amber-400' : 'text-casa-gold'} />
                <span>{nextTodayDeparture.driverName}</span>
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ── All Today's Departures Lineup ── */}
      <div className="space-y-2 relative z-10">
        <div
          className={cn(
            'text-caption font-bold uppercase tracking-widest',
            isNavy ? 'text-white/60' : 'text-casa-muted',
          )}
        >
          Household Departure Queue
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {todayDepartures.map((dep) => (
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
                'p-3.5 rounded-2xl border flex items-center justify-between gap-2 transition-all cursor-pointer select-none active:scale-[0.98] min-h-[48px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-casa-gold',
                isNavy
                  ? dep.id === nextTodayDeparture?.id
                    ? 'bg-white/10 border-white/20 ring-1 ring-casa-gold/30 text-white hover:bg-white/15 hover:border-white/30'
                    : 'bg-white/5 border-white/10 text-white hover:bg-white/10 hover:border-white/25'
                  : dep.id === nextTodayDeparture?.id
                  ? 'bg-casa-surface border-casa-border ring-1 ring-casa-gold/40 text-casa-navy hover:bg-white hover:border-casa-gold/60 hover:shadow-sm'
                  : 'bg-casa-surface-subtle/80 border-casa-border text-casa-navy hover:bg-white hover:border-casa-gold/50 hover:shadow-sm',
              )}
            >
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span
                    className={cn(
                      'text-body font-bold font-mono',
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
                  {dep.childNamesFormatted}
                </div>
                <div
                  className={cn(
                    'text-caption truncate',
                    isNavy ? 'text-white/60' : 'text-casa-muted',
                  )}
                >
                  {dep.venueName}
                </div>
              </div>

              <div className="text-right shrink-0">
                <div
                  className={cn(
                    'text-3xs uppercase font-semibold mb-0.5',
                    isNavy ? 'text-white/50' : 'text-casa-muted',
                  )}
                >
                  Driver
                </div>
                <span
                  className={cn(
                    'inline-flex items-center px-2.5 py-1 rounded-full border text-caption font-bold',
                    isNavy
                      ? 'bg-white/10 border-white/15 text-white'
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
        <div className="space-y-2 relative z-10 pt-1">
          <div
            className={cn(
              'text-caption font-bold uppercase tracking-widest',
              isNavy ? 'text-white/60' : 'text-casa-muted',
            )}
          >
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
                  isNavy
                    ? item.completed
                      ? 'bg-emerald-950/30 border-emerald-500/40 text-emerald-200/80'
                      : 'bg-white/5 border-white/10 text-white hover:border-white/30 hover:bg-white/10'
                    : item.completed
                    ? 'bg-emerald-50/50 border-emerald-500/30 text-casa-muted'
                    : 'bg-casa-surface-subtle border-casa-border text-casa-navy hover:border-casa-gold/50',
                )}
              >
                <div
                  className={cn(
                    'w-6 h-6 rounded-full border flex items-center justify-center shrink-0 transition-colors',
                    isNavy
                      ? item.completed
                        ? 'bg-emerald-500 border-emerald-500 text-white'
                        : 'border-white/30 bg-white/5 text-transparent'
                      : item.completed
                      ? 'bg-emerald-600 border-emerald-600 text-white'
                      : 'border-casa-border bg-white text-transparent',
                  )}
                >
                  <Check size={14} strokeWidth={3} />
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
