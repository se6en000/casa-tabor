import { useMemo } from 'react'
import { format, parseISO, differenceInMinutes, addMinutes } from 'date-fns'
import { Car, MapPin, Clock, Home } from 'lucide-react'
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
}: JourneyProgressBarProps) {
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

  const isInSession = phase === 'in-session'

  // Non-travel event fallback (standard session bar)
  if (!hasDrive) {
    return (
      <div className={cn('w-full space-y-1.5', className)}>
        {showLabels && parsedStart && (
          <div className="flex items-center justify-between text-caption font-semibold text-white/70">
            <span className="flex items-center gap-1.5 text-casa-gold">
              <Clock size={13} />
              {minutesUntilStart !== null && minutesUntilStart > 0
                ? `Starts in ${formatDurationHuman(minutesUntilStart)}`
                : phase === 'in-session'
                ? 'Underway'
                : 'Scheduled'}
            </span>
            <span>
              {format(parsedStart, 'h:mm a')}
              {parsedEnd && ` – ${format(parsedEnd, 'h:mm a')}`}
            </span>
          </div>
        )}
        <div className="w-full bg-white/10 h-2 rounded-full overflow-hidden flex items-center">
          <div
            className="bg-gradient-to-r from-casa-gold to-amber-400 h-full rounded-full transition-all duration-500 shadow-sm"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>
    )
  }

  // Active Event Session Timeline (when appointment is already underway / happening now)
  if (isInSession) {
    const elapsedMins = Math.max(0, totalEventDurationMins - (minutesUntilEnd ?? 0))
    const homeEta = parsedEnd && driveTimeMins ? addMinutes(parsedEnd, driveTimeMins) : null

    return (
      <div className={cn('w-full space-y-2', className)}>
        {showLabels && (
          <div className="flex items-center justify-between text-caption font-medium">
            <div className="flex items-center gap-1.5 text-casa-gold font-semibold truncate">
              <Clock size={13} className="shrink-0" />
              <span className="truncate">{destinationName ? `At ${destinationName}` : 'At Event'}</span>
              <span className="text-white/60 font-normal shrink-0">
                · Ends {parsedEnd ? format(parsedEnd, 'h:mm a') : ''}
              </span>
              <span
                className={cn(
                  'px-1.5 py-0.5 rounded text-2xs font-bold font-sans shrink-0',
                  minutesUntilEnd !== null && minutesUntilEnd <= 10
                    ? 'bg-amber-400 text-slate-950 animate-pulse'
                    : 'bg-white/10 text-white/80',
                )}
              >
                {minutesUntilEnd !== null && minutesUntilEnd > 0
                  ? `${formatDurationHuman(minutesUntilEnd)} left`
                  : 'Wrapping up'}
              </span>
            </div>
            {homeEta && (
              <div className="flex items-center gap-1.5 text-white/80 font-mono text-caption shrink-0">
                <Home size={12} className="text-casa-gold/80" />
                <span>{returnDestinationName} ~{format(homeEta, 'h:mm a')}</span>
              </div>
            )}
          </div>
        )}

        {/* Dual-Phase In-Session + Return Drive Progress Bar */}
        <div className="relative w-full">
          <div className="relative w-full h-2.5 rounded-full bg-white/10 overflow-hidden flex items-stretch p-0.5 border border-white/5">
            {/* Zone 1: Appointment Session Progress (65% width) */}
            <div className="relative w-[65%] h-full rounded-l-full bg-white/5 flex items-center overflow-hidden mr-0.5">
              <div
                className="h-full rounded-l-full bg-gradient-to-r from-casa-gold via-amber-400 to-emerald-400 transition-all duration-500 shadow-sm"
                style={{ width: `${progressPercent}%` }}
              />
            </div>

            {/* Zone 2: Return Drive Home (35% width) */}
            <div className="relative w-[35%] h-full rounded-r-full bg-white/5 flex items-center overflow-hidden border-l border-white/10">
              <div className="w-full h-full bg-amber-500/20" />
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
                minutesUntilEnd !== null && minutesUntilEnd <= 10
                  ? 'bg-amber-400 text-slate-950 border-white scale-110 animate-pulse ring-2 ring-amber-400/50'
                  : 'bg-slate-900 text-casa-gold border-casa-gold/60',
              )}
            >
              <Car size={9} />
            </div>
          </div>
        </div>

        {showLabels && (
          <div className="flex items-center justify-between text-3xs font-sans uppercase tracking-wider text-white/50 px-1 pt-0.5">
            <span className="w-[60%] text-left truncate">
              {destinationName ? `At ${destinationName}` : 'In Session'} ({formatDurationHuman(elapsedMins)} of {formatDurationHuman(totalEventDurationMins)})
            </span>
            <span className="w-[40%] text-right font-semibold text-white/70 truncate">
              {driveTimeMins}m Drive to {returnDestinationName}
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
                  ? 'bg-amber-500 text-slate-950 animate-pulse font-extrabold'
                  : isPrepPhase && minutesUntilLeave !== null && minutesUntilLeave <= 15
                  ? 'bg-casa-gold/20 text-casa-gold border border-casa-gold/30'
                  : 'text-casa-gold',
              )}
            >
              <Car size={13} className="shrink-0" />
              {minutesUntilLeave !== null && minutesUntilLeave > 0 ? (
                <>
                  <span>Leave in {formatDurationHuman(minutesUntilLeave)}</span>
                  <span className="text-white/60 font-normal hidden sm:inline">
                    ({parsedLeave ? format(parsedLeave, 'h:mm a') : ''})
                  </span>
                </>
              ) : isLeaveNow ? (
                <span>LEAVE NOW ({parsedLeave ? format(parsedLeave, 'h:mm a') : ''})</span>
              ) : isEnRoute ? (
                <span>En Route · {driveTimeMins}m Drive</span>
              ) : (
                <span>At Event</span>
              )}
            </span>
          </div>

          {/* Right Milestone: Event Start Time */}
          {parsedStart && (
            <div className="flex items-center gap-1.5 text-white/75 shrink-0 text-caption font-mono">
              <MapPin size={12} className="text-casa-gold/80" />
              <span>Arrive {format(parsedStart, 'h:mm a')}</span>
            </div>
          )}
        </div>
      )}

      {/* Dual-Phase Segmented Progress Bar */}
      <div className="relative w-full">
        {/* Track Container */}
        <div className="relative w-full h-2.5 rounded-full bg-white/10 overflow-hidden flex items-stretch p-0.5 border border-white/5">
          {/* Zone 1: At-Home Prep Zone (45% width) */}
          <div className="relative w-[45%] h-full rounded-l-full bg-white/5 flex items-center overflow-hidden mr-0.5">
            <div
              className={cn(
                'h-full rounded-l-full transition-all duration-500',
                isPrepPhase
                  ? 'bg-gradient-to-r from-casa-gold/80 to-casa-gold shadow-glow-gold'
                  : 'bg-casa-gold w-full',
              )}
              style={{
                width: isPrepPhase ? `${progressPercent}%` : '100%',
              }}
            />
          </div>

          {/* Zone 2: Transit / Drive Zone (35% width) */}
          <div className="relative w-[35%] h-full bg-white/5 flex items-center overflow-hidden mr-0.5 border-x border-white/10">
            <div
              className={cn(
                'h-full transition-all duration-500',
                isEnRoute || isLeaveNow
                  ? 'bg-gradient-to-r from-amber-400 to-amber-500 shadow-sm'
                  : isInSession
                  ? 'bg-amber-400 w-full'
                  : 'w-0',
              )}
              style={{
                width: isEnRoute || isLeaveNow ? `${progressPercent}%` : isInSession ? '100%' : '0%',
              }}
            />
          </div>

          {/* Zone 3: Event Window (20% width) */}
          <div className="relative w-[20%] h-full rounded-r-full bg-white/5 flex items-center overflow-hidden">
            <div
              className={cn(
                'h-full rounded-r-full transition-all duration-500',
                isInSession
                  ? 'bg-gradient-to-r from-emerald-400 to-emerald-500 shadow-sm'
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
                ? 'bg-amber-400 text-slate-950 border-white scale-125 animate-bounce ring-2 ring-amber-400/50'
                : isEnRoute || isInSession
                ? 'bg-casa-gold text-slate-950 border-white/80'
                : 'bg-slate-900 text-casa-gold border-casa-gold/60',
            )}
          >
            <Car size={9} />
          </div>
        </div>
      </div>

      {/* Sub-bar Milestone Labels */}
      {showLabels && (
        <div className="flex items-center justify-between text-3xs font-sans uppercase tracking-wider text-white/50 px-1 pt-0.5">
          <span className="w-[45%] text-left truncate">{originName || 'Prep to Leave'}</span>
          <span className="w-[35%] text-center font-semibold text-white/70 truncate">
            {driveTimeMins}m Drive
          </span>
          <span className="w-[20%] text-right truncate">{destinationName || 'Destination'}</span>
        </div>
      )}
    </div>
  )
}
