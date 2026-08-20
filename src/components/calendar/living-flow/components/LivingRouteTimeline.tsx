import { useState } from 'react'
import { format, isSameDay, differenceInDays } from 'date-fns'
import {
  Car, Coffee, House, MapPin, ChevronDown, Clock, Users, Check, Plus, X,
  ArrowDown, ArrowUp, Repeat, Footprints,
} from 'lucide-react'
import { Button } from '../../../../components/ui'
import type { TravelBehavior, VenueInfo } from '../types'
import type { FamilyMember } from '../../../../types'

interface LivingRouteTimelineProps {
  departureDate: Date
  arrivalDate: Date
  pickupDepartureDate?: Date
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
  { name: 'Carpool', role: 'Team / Friend', initial: 'C', colorClass: 'bg-slate-600' },
]

const LOGISTICS_MODE_OPTIONS: Array<{
  mode: TravelBehavior
  label: string
  shortLabel: string
  icon: typeof Coffee
}> = [
  { mode: 'stay', label: 'Stay on Site', shortLabel: 'Stay', icon: Coffee },
  { mode: 'dropoff_only', label: 'Drop Only', shortLabel: 'Drop', icon: ArrowDown },
  { mode: 'pickup_only', label: 'Pick Up Only', shortLabel: 'Pick Up', icon: ArrowUp },
  { mode: 'two_way', label: 'Drop & Pick', shortLabel: '2-Way', icon: Repeat },
  { mode: 'none', label: 'No Ride', shortLabel: 'None', icon: Footprints },
]

