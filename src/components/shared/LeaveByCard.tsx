import { format, differenceInMinutes, isAfter } from 'date-fns'
import { Loader2, Navigation, Clock3, AlertTriangle } from 'lucide-react'
import { useTravelEta, type TravelEtaResult } from '../../hooks/useTravelEta'
import { cn } from '../../utils/cn'

export function LeaveByCard({
  origin,
  destination,
  eventStartIso,
  departureTimeIso,
  className,
  compact = false,
  travelEta,
  travelEtaLoading,
  travelEtaError,
}: {
  origin?: string | null
  destination: string | null
  eventStartIso?: string | null
  departureTimeIso?: string | null
  className?: string
  compact?: boolean
  travelEta?: TravelEtaResult | null
  travelEtaLoading?: boolean
  travelEtaError?: boolean
}) {
  const targetValue = departureTimeIso ?? eventStartIso
  const target = targetValue ? new Date(targetValue) : null
  const shouldRun = Boolean(destination && target && isAfter(target, new Date()))
  const query = useTravelEta({
    origin,
    destination,
    eventStartIso,
    departureTimeIso,
    enabled: shouldRun && !travelEta,
    bufferMins: 10,
  })
  const data = travelEta ?? query.data
  const isLoading = travelEtaLoading ?? query.isLoading
  const isError = travelEtaError ?? query.isError

  if (!shouldRun) return null
  if (isLoading) {
    return (
      <div className={cn('inline-flex items-center gap-1.5 text-caption text-casa-muted', className)}>
        <Loader2 size={12} className="animate-spin" />
        Calculating live traffic…
      </div>
    )
  }
  const leaveByValue = data?.leave_by ?? data?.departure_time
  if (isError || !data?.found || !leaveByValue) {
    return (
      <div className={cn('inline-flex items-center gap-1.5 text-caption text-casa-muted', className)}>
        <AlertTriangle size={12} />
        Live ETA unavailable
      </div>
    )
  }

  const leaveBy = new Date(leaveByValue)
  const minsUntilLeave = differenceInMinutes(leaveBy, new Date())
  const urgency =
    minsUntilLeave <= 0 ? 'text-red-600' :
      minsUntilLeave <= 15 ? 'text-amber-600' :
        'text-casa-gold'
  const driveTime = typeof data.drive_time_mins === 'number' ? `${data.drive_time_mins} min` : null
  const traffic = typeof data.traffic_delay_mins === 'number' && data.traffic_delay_mins > 0
    ? `+${data.traffic_delay_mins} min traffic`
    : null

  if (compact) {
    return (
      <div className={cn('inline-flex items-center gap-1 text-caption font-semibold', urgency, className)}>
        <Navigation size={11} />
        Leave by {format(leaveBy, 'h:mm a')}
      </div>
    )
  }

  return (
    <div className={cn('rounded-xl border border-casa-border bg-casa-bg/80 px-3 py-2.5', className)}>
      <div className={cn('flex items-center gap-1.5 text-body-sm font-semibold', urgency)}>
        <Navigation size={14} />
        Leave by {format(leaveBy, 'h:mm a')}
      </div>
      <div className="mt-1 flex items-center gap-2 text-caption text-casa-muted">
        <Clock3 size={11} />
        {minsUntilLeave <= 0 ? 'Leave now' : `In ${minsUntilLeave} min`}
        {driveTime && <span>· {driveTime}</span>}
        {traffic && <span>· {traffic}</span>}
      </div>
    </div>
  )
}
