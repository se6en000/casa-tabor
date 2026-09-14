import { useState, useEffect, useRef, useMemo } from 'react'
import { MapPin, Pencil, Search, X, Loader2, Star, Compass, Plus } from 'lucide-react'
import type { VenueInfo } from '../types'
import { supabase } from '../../../../lib/supabase'
import { useSavedPlaces, savedPlaceAddress } from '../../../../hooks/useSavedPlaces'
import {
  DEFAULT_HOUSEHOLD_COORDINATES,
  computeDistanceMiles,
  formatDistanceMiles,
  type GeoCoordinates,
} from '../../../../utils/geoDistance'

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
  distanceText?: string | null
}

const DEFAULT_HOUSEHOLD_PLACES: VenueInfo[] = [
  {
    name: 'The Gardens Mall',
    address: '3101 PGA Blvd, Palm Beach Gardens, FL 33410',
    driveMinutes: 0,
    distanceMiles: 0,
  },
  {
    name: 'Target on PGA',
    address: '5900 PGA Blvd, Palm Beach Gardens, FL 33418',
    driveMinutes: 0,
    distanceMiles: 0,
  },
  {
    name: 'Jupiter Community Park',
    address: '3377 Church St, Jupiter, FL 33458',
    driveMinutes: 0,
    distanceMiles: 0,
  },
  {
    name: 'The Benjamin School',
    address: '11000 Ellison Wilson Rd, North Palm Beach, FL 33408',
    driveMinutes: 0,
    distanceMiles: 0,
  },
]

