import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Loader2, MapPin, Search, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { savedPlaceAddress, useSavedPlaces } from '../../hooks/useSavedPlaces'
import type { TransportationPlace } from '../../lib/eventTransportation'
import { Button, IconButton, Input } from '../ui'

interface PlaceSuggestion extends TransportationPlace {
  id: string
  source: 'saved' | 'google'
  aliases?: string[]
}

interface GooglePlace {
  place_id: string
  name: string
  address: string
  lat?: number | null
  lng?: number | null
}

interface SmartPlaceInputProps {
  value: TransportationPlace
  field: 'name' | 'address'
  label: string
  placeholder: string
  autoFocus?: boolean
  extraPlaces?: TransportationPlace[]
  onClear?: () => void
  onChange: (place: TransportationPlace) => void
}

function matchesQuery(place: PlaceSuggestion, query: string): boolean {
  const needle = query.trim().toLowerCase()
  if (!needle) return true
  return [place.name, place.address, ...(place.aliases ?? [])]
    .some((part) => part.toLowerCase().includes(needle))
}

export default function SmartPlaceInput({
  value,
  field,
  label,
  placeholder,
  autoFocus = false,
  extraPlaces = [],
  onClear,
  onChange,
}: SmartPlaceInputProps) {
  const listboxId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const requestIdRef = useRef(0)
  const [focused, setFocused] = useState(false)
  const [googlePlaces, setGooglePlaces] = useState<GooglePlace[]>([])
  const [googleQuery, setGoogleQuery] = useState('')
  const [loadingGoogle, setLoadingGoogle] = useState(false)
  const [lookupError, setLookupError] = useState<string | null>(null)
  const [activeIndex, setActiveIndex] = useState(-1)
  const { data: savedPlaces = [] } = useSavedPlaces()
  const query = value[field]
  const normalizedQuery = query.trim()
  const shouldSearchGoogle = focused && normalizedQuery.length >= 3

  const savedSuggestions = useMemo<PlaceSuggestion[]>(() => {
    const merged: PlaceSuggestion[] = [
      ...extraPlaces.map((place, index) => ({
        ...place,
        id: `extra-${index}-${place.name}-${place.address}`,
        source: 'saved' as const,
      })),
      ...savedPlaces.map((place) => ({
        name: place.name,
        address: savedPlaceAddress(place),
        id: place.id,
        source: 'saved' as const,
        lat: place.lat,
        lng: place.lng,
        aliases: place.aliases,
      })),
    ]
    const unique = new Map<string, PlaceSuggestion>()
    merged.forEach((place) => {
      const key = `${place.name.trim().toLowerCase()}|${place.address.trim().toLowerCase()}`
      if (!unique.has(key)) unique.set(key, place)
    })
    return [...unique.values()].filter((place) => matchesQuery(place, query)).slice(0, 5)
  }, [extraPlaces, query, savedPlaces])

  useEffect(() => {
    const search = normalizedQuery
    if (!shouldSearchGoogle) {
      requestIdRef.current += 1
      return
    }
    const requestId = ++requestIdRef.current
    const timer = window.setTimeout(async () => {
      setLoadingGoogle(true)
      setLookupError(null)
      const { data, error } = await supabase.functions.invoke('place-search', {
        body: { query: search },
      })
      if (requestId !== requestIdRef.current) return
      setLoadingGoogle(false)
      if (error) {
        setGooglePlaces([])
        setGoogleQuery(search)
        setLookupError('Google address lookup is temporarily unavailable.')
        return
      }
      const results = (data as { places?: GooglePlace[] } | null)?.places
      setGooglePlaces(Array.isArray(results) ? results : [])
      setGoogleQuery(search)
    }, 350)
    return () => window.clearTimeout(timer)
  }, [normalizedQuery, shouldSearchGoogle])

  useEffect(() => {
    if (!focused) return
    const close = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setFocused(false)
    }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [focused])

  const suggestions = useMemo<PlaceSuggestion[]>(() => {
    const seen = new Set(savedSuggestions.map((place) =>
      `${place.name.trim().toLowerCase()}|${place.address.trim().toLowerCase()}`))
    const activeGooglePlaces = shouldSearchGoogle && googleQuery === normalizedQuery ? googlePlaces : []
    const googleSuggestions = activeGooglePlaces.flatMap((place): PlaceSuggestion[] => {
      const suggestion = {
        id: place.place_id,
        name: place.name,
        address: place.address,
        source: 'google' as const,
        placeId: place.place_id,
        lat: place.lat ?? null,
        lng: place.lng ?? null,
      }
      const key = `${suggestion.name.trim().toLowerCase()}|${suggestion.address.trim().toLowerCase()}`
      return seen.has(key) ? [] : [suggestion]
    })
    return [...savedSuggestions, ...googleSuggestions].slice(0, 8)
  }, [googlePlaces, googleQuery, normalizedQuery, savedSuggestions, shouldSearchGoogle])

  const choose = (suggestion: PlaceSuggestion) => {
    onChange({
      name: suggestion.name,
      address: suggestion.address,
      source: suggestion.source,
      placeId: suggestion.placeId,
      lat: suggestion.lat,
      lng: suggestion.lng,
      ...(value.kind ? { kind: value.kind } : {}),
    })
    setFocused(false)
    setActiveIndex(-1)
  }

  const showResults = focused && (
    suggestions.length > 0
    || (shouldSearchGoogle && loadingGoogle)
    || (googleQuery === normalizedQuery && Boolean(lookupError))
    || Boolean(query.trim())
  )

  return (
    <div ref={rootRef} className="relative">
      <Input
        autoFocus={autoFocus}
        value={query}
        aria-label={label}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={showResults}
        aria-controls={listboxId}
        aria-activedescendant={activeIndex >= 0 ? `${listboxId}-${activeIndex}` : undefined}
        placeholder={placeholder}
        className="pr-control"
        onFocus={() => setFocused(true)}
        onChange={(event) => {
          onChange({
            ...value,
            [field]: event.target.value,
            source: 'manual',
            placeId: undefined,
            lat: null,
            lng: null,
          })
          setFocused(true)
          setActiveIndex(-1)
        }}
        onKeyDown={(event) => {
          if (!showResults || suggestions.length === 0) return
          if (event.key === 'ArrowDown') {
            event.preventDefault()
            setActiveIndex((index) => Math.min(index + 1, suggestions.length - 1))
          } else if (event.key === 'ArrowUp') {
            event.preventDefault()
            setActiveIndex((index) => Math.max(index - 1, 0))
          } else if (event.key === 'Enter' && activeIndex >= 0) {
            event.preventDefault()
            choose(suggestions[activeIndex])
          } else if (event.key === 'Escape') {
            setFocused(false)
          }
        }}
      />
      {query && onClear ? (
        <IconButton
          icon={<X size={15} />}
          aria-label={`Clear ${label.toLowerCase()}`}
          variant="ghost"
          size="sm"
          className="absolute right-1 top-1/2 -translate-y-1/2"
          onPointerDown={(event) => event.preventDefault()}
          onClick={onClear}
        />
      ) : (
        <Search size={17} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-casa-muted" />
      )}
      {showResults && (
        <div
          id={listboxId}
          role="listbox"
          aria-label={`${label} suggestions`}
          className="absolute left-0 right-0 top-[calc(100%+6px)] z-popover max-h-72 overflow-y-auto overscroll-contain rounded-card border border-casa-border bg-casa-surface p-1.5 shadow-modal"
        >
          {query.trim() && savedSuggestions.length === 0 && (
            <p className="px-3 py-2 text-caption text-casa-muted">
              No saved match · choose a Google result or keep this as a new place.
            </p>
          )}
          {suggestions.map((suggestion, index) => (
            <Button
              key={`${suggestion.source}-${suggestion.id}`}
              id={`${listboxId}-${index}`}
              role="option"
              aria-selected={index === activeIndex}
              variant="ghost"
              fullWidth
              align="start"
              className="min-h-control rounded-button px-3 text-left"
              onPointerDown={(event) => event.preventDefault()}
              onClick={() => choose(suggestion)}
            >
              <MapPin size={16} className="shrink-0 text-casa-gold" />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="truncate text-body-sm font-semibold text-casa-navy">{suggestion.name}</span>
                  <span className="shrink-0 rounded-pill bg-casa-bg px-2 py-0.5 text-caption font-semibold uppercase text-casa-muted">
                    {suggestion.source === 'saved' ? 'Saved' : 'Google'}
                  </span>
                </span>
                {suggestion.address && (
                  <span className="mt-0.5 block truncate text-caption text-casa-muted">{suggestion.address}</span>
                )}
              </span>
            </Button>
          ))}
          {shouldSearchGoogle && loadingGoogle && (
            <p className="flex min-h-control items-center gap-2 px-3 text-caption text-casa-muted">
              <Loader2 size={15} className="animate-spin" /> Finding addresses…
            </p>
          )}
          {googleQuery === normalizedQuery && lookupError && (
            <p role="alert" className="px-3 py-2 text-caption text-casa-error">{lookupError}</p>
          )}
        </div>
      )}
    </div>
  )
}
