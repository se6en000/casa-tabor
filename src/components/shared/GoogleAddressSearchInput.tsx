import { useEffect, useId, useRef, useState } from 'react'
import { BadgeCheck, Loader2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { Button, Input } from '../ui'

interface GooglePlaceResult {
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

export interface GoogleAddressSelection {
  name: string
  street: string | null
  city: string | null
  state: string | null
  zip: string | null
  lat: number | null
  lng: number | null
  formattedAddress: string
}

interface GoogleAddressSearchInputProps {
  value: string
  ariaLabel: string
  placeholder?: string
  required?: boolean
  onChange: (value: string) => void
  onSelect: (result: GoogleAddressSelection) => void
}

/**
 * Street-address input backed by a live Google Places search, so a place's
 * address is always Google-verified and split into street/city/state/zip
 * rather than hand-typed as one string (the root cause of blank city/state/
 * zip fields and directory duplicates). Manual typing still works as a
 * fallback if nothing matches — it just isn't verified.
 */
export default function GoogleAddressSearchInput({
  value,
  ariaLabel,
  placeholder,
  required,
  onChange,
  onSelect,
}: GoogleAddressSearchInputProps) {
  const listboxId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const requestIdRef = useRef(0)
  const [focused, setFocused] = useState(false)
  const [suggestions, setSuggestions] = useState<GooglePlaceResult[]>([])
  const [loading, setLoading] = useState(false)
  const [queriedFor, setQueriedFor] = useState('')

  const normalized = value.trim()
  const shouldSearch = focused && normalized.length >= 3

  useEffect(() => {
    if (!shouldSearch) {
      requestIdRef.current += 1
      return
    }
    const requestId = ++requestIdRef.current
    const timer = window.setTimeout(async () => {
      setLoading(true)
      const { data, error } = await supabase.functions.invoke('place-search', { body: { query: normalized } })
      if (requestId !== requestIdRef.current) return
      setLoading(false)
      if (error) { setSuggestions([]); setQueriedFor(normalized); return }
      const results = (data as { places?: GooglePlaceResult[] } | null)?.places
      setSuggestions(Array.isArray(results) ? results : [])
      setQueriedFor(normalized)
    }, 350)
    return () => window.clearTimeout(timer)
  }, [normalized, shouldSearch])

  useEffect(() => {
    if (!focused) return
    const close = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setFocused(false)
    }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [focused])

  const showResults = shouldSearch && queriedFor === normalized && (loading || suggestions.length > 0)

  return (
    <div ref={rootRef} className="relative">
      <Input
        required={required}
        value={value}
        aria-label={ariaLabel}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={showResults}
        aria-controls={listboxId}
        placeholder={placeholder}
        onFocus={() => setFocused(true)}
        onChange={(event) => onChange(event.target.value)}
      />
      {showResults && (
        <div
          id={listboxId}
          role="listbox"
          aria-label={`${ariaLabel} suggestions`}
          className="absolute left-0 right-0 top-[calc(100%+6px)] z-popover max-h-72 overflow-y-auto overscroll-contain rounded-card border border-casa-border bg-casa-surface p-1.5 shadow-modal"
        >
          {loading && (
            <p className="flex items-center gap-2 px-3 py-2 text-caption text-casa-muted">
              <Loader2 size={13} className="animate-spin" /> Finding verified addresses…
            </p>
          )}
          {suggestions.slice(0, 5).map((place) => (
            <Button
              key={place.place_id}
              type="button"
              role="option"
              variant="ghost"
              fullWidth
              align="start"
              className="min-h-control rounded-button px-3 text-left"
              onPointerDown={(event) => event.preventDefault()}
              onClick={() => {
                onSelect({
                  name: place.name,
                  street: place.street ?? place.address ?? null,
                  city: place.city ?? null,
                  state: place.state ?? null,
                  zip: place.zip ?? null,
                  lat: place.lat ?? null,
                  lng: place.lng ?? null,
                  formattedAddress: place.address,
                })
                setFocused(false)
              }}
            >
              <BadgeCheck size={16} className="shrink-0 text-casa-success" />
              <span className="min-w-0 flex-1">
                <span className="truncate text-body-sm font-semibold text-casa-navy">{place.name}</span>
                <span className="mt-0.5 block truncate text-caption text-casa-muted">{place.address}</span>
              </span>
            </Button>
          ))}
        </div>
      )}
    </div>
  )
}
