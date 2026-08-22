import { useMemo } from 'react'
import { format, parseISO, differenceInMinutes, addMinutes } from 'date-fns'
import { Car, MapPin, Clock, Home, CheckCircle2 } from 'lucide-react'
import { cn } from '../../utils/cn'
import { formatDurationHuman } from '../../utils/eventTime'

export interface JourneyProgressBarProps {
  /** Current time for live tracking. */
  now?: Date
  /** When the user needs to leave home. */
  leaveAt?: Date | string | null
  /** When the event starts. */
  startTime?: Date | string | null
  /** When the event ends. */
  endTime?: Date | string | null
  /** Drive duration in minutes. */
  driveTimeMins?: number | null
  /** Whether the event is all-day. */
  isAllDay?: boolean
  /** Whether to render milestone text badges above and below the bar. */
  showLabels?: boolean
  /** Optional custom class name. */
  className?: string
  /** Dynamic waypoint names from event or transportation plan */
  originName?: string
  destinationName?: string
  returnDestinationName?: string
  /** Visual theme finish: 'navy' (dark) | 'linen' (light/warm neutral) | 'dark' | 'light'. Defaults to 'navy'. */
  theme?: 'navy' | 'linen' | 'dark' | 'light'
}

/**
 * Dual-Phase Journey & Departure Progress Bar (Option A)
 * Visualizes Origin (e.g. School/Home) -> Departure Gate -> Drive In-Transit -> Destination (e.g. Dentist/Party).
 */
