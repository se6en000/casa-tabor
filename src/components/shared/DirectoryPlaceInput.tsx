import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { AlertTriangle, BadgeCheck, Loader2, MapPin, Plus, Search, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { savedPlaceAddress, useSavedPlaces } from '../../hooks/useSavedPlaces'
import { rankDirectorySuggestions, type DirectoryPlaceSelection, type DirectorySuggestionCandidate } from '../../utils/directorySuggestions'
import { Button, IconButton, Input } from '../ui'

interface SavedSuggestion extends DirectorySuggestionCandidate {
  source: 'saved'
  address: string
}

interface GooglePlace {
  place_id: string
  name: string
  address: string
  street?: string | null
  city?: string | null
  state?: string | null
  zip?: string | null
  lat?: number | null
  lng?: number | null
}

interface GoogleSuggestion {
  id: string
  source: 'google'
  primary: string
  address: string
  street: string | null
  city: string | null
  state: string | null
  zip: string | null
  lat: number | null
  lng: number | null
}

type PendingNewPlace = {
  name: string
  address: string | null
  street: string | null
  city: string | null
  state: string | null
  zip: string | null
  lat: number | null
  lng: number | null
  verified: boolean
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
 * places first, and searches Google Places live on the same typed query so
 * a new place's address is always Google-verified rather than hand-typed
 * (hand-typed addresses are what create duplicate/near-duplicate records).
 * Manual, unverified entry is offered only as an explicit fallback when
 * Google can't find a match.
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
  const [pendingNew, setPendingNew] = useState<PendingNewPlace | null>(null)
  const [pendingName, setPendingName] = useState('')
  const [googlePlaces, setGooglePlaces] = useState<GooglePlace[]>([])
  const [googleQuery, setGoogleQuery] = useState('')
  const [loadingGoogle, setLoadingGoogle] = useState(false)
  const { data: savedPlaces = [] } = useSavedPlaces()

  const normalizedQuery = query.trim()
  const shouldSearchGoogle = focused && normalizedQuery.length >= 3

  const savedSuggestions = useMemo<SavedSuggestion[]>(() => {
    const candidates: SavedSuggestion[] = savedPlaces.map(place => ({
      id: place.id,
      primary: place.name,
      aliases: place.aliases,
      secondary: savedPlaceAddress(place),
      address: savedPlaceAddress(place),
      source: 'saved',
    }))
    return rankDirectorySuggestions(candidates, normalizedQuery, 5)
  }, [savedPlaces, normalizedQuery])

  useEffect(() => {
    const search = normalizedQuery
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
  }, [normalizedQuery, shouldSearchGoogle])

  useEffect(() => {
    if (!focused) return
    const close = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) { setFocused(false); setPendingNew(null) }
    }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [focused])

  const googleSuggestions = useMemo<GoogleSuggestion[]>(() => {
    if (!shouldSearchGoogle || googleQuery !== normalizedQuery) return []
    return googlePlaces.slice(0, 4).map(place => ({
      id: place.place_id,
      source: 'google' as const,
      primary: place.name,
      address: place.address,
      street: place.street ?? null,
      city: place.city ?? null,
      state: place.state ?? null,
      zip: place.zip ?? null,
      lat: place.lat ?? null,
      lng: place.lng ?? null,
    }))
  }, [googlePlaces, googleQuery, normalizedQuery, shouldSearchGoogle])

  const chooseExisting = (suggestion: SavedSuggestion) => {
    onChange({ mode: 'existing', placeId: suggestion.id })
    setQuery(`${suggestion.primary}${suggestion.address ? ` — ${suggestion.address}` : ''}`)
    setFocused(false)
    setPendingNew(null)
  }

  const chooseGooglePlace = (suggestion: GoogleSuggestion) => {
    setPendingNew({
      name: suggestion.primary,
      address: suggestion.address,
      street: suggestion.street ?? suggestion.address,
      city: suggestion.city,
      state: suggestion.state,
      zip: suggestion.zip,
      lat: suggestion.lat,
      lng: suggestion.lng,
      verified: true,
    })
    setPendingName(suggestion.primary)
  }

  const chooseUnverified = () => {
    setPendingNew({ name: normalizedQuery, address: null, street: null, city: null, state: null, zip: null, lat: null, lng: null, verified: false })
    setPendingName(normalizedQuery)
  }

  const confirmNewPlace = () => {
    if (!pendingNew) return
    onChange({ mode: 'new', input: {
      name: pendingName.trim() || pendingNew.name,
      address: pendingNew.street ?? pendingNew.address,
      city: pendingNew.city,
      state: pendingNew.state,
      zip: pendingNew.zip,
      lat: pendingNew.lat,
      lng: pendingNew.lng,
    } })
    setQuery(pendingName.trim() || pendingNew.name)
    setFocused(false)
    setPendingNew(null)
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
          setPendingNew(null)
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
          onClick={() => { setQuery(''); setPendingNew(null); onClear() }}
        />
      ) : (
        <Search size={17} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-casa-muted" />
      )}
      {showResults && !pendingNew && (
        <div
          id={listboxId}
          role="listbox"
          aria-label={`${label} suggestions`}
          className="absolute left-0 right-0 top-[calc(100%+6px)] z-popover max-h-80 overflow-y-auto overscroll-contain rounded-card border border-casa-border bg-casa-surface p-1.5 shadow-modal"
        >
          {savedSuggestions.map((suggestion) => (
            <Button
              key={`saved-${suggestion.id}`}
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
          {loadingGoogle && (
            <p className="flex items-center gap-2 px-3 py-2 text-caption text-casa-muted">
              <Loader2 size={13} className="animate-spin" /> Finding verified addresses…
            </p>
          )}
          {googleSuggestions.length > 0 && (
            <>
              <p className="px-3 pb-1 pt-2 text-caption font-semibold text-casa-muted">Verified addresses</p>
              {googleSuggestions.map((suggestion) => (
                <Button
                  key={`google-${suggestion.id}`}
                  role="option"
                  variant="ghost"
                  fullWidth
                  align="start"
                  className="min-h-control rounded-button px-3 text-left"
                  onPointerDown={(event) => event.preventDefault()}
                  onClick={() => chooseGooglePlace(suggestion)}
                >
                  <BadgeCheck size={16} className="shrink-0 text-casa-success" />
                  <span className="min-w-0 flex-1">
                    <span className="truncate text-body-sm font-semibold text-casa-navy">{suggestion.primary}</span>
                    <span className="mt-0.5 block truncate text-caption text-casa-muted">{suggestion.address}</span>
                  </span>
                </Button>
              ))}
            </>
          )}
          {normalizedQuery.length >= 3 && !loadingGoogle && (
            <Button
              variant="ghost"
              fullWidth
              align="start"
              className="min-h-control rounded-button px-3 text-left"
              onPointerDown={(event) => event.preventDefault()}
              onClick={chooseUnverified}
            >
              <Plus size={16} className="shrink-0 text-casa-muted" />
              <span className="min-w-0 flex-1">
                <span className="truncate text-body-sm font-semibold text-casa-navy">
                  Add &quot;{normalizedQuery}&quot; as a new place
                </span>
                <span className="mt-0.5 flex items-center gap-1 text-caption text-casa-muted">
                  <AlertTriangle size={12} /> Can&apos;t find it above? Add it without a verified address
                </span>
              </span>
            </Button>
          )}
        </div>
      )}
      {pendingNew && (
        <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-popover rounded-card border border-casa-border bg-casa-surface p-3 shadow-modal">
          {pendingNew.verified ? (
            <p className="mb-2 flex items-center gap-1.5 text-caption font-semibold text-casa-success">
              <BadgeCheck size={14} /> Verified address: {pendingNew.address}
            </p>
          ) : (
            <p className="mb-2 flex items-center gap-1.5 text-caption font-semibold text-casa-warning">
              <AlertTriangle size={14} /> No verified address — this place is being added without one
            </p>
          )}
          <label className="mb-1 block text-caption font-semibold text-casa-muted">Place name</label>
          <Input
            autoFocus
            value={pendingName}
            aria-label="New place name"
            placeholder="e.g. Cooper House"
            onChange={(event) => setPendingName(event.target.value)}
          />
          <div className="mt-3 flex justify-end gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => setPendingNew(null)}>
              Cancel
            </Button>
            <Button type="button" variant="primary" size="sm" onClick={confirmNewPlace} disabled={!pendingName.trim()}>
              Add place
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
