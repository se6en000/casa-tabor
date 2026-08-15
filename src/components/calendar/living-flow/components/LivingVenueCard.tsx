import { useState, useEffect, useRef } from 'react'
import { MapPin, Pencil, Navigation, Compass, Search, X, Loader2, Star } from 'lucide-react'
import type { VenueInfo } from '../types'
import { supabase } from '../../../../lib/supabase'
import { useSavedPlaces, savedPlaceAddress } from '../../../../hooks/useSavedPlaces'

interface LivingVenueCardProps {
  venue: VenueInfo
  onSelectVenue: (venue: VenueInfo) => void
}

interface GooglePlaceItem {
  place_id: string
  name: string
  address: string
  lat?: number | null
  lng?: number | null
}

const DEFAULT_HOUSEHOLD_PLACES: VenueInfo[] = [
  {
    name: 'The Gardens Mall',
    address: '3101 PGA Blvd, Palm Beach Gardens, FL 33410',
    driveMinutes: 0,
    distanceMiles: 0
  },
  {
    name: 'Target on PGA',
    address: '5900 PGA Blvd, Palm Beach Gardens, FL 33418',
    driveMinutes: 0,
    distanceMiles: 0
  },
  {
    name: 'Jupiter Community Park',
    address: '3377 Church St, Jupiter, FL 33458',
    driveMinutes: 0,
    distanceMiles: 0
  },
  {
    name: 'The Benjamin School',
    address: '11000 Ellison Wilson Rd, North Palm Beach, FL 33408',
    driveMinutes: 0,
    distanceMiles: 0
  }
]

