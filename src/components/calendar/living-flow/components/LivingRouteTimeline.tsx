import { useState } from 'react'
import { format } from 'date-fns'
import { Car, Coffee, House, MapPin, ChevronDown, Clock, Users, Check, Plus, X } from 'lucide-react'
import type { TravelBehavior, VenueInfo } from '../types'
import type { FamilyMember } from '../../../../types'

interface LivingRouteTimelineProps {
  departureDate: Date
  arrivalDate: Date
  returnDate: Date
  durationMinutes: number
  venue: VenueInfo
  travelBehavior: TravelBehavior
  driverLeg1: string
  driverLeg2: string
  familyMembers: FamilyMember[]
  selectedMemberIds: string[]
  onSetTravelBehavior: (behavior: TravelBehavior) => void
  onAssignDriver: (leg: 1 | 2, name: string, syncBoth: boolean) => void
}

const DRIVER_OPTIONS = [
  { name: 'Kelly', role: 'Mom · Primary', initial: 'K', colorClass: 'bg-amber-700' },
  { name: 'Jake', role: 'Dad · Driver', initial: 'J', colorClass: 'bg-slate-900' },
  { name: 'Both Parents', role: 'Ride Together', initial: '👥', colorClass: 'bg-amber-500' },
  { name: 'Giselle', role: 'Caregiver / Nanny', initial: 'G', colorClass: 'bg-purple-700' },
  { name: 'Grandma', role: 'Family Helper', initial: 'S', colorClass: 'bg-orange-600' },
  { name: 'Carpool', role: 'Team / Friend', initial: 'C', colorClass: 'bg-slate-600' }
]