export default function LivingRouteTimeline({
  departureDate,
  arrivalDate,
  pickupDepartureDate,
  returnDate,
  durationMinutes,
  venue,
  travelBehavior,
  driverLeg1,
  driverLeg2,
  familyMembers,
  selectedMemberIds,
  onSetTravelBehavior,
  onAssignDriver,
}: LivingRouteTimelineProps) {
  const [expandedLeg, setExpandedLeg] = useState<1 | 2 | null>(null)

  const activeMode: TravelBehavior = travelBehavior === 'dropoff' ? 'two_way' : travelBehavior

  const activeAttendees = familyMembers
    .filter((m) => selectedMemberIds.includes(m.id) && m.name !== driverLeg1 && m.name !== driverLeg2 && m.role !== 'parent')
    .map((m) => m.name)
    .join(', ') || familyMembers
    .filter((m) => selectedMemberIds.includes(m.id))
    .map((m) => m.name)
    .join(', ') || 'Kids'

  const formattedDepart = !departureDate || isNaN(departureDate.getTime()) ? '--:--' : format(departureDate, 'h:mm a')
  const formattedArrive = !arrivalDate || isNaN(arrivalDate.getTime()) ? '--:--' : format(arrivalDate, 'h:mm a')
  const stayEndMs = arrivalDate && !isNaN(arrivalDate.getTime()) ? arrivalDate.getTime() + (durationMinutes || 60) * 60000 : null
  const formattedStayEnd = stayEndMs ? format(new Date(stayEndMs), 'h:mm a') : '--:--'

  const isMultiDayStay = Boolean(stayEndMs && arrivalDate && !isSameDay(arrivalDate, new Date(stayEndMs)))
  const stayNightsCount = isMultiDayStay && stayEndMs ? Math.max(1, differenceInDays(new Date(stayEndMs), arrivalDate)) : 0
  const staySpanLabel = isMultiDayStay && stayEndMs
    ? `${format(arrivalDate, 'EEE, MMM d · h:mm a')} → ${format(new Date(stayEndMs), 'EEE, MMM d · h:mm a')}`
    : `${formattedArrive} – ${formattedStayEnd}`

  const calculatedPickupDepart = pickupDepartureDate ?? (stayEndMs && venue.driveMinutes
    ? new Date(stayEndMs - (venue.driveMinutes + 5) * 60000)
    : null)
  const formattedPickupDepart = !calculatedPickupDepart || isNaN(calculatedPickupDepart.getTime())
    ? '--:--'
    : format(calculatedPickupDepart, 'h:mm a')

  const formattedReturn = !returnDate || isNaN(returnDate.getTime()) ? '--:--' : format(returnDate, 'h:mm a')

  return (
    <div className="living-journey-timeline">
      {/* Header Row with 5-Mode Segmented Selector */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold uppercase text-slate-900 tracking-wider flex items-center gap-1.5">
            <Car size={14} className="text-slate-600" />
            <span>Route & Logistics</span>
          </span>
        </div>

        <div className="grid grid-cols-5 bg-slate-100 border border-slate-200 rounded-full p-0.5 gap-0.5">
          {LOGISTICS_MODE_OPTIONS.map(({ mode, shortLabel, icon: IconComponent }) => {
            const isSelected = activeMode === mode
            return (
              <button
                key={mode}
                type="button"
                onClick={() => onSetTravelBehavior(mode)}
                className={`py-1.5 px-1 rounded-full text-xs font-bold transition-all flex items-center justify-center gap-1 ${
                  isSelected
                    ? 'bg-slate-900 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                }`}
                title={mode}
              >
                <IconComponent size={12} className="shrink-0" />
                <span className="truncate">{shortLabel}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* ══════ MODE: NONE (NO RIDE) ══════ */}
      {activeMode === 'none' && (
        <div className="flex items-center gap-3 p-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-600">
          <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 shrink-0">
            <Footprints size={15} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold text-slate-900">No Family Ride Needed</p>
            <p className="text-xs text-slate-500">Attending via bus, walking, or friend carpool.</p>
          </div>
        </div>
      )}

      {/* ══════ MODE: DROPOFF ONLY ══════ */}
      {activeMode === 'dropoff_only' && (
        <>
          {/* Step 1: Depart Home */}
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-slate-900 border-2 border-slate-900 flex items-center justify-center text-white shrink-0 shadow-sm">
              <House size={15} />
            </div>
            <div className="flex-1 bg-slate-50 border border-slate-200 rounded-xl p-3 flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-slate-900">Leg 1: Drop Off Drive</span>
                <span className="font-mono text-xs font-bold text-slate-900">{formattedDepart}</span>
              </div>
              <span className="text-xs text-slate-500">
                {venue.driveMinutes > 0
                  ? `${venue.driveMinutes} min drive · ${venue.distanceMiles} miles · ${driverLeg1} driving ${activeAttendees}`
                  : `Calculating route… · ${driverLeg1} driving ${activeAttendees}`}
              </span>

              <div
                onClick={() => setExpandedLeg((prev) => (prev === 1 ? null : 1))}
                className={`living-driver-pill ${expandedLeg === 1 ? 'bg-amber-50 border-amber-400 text-amber-900' : ''}`}
              >
                <div className="w-2 h-2 rounded-full bg-amber-600" />
                <span>Drop Driver: <strong>{driverLeg1}</strong></span>
                <ChevronDown size={12} className={`text-slate-400 ${expandedLeg === 1 ? 'rotate-180 transition-transform' : ''}`} />
              </div>

              {expandedLeg === 1 && (
                <div className="living-inline-drawer">
                  <div className="living-inline-drawer-header">
                    <span>Select Drop-Off Driver</span>
                    <button
                      type="button"
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
                            onAssignDriver(1, drv.name, false)
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

          {/* Step 2: Venue Arrival */}
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-white border-2 border-amber-400 flex items-center justify-center text-amber-700 shrink-0 shadow-sm">
              <MapPin size={15} />
            </div>
            <div className="flex-1 bg-slate-50 border border-slate-200 rounded-xl p-3 flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-slate-900">{venue.name}</span>
                <span className="font-mono text-xs font-bold text-slate-900">{formattedArrive}</span>
              </div>
              <span className="text-xs text-slate-900 font-semibold flex items-center gap-1">
                <Clock size={13} className="text-slate-600 shrink-0" />
                <span>{activeAttendees} at venue · Driver departs after drop-off</span>
              </span>
            </div>
          </div>
        </>
      )}

      {/* ══════ MODE: PICKUP ONLY ══════ */}
      {activeMode === 'pickup_only' && (
        <>
          {/* Step 1: Depart for Pickup */}
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-slate-900 border-2 border-slate-900 flex items-center justify-center text-white shrink-0 shadow-sm">
              <House size={15} />
            </div>
            <div className="flex-1 bg-slate-50 border border-slate-200 rounded-xl p-3 flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-slate-900">Leg 1: Pickup Departure Drive</span>
                <span className="font-mono text-xs font-bold text-slate-900">{formattedPickupDepart}</span>
              </div>
              <span className="text-xs text-slate-500">
                {venue.driveMinutes > 0
                  ? `${venue.driveMinutes} min drive · ${venue.distanceMiles} miles · ${driverLeg2} leaving to pick up ${activeAttendees}`
                  : `Calculating route… · ${driverLeg2} leaving to pick up ${activeAttendees}`}
              </span>

              <div
                onClick={() => setExpandedLeg((prev) => (prev === 2 ? null : 2))}
                className={`living-driver-pill ${expandedLeg === 2 ? 'bg-amber-50 border-amber-400 text-amber-900' : ''}`}
              >
                <div className="w-2 h-2 rounded-full bg-amber-600" />
                <span>Pickup Driver: <strong>{driverLeg2}</strong></span>
                <ChevronDown size={12} className={`text-slate-400 ${expandedLeg === 2 ? 'rotate-180 transition-transform' : ''}`} />
              </div>

              {expandedLeg === 2 && (
                <div className="living-inline-drawer">
                  <div className="living-inline-drawer-header">
                    <span>Select Pickup Driver</span>
                    <button
                      type="button"
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
                            onAssignDriver(2, drv.name, false)
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

          {/* Step 2: Return Home */}
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-slate-900 border-2 border-slate-900 flex items-center justify-center text-white shrink-0 shadow-sm">
              <House size={15} />
            </div>
            <div className="flex-1 bg-slate-50 border border-slate-200 rounded-xl p-3 flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-slate-900">Return Home with {activeAttendees}</span>
                <span className="font-mono text-xs font-bold text-slate-900">{formattedReturn} Arrival</span>
              </div>
              <span className="text-xs text-slate-500">
                {venue.driveMinutes > 0
                  ? `${venue.driveMinutes} min return drive · ${driverLeg2} driving`
                  : `Calculating return route… · ${driverLeg2} driving`}
              </span>
            </div>
          </div>
        </>
      )}

      {/* ══════ MODE: STAY ON SITE ══════ */}
      {activeMode === 'stay' && (
        <>
          {/* Step 1: Depart Home Together */}
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-slate-900 border-2 border-slate-900 flex items-center justify-center text-white shrink-0 shadow-sm">
              <House size={15} />
            </div>
            <div className="flex-1 bg-slate-50 border border-slate-200 rounded-xl p-3 flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-slate-900">Depart Home Together</span>
                <span className="font-mono text-xs font-bold text-slate-900">{formattedDepart}</span>
              </div>
              <span className="text-xs text-slate-500">
                {venue.driveMinutes > 0
                  ? `${venue.driveMinutes} min drive · ${venue.distanceMiles} miles · ${driverLeg1} driving ${activeAttendees}`
                  : `Calculating route… · ${driverLeg1} driving ${activeAttendees}`}
              </span>

              <div
                onClick={() => setExpandedLeg((prev) => (prev === 1 ? null : 1))}
                className={`living-driver-pill ${expandedLeg === 1 ? 'bg-amber-50 border-amber-400 text-amber-900' : ''}`}
              >
                <div className="w-2 h-2 rounded-full bg-amber-600" />
                <span>Driver: <strong>{driverLeg1}</strong></span>
                <ChevronDown size={12} className={`text-slate-400 ${expandedLeg === 1 ? 'rotate-180 transition-transform' : ''}`} />
              </div>

              {expandedLeg === 1 && (
                <div className="living-inline-drawer">
                  <div className="living-inline-drawer-header">
                    <span>Select Driver</span>
                    <button
                      type="button"
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
                            onAssignDriver(1, drv.name, true)
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

          {/* Step 2: Middle Venue Node (Stay) */}
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-white border-2 border-amber-400 flex items-center justify-center text-amber-700 shrink-0 shadow-sm">
              <MapPin size={15} />
            </div>
            <div className="flex-1 bg-slate-50 border border-slate-200 rounded-xl p-3 flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-slate-900">{venue.name}</span>
                <span className="font-mono text-xs font-bold text-slate-900">
                  {staySpanLabel}
                </span>
              </div>
              <span className="text-xs text-slate-900 font-semibold flex items-center gap-1">
                <Coffee size={13} className="text-amber-700 shrink-0" />
                <span>
                  {driverLeg1} stays on site with {activeAttendees} {isMultiDayStay
                    ? `(${stayNightsCount} night${stayNightsCount > 1 ? 's' : ''} · ${Math.round(durationMinutes / 60)}h stay)`
                    : `(${Math.round(durationMinutes / 60)}h ${durationMinutes % 60}m)`}
                </span>
              </span>
            </div>
          </div>

          {/* Step 3: Return Home Together */}
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-slate-900 border-2 border-slate-900 flex items-center justify-center text-white shrink-0 shadow-sm">
              <House size={15} />
            </div>
            <div className="flex-1 bg-slate-50 border border-slate-200 rounded-xl p-3 flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-slate-900">Return Home Together</span>
                <span className="font-mono text-xs font-bold text-slate-900">{formattedReturn} Arrival</span>
              </div>
              <span className="text-xs text-slate-500">
                {venue.driveMinutes > 0
                  ? `${venue.driveMinutes} min return drive · ${driverLeg1} driving`
                  : `Calculating return route… · ${driverLeg1} driving`}
              </span>
            </div>
          </div>
        </>
      )}

      {/* ══════ MODE: TWO-WAY (DROP & PICK) ══════ */}
      {activeMode === 'two_way' && (
        <>
          {/* Step 1: Leg 1 Drop Off Drive */}
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-slate-900 border-2 border-slate-900 flex items-center justify-center text-white shrink-0 shadow-sm">
              <House size={15} />
            </div>
            <div className="flex-1 bg-slate-50 border border-slate-200 rounded-xl p-3 flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-slate-900">Leg 1: Drop Off Drive</span>
                <span className="font-mono text-xs font-bold text-slate-900">{formattedDepart}</span>
              </div>
              <span className="text-xs text-slate-500">
                {venue.driveMinutes > 0
                  ? `${venue.driveMinutes} min drive · ${venue.distanceMiles} miles · ${driverLeg1} driving ${activeAttendees}`
                  : `Calculating route… · ${driverLeg1} driving ${activeAttendees}`}
              </span>

              <div
                onClick={() => setExpandedLeg((prev) => (prev === 1 ? null : 1))}
                className={`living-driver-pill ${expandedLeg === 1 ? 'bg-amber-50 border-amber-400 text-amber-900' : ''}`}
              >
                <div className="w-2 h-2 rounded-full bg-amber-600" />
                <span>Drop Driver: <strong>{driverLeg1}</strong></span>
                <ChevronDown size={12} className={`text-slate-400 ${expandedLeg === 1 ? 'rotate-180 transition-transform' : ''}`} />
              </div>

              {expandedLeg === 1 && (
                <div className="living-inline-drawer">
                  <div className="living-inline-drawer-header">
                    <span>Select Driver (Leg 1 Drop-off)</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setExpandedLeg(null)}
                      className="h-6 px-2 text-xs text-slate-500 hover:text-slate-900 font-bold flex items-center gap-0.5"
                    >
                      <span>Done</span>
                      <X size={13} />
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {DRIVER_OPTIONS.map((drv) => {
                      const isSelected = driverLeg1 === drv.name
                      return (
                        <div
                          key={drv.name}
                          onClick={() => {
                            onAssignDriver(1, drv.name, false)
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
                <span className="text-sm font-bold text-slate-900">{venue.name}</span>
                <span className="font-mono text-xs font-bold text-slate-900">
                  {formattedArrive} – {formattedStayEnd}
                </span>
              </div>
              <span className="text-xs text-slate-900 font-semibold flex items-center gap-1">
                <Clock size={13} className="text-slate-600 shrink-0" />
                <span>Kids at venue · Pickup scheduled at {formattedStayEnd}</span>
              </span>
            </div>
          </div>

          {/* Step 3: Leg 2 Return Pickup Drive */}
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-slate-900 border-2 border-slate-900 flex items-center justify-center text-white shrink-0 shadow-sm">
              <House size={15} />
            </div>
            <div className="flex-1 bg-slate-50 border border-slate-200 rounded-xl p-3 flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-slate-900">Leg 2: Return Pickup Drive</span>
                <span className="font-mono text-xs font-bold text-slate-900">{formattedReturn} Arrival</span>
              </div>
              <span className="text-xs text-slate-500">
                {venue.driveMinutes > 0
                  ? `${venue.driveMinutes} min return drive · ${driverLeg2} driving`
                  : `Calculating return route… · ${driverLeg2} driving`}
              </span>

              <div
                onClick={() => setExpandedLeg((prev) => (prev === 2 ? null : 2))}
                className={`living-driver-pill ${expandedLeg === 2 ? 'bg-amber-50 border-amber-400 text-amber-900' : ''}`}
              >
                <div className="w-2 h-2 rounded-full bg-amber-600" />
                <span>Pickup Driver: <strong>{driverLeg2}</strong></span>
                <ChevronDown size={12} className={`text-slate-400 ${expandedLeg === 2 ? 'rotate-180 transition-transform' : ''}`} />
              </div>

              {expandedLeg === 2 && (
                <div className="living-inline-drawer">
                  <div className="living-inline-drawer-header">
                    <span>Select Driver (Leg 2 Pickup)</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setExpandedLeg(null)}
                      className="h-6 px-2 text-xs text-slate-500 hover:text-slate-900 font-bold flex items-center gap-0.5"
                    >
                      <span>Done</span>
                      <X size={13} />
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {DRIVER_OPTIONS.map((drv) => {
                      const isSelected = driverLeg2 === drv.name
                      return (
                        <div
                          key={drv.name}
                          onClick={() => {
                            onAssignDriver(2, drv.name, false)
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
        </>
      )}
    </div>
  )
}