export default function LivingVenueCard({
  venue,
  onSelectVenue,
}: LivingVenueCardProps) {
  const [isChanging, setIsChanging] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [googleResults, setGoogleResults] = useState<GooglePlaceItem[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [userCoords, setUserCoords] = useState<GeoCoordinates>(DEFAULT_HOUSEHOLD_COORDINATES)
  const requestIdRef = useRef(0)

  const { data: savedPlaces = [] } = useSavedPlaces()

  // Dynamic Geolocation: Prioritizes live mobile/device GPS, falling back to household home anchor
  useEffect(() => {
    const home = savedPlaces.find(
      (p) => p.name.toLowerCase().includes('home') && p.lat && p.lng,
    )
    if (home?.lat && home?.lng) {
      setUserCoords({ lat: home.lat, lng: home.lng })
    }

    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      // Live watch/get position for mobile devices on the go (e.g. Royal Palm Beach, Wellington, etc.)
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setUserCoords({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
          })
        },
        () => {
          if (home?.lat && home?.lng) {
            setUserCoords({ lat: home.lat, lng: home.lng })
          }
        },
        { enableHighAccuracy: true, timeout: 5000 },
      )
    }
  }, [savedPlaces])

  // Build list of saved household favorites with computed proximity
  const householdFavorites = useMemo(() => {
    if (savedPlaces.length > 0) {
      return savedPlaces.map((p) => {
        const dist =
          p.lat && p.lng
            ? computeDistanceMiles(userCoords.lat, userCoords.lng, p.lat, p.lng)
            : null
        return {
          name: p.name,
          address: savedPlaceAddress(p) || p.address || '',
          driveMinutes: 0,
          distanceMiles: dist ?? 0,
          formattedDistance: formatDistanceMiles(dist),
          lat: p.lat,
          lng: p.lng,
        }
      })
    }
    return DEFAULT_HOUSEHOLD_PLACES.map((p) => ({
      ...p,
      formattedDistance: null as string | null,
      lat: null as number | null,
      lng: null as number | null,
    }))
  }, [savedPlaces, userCoords])

  const searchInputRef = useRef<HTMLInputElement>(null)

  // Context-aware pre-fill: load the current place name or street address into the search bar
  const handleOpenChange = () => {
    const nextState = !isChanging
    setIsChanging(nextState)
    if (nextState) {
      const isGenericName = !venue.name || ['unset', 'new event', 'destination', 'home'].includes(venue.name.trim().toLowerCase())
      if (!isGenericName && venue.name) {
        setSearchTerm(venue.name)
      } else {
        setSearchTerm(venue.address || '')
      }
      setTimeout(() => {
        if (searchInputRef.current) {
          searchInputRef.current.focus()
          searchInputRef.current.select()
        }
      }, 50)
    } else {
      setSearchTerm('')
    }
  }

  // Debounced live Google Places search dynamically restricted to active device/household coordinates
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
          body: {
            query: trimmed,
            lat: userCoords.lat,
            lng: userCoords.lng,
          },
        })

        if (requestId !== requestIdRef.current) return
        setIsLoading(false)

        if (error) {
          console.warn('[LivingVenueCard] Place search error:', error)
          setGoogleResults([])
          return
        }

        const places = (data as { places?: GooglePlaceItem[] } | null)?.places
        if (Array.isArray(places)) {
          const withDistances = places.map((item) => {
            if (item.lat && item.lng) {
              const dist = computeDistanceMiles(
                userCoords.lat,
                userCoords.lng,
                item.lat,
                item.lng,
              )
              return {
                ...item,
                distanceMiles: dist,
                distanceText: formatDistanceMiles(dist),
              }
            }
            return {
              ...item,
              distanceMiles: 99999,
              distanceText: null,
            }
          })
          withDistances.sort((a, b) => (a.distanceMiles ?? 99999) - (b.distanceMiles ?? 99999))
          setGoogleResults(withDistances)
        } else {
          setGoogleResults([])
        }
      } catch {
        if (requestId === requestIdRef.current) {
          setIsLoading(false)
          setGoogleResults([])
        }
      }
    }, 300)

    return () => window.clearTimeout(timer)
  }, [searchTerm, isChanging, userCoords])

  // Filter household places locally
  const filteredHousehold = householdFavorites.filter((p) => {
    const needle = searchTerm.toLowerCase().trim()
    if (!needle) return true
    return (
      p.name.toLowerCase().includes(needle) ||
      p.address.toLowerCase().includes(needle)
    )
  })

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

  const handleSelectHouseholdPlace = (place: { name: string; address: string; driveMinutes: number; distanceMiles: number }) => {
    onSelectVenue({
      name: place.name,
      address: place.address,
      driveMinutes: place.driveMinutes,
      distanceMiles: place.distanceMiles,
    })
    setIsChanging(false)
    setSearchTerm('')
  }

  const handleSelectCustom = () => {
    if (!searchTerm.trim()) return
    onSelectVenue({
      name: searchTerm.trim(),
      address: searchTerm.trim(),
      driveMinutes: 0,
      distanceMiles: 0,
    })
    setIsChanging(false)
    setSearchTerm('')
  }

  const hasAddress = Boolean(venue.address && venue.address.trim())
  const hasSavedMatches = filteredHousehold.length > 0

  return (
    <div className={`living-venue-card ${isChanging ? 'border-amber-400 dark:border-amber-600 shadow-md' : ''}`}>
      {/* Top Header Row */}
      <div className="flex items-center justify-between">
        <div className="min-w-0 flex-1 mr-2">
          <div className="text-base font-bold text-slate-900 dark:text-slate-300 truncate">
            {venue.name}
          </div>
          <div className="text-xs text-slate-500 mt-0.5 truncate">
            {venue.address || 'No street address set'}
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {hasAddress ? (
            <span className="bg-emerald-50 dark:bg-emerald-950/20 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700 text-xs font-bold py-1 px-2.5 rounded-xl inline-flex items-center gap-1">
              <MapPin size={12} className="text-emerald-700 dark:text-emerald-400" />
              <span>Mapped</span>
            </span>
          ) : (
            <span className="bg-amber-50 dark:bg-amber-950/20 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-700 text-xs font-bold py-1 px-2.5 rounded-xl inline-flex items-center gap-1">
              <Compass size={12} className="text-amber-700 dark:text-amber-400" />
              <span>Address Needed</span>
            </span>
          )}
          <button
            type="button"
            aria-label={isChanging ? 'Done changing location' : 'Change location'}
            onClick={handleOpenChange}
            className={`text-xs font-bold py-1 px-2.5 rounded-xl border transition-all inline-flex items-center gap-1 min-h-[32px] ${
              isChanging
                ? 'bg-slate-900 text-white border-slate-900'
                : 'bg-white dark:bg-casa-surface text-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-800/50 hover:border-amber-400 hover:dark:border-amber-600'
            }`}
          >
            <Pencil size={12} className={isChanging ? 'text-white' : 'text-slate-600 dark:text-slate-400'} />
            <span>{isChanging ? 'Done' : 'Change'}</span>
          </button>
        </div>
      </div>

      {/* ══════ INLINE LOCALIZED PLACE SEARCH DRAWER (CONCEPT A) ══════ */}
      {isChanging && (
        <div className="living-inline-drawer flex flex-col gap-3 pt-1">
          {/* Search Box with Proximity Cue and Live Indicator */}
          <div className="flex items-center gap-2 bg-white dark:bg-casa-surface border-2 border-amber-400 dark:border-amber-600 p-2.5 rounded-xl shadow-inner min-h-[48px]">
            {isLoading ? (
              <Loader2 size={16} className="text-amber-600 dark:text-amber-400 animate-spin shrink-0" />
            ) : (
              <Search size={16} className="text-slate-500 shrink-0" />
            )}
            <input
              ref={searchInputRef}
              type="text"
              autoFocus
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search places or addresses nearby…"
              className="flex-1 bg-transparent border-none text-xs sm:text-sm font-semibold text-slate-900 dark:text-slate-300 outline-none placeholder:text-slate-400"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => {
                  setSearchTerm('')
                  searchInputRef.current?.focus()
                }}
                className="text-slate-400 hover:text-slate-700 hover:dark:text-slate-400 hover:bg-slate-100 hover:dark:bg-slate-900/50 active:bg-slate-200 active:dark:bg-slate-900/80 p-1 min-w-[36px] min-h-[36px] flex items-center justify-center rounded-lg transition-colors cursor-pointer"
                aria-label="Clear destination search query"
              >
                <X size={16} />
              </button>
            )}
          </div>

          {/* ══════ PRIORITY 1: SAVED & HOUSEHOLD SHORTCUTS ══════ */}
          {hasSavedMatches && (
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-extrabold uppercase text-slate-500 tracking-wider flex items-center gap-1">
                <Star size={12} className="text-amber-600 dark:text-amber-400 fill-amber-500" />
                <span>{searchTerm.trim() ? 'Matching Saved Places' : 'Household Shortcuts'}</span>
              </span>
              {filteredHousehold.slice(0, searchTerm.trim() ? 5 : 4).map((place) => {
                const isSelected = venue.name.toLowerCase() === place.name.toLowerCase()
                return (
                  <button
                    type="button"
                    key={place.name}
                    onClick={() => handleSelectHouseholdPlace(place)}
                    aria-label={`Select saved place ${place.name}`}
                    className={`flex items-center justify-between p-2.5 rounded-xl border text-left cursor-pointer transition-all min-h-[48px] w-full ${
                      isSelected
                        ? 'bg-amber-50/80 dark:bg-amber-950/20 border-amber-400 dark:border-amber-600 shadow-sm'
                        : 'bg-white dark:bg-casa-surface border-slate-200 dark:border-slate-800/50 hover:border-amber-400 hover:dark:border-amber-600 hover:bg-amber-50/30 hover:dark:bg-amber-950/20'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <div className="w-8 h-8 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/50 flex items-center justify-center text-amber-600 dark:text-amber-400 shrink-0">
                        <Star size={14} className="fill-amber-500" />
                      </div>
                      <div className="min-w-0 flex-1 truncate">
                        <div className="text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-300 truncate">
                          {place.name}
                        </div>
                        <div className="text-xs text-slate-500 truncate">
                          {place.address}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0 ml-2">
                      {place.formattedDistance && (
                        <span className="text-xs font-bold text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800/50 py-0.5 px-2 rounded-lg">
                          {place.formattedDistance}
                        </span>
                      )}
                      <span className="text-xs font-bold text-amber-800 dark:text-amber-300 bg-amber-100 dark:bg-amber-900/50 border border-amber-300 dark:border-amber-700 py-0.5 px-2 rounded-lg">
                        Saved
                      </span>
                    </div>
                  </button>
                )
              })}
            </div>
          )}

          {/* ══════ PRIORITY 2: LOCALIZED GOOGLE PLACES RESULTS ══════ */}
          {googleResults.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-extrabold uppercase text-slate-500 tracking-wider flex items-center gap-1">
                <MapPin size={12} className="text-amber-600 dark:text-amber-400" />
                <span>Nearby Google Places</span>
              </span>
              {googleResults.map((item) => (
                <button
                  type="button"
                  key={item.place_id}
                  onClick={() => handleSelectGooglePlace(item)}
                  aria-label={`Select place ${item.name}`}
                  className="flex items-center justify-between p-2.5 rounded-xl border border-slate-200 dark:border-slate-800/50 bg-white dark:bg-casa-surface hover:border-amber-400 hover:dark:border-amber-600 hover:bg-amber-50/40 hover:dark:bg-amber-950/20 text-left cursor-pointer transition-all shadow-sm min-h-[48px] w-full"
                >
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <div className="w-8 h-8 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/50 flex items-center justify-center text-amber-700 dark:text-amber-400 shrink-0">
                      <MapPin size={15} />
                    </div>
                    <div className="min-w-0 flex-1 truncate">
                      <div className="text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-300 truncate">
                        {item.name}
                      </div>
                      <div className="text-xs text-slate-500 truncate">
                        {item.address}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0 ml-2">
                    {item.distanceText && (
                      <span className="text-xs font-bold text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800/50 py-0.5 px-2 rounded-lg">
                        {item.distanceText}
                      </span>
                    )}
                    <span className="text-xs font-bold text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/50 py-0.5 px-2 rounded-lg">
                      Select
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* ══════ PRIORITY 3: CUSTOM RAW VALUE FALLBACK ══════ */}
          {searchTerm.trim().length >= 2 && !isLoading && (
            <button
              type="button"
              onClick={handleSelectCustom}
              aria-label={`Use ${searchTerm.trim()} as custom location`}
              className="flex items-center gap-2.5 p-2.5 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-950/20 hover:bg-amber-50/50 hover:dark:bg-amber-950/20 hover:border-amber-300 hover:dark:border-amber-700 text-left transition-all min-h-[44px] w-full mt-1"
            >
              <div className="w-7 h-7 rounded-lg bg-slate-200/70 dark:bg-slate-900/80 flex items-center justify-center text-slate-600 dark:text-slate-400 shrink-0">
                <Plus size={14} />
              </div>
              <div className="min-w-0 flex-1">
                <span className="text-xs text-slate-600 dark:text-slate-400">Use </span>
                <span className="text-xs font-bold text-slate-900 dark:text-slate-300">"{searchTerm.trim()}"</span>
                <span className="text-xs text-slate-600 dark:text-slate-400"> as custom address</span>
              </div>
            </button>
          )}
        </div>
      )}
    </div>
  )
}
