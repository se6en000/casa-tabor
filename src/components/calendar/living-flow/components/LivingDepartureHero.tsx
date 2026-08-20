import { format } from 'date-fns'
import { Car, MapPin, Clock3, Coffee, ArrowDown, ArrowUp, Repeat, Footprints } from 'lucide-react'
import type { TravelBehavior, VenueInfo } from '../types'

interface LivingDepartureHeroProps {
  departureDate: Date
  arrivalDate: Date
  pickupDepartureDate?: Date
  venue: VenueInfo
  bufferMinutes: number
  travelBehavior: TravelBehavior
  onOpenBufferOrTime: () => void
}

export default function LivingDepartureHero({
  departureDate,
  arrivalDate,
  pickupDepartureDate,
  venue,
  bufferMinutes,
  travelBehavior,
  onOpenBufferOrTime,
}: LivingDepartureHeroProps) {
  const activeMode: TravelBehavior = travelBehavior === 'dropoff' ? 'two_way' : travelBehavior

  const formattedDepart = !departureDate || isNaN(departureDate.getTime()) ? '--:--' : format(departureDate, 'h:mm a')
  const formattedArrive = !arrivalDate || isNaN(arrivalDate.getTime()) ? '--:--' : format(arrivalDate, 'h:mm a')
  const formattedPickupDepart = pickupDepartureDate && !isNaN(pickupDepartureDate.getTime())
    ? format(pickupDepartureDate, 'h:mm a')
    : formattedDepart

  const now = new Date()
  const relevantTargetDate = activeMode === 'pickup_only' && pickupDepartureDate
    ? pickupDepartureDate
    : departureDate

  const diffMins = relevantTargetDate && !isNaN(relevantTargetDate.getTime())
    ? Math.round((relevantTargetDate.getTime() - now.getTime()) / (1000 * 60))
    : 0
  const countdownText = diffMins > 0 ? `Leave in ${diffMins}m` : 'Depart Now'

  return (
    <div
      onClick={onOpenBufferOrTime}
      title="Tap to adjust start time or duration"
      className="living-departure-hero"
    >
      {/* Top Badge Row */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        {venue.trafficDelayMinutes && venue.trafficDelayMinutes > 0 ? (
          <span className="bg-amber-500/25 border border-amber-500/60 text-amber-300 text-xs font-extrabold uppercase tracking-wider py-0.5 px-2 rounded-full flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            <span>+{venue.trafficDelayMinutes}m Traffic Delay</span>
          </span>
        ) : (
          <span className="bg-emerald-500/25 border border-emerald-500/60 text-emerald-300 text-xs font-extrabold uppercase tracking-wider py-0.5 px-2 rounded-full flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>{venue.driveMinutes > 0 ? 'Live Traffic Clear' : 'Calculating Route…'}</span>
          </span>
        )}
        <span className="font-mono text-xs font-bold text-amber-300 bg-amber-300/20 py-0.5 px-2 rounded-full">
          {countdownText}
        </span>
      </div>

      {/* Main Metric Row */}
      <div className="flex items-baseline justify-between gap-2">
        <div>
          <div className="text-xs font-bold uppercase tracking-wider text-slate-400">
            {activeMode === 'pickup_only' ? 'Leave For Venue By' : 'Leave Home By'}
          </div>
          <div className="living-dep-time-huge">
            {activeMode === 'pickup_only' ? formattedPickupDepart : formattedDepart}
          </div>
        </div>

        <div className="text-right">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-400">
            {activeMode === 'dropoff_only' ? 'Drop Off By' : 'Arrive By'}
          </div>
          <div className="font-mono text-xl font-bold text-slate-200 mt-1">
            {formattedArrive}
          </div>
        </div>
      </div>

      {/* Sub Metrics */}
      <div className="flex items-center gap-2 text-xs text-slate-300 flex-wrap mt-0.5">
        <span className="inline-flex items-center gap-1">
          <Car size={13} className="text-slate-400" />
          <span>{venue.driveMinutes}m drive</span>
        </span>
        <span>•</span>
        <span className="inline-flex items-center gap-1">
          <MapPin size={13} className="text-slate-400" />
          <span>{venue.distanceMiles} mi</span>
        </span>
        <span>•</span>
        <span className="inline-flex items-center gap-1">
          <Clock3 size={13} className="text-slate-400" />
          <span>+{bufferMinutes}m buffer</span>
        </span>
        <span className="ml-auto text-xs text-amber-300 font-medium inline-flex items-center gap-1">
          {activeMode === 'stay' && (
            <>
              <span>Parent Stays on Site</span>
              <Coffee size={13} />
            </>
          )}
          {activeMode === 'dropoff_only' && (
            <>
              <span>Drop Off Only</span>
              <ArrowDown size={13} />
            </>
          )}
          {activeMode === 'pickup_only' && (
            <>
              <span>Pick Up Only</span>
              <ArrowUp size={13} />
            </>
          )}
          {activeMode === 'two_way' && (
            <>
              <span>Drop & Pick Up</span>
              <Repeat size={13} />
            </>
          )}
          {activeMode === 'none' && (
            <>
              <span>No Family Ride</span>
              <Footprints size={13} />
            </>
          )}
        </span>
      </div>
    </div>
  )
}
