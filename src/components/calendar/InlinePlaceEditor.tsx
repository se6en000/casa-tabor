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
  editorOnly?: boolean
  onCancel?: () => void
  busy?: boolean
  className?: string
}

export default function InlinePlaceEditor({
  value,
  onConfirm,
  ariaLabel,
  extraPlaces = [],
  allowEmpty = false,
  requireAddress = false,
  editorOnly = false,
  onCancel,
  busy = false,
  className,
}: InlinePlaceEditorProps) {
  const [editing, setEditing] = useState(editorOnly)
  const [draft, setDraft] = useState<TransportationPlace>(value)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { data: savedPlaces = [] } = useSavedPlaces()
  const savePlace = useSavePlace()

  const cancel = () => {
    setDraft(value)
    setError(null)
    setEditing(false)
    onCancel?.()
  }

  const apply = async () => {
    if (busy) return
    const next = { ...draft, name: draft.name.trim(), address: draft.address.trim() }
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

  const exactSavedPlace = findExactSavedPlace(savedPlaces, draft.name, draft.address)
  const canSavePlace = Boolean(draft.name.trim() && draft.address.trim() && !exactSavedPlace)
  const saveCurrentPlace = () => {
    setError(null)
    savePlace.mutate({
      name: draft.name.trim(),
      address: draft.address.trim(),
      category: 'other',
    }, {
      onError: (cause) => {
        setError(cause instanceof Error ? cause.message : 'Could not save this place.')
      },
    })
  }

  if (!editing && !editorOnly) {
    return (
      <Button
        variant="ghost"
        fullWidth
        align="start"
        aria-label={ariaLabel}
        onClick={() => {
          setDraft(value)
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
    <div className={`relative rounded-card border border-casa-border bg-casa-surface p-4 shadow-card ${className ?? ''}`}>
      {editorOnly && (
        <div className="mb-3">
          <p className="text-body-sm font-bold text-casa-navy">Change event location</p>
          <p className="mt-0.5 text-caption text-casa-muted">Choose a saved or Google result to confirm it automatically.</p>
        </div>
      )}
      <div className="space-y-2">
        {!editorOnly && (
          <SmartPlaceInput
            value={draft}
            field="name"
            label={`${ariaLabel} name`}
            placeholder="Location name"
            autoFocus
            extraPlaces={extraPlaces}
            onClear={() => {
              setDraft({ name: '', address: '', source: 'manual', lat: null, lng: null })
              setError(null)
            }}
            onChange={(place) => {
              setDraft(place)
              setError(null)
            }}
          />
        )}
        <SmartPlaceInput
          value={draft}
          field="address"
          label={`${ariaLabel} address`}
          placeholder={editorOnly ? 'Search for a place or address' : 'Start typing an address'}
          autoFocus={editorOnly}
          extraPlaces={extraPlaces}
          onClear={() => {
            setDraft((current) => ({
              ...current,
              address: '',
              source: 'manual',
              placeId: undefined,
              lat: null,
              lng: null,
            }))
            setError(null)
          }}
          onChange={(place) => {
            setDraft(place)
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
        <Button variant="secondary" size="sm" onClick={cancel} disabled={saving || busy}>Cancel</Button>
        <Button variant="primary" size="sm" onClick={apply} loading={saving || busy}>
          <Check size={15} /> Apply
        </Button>
      </div>
    </div>
  )
}