export default function LivingRouteTimeline({
  departureDate,
  arrivalDate,
  returnDate,
  durationMinutes,
  venue,
  travelBehavior,
  driverLeg1,
  driverLeg2,
  familyMembers,
  selectedMemberIds,
  onSetTravelBehavior,
  onAssignDriver
}: LivingRouteTimelineProps) {
  const [expandedLeg, setExpandedLeg] = useState<1 | 2 | null>(null)
  const syncReturn = true

  const activeAttendees = familyMembers
    .filter(m => selectedMemberIds.includes(m.id))
    .map(m => m.name)
    .join(', ') || 'Kids'

  const formattedDepart = format(departureDate, 'h:mm a')
  const formattedArrive = format(arrivalDate, 'h:mm a')
  const formattedStayEnd = format(new Date(arrivalDate.getTime() + durationMinutes * 60000), 'h:mm a')
  const formattedReturn = format(returnDate, 'h:mm a')

  return (
    <div className="living-journey-timeline">
      {/* Header Row with 1-Tap Behavior Switcher */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold uppercase text-slate-900 tracking-wider flex items-center gap-1.5">
          <Car size={14} className="text-slate-600" />
          <span>Route & Drivers</span>
        </span>

        <div className="flex bg-slate-50 border border-slate-200 rounded-full p-0.5 gap-0.5">
          <button
            onClick={() => onSetTravelBehavior('stay')}
            className={`py-1 px-2.5 rounded-full text-xs font-bold transition-all flex items-center gap-1 ${
              travelBehavior === 'stay'
                ? 'bg-slate-900 text-white shadow-sm'
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            <Coffee size={12} />
            <span>Stay on Site</span>
          </button>
          <button
            onClick={() => onSetTravelBehavior('dropoff')}
            className={`py-1 px-2.5 rounded-full text-xs font-bold transition-all flex items-center gap-1 ${
              travelBehavior === 'dropoff'
                ? 'bg-slate-900 text-white shadow-sm'
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            <Car size={12} />
            <span>Drop Off & Pick Up</span>
          </button>
        </div>
      </div>

      {/* Step 1: Depart Node */}
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-full bg-slate-900 border-2 border-slate-900 flex items-center justify-center text-white shrink-0 shadow-sm">
          <House size={15} />
        </div>
        <div className="flex-1 bg-slate-50 border border-slate-200 rounded-xl p-3 flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-slate-900">
              {travelBehavior === 'stay' ? 'Depart Home Together' : 'Leg 1: Drop Off Drive'}
            </span>
            <span className="font-mono text-xs font-bold text-slate-900">
              {formattedDepart}
            </span>
          </div>
          <span className="text-xs text-slate-500">
            {venue.driveMinutes} min drive · {venue.distanceMiles} miles · {driverLeg1} driving {activeAttendees}
          </span>

          <div
            onClick={() => setExpandedLeg(prev => prev === 1 ? null : 1)}
            className={`living-driver-pill ${expandedLeg === 1 ? 'bg-amber-50 border-amber-400 text-amber-900' : ''}`}
          >
            <div className="w-2 h-2 rounded-full bg-amber-600" />
            <span>Driver: <strong>{driverLeg1}</strong></span>
            <ChevronDown size={12} className={`text-slate-400 ${expandedLeg === 1 ? 'rotate-180 transition-transform' : ''}`} />
          </div>

          {/* Inline Driver Drawer for Leg 1 */}
          {expandedLeg === 1 && (
            <div className="living-inline-drawer">
              <div className="living-inline-drawer-header">
                <span>Select Driver (Leg 1)</span>
                <button
                  onClick={() => setExpandedLeg(null)}
                  className="text-xs text-slate-500 hover:text-slate-900 font-bold flex items-center gap-0.5"
                >
                  <span>Done</span>
                  <X size={13} />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {DRIVER_OPTIONS.map((drv) => {
                  const isSelected = driverLeg1 === drv.name
                  return (
                    <div
                      key={drv.name}
                      onClick={() => {
                        onAssignDriver(1, drv.name, syncReturn)
                        setExpandedLeg(null)
                      }}
                      className={`flex items-center justify-between p-2.5 rounded-xl cursor-pointer transition-all border ${
                        isSelected
                          ? 'bg-amber-50 border-amber-400 shadow-sm'
                          : 'bg-white border-slate-200 hover:border-amber-400'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <div className={`w-7 h-7 rounded-full text-white font-bold text-xs flex items-center justify-center shrink-0 ${drv.colorClass}`}>
                          {drv.name === 'Both Parents' ? <Users size={13} /> : drv.initial}
                        </div>
                        <span className="text-xs font-bold text-slate-900 truncate">{drv.name}</span>
                      </div>
                      {isSelected ? <Check size={14} className="text-emerald-600" /> : <Plus size={14} className="text-slate-400" />}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Step 2: Middle Venue Node */}
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-full bg-white border-2 border-amber-400 flex items-center justify-center text-amber-700 shrink-0 shadow-sm">
          <MapPin size={15} />
        </div>
        <div className="flex-1 bg-slate-50 border border-slate-200 rounded-xl p-3 flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-slate-900">
              {venue.name}
            </span>
            <span className="font-mono text-xs font-bold text-slate-900">
              {formattedArrive} – {formattedStayEnd}
            </span>
          </div>
          <span className="text-xs text-slate-900 font-semibold flex items-center gap-1">
            {travelBehavior === 'stay' ? (
              <>
                <Coffee size={13} className="text-amber-700 shrink-0" />
                <span>{driverLeg1} stays on site with {activeAttendees} ({Math.round(durationMinutes / 60)}h {durationMinutes % 60}m)</span>
              </>
            ) : (
              <>
                <Clock size={13} className="text-slate-600 shrink-0" />
                <span>Kids at venue · Pickup scheduled at {formattedStayEnd}</span>
              </>
            )}
          </span>
        </div>
      </div>

      {/* Step 3: Return Node */}
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-full bg-slate-900 border-2 border-slate-900 flex items-center justify-center text-white shrink-0 shadow-sm">
          <House size={15} />
        </div>
        <div className="flex-1 bg-slate-50 border border-slate-200 rounded-xl p-3 flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-slate-900">
              {travelBehavior === 'stay' ? 'Return Home Together' : 'Leg 2: Return Pickup Drive'}
            </span>
            <span className="font-mono text-xs font-bold text-slate-900">
              {formattedReturn} Arrival
            </span>
          </div>
          <span className="text-xs text-slate-500">
            {venue.driveMinutes} min return drive · {driverLeg2} driving
          </span>

          <div
            onClick={() => setExpandedLeg(prev => prev === 2 ? null : 2)}
            className={`living-driver-pill ${expandedLeg === 2 ? 'bg-amber-50 border-amber-400 text-amber-900' : ''}`}
          >
            <div className="w-2 h-2 rounded-full bg-amber-600" />
            <span>Driver: <strong>{driverLeg2}</strong></span>
            <ChevronDown size={12} className={`text-slate-400 ${expandedLeg === 2 ? 'rotate-180 transition-transform' : ''}`} />
          </div>

          {/* Inline Driver Drawer for Leg 2 */}
          {expandedLeg === 2 && (
            <div className="living-inline-drawer">
              <div className="living-inline-drawer-header">
                <span>Select Driver (Leg 2)</span>
                <button
                  onClick={() => setExpandedLeg(null)}
                  className="text-xs text-slate-500 hover:text-slate-900 font-bold flex items-center gap-0.5"
                >
                  <span>Done</span>
                  <X size={13} />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {DRIVER_OPTIONS.map((drv) => {
                  const isSelected = driverLeg2 === drv.name
                  return (
                    <div
                      key={drv.name}
                      onClick={() => {
                        onAssignDriver(2, drv.name, syncReturn)
                        setExpandedLeg(null)
                      }}
                      className={`flex items-center justify-between p-2.5 rounded-xl cursor-pointer transition-all border ${
                        isSelected
                          ? 'bg-amber-50 border-amber-400 shadow-sm'
                          : 'bg-white border-slate-200 hover:border-amber-400'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <div className={`w-7 h-7 rounded-full text-white font-bold text-xs flex items-center justify-center shrink-0 ${drv.colorClass}`}>
                          {drv.name === 'Both Parents' ? <Users size={13} /> : drv.initial}
                        </div>
                        <span className="text-xs font-bold text-slate-900 truncate">{drv.name}</span>
                      </div>
                      {isSelected ? <Check size={14} className="text-emerald-600" /> : <Plus size={14} className="text-slate-400" />}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
