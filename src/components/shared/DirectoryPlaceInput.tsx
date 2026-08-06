import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Loader2, MapPin, Plus, Search, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { savedPlaceAddress, useSavedPlaces } from '../../hooks/useSavedPlaces'
import { rankDirectorySuggestions, type DirectoryPlaceSelection, type DirectorySuggestionCandidate } from '../../utils/directorySuggestions'
import { Button, IconButton, Input } from '../ui'

interface PlaceSuggestion extends DirectorySuggestionCandidate {
  address: string
}

interface GooglePlace {
  place_id: string
  name: string
  address: string
  lat?: number | null
  lng?: number | null
}

interface DirectoryPlaceInputProps {
  label: string
  placeholder: string
  displayLabel?: string
  onClear?: () => void
  onChange: (selection: DirectoryPlaceSelection) => void
}

/**
 * Shared search-or-create combobox for linking a place. Searches saved
 * places first; when nothing matches, offers to add the typed query as a
 * new place (with an optional live address lookup) so a new record can be
 * created and linked without leaving the current form.
 */
export default function DirectoryPlaceInput({
  label,
  placeholder,
  displayLabel,
  onClear,
  onChange,
}: DirectoryPlaceInputProps) {
  const listboxId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const requestIdRef = useRef(0)
  const [query, setQuery] = useState(displayLabel ?? '')
  const [focused, setFocused] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newAddress, setNewAddress] = useState('')
  const [googlePlaces, setGooglePlaces] = useState<GooglePlace[]>([])
  const [googleQuery, setGoogleQuery] = useState('')
  const [loadingGoogle, setLoadingGoogle] = useState(false)
  const { data: savedPlaces = [] } = useSavedPlaces()

  const normalizedQuery = query.trim()
  const shouldSearchGoogle = creating && newAddress.trim().length >= 3

  const suggestions = useMemo<PlaceSuggestion[]>(() => {
    const candidates: PlaceSuggestion[] = savedPlaces.map(place => ({
      id: place.id,
      primary: place.name,
      aliases: place.aliases,
      secondary: savedPlaceAddress(place),
      address: savedPlaceAddress(place),
    }))
    return rankDirectorySuggestions(candidates, normalizedQuery, 6)
  }, [savedPlaces, normalizedQuery])

  useEffect(() => {
    const search = newAddress.trim()
    if (!shouldSearchGoogle) {
      requestIdRef.current += 1
      return
    }
    const requestId = ++requestIdRef.current
    const timer = window.setTimeout(async () => {
      setLoadingGoogle(true)
      const { data, error } = await supabase.functions.invoke('place-search', { body: { query: search } })
      if (requestId !== requestIdRef.current) return
      setLoadingGoogle(false)
      if (error) { setGooglePlaces([]); setGoogleQuery(search); return }
      const results = (data as { places?: GooglePlace[] } | null)?.places
      setGooglePlaces(Array.isArray(results) ? results : [])
      setGoogleQuery(search)
    }, 350)
    return () => window.clearTimeout(timer)
  }, [newAddress, shouldSearchGoogle])

  useEffect(() => {
    if (!focused) return
    const close = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) { setFocused(false); setCreating(false) }
    }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [focused])

  const chooseExisting = (suggestion: PlaceSuggestion) => {
    onChange({ mode: 'existing', placeId: suggestion.id })
    setQuery(`${suggestion.primary}${suggestion.address ? ` — ${suggestion.address}` : ''}`)
    setFocused(false)
    setCreating(false)
  }

  const confirmNewPlace = (address?: GooglePlace) => {
    onChange({ mode: 'new', input: {
      name: normalizedQuery,
      address: address?.address ?? (newAddress.trim() || null),
      lat: address?.lat ?? null,
      lng: address?.lng ?? null,
    } })
    setQuery(normalizedQuery)
    setFocused(false)
    setCreating(false)
  }

  const showResults = focused && normalizedQuery.length > 0

  return (
    <div ref={rootRef} className="relative">
      <Input
        value={query}
        aria-label={label}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={showResults}
        aria-controls={listboxId}
        placeholder={placeholder}
        className="pr-control"
        onFocus={() => setFocused(true)}
        onChange={(event) => {
          setQuery(event.target.value)
          setCreating(false)
          if (!event.target.value.trim()) onChange(null)
          setFocused(true)
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
          onClick={() => { setQuery(''); setCreating(false); onClear() }}
        />
      ) : (
        <Search size={17} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-casa-muted" />
      )}
      {showResults && !creating && (
        <div
          id={listboxId}
          role="listbox"
          aria-label={`${label} suggestions`}
          className="absolute left-0 right-0 top-[calc(100%+6px)] z-popover max-h-72 overflow-y-auto overscroll-contain rounded-card border border-casa-border bg-casa-surface p-1.5 shadow-modal"
        >
          {suggestions.map((suggestion) => (
            <Button
              key={suggestion.id}
              role="option"
              variant="ghost"
              fullWidth
              align="start"
              className="min-h-control rounded-button px-3 text-left"
              onPointerDown={(event) => event.preventDefault()}
              onClick={() => chooseExisting(suggestion)}
            >
              <MapPin size={16} className="shrink-0 text-casa-gold" />
              <span className="min-w-0 flex-1">
                <span className="truncate text-body-sm font-semibold text-casa-navy">{suggestion.primary}</span>
                {suggestion.address && (
                  <span className="mt-0.5 block truncate text-caption text-casa-muted">{suggestion.address}</span>
                )}
              </span>
            </Button>
          ))}
          <Button
            variant="ghost"
            fullWidth
            align="start"
            className="min-h-control rounded-button px-3 text-left"
            onPointerDown={(event) => event.preventDefault()}
            onClick={() => setCreating(true)}
          >
            <Plus size={16} className="shrink-0 text-casa-gold" />
            <span className="truncate text-body-sm font-semibold text-casa-navy">
              Add &quot;{normalizedQuery}&quot; as a new place
            </span>
          </Button>
        </div>
      )}
      {creating && (
        <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-popover rounded-card border border-casa-border bg-casa-surface p-3 shadow-modal">
          <p className="mb-2 text-caption font-semibold text-casa-muted">
            New place: <span className="text-casa-navy">{normalizedQuery}</span>
          </p>
          <Input
            autoFocus
            value={newAddress}
            aria-label="New place address"
            placeholder="Search an address (optional)"
            onChange={(event) => setNewAddress(event.target.value)}
          />
          {loadingGoogle && (
            <p className="mt-1.5 flex items-center gap-2 text-caption text-casa-muted">
              <Loader2 size={13} className="animate-spin" /> Finding addresses…
            </p>
          )}
          {googleQuery === newAddress.trim() && googlePlaces.length > 0 && (
            <div className="mt-1.5 space-y-1">
              {googlePlaces.slice(0, 4).map((place) => (
                <Button
                  key={place.place_id}
                  variant="subtle"
                  size="sm"
                  fullWidth
                  align="start"
                  onPointerDown={(event) => event.preventDefault()}
                  onClick={() => confirmNewPlace(place)}
                >
                  {place.name} — {place.address}
                </Button>
              ))}
            </div>
          )}
          <div className="mt-3 flex justify-end gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => setCreating(false)}>
              Cancel
            </Button>
            <Button type="button" variant="primary" size="sm" onClick={() => confirmNewPlace()}>
              Add place
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
