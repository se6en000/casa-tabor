import { useState } from 'react'
import { Car, X, Coffee, Users, Check, Plus } from 'lucide-react'
import type { TravelBehavior } from '../types'

interface DriverPopoverProps {
  travelBehavior: TravelBehavior
  activeLeg: 1 | 2
  currentDriverLeg1: string
  currentDriverLeg2: string
  onSetTravelBehavior: (behavior: TravelBehavior) => void
  onAssignDriver: (leg: 1 | 2, name: string, syncBoth: boolean) => void
  onClose: () => void
}

const DRIVER_OPTIONS = [
  { name: 'Kelly', role: 'Mom · Primary', initial: 'K', colorClass: 'bg-amber-700' },
  { name: 'Jake', role: 'Dad · Driver', initial: 'J', colorClass: 'bg-slate-900' },
  { name: 'Both Parents', role: 'Ride Together', initial: '👥', colorClass: 'bg-amber-500' },
  { name: 'Giselle', role: 'Caregiver / Nanny', initial: 'G', colorClass: 'bg-purple-700' },
  { name: 'Grandma', role: 'Family Helper', initial: 'S', colorClass: 'bg-orange-600' },
  { name: 'Carpool', role: 'Team / Friend', initial: 'C', colorClass: 'bg-slate-600' }
]

export default function DriverPopover({
  travelBehavior,
  activeLeg,
  currentDriverLeg1,
  currentDriverLeg2,
  onSetTravelBehavior,
  onAssignDriver,
  onClose
}: DriverPopoverProps) {
  const [syncReturn, setSyncReturn] = useState(true)
  const currentSelectedDriver = activeLeg === 1 ? currentDriverLeg1 : currentDriverLeg2

  return (
    <div 
      className="living-floating-card living-driver-popover"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Title Row */}
      <div className="living-card-title-row">
        <span className="living-card-heading">
          <Car size={16} className="text-slate-700" />
          <span>Driver & Travel Mode (Leg {activeLeg})</span>
        </span>
        <button
          onClick={onClose}
          className="living-card-close-btn"
          aria-label="Close driver popover"
        >
          <X size={16} />
        </button>
      </div>

      {/* 1. Travel Behavior Switcher */}
      <div>
        <div className="text-xs font-bold text-slate-500 uppercase mb-1.5 tracking-wider">
          Travel Behavior
        </div>
        <div className="grid grid-cols-2 bg-slate-100 p-1 rounded-xl gap-1">
          <button
            onClick={() => onSetTravelBehavior('stay')}
            className={`py-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
              travelBehavior === 'stay'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            <Coffee size={14} />
            <span>Parent Stays on Site</span>
          </button>
          <button
            onClick={() => onSetTravelBehavior('dropoff')}
            className={`py-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
              travelBehavior === 'dropoff'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            <Car size={14} />
            <span>Drop Off & Pick Up</span>
          </button>
        </div>
      </div>

      {/* 2. Drivers Roster Grid */}
      <div>
        <div className="text-xs font-bold text-slate-500 uppercase mb-1.5 tracking-wider">
          Select Driver
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          {DRIVER_OPTIONS.map((drv) => {
            const isSelected = currentSelectedDriver === drv.name
            return (
              <div
                key={drv.name}
                onClick={() => {
                  onAssignDriver(activeLeg, drv.name, syncReturn)
                  onClose()
                }}
                className={`flex items-center justify-between p-3 rounded-xl cursor-pointer transition-all border ${
                  isSelected
                    ? 'bg-amber-50 border-amber-400 shadow-sm -translate-y-0.5'
                    : 'bg-slate-50 border-slate-200 hover:border-amber-400 hover:bg-amber-50/50'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div
                    className={`w-9 h-9 rounded-full text-white font-bold text-sm flex items-center justify-center shrink-0 shadow-sm ${drv.colorClass}`}
                  >
                    {drv.name === 'Both Parents' ? <Users size={16} /> : drv.initial}
                  </div>
                  <div className="min-w-0 truncate">
                    <div className="text-sm font-bold text-slate-900 leading-tight truncate">
                      {drv.name}
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5 truncate">
                      {drv.role}
                    </div>
                  </div>
                </div>
                <div className="text-sm font-bold shrink-0 ml-1 flex items-center justify-center">
                  {isSelected ? (
                    <Check size={16} className="text-emerald-600 stroke-[2.5]" />
                  ) : (
                    <Plus size={16} className="text-slate-400" />
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Sync Return Trip */}
      <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200 flex items-center justify-between text-xs font-semibold text-slate-900">
        <span>Also assign to Return Pickup</span>
        <input
          type="checkbox"
          checked={syncReturn}
          onChange={(e) => setSyncReturn(e.target.checked)}
          className="w-4 h-4 accent-amber-500 cursor-pointer"
        />
      </div>
    </div>
  )
}