export function JourneyProgressBar({
  now = new Date(),
  leaveAt,
  startTime,
  endTime,
  driveTimeMins,
  isAllDay = false,
  showLabels = true,
  className,
  originName = 'Prep to Leave',
  destinationName = 'Destination',
  returnDestinationName = 'Home',
  theme = 'navy',
}: JourneyProgressBarProps) {
  const isLinen = theme === 'linen' || theme === 'light'
  const parsedStart = useMemo(() => {
    if (!startTime) return null
    return typeof startTime === 'string' ? parseISO(startTime) : startTime
  }, [startTime])

  const parsedEnd = useMemo(() => {
    if (!endTime) return null
    return typeof endTime === 'string' ? parseISO(endTime) : endTime
  }, [endTime])

  const parsedLeave = useMemo(() => {
    if (leaveAt) {
      return typeof leaveAt === 'string' ? parseISO(leaveAt) : leaveAt
    }
    if (parsedStart && driveTimeMins && driveTimeMins > 0) {
      return new Date(parsedStart.getTime() - driveTimeMins * 60 * 1000)
    }
    return parsedStart
  }, [leaveAt, parsedStart, driveTimeMins])

  const {
    minutesUntilLeave,
    minutesUntilStart,
    minutesUntilEnd,
    totalEventDurationMins,
    hasDrive,
    phase,
    progressPercent,
  } = useMemo(() => {
    if (isAllDay || !parsedStart) {
      return {
        minutesUntilLeave: null,
        minutesUntilStart: null,
        minutesUntilEnd: null,
        totalEventDurationMins: 0,
        hasDrive: false,
        phase: 'all-day' as const,
        progressPercent: 100,
      }
    }

    const mLeave = parsedLeave ? differenceInMinutes(parsedLeave, now) : differenceInMinutes(parsedStart, now)
    const mStart = differenceInMinutes(parsedStart, now)
    const mEnd = parsedEnd ? differenceInMinutes(parsedEnd, now) : mStart + 60
    const totalDuration = parsedEnd ? Math.max(1, differenceInMinutes(parsedEnd, parsedStart)) : 60
    const drive = Boolean(driveTimeMins && driveTimeMins > 0)

    // Determine current journey phase
    let currentPhase: 'prep' | 'leave-now' | 'en-route' | 'in-session' | 'concluded' = 'prep'
    let progress = 0

    if (mEnd <= 0) {
      currentPhase = 'concluded'
      progress = 100
    } else if (mStart <= 0) {
      currentPhase = 'in-session'
      const elapsed = totalDuration - mEnd
      progress = Math.max(15, Math.min(100, Math.round((elapsed / totalDuration) * 100)))
    } else if (drive && mLeave <= 0) {
      // In departure or driving window (between leaveAt and start)
      currentPhase = mLeave >= -5 ? 'leave-now' : 'en-route'
      const transitDuration = driveTimeMins || 20
      const transitElapsed = transitDuration - mStart
      progress = Math.max(20, Math.min(95, Math.round((transitElapsed / transitDuration) * 100)))
    } else {
      // Still at home / prep window before departure
      currentPhase = 'prep'
      const prepWindowMins = 45 // Standard 45m home prep horizon
      if (mLeave !== null && mLeave < prepWindowMins) {
        progress = Math.max(15, Math.min(90, Math.round(100 - (mLeave / prepWindowMins) * 85)))
      } else {
        progress = 15 // Baseline
      }
    }

    return {
      minutesUntilLeave: mLeave,
      minutesUntilStart: mStart,
      minutesUntilEnd: mEnd,
      totalEventDurationMins: totalDuration,
      hasDrive: drive,
      phase: currentPhase,
      progressPercent: progress,
    }
  }, [isAllDay, parsedStart, parsedEnd, parsedLeave, driveTimeMins, now])

  const isConcluded = phase === 'concluded'
  const isInSession = phase === 'in-session'
  const isSessionOrConcluded = isInSession || isConcluded

  // Non-travel event fallback (standard session bar)
  if (!hasDrive) {
    return (
      <div className={cn('w-full space-y-1.5', className)}>
        {showLabels && parsedStart && (
          <div
            className={cn(
              'flex items-center justify-between text-caption font-semibold',
              isLinen ? 'text-casa-text-secondary' : 'text-white/70',
            )}
          >
            <span
              className={cn(
                'flex items-center gap-1.5',
                isLinen ? 'text-amber-800' : 'text-casa-gold',
              )}
            >
              {isConcluded ? (
                <>
                  <CheckCircle2
                    size={13}
                    className={isLinen ? 'text-emerald-600' : 'text-emerald-400'}
                  />
                  <span className={isLinen ? 'text-emerald-700 font-bold' : 'text-emerald-400'}>
                    Concluded
                  </span>
                </>
              ) : (
                <>
                  <Clock size={13} />
                  <span>
                    {minutesUntilStart !== null && minutesUntilStart > 0
                      ? `Starts in ${formatDurationHuman(minutesUntilStart)}`
                      : phase === 'in-session'
                      ? 'Underway'
                      : 'Scheduled'}
                  </span>
                </>
              )}
            </span>
            <span>
              {format(parsedStart, 'h:mm a')}
              {parsedEnd && ` – ${format(parsedEnd, 'h:mm a')}`}
            </span>
          </div>
        )}
        <div
          className={cn(
            'w-full h-2 rounded-full overflow-hidden flex items-center border',
            isLinen
              ? 'bg-casa-navy/[0.08] border-casa-border/80 shadow-inner'
              : 'bg-white/10 border-white/5',
          )}
        >
          <div
            className={cn(
              'h-full rounded-full transition-all duration-500 shadow-sm',
              isLinen
                ? 'bg-gradient-to-r from-casa-gold to-amber-600'
                : 'bg-gradient-to-r from-casa-gold to-amber-400',
            )}
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>
    )
  }

  // Active Event Session Timeline or Concluded Wrap-Up (when appointment is underway or concluded)
  if (isSessionOrConcluded) {
    const elapsedMins = Math.min(totalEventDurationMins, Math.max(0, totalEventDurationMins - (minutesUntilEnd ?? 0)))
    const homeEta = driveTimeMins
      ? parsedEnd && now <= parsedEnd
        ? addMinutes(parsedEnd, driveTimeMins)
        : addMinutes(now, driveTimeMins)
      : null

    return (
      <div className={cn('w-full space-y-2', className)}>
        {showLabels && (
          <div className="flex items-center justify-between text-caption font-medium">
            <div className="flex items-center gap-1.5 font-semibold truncate">
              {isConcluded ? (
                <>
                  <CheckCircle2
                    size={13}
                    className={cn('shrink-0', isLinen ? 'text-emerald-600' : 'text-emerald-400')}
                  />
                  <span className={isLinen ? 'text-emerald-700 font-bold' : 'text-emerald-400'}>
                    Event Concluded
                  </span>
                  {parsedEnd && (
                    <span
                      className={cn(
                        'font-normal shrink-0',
                        isLinen ? 'text-casa-muted' : 'text-white/60',
                      )}
                    >
                      (Ended {format(parsedEnd, 'h:mm a')})
                    </span>
                  )}
                </>
              ) : minutesUntilEnd !== null && minutesUntilEnd <= 10 && minutesUntilEnd > 0 ? (
                <>
                  <Clock
                    size={13}
                    className={cn(
                      'shrink-0 animate-pulse',
                      isLinen ? 'text-amber-600' : 'text-amber-400',
                    )}
                  />
                  <span className={isLinen ? 'text-amber-700 font-bold' : 'text-amber-400'}>
                    Wrapping up · Ends in {formatDurationHuman(minutesUntilEnd)}
                  </span>
                  {parsedEnd && (
                    <span
                      className={cn(
                        'font-normal shrink-0',
                        isLinen ? 'text-casa-muted' : 'text-white/60',
                      )}
                    >
                      ({format(parsedEnd, 'h:mm a')})
                    </span>
                  )}
                </>
              ) : (
                <>
                  <Clock
                    size={13}
                    className={cn('shrink-0', isLinen ? 'text-amber-700' : 'text-casa-gold')}
                  />
                  <span className={isLinen ? 'text-amber-800 font-bold' : 'text-casa-gold'}>
                    {minutesUntilEnd !== null && minutesUntilEnd > 0
                      ? `Ends in ${formatDurationHuman(minutesUntilEnd)}`
                      : 'Wrapping up'}
                  </span>
                  {parsedEnd && (
                    <span
                      className={cn(
                        'font-normal shrink-0',
                        isLinen ? 'text-casa-muted' : 'text-white/60',
                      )}
                    >
                      ({format(parsedEnd, 'h:mm a')})
                    </span>
                  )}
                </>
              )}
            </div>
            {homeEta && (
              <div
                className={cn(
                  'flex items-center gap-1.5 font-mono text-caption shrink-0',
                  isLinen ? 'text-casa-navy font-semibold' : 'text-white/80',
                )}
              >
                <Home
                  size={12}
                  className={isLinen ? 'text-amber-700' : 'text-casa-gold/80'}
                />
                <span>{returnDestinationName} ETA ~{format(homeEta, 'h:mm a')}</span>
              </div>
            )}
          </div>
        )}

        {/* Dual-Phase In-Session + Return Drive Progress Bar */}
        <div className="relative w-full">
          <div
            className={cn(
              'relative w-full h-2.5 rounded-full overflow-hidden flex items-stretch p-0.5 border',
              isLinen
                ? 'bg-casa-navy/[0.08] border-casa-border/80 shadow-inner'
                : 'bg-white/10 border-white/5',
            )}
          >
            {/* Zone 1: Appointment Session Progress (65% width) */}
            <div
              className={cn(
                'relative w-[65%] h-full rounded-l-full flex items-center overflow-hidden mr-0.5',
                isLinen ? 'bg-casa-navy/[0.04]' : 'bg-white/5',
              )}
            >
              <div
                className={cn(
                  'h-full rounded-l-full transition-all duration-500 shadow-sm',
                  isLinen
                    ? isConcluded
                      ? 'bg-gradient-to-r from-casa-gold via-amber-500 to-emerald-600 w-full'
                      : 'bg-gradient-to-r from-casa-gold via-amber-500 to-emerald-600'
                    : isConcluded
                    ? 'bg-gradient-to-r from-casa-gold via-amber-400 to-emerald-400 w-full'
                    : 'bg-gradient-to-r from-casa-gold via-amber-400 to-emerald-400',
                )}
                style={{ width: isConcluded ? '100%' : `${progressPercent}%` }}
              />
            </div>

            {/* Zone 2: Return Drive Home (35% width) */}
            <div
              className={cn(
                'relative w-[35%] h-full rounded-r-full flex items-center overflow-hidden',
                isLinen
                  ? 'border-l border-casa-border bg-casa-navy/[0.04]'
                  : 'border-l border-white/10 bg-white/5',
              )}
            >
              <div
                className={cn(
                  'w-full h-full transition-colors duration-500',
                  isLinen
                    ? isConcluded
                      ? 'bg-amber-500/25'
                      : 'bg-amber-500/15'
                    : isConcluded
                    ? 'bg-amber-500/30'
                    : 'bg-amber-500/20',
                )}
              />
            </div>
          </div>

          {/* Departure Marker Pin at 65% */}
          <div
            className="absolute top-1/2 -translate-y-1/2 left-[65%] -translate-x-1/2 flex flex-col items-center pointer-events-none"
            title={`Leave: ${parsedEnd ? format(parsedEnd, 'h:mm a') : ''}`}
          >
            <div
              className={cn(
                'w-4 h-4 rounded-full flex items-center justify-center text-3xs font-bold border shadow-md transition-transform',
                isConcluded
                  ? isLinen
                    ? 'bg-emerald-600 text-white border-white ring-2 ring-emerald-600/30'
                    : 'bg-emerald-400 text-slate-950 border-white ring-2 ring-emerald-400/50'
                  : minutesUntilEnd !== null && minutesUntilEnd <= 10
                  ? isLinen
                    ? 'bg-amber-500 text-slate-950 border-white scale-110 animate-pulse ring-2 ring-amber-500/40'
                    : 'bg-amber-400 text-slate-950 border-white scale-110 animate-pulse ring-2 ring-amber-400/50'
                  : isLinen
                  ? 'bg-casa-navy text-casa-gold border-white ring-2 ring-casa-navy/20'
                  : 'bg-slate-900 text-casa-gold border-casa-gold/60',
              )}
            >
              <Car size={9} />
            </div>
          </div>
        </div>

        {showLabels && (
          <div
            className={cn(
              'flex items-center justify-between text-3xs font-sans uppercase tracking-wider px-1 pt-0.5',
              isLinen ? 'text-casa-muted' : 'text-white/50',
            )}
          >
            <span className="w-[60%] text-left truncate">
              {isConcluded
                ? `Completed (${formatDurationHuman(totalEventDurationMins)})`
                : `${formatDurationHuman(elapsedMins)} elapsed (${formatDurationHuman(totalEventDurationMins)} total)`}
            </span>
            <span
              className={cn(
                'w-[40%] text-right font-semibold truncate',
                isLinen ? 'text-casa-text-secondary' : 'text-white/70',
              )}
            >
              {driveTimeMins}m drive back {returnDestinationName.toLowerCase() === 'home' ? 'home' : `to ${returnDestinationName}`}
            </span>
          </div>
        )}
      </div>
    )
  }

  // Segmented Dual-Phase Layout for Driving Events (Before Event Starts)
  // Prep Zone (45%) | Departure Gate (Tick) | Transit Zone (35%) | Event Zone (20%)
  const isPrepPhase = phase === 'prep'
  const isLeaveNow = phase === 'leave-now'
  const isEnRoute = phase === 'en-route'

  return (
    <div className={cn('w-full space-y-2', className)}>
      {/* Top Waypoint Micro-Labels */}
      {showLabels && (
        <div className="flex items-center justify-between text-caption font-medium">
          {/* Left Milestone: Departure Buffer */}
          <div className="flex items-center gap-1.5 min-w-0">
            <span
              className={cn(
                'inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-bold text-caption transition-colors',
                isLeaveNow
                  ? 'bg-amber-500 text-slate-950 animate-pulse font-extrabold shadow-sm'
                  : isPrepPhase && minutesUntilLeave !== null && minutesUntilLeave <= 15
                  ? isLinen
                    ? 'bg-amber-500/15 text-amber-900 border border-amber-500/30'
                    : 'bg-casa-gold/20 text-casa-gold border border-casa-gold/30'
                  : isLinen
                  ? 'text-amber-800'
                  : 'text-casa-gold',
              )}
            >
              <Car size={13} className="shrink-0" />
              {minutesUntilLeave !== null && minutesUntilLeave > 0 ? (
                <>
                  <span>Leave in {formatDurationHuman(minutesUntilLeave)}</span>
                  <span
                    className={cn(
                      'font-normal hidden sm:inline',
                      isLinen ? 'text-casa-muted' : 'text-white/60',
                    )}
                  >
                    ({parsedLeave ? format(parsedLeave, 'h:mm a') : ''})
                  </span>
                </>
              ) : isLeaveNow ? (
                <span>LEAVE NOW ({parsedLeave ? format(parsedLeave, 'h:mm a') : ''})</span>
              ) : isEnRoute ? (
                <span>En Route · {driveTimeMins} min</span>
              ) : (
                <span>Prep to Depart</span>
              )}
            </span>
          </div>

          {/* Right Milestone: Event Start Time */}
          {parsedStart && (
            <div
              className={cn(
                'flex items-center gap-1.5 shrink-0 text-caption font-mono',
                isLinen ? 'text-casa-text-secondary' : 'text-white/75',
              )}
            >
              <MapPin
                size={12}
                className={isLinen ? 'text-amber-700' : 'text-casa-gold/80'}
              />
              <span>Arrive {format(parsedStart, 'h:mm a')}</span>
            </div>
          )}
        </div>
      )}

      {/* Dual-Phase Segmented Progress Bar */}
      <div className="relative w-full">
        {/* Track Container */}
        <div
          className={cn(
            'relative w-full h-2.5 rounded-full overflow-hidden flex items-stretch p-0.5 border',
            isLinen
              ? 'bg-casa-navy/[0.08] border-casa-border/80 shadow-inner'
              : 'bg-white/10 border-white/5',
          )}
        >
          {/* Zone 1: At-Home Prep Zone (45% width) */}
          <div
            className={cn(
              'relative w-[45%] h-full rounded-l-full flex items-center overflow-hidden mr-0.5',
              isLinen ? 'bg-casa-navy/[0.04]' : 'bg-white/5',
            )}
          >
            <div
              className={cn(
                'h-full rounded-l-full transition-all duration-500',
                isPrepPhase
                  ? isLinen
                    ? 'bg-gradient-to-r from-casa-gold to-amber-500 shadow-sm'
                    : 'bg-gradient-to-r from-casa-gold/80 to-casa-gold shadow-glow-gold'
                  : 'bg-casa-gold w-full',
              )}
              style={{
                width: isPrepPhase ? `${progressPercent}%` : '100%',
              }}
            />
          </div>

          {/* Zone 2: Transit / Drive Zone (35% width) */}
          <div
            className={cn(
              'relative w-[35%] h-full flex items-center overflow-hidden mr-0.5',
              isLinen
                ? 'border-x border-casa-border bg-casa-navy/[0.04]'
                : 'border-x border-white/10 bg-white/5',
            )}
          >
            <div
              className={cn(
                'h-full transition-all duration-500',
                isEnRoute || isLeaveNow
                  ? isLinen
                    ? 'bg-gradient-to-r from-amber-500 to-amber-600 shadow-sm'
                    : 'bg-gradient-to-r from-amber-400 to-amber-500 shadow-sm'
                  : isInSession
                  ? isLinen
                    ? 'bg-amber-500 w-full'
                    : 'bg-amber-400 w-full'
                  : 'w-0',
              )}
              style={{
                width: isEnRoute || isLeaveNow ? `${progressPercent}%` : isInSession ? '100%' : '0%',
              }}
            />
          </div>

          {/* Zone 3: Event Window (20% width) */}
          <div
            className={cn(
              'relative w-[20%] h-full rounded-r-full flex items-center overflow-hidden',
              isLinen ? 'bg-casa-navy/[0.04]' : 'bg-white/5',
            )}
          >
            <div
              className={cn(
                'h-full rounded-r-full transition-all duration-500',
                isInSession
                  ? isLinen
                    ? 'bg-gradient-to-r from-emerald-500 to-emerald-600 shadow-sm'
                    : 'bg-gradient-to-r from-emerald-400 to-emerald-500 shadow-sm'
                  : 'w-0',
              )}
              style={{
                width: isInSession ? `${progressPercent}%` : '0%',
              }}
            />
          </div>
        </div>

        {/* Departure Gate Marker Pin (Positioned at 45% threshold) */}
        <div
          className="absolute top-1/2 -translate-y-1/2 left-[45%] -translate-x-1/2 flex flex-col items-center pointer-events-none"
          title={`Departure Gate: ${parsedLeave ? format(parsedLeave, 'h:mm a') : ''}`}
        >
          <div
            className={cn(
              'w-4 h-4 rounded-full flex items-center justify-center text-3xs font-bold border shadow-md transition-transform',
              isLeaveNow
                ? isLinen
                  ? 'bg-amber-500 text-slate-950 border-white scale-125 animate-bounce ring-2 ring-amber-500/40'
                  : 'bg-amber-400 text-slate-950 border-white scale-125 animate-bounce ring-2 ring-amber-400/50'
                : isEnRoute || isInSession
                ? isLinen
                  ? 'bg-amber-600 text-white border-white ring-2 ring-amber-600/30'
                  : 'bg-casa-gold text-slate-950 border-white/80'
                : isLinen
                ? 'bg-casa-navy text-casa-gold border-white ring-2 ring-casa-navy/20'
                : 'bg-slate-900 text-casa-gold border-casa-gold/60',
            )}
          >
            <Car size={9} />
          </div>
        </div>
      </div>

      {/* Sub-bar Milestone Labels */}
      {showLabels && (
        <div
          className={cn(
            'flex items-center justify-between gap-2 text-3xs font-sans uppercase tracking-wider px-0.5 pt-0.5',
            isLinen ? 'text-casa-muted' : 'text-white/60',
          )}
        >
          <div className="flex items-center gap-1.5 shrink-0 max-w-[40%]">
            <span
              className={cn(
                'w-1.5 h-1.5 rounded-full shrink-0',
                isLinen ? 'bg-casa-gold' : 'bg-casa-gold/60',
              )}
            />
            <span
              className={cn(
                'font-semibold truncate',
                isLinen ? 'text-casa-text-secondary' : 'text-white/80',
              )}
            >
              {originName || 'Prep to Leave'}
            </span>
          </div>
          {driveTimeMins && driveTimeMins > 0 && (
            <div
              className={cn(
                'flex items-center gap-1 font-mono text-3xs px-2 py-0.5 rounded-md border shrink-0',
                isLinen
                  ? 'text-amber-900 bg-amber-500/10 border-amber-500/20 font-semibold'
                  : 'text-casa-gold/90 bg-white/5 border-white/5',
              )}
            >
              <Car size={10} className="shrink-0" />
              <span>{driveTimeMins} min</span>
            </div>
          )}
          <div className="flex items-center gap-1.5 justify-end shrink-0 max-w-[45%] text-right">
            <span
              className={cn(
                'font-semibold truncate',
                isLinen ? 'text-casa-text-secondary' : 'text-white/80',
              )}
            >
              {destinationName || 'Destination'}
            </span>
            <span
              className={cn(
                'w-1.5 h-1.5 rounded-full shrink-0',
                isLinen ? 'bg-emerald-600' : 'bg-emerald-400/80',
              )}
            />
          </div>
        </div>
      )}
    </div>
  )
}
