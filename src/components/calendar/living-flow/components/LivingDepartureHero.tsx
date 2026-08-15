import { format } from 'date-fns'
import { Car, MapPin, Clock3, Coffee } from 'lucide-react'
import type { TravelBehavior, VenueInfo } from '../types'

interface LivingDepartureHeroProps {
  departureDate: Date
  arrivalDate: Date
  venue: VenueInfo
  bufferMinutes: number
  travelBehavior: TravelBehavior
  onOpenBufferOrTime: () => void
}

export default function LivingDepartureHero({
  departureDate,
  arrivalDate,
  venue,
  bufferMinutes,
  travelBehavior,
  onOpenBufferOrTime
}: LivingDepartureHeroProps) {
  const formattedDepart = format(departureDate, 'h:mm a')
  const formattedArrive = format(arrivalDate, 'h:mm a')

  const now = new Date()
  const diffMins = Math.round((departureDate.getTime() - now.getTime()) / (1000 * 60))
  const countdownText = diffMins > 0 ? `Leave in ${diffMins}m` : 'Depart Now'

  return (
    <div
      onClick={onOpenBufferOrTime}
      title="Tap to adjust start time or duration"
      className="living-departure-hero"
    >
      {/* Top Badge Row */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="bg-emerald-500/25 border border-emerald-500/60 text-emerald-300 text-xs font-extrabold uppercase tracking-wider py-0.5 px-2 rounded-full flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span>Live Traffic Clear · I-95 N</span>
        </span>
        <span className="font-mono text-xs font-bold text-amber-300 bg-amber-300/20 py-0.5 px-2 rounded-full">
          {countdownText}
        </span>
      </div>

      {/* Main Metric Row */}
      <div className="flex items-baseline justify-between gap-2">
        <div>
          <div className="text-xs font-bold uppercase tracking-wider text-slate-400">
            Leave Home By
          </div>
          <div className="living-dep-time-huge">
            {formattedDepart}
          </div>
        </div>

        <div className="text-right">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-400">
            Arrive By
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
          {travelBehavior === 'stay' ? (
            <>
              <span>Parent Stays on Site</span>
              <Coffee size={13} />
            </>
          ) : (
            <>
              <span>Drop Off & Pick Up</span>
              <Car size={13} />
            </>
          )}
        </span>
      </div>
    </div>
  )
}