export default function LivingVenueCard({
  venue,
  onSelectVenue
}: LivingVenueCardProps) {
  const [isChanging, setIsChanging] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [googleResults, setGoogleResults] = useState<GooglePlaceItem[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const requestIdRef = useRef(0)

  const { data: savedPlaces = [] } = useSavedPlaces()

  // Build list of saved household favorites
  const householdFavorites: VenueInfo[] = savedPlaces.length > 0
    ? savedPlaces.map(p => ({
        name: p.name,
        address: savedPlaceAddress(p) || p.address || '',
        driveMinutes: 0,
        distanceMiles: 0
      }))
    : DEFAULT_HOUSEHOLD_PLACES

  // Debounced live Google Places search
  useEffect(() => {
    const trimmed = searchTerm.trim()
    if (!isChanging || trimmed.length < 2) {
      setGoogleResults([])
      setIsLoading(false)
      return
    }

    const requestId = ++requestIdRef.current
    setIsLoading(true)

    const timer = window.setTimeout(async () => {
      try {
        const { data, error } = await supabase.functions.invoke('place-search', {
          body: { query: trimmed }
        })

        if (requestId !== requestIdRef.current) return
        setIsLoading(false)

        if (error) {
          console.warn('[LivingVenueCard] Place search error:', error)
          setGoogleResults([])
          return
        }

        const places = (data as { places?: GooglePlaceItem[] } | null)?.places
        setGoogleResults(Array.isArray(places) ? places : [])
      } catch (err) {
        if (requestId === requestIdRef.current) {
          setIsLoading(false)
          setGoogleResults([])
        }
      }
    }, 300)

    return () => window.clearTimeout(timer)
  }, [searchTerm, isChanging])

  const openAppleMaps = (e: React.MouseEvent) => {
    e.stopPropagation()
    const query = encodeURIComponent(venue.address || venue.name)
    window.open(`http://maps.apple.com/?q=${query}`, '_blank')
  }

  const openGoogleMaps = (e: React.MouseEvent) => {
    e.stopPropagation()
    const query = encodeURIComponent(venue.address || venue.name)
    window.open(`https://www.google.com/maps/search/?api=1&query=${query}`, '_blank')
  }

  // Filter household places locally
  const filteredHousehold = householdFavorites.filter(p =>
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.address.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const handleSelectGooglePlace = (item: GooglePlaceItem) => {
    onSelectVenue({
      name: item.name,
      address: item.address,
      driveMinutes: 0,
      distanceMiles: 0,
    })
    setIsChanging(false)
    setSearchTerm('')
  }

  const handleSelectHouseholdPlace = (place: VenueInfo) => {
    onSelectVenue(place)
    setIsChanging(false)
    setSearchTerm('')
  }

  return (
    <div className={`living-venue-card ${isChanging ? 'border-amber-400 shadow-md' : ''}`}>
      {/* Top Header Row */}
      <div className="flex items-center justify-between">
        <div className="min-w-0 flex-1 mr-2">
          <div className="text-base font-bold text-slate-900 truncate">
            {venue.name}
          </div>
          <div className="text-xs text-slate-500 mt-0.5 truncate">
            {venue.address || 'No street address set'}
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <span className="bg-amber-50 text-amber-800 border border-amber-300 text-xs font-bold py-1 px-2.5 rounded-xl inline-flex items-center gap-1">
            <MapPin size={12} className="text-amber-700" />
            <span>Mapped</span>
          </span>
          <button
            onClick={() => {
              setIsChanging(prev => !prev)
              if (!isChanging) setSearchTerm('')
            }}
            className={`text-xs font-bold py-1 px-2.5 rounded-xl border transition-all inline-flex items-center gap-1 ${
              isChanging
                ? 'bg-slate-900 text-white border-slate-900'
                : 'bg-white text-slate-800 border-slate-200 hover:border-amber-400'
            }`}
          >
            <Pencil size={12} className={isChanging ? 'text-white' : 'text-slate-600'} />
            <span>{isChanging ? 'Done' : 'Change'}</span>
          </button>
        </div>
      </div>

      {/* 1-Tap Maps Launch Buttons */}
      {!isChanging && (
        <div className="flex gap-2 mt-1">
          <button
            onClick={openAppleMaps}
            className="flex-1 bg-amber-50 border border-amber-300 text-amber-900 py-1.5 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 hover:bg-white transition-all shadow-sm"
          >
            <Navigation size={13} className="text-amber-800" />
            <span>Apple Maps</span>
          </button>
          <button
            onClick={openGoogleMaps}
            className="flex-1 bg-white border border-slate-200 text-slate-800 py-1.5 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 hover:border-amber-400 hover:bg-amber-50/50 transition-all shadow-sm"
          >
            <Compass size={13} className="text-slate-700" />
            <span>Google Maps</span>
          </button>
        </div>
      )}

      {/* ══════ INLINE GOOGLE MAPS PLACE SEARCH ══════ */}
      {isChanging && (
        <div className="living-inline-drawer">
          {/* Search Box with Live Indicator */}
          <div className="flex items-center gap-2 bg-white border-2 border-amber-400 p-2 rounded-xl shadow-inner">
            {isLoading ? (
              <Loader2 size={15} className="text-amber-600 animate-spin" />
            ) : (
              <Search size={15} className="text-slate-500" />
            )}
            <input
              type="text"
              autoFocus
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search Google Maps (e.g. Lake Lytal, Target, Benjamin)…"
              className="flex-1 bg-transparent border-none text-xs font-semibold text-slate-900 outline-none placeholder:text-slate-400"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="text-xs text-slate-400 hover:text-slate-700 p-1"
                aria-label="Clear destination search query"
              >
                <X size={13} />
              </button>
            )}
          </div>

          {/* 1. Live Google Places Results */}
          {googleResults.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-extrabold uppercase text-slate-500 tracking-wider flex items-center gap-1">
                <MapPin size={11} className="text-amber-600" />
                <span>Google Places Results</span>
              </span>
              {googleResults.map((item) => (
                <div
                  key={item.place_id}
                  onClick={() => handleSelectGooglePlace(item)}
                  className="flex items-center justify-between p-2.5 rounded-xl border border-slate-200 bg-white hover:border-amber-400 hover:bg-amber-50/40 cursor-pointer transition-all shadow-sm"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-7 h-7 rounded-lg bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-700 shrink-0">
                      <MapPin size={14} />
                    </div>
                    <div className="min-w-0 truncate">
                      <div className="text-xs font-bold text-slate-900 truncate">{item.name}</div>
                      <div className="text-xs text-slate-500 truncate">{item.address}</div>
                    </div>
                  </div>
                  <span className="text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200 py-0.5 px-2 rounded-lg shrink-0 ml-1.5">
                    Select
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* 2. Household Shortcuts */}
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-extrabold uppercase text-slate-500 tracking-wider flex items-center gap-1">
              <Star size={11} className="text-amber-600 fill-amber-500" />
              <span>Household Shortcuts</span>
            </span>
            {filteredHousehold.slice(0, 4).map((place) => {
              const isSelected = venue.name.toLowerCase() === place.name.toLowerCase()
              return (
                <div
                  key={place.name}
                  onClick={() => handleSelectHouseholdPlace(place)}
                  className={`flex items-center justify-between p-2.5 rounded-xl border cursor-pointer transition-all ${
                    isSelected
                      ? 'bg-amber-50 border-amber-400 shadow-sm'
                      : 'bg-white border-slate-200 hover:border-amber-400'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-7 h-7 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-700 shrink-0">
                      <Star size={13} className="text-amber-500" />
                    </div>
                    <div className="min-w-0 truncate">
                      <div className="text-xs font-bold text-slate-900 truncate">{place.name}</div>
                      <div className="text-xs text-slate-500 truncate">{place.address}</div>
                    </div>
                  </div>
                  {place.driveMinutes > 0 ? (
                    <div className="font-mono text-xs font-bold text-emerald-600 shrink-0 ml-1.5">
                      {place.driveMinutes}m
                    </div>
                  ) : (
                    <span className="text-xs font-bold text-slate-600 bg-slate-100 border border-slate-200 py-0.5 px-2 rounded-lg shrink-0 ml-1.5">
                      Select
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
