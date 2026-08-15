import { useState } from 'react'
import { MapPin, X, Search, ShoppingBag, Target, Trees, GraduationCap } from 'lucide-react'
import type { VenueInfo } from '../types'
import { useSavedPlaces, savedPlaceAddress } from '../../../../hooks/useSavedPlaces'

interface DestinationPopoverProps {
  currentVenue: VenueInfo
  onSelectVenue: (venue: VenueInfo) => void
  onClose: () => void
}

const DEFAULT_FAVORITES = [
  {
    name: 'The Gardens Mall',
    address: '3101 PGA Blvd, Palm Beach Gardens, FL 33410',
    driveMinutes: 0,
    distanceMiles: 0,
    icon: ShoppingBag
  },
  {
    name: 'Target on PGA',
    address: '5900 PGA Blvd, Palm Beach Gardens, FL 33418',
    driveMinutes: 0,
    distanceMiles: 0,
    icon: Target
  },
  {
    name: 'Jupiter Community Park',
    address: '3377 Church St, Jupiter, FL 33458',
    driveMinutes: 0,
    distanceMiles: 0,
    icon: Trees
  },
  {
    name: 'The Benjamin School',
    address: '11000 Ellison Wilson Rd, North Palm Beach, FL 33408',
    driveMinutes: 0,
    distanceMiles: 0,
    icon: GraduationCap
  }
]

export default function DestinationPopover({
  currentVenue,
  onSelectVenue,
  onClose
}: DestinationPopoverProps) {
  const [searchTerm, setSearchTerm] = useState(currentVenue.name)
  const { data: savedPlaces = [] } = useSavedPlaces()

  const favorites = savedPlaces.length > 0
    ? savedPlaces.map(p => ({
        name: p.name,
        address: savedPlaceAddress(p) || p.address || '',
        driveMinutes: 0,
        distanceMiles: 0,
        icon: MapPin
      }))
    : DEFAULT_FAVORITES

  const filteredPlaces = favorites.filter(p => 
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.address.toLowerCase().includes(searchTerm.toLowerCase())
  )

  return (
    <div 
      className="living-floating-card living-destination-popover"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Title Row */}
      <div className="living-card-title-row">
        <span className="living-card-heading">
          <MapPin size={16} className="text-slate-700" />
          <span>Change Destination & Address</span>
        </span>
        <button
          onClick={onClose}
          className="living-card-close-btn"
          aria-label="Close destination popover"
        >
          <X size={16} />
        </button>
      </div>

      {/* Search Field */}
      <div className="flex items-center gap-2.5 bg-slate-50 border-2 border-amber-400 p-2.5 rounded-xl">
        <Search size={16} className="text-slate-500" />
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Search address, mall, school, park…"
          className="flex-1 bg-transparent border-none text-sm font-semibold text-slate-900 outline-none"
        />
        {searchTerm && (
          <button
            onClick={() => setSearchTerm('')}
            className="text-xs text-slate-400 hover:text-slate-700"
            aria-label="Clear destination search"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* Frequent Household Places */}
      <div>
        <div className="text-xs font-bold text-slate-500 uppercase mb-2 tracking-wider">
          Frequent Household Places
        </div>
        <div className="flex flex-col gap-2">
          {(filteredPlaces.length > 0 ? filteredPlaces : DEFAULT_FAVORITES).map((place) => {
            const isSelected = currentVenue.name.toLowerCase() === place.name.toLowerCase()
            const IconComp = place.icon
            return (
              <div
                key={place.name}
                onClick={() => {
                  onSelectVenue({
                    name: place.name,
                    address: place.address,
                    driveMinutes: place.driveMinutes,
                    distanceMiles: place.distanceMiles,
                    icon: ''
                  })
                  onClose()
                }}
                className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-all ${
                  isSelected
                    ? 'bg-amber-50 border-amber-400 shadow-sm -translate-y-0.5'
                    : 'bg-slate-50 border-slate-200 hover:border-amber-400 hover:bg-amber-50/50'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-700 shrink-0">
                    <IconComp size={16} />
                  </div>
                  <div className="min-w-0 truncate">
                    <div className="text-sm font-bold text-slate-900 truncate">{place.name}</div>
                    <div className="text-xs text-slate-500 mt-0.5 truncate">{place.address}</div>
                  </div>
                </div>
                {place.driveMinutes > 0 && (
                  <div className="font-mono text-xs font-bold text-emerald-600 shrink-0 ml-2">
                    {place.driveMinutes}m drive
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

