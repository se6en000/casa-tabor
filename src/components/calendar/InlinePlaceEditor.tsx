import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, MapPin, Pencil, X } from 'lucide-react'
import { useSavedPlaces } from '../../hooks/useSavedPlaces'
import type { TransportationPlace } from '../../lib/eventTransportation'
import { Button, IconButton, Input } from '../ui'

interface InlinePlaceEditorProps {
  value: TransportationPlace
  onConfirm: (place: TransportationPlace) => void | Promise<void>
  ariaLabel: string
  extraPlaces?: TransportationPlace[]
  allowEmpty?: boolean
  className?: string
}

function savedPlaceAddress(place: {
  address: string | null
  city: string | null
  state: string | null
  zip: string | null
}): string {
  return [place.address, place.city, place.state, place.zip].filter(Boolean).join(', ')
}

export default function InlinePlaceEditor({
  value,
  onConfirm,
  ariaLabel,
  extraPlaces = [],
  allowEmpty = false,
  className,
}: InlinePlaceEditorProps) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(value.name)
  const [address, setAddress] = useState(value.address)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const nameRef = useRef<HTMLInputElement>(null)
  const { data: savedPlaces = [] } = useSavedPlaces()

  useEffect(() => {
    if (editing) nameRef.current?.focus()
  }, [editing])

  const options = useMemo(() => {
    const merged = [
      ...extraPlaces,
      ...savedPlaces.map((place) => ({ name: place.name, address: savedPlaceAddress(place), aliases: place.aliases })),
    ]
    const unique = new Map<string, TransportationPlace & { aliases?: string[] }>()
    merged.forEach((place) => {
      if (!place.name.trim() && !place.address.trim()) return
      const key = `${place.name.trim().toLowerCase()}|${place.address.trim().toLowerCase()}`
      if (!unique.has(key)) unique.set(key, place)
    })
    return [...unique.values()]
  }, [extraPlaces, savedPlaces])

  const needle = `${name} ${address}`.trim().toLowerCase()
  const matches = needle
    ? options.filter((place) =>
        [place.name, place.address, ...(place.aliases ?? [])]
          .some((part) => part.toLowerCase().includes(needle) || needle.includes(part.toLowerCase())),
      ).slice(0, 5)
    : options.slice(0, 5)

  const cancel = () => {
    setName(value.name)
    setAddress(value.address)
    setError(null)
    setEditing(false)
  }

  const apply = async () => {
    const next = { name: name.trim(), address: address.trim() }
    if (!allowEmpty && !next.name && !next.address) {
      setError('Enter a location name or address.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await onConfirm(next)
      setEditing(false)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not update this location.')
    } finally {
      setSaving(false)
    }
  }

  if (!editing) {
    return (
      <Button
        variant="ghost"
        fullWidth
        align="start"
        aria-label={ariaLabel}
        onClick={() => {
          setName(value.name)
          setAddress(value.address)
          setEditing(true)
        }}
        className={`rounded-button px-2 text-left ${className ?? ''}`}
        contentClassName="w-full justify-start"
      >
        <MapPin size={16} className="shrink-0 text-casa-gold" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-body-sm font-semibold text-casa-navy">
            {value.name || value.address || 'Add location'}
          </span>
          {value.address && value.address !== value.name && (
            <span className="mt-0.5 block truncate text-caption text-casa-muted">{value.address}</span>
          )}
        </span>
        <Pencil size={15} className="shrink-0 text-casa-muted" />
      </Button>
    )
  }

  return (
    <div className={`relative rounded-card border border-casa-gold bg-casa-surface p-3 shadow-card ${className ?? ''}`}>
      <div className="space-y-2">
        <div className="relative">
          <Input
            ref={nameRef}
            value={name}
            aria-label={`${ariaLabel} name`}
            placeholder="Location name"
            className="pr-control"
            onChange={(event) => {
              setName(event.target.value)
              setError(null)
            }}
          />
          {(name || address) && (
            <IconButton
              icon={<X size={15} />}
              aria-label={`Clear ${ariaLabel.toLowerCase()}`}
              title={`Clear ${ariaLabel.toLowerCase()}`}
              size="sm"
              variant="ghost"
              className="absolute right-1 top-1/2 -translate-y-1/2"
              onClick={() => {
                setName('')
                setAddress('')
                setError(null)
              }}
            />
          )}
        </div>
        <Input
          value={address}
          aria-label={`${ariaLabel} address`}
          placeholder="Address"
          onChange={(event) => {
            setAddress(event.target.value)
            setError(null)
          }}
        />
      </div>

      {matches.length > 0 && (
        <div className="mt-2 overflow-hidden rounded-button border border-casa-border bg-casa-surface">
          <p className="px-3 pb-1 pt-2 text-caption font-semibold uppercase tracking-wide text-casa-muted">Saved places</p>
          {matches.map((place) => (
            <Button
              key={`${place.name}-${place.address}`}
              variant="ghost"
              size="sm"
              fullWidth
              align="start"
              className="rounded-none"
              onPointerDown={(event) => event.preventDefault()}
              onClick={() => {
                setName(place.name)
                setAddress(place.address)
                setError(null)
              }}
            >
              <MapPin size={14} className="shrink-0 text-casa-gold" />
              <span className="min-w-0">
                <span className="block truncate text-body-sm font-semibold text-casa-navy">{place.name}</span>
                {place.address && <span className="block truncate text-caption text-casa-muted">{place.address}</span>}
              </span>
            </Button>
          ))}
        </div>
      )}

      {error && <p role="alert" className="mt-2 text-caption text-casa-error">{error}</p>}
      <div className="mt-3 flex justify-end gap-2">
        <Button variant="secondary" size="sm" onClick={cancel} disabled={saving}>Cancel</Button>
        <Button variant="primary" size="sm" onClick={apply} loading={saving}>
          <Check size={15} /> Apply
        </Button>
      </div>
    </div>
  )
}
