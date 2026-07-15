import { useState } from 'react'
import { BookmarkPlus, Check, MapPin, Pencil } from 'lucide-react'
import {
  findExactSavedPlace,
  useSavedPlaces,
  useSavePlace,
} from '../../hooks/useSavedPlaces'
import type { TransportationPlace } from '../../lib/eventTransportation'
import { Button } from '../ui'
import SmartPlaceInput from './SmartPlaceInput'

interface InlinePlaceEditorProps {
  value: TransportationPlace
  onConfirm: (place: TransportationPlace) => void | Promise<void>
  ariaLabel: string
  extraPlaces?: TransportationPlace[]
  allowEmpty?: boolean
  requireAddress?: boolean
  className?: string
}

export default function InlinePlaceEditor({
  value,
  onConfirm,
  ariaLabel,
  extraPlaces = [],
  allowEmpty = false,
  requireAddress = false,
  className,
}: InlinePlaceEditorProps) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(value.name)
  const [address, setAddress] = useState(value.address)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { data: savedPlaces = [] } = useSavedPlaces()
  const savePlace = useSavePlace()

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
    if (requireAddress && !next.address) {
      setError('Add the event address so traffic works everywhere.')
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

  const exactSavedPlace = findExactSavedPlace(savedPlaces, name, address)
  const canSavePlace = Boolean(name.trim() && address.trim() && !exactSavedPlace)
  const saveCurrentPlace = () => {
    setError(null)
    savePlace.mutate({
      name: name.trim(),
      address: address.trim(),
      category: 'other',
    }, {
      onError: (cause) => {
        setError(cause instanceof Error ? cause.message : 'Could not save this place.')
      },
    })
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
          {value.address && value.address !== value.name ? (
            <span className="mt-0.5 block truncate text-caption text-casa-muted">{value.address}</span>
          ) : requireAddress ? (
            <span className="mt-0.5 block truncate text-caption font-semibold text-casa-error">Add event address</span>
          ) : null}
        </span>
        <Pencil size={15} className="shrink-0 text-casa-muted" />
      </Button>
    )
  }

  return (
    <div className={`relative rounded-card border border-casa-gold bg-casa-surface p-3 shadow-card ${className ?? ''}`}>
      <div className="space-y-2">
        <SmartPlaceInput
          value={{ name, address }}
          field="name"
          label={`${ariaLabel} name`}
          placeholder="Location name"
          autoFocus
          extraPlaces={extraPlaces}
          onClear={() => {
            setName('')
            setAddress('')
            setError(null)
          }}
          onChange={(place) => {
            setName(place.name)
            setAddress(place.address)
            setError(null)
          }}
        />
        <SmartPlaceInput
          value={{ name, address }}
          field="address"
          label={`${ariaLabel} address`}
          placeholder="Start typing an address"
          extraPlaces={extraPlaces}
          onClear={() => {
            setAddress('')
            setError(null)
          }}
          onChange={(place) => {
            setName(place.name)
            setAddress(place.address)
            setError(null)
          }}
        />
      </div>

      {error && <p role="alert" className="mt-2 text-caption text-casa-error">{error}</p>}
      <div className="mt-3 flex flex-wrap justify-end gap-2">
        {(canSavePlace || exactSavedPlace || savePlace.isPending) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={saveCurrentPlace}
            disabled={!canSavePlace || savePlace.isPending}
          >
            <BookmarkPlus size={15} />
            {exactSavedPlace ? 'Saved place' : savePlace.isPending ? 'Saving…' : 'Save place'}
          </Button>
        )}
        <Button variant="secondary" size="sm" onClick={cancel} disabled={saving}>Cancel</Button>
        <Button variant="primary" size="sm" onClick={apply} loading={saving}>
          <Check size={15} /> Apply
        </Button>
      </div>
    </div>
  )
}
