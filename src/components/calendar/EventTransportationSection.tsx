import { useEffect, useMemo, useRef, useState } from 'react'
import { BookmarkPlus, Car, Check, ChevronDown, House, Pencil, Plus, Trash2 } from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useFamilyMembers } from '../../hooks/useFamilyMembers'
import {
  findExactSavedPlace,
  savedPlaceAddress,
  useSavedPlaces,
  useSavePlace,
} from '../../hooks/useSavedPlaces'
import { useTravelEta } from '../../hooks/useTravelEta'
import type { EventWithDetails } from '../../hooks/useCalendarEvents'
import type { FamilyMember } from '../../types'
import {
  appendReturnHomeLeg,
  createDefaultTransportationPlan,
  eventPassengerNames,
  hydrateTransportationEventPlaces,
  isTransportationEventPlace,
  syncTransportationAttendees,
  transportationTimeIso,
  updateTransportationDriver,
  updateTransportationEventPlace,
  updateTransportationPlace,
  updateTransportationWait,
  transportationPlaceMatchesEvent,
  type EventTransportationPlan,
  type TransportationLeg,
  type TransportationPlace,
} from '../../lib/eventTransportation'
import { Button, Card, Checkbox, ConfirmationDialog, Field, IconButton, Input, Modal, Select, Sheet, Switch } from '../ui'
import InlinePlaceEditor from './InlinePlaceEditor'
import SmartPlaceInput from './SmartPlaceInput'
import PassengerChipSelector from './PassengerChipSelector'

interface EventTransportationSectionProps {
  event: EventWithDetails
  plan: EventTransportationPlan | null
  onQuickChange: (
    plan: EventTransportationPlan | null,
    eventPlace?: TransportationPlace,
  ) => Promise<void>
  onSave: (
    plan: EventTransportationPlan | null,
    eventPlace?: TransportationPlace,
  ) => Promise<'handled' | 'legacy' | 'cancelled'>
  suggestedPlan?: boolean
  noRouteReason?: 'trip' | null
}

interface PlaceOption {
  name: string
  address: string
}

const PURPOSE_LABELS: Record<TransportationLeg['purpose'], string> = {
  drive: 'Drive',
  pickup: 'Pick up',
  dropoff: 'Drop off',
  appointment: 'Appointment',
  return: 'Return',
}

function formatClock(iso: string | null | undefined): string | null {
  if (!iso) return null
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

function formatTimeInput(value: string): string {
  const [hoursText, minutes = '00'] = value.split(':')
  const hours = Number(hoursText)
  if (!Number.isFinite(hours)) return 'Time needed'
  const period = hours >= 12 ? 'PM' : 'AM'
  const displayHour = hours % 12 || 12
  return `${displayHour}:${minutes} ${period}`
}

function transportationLegSummary(leg: TransportationLeg): string {
  const driver = leg.driverName.trim() || 'Driver needed'
  const origin = leg.origin.name.trim() || 'Starting place needed'
  const destination = leg.destination.name.trim() || 'Destination needed'
  const timing = leg.timing === 'arrive_by' ? 'Arrive' : 'Leave'
  return `${driver} · ${origin} → ${destination} · ${timing} ${formatTimeInput(leg.time)}`
}

function useDesktopTransportationEditor(): boolean {
  const [desktop, setDesktop] = useState(() => window.matchMedia('(min-width: 768px)').matches)

  useEffect(() => {
    const query = window.matchMedia('(min-width: 768px)')
    const update = (event: MediaQueryListEvent) => setDesktop(event.matches)
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])

  return desktop
}

function QuickDriverPicker({
  leg,
  household,
  onSelect,
}: {
  leg: TransportationLeg
  household: FamilyMember[]
  onSelect: (driver: { id: string | null; name: string }, applyToRemaining: boolean) => void
}) {
  const [open, setOpen] = useState(false)
  const [custom, setCustom] = useState('')
  const [showCustom, setShowCustom] = useState(false)
  const [applyToRemaining, setApplyToRemaining] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const drivers = household.filter((member) => member.can_drive)
  const activeDriver = household.find((member) => member.id === leg.driverId)
    ?? household.find((member) => member.name === leg.driverName)

  return (
    <div ref={containerRef} className="relative shrink-0">
      <Button
        variant="secondary"
        size="sm"
        className="rounded-pill px-2.5"
        aria-label={`Change driver from ${leg.driverName || 'unassigned'}`}
        aria-expanded={open}
        onClick={() => {
          setOpen((value) => !value)
          setShowCustom(false)
        }}
      >
        <span
          className="flex size-6 items-center justify-center rounded-full text-caption font-bold text-white"
          style={{ backgroundColor: activeDriver?.color_hex ?? 'var(--color-casa-navy)' }}
        >
          {leg.driverName?.[0]?.toUpperCase() || '?'}
        </span>
        {leg.driverName || 'Driver'}
        <ChevronDown size={14} />
      </Button>
      {open && (
        <div className="absolute right-0 top-[calc(100%+8px)] z-popover w-72 rounded-card border border-casa-border bg-casa-surface p-3 shadow-modal">
          <p className="text-caption font-semibold uppercase tracking-wide text-casa-muted">Who drives this leg?</p>
          <div className="mt-2 space-y-1">
            {drivers.map((driver) => (
              <Button
                key={driver.id}
                variant="ghost"
                size="sm"
                fullWidth
                align="start"
                onClick={() => {
                  onSelect({ id: driver.id, name: driver.name }, applyToRemaining)
                  setOpen(false)
                }}
              >
                <span
                  className="flex size-7 items-center justify-center rounded-full text-caption font-bold text-white"
                  style={{ backgroundColor: driver.color_hex ?? 'var(--color-casa-muted)' }}
                >
                  {driver.name[0]?.toUpperCase()}
                </span>
                <span className="flex-1">{driver.name}</span>
                {driver.id === leg.driverId && <Check size={15} className="text-casa-success" />}
              </Button>
            ))}
            <Button
              variant="ghost"
              size="sm"
              fullWidth
              align="start"
              onClick={() => {
                setCustom(leg.driverId ? '' : leg.driverName)
                setShowCustom(true)
              }}
            >
              Someone else
            </Button>
          </div>
          {showCustom && (
            <div className="mt-2 flex gap-2">
              <Input
                value={custom}
                aria-label="Driver name"
                placeholder="e.g. Giselle"
                onChange={(event) => setCustom(event.target.value)}
              />
              <Button
                size="sm"
                disabled={!custom.trim()}
                onClick={() => {
                  onSelect({ id: null, name: custom.trim() }, applyToRemaining)
                  setOpen(false)
                }}
              >
                Apply
              </Button>
            </div>
          )}
          <Checkbox
            checked={applyToRemaining}
            onChange={(event) => setApplyToRemaining(event.target.checked)}
            label="Use for remaining legs"
            className="mt-3"
          />
        </div>
      )}
    </div>
  )
}

function TripLegTimeline({
  event,
  leg,
  last,
  household,
  placeOptions,
  onPlaceChange,
  onDriverChange,
}: {
  event: EventWithDetails
  leg: TransportationLeg
  last: boolean
  household: FamilyMember[]
  placeOptions: TransportationPlace[]
  onPlaceChange: (side: 'origin' | 'destination', place: TransportationPlace) => void
  onDriverChange: (driver: { id: string | null; name: string }, applyToRemaining: boolean) => void
}) {
  const timingIso = transportationTimeIso(event, leg)
  const eta = useTravelEta({
    origin: leg.origin.address || leg.origin.name,
    destination: leg.destination.address || leg.destination.name,
    eventStartIso: leg.timing === 'arrive_by' ? timingIso : null,
    departureTimeIso: leg.timing === 'depart_at' ? timingIso : null,
    enabled: Boolean(leg.origin.name && leg.destination.name && timingIso),
    bufferMins: 10,
  })
  const result = eta.data
  const leaveTime = formatClock(result?.leave_by ?? result?.departure_time)
  const arriveTime = formatClock(result?.arrival_time)
  const timingLabel = leg.timing === 'arrive_by'
    ? (leaveTime ? `Leave by ${leaveTime}` : `Arrive by ${formatClock(timingIso) ?? leg.time}`)
    : `Leave at ${formatClock(timingIso) ?? leg.time}`
  const driverLine = [
    leg.driverName ? `${leg.driverName} driving` : 'Driver not assigned',
    leg.passengers.length ? `with ${leg.passengers.join(', ')}` : null,
  ].filter(Boolean).join(' ')

  return (
    <li className="relative flex gap-3 py-3">
      <div className="flex w-control-sm shrink-0 flex-col items-center">
        <span className="flex size-control-sm items-center justify-center rounded-full bg-casa-navy text-white">
          <Car size={16} />
        </span>
        {!last && <span className="my-1 min-h-8 w-px flex-1 bg-casa-border" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-body font-semibold text-casa-navy">{timingLabel}</p>
          <span className="text-caption font-semibold uppercase tracking-wide text-casa-muted">
            {PURPOSE_LABELS[leg.purpose]}
          </span>
        </div>
        <div className="mt-2 grid gap-1">
          <InlinePlaceEditor
            value={leg.origin}
            ariaLabel={`${PURPOSE_LABELS[leg.purpose]} origin`}
            extraPlaces={placeOptions}
            requireAddress={isTransportationEventPlace(leg.origin)}
            onConfirm={(place) => onPlaceChange('origin', place)}
          />
          <div className="ml-control-sm flex items-center gap-2 text-caption text-casa-muted">
            <span className="h-4 w-px bg-casa-border" /> to
          </div>
          <InlinePlaceEditor
            value={leg.destination}
            ariaLabel={`${PURPOSE_LABELS[leg.purpose]} destination`}
            extraPlaces={placeOptions}
            requireAddress={isTransportationEventPlace(leg.destination)}
            onConfirm={(place) => onPlaceChange('destination', place)}
          />
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <p className="text-caption text-casa-muted">{driverLine}</p>
          <QuickDriverPicker leg={leg} household={household} onSelect={onDriverChange} />
        </div>
        {eta.isLoading && <p className="mt-1 text-caption text-casa-muted">Calculating traffic…</p>}
        {result?.found && (
          <p className="mt-1 text-caption font-semibold text-casa-success">
            {Math.round(result.drive_time_mins ?? result.base_drive_time_mins ?? 0)} min with traffic
            {arriveTime ? ` · arrive ${arriveTime}` : ''}
          </p>
        )}
        {eta.isError && <p className="mt-1 text-caption text-casa-error">Drive time unavailable.</p>}
      </div>
    </li>
  )
}

function updateLeg(plan: EventTransportationPlan, legId: string, patch: Partial<TransportationLeg>): EventTransportationPlan {
  return {
    ...plan,
    legs: plan.legs.map((leg) => leg.id === legId ? { ...leg, ...patch } : leg),
  }
}

function TripPlaceFields({
  label,
  value,
  savedPlaces,
  onChange,
}: {
  label: string
  value: TransportationPlace
  savedPlaces: ReturnType<typeof useSavedPlaces>['data']
  onChange: (place: TransportationPlace) => void
}) {
  const savePlace = useSavePlace()
  const places = savedPlaces ?? []
  const exactSavedPlace = findExactSavedPlace(places, value.name, value.address)
  const canSave = Boolean(value.name.trim() && value.address.trim() && !exactSavedPlace)

  return (
    <div className="space-y-3">
      <Field label={`${label} place`}>
        <SmartPlaceInput
          value={value}
          field="name"
          label={`${label} place`}
          placeholder="Type a saved place or new place"
          onClear={() => onChange({ ...value, name: '', address: '' })}
          onChange={onChange}
        />
      </Field>
      <Field
        label={`${label} address`}
        error={isTransportationEventPlace(value) && !value.address.trim()
          ? 'Add the event address so traffic works everywhere.'
          : undefined}
      >
        <SmartPlaceInput
          value={value}
          field="address"
          label={`${label} address`}
          placeholder="Start typing an address"
          onClear={() => onChange({ ...value, address: '' })}
          onChange={onChange}
        />
      </Field>
      {(canSave || exactSavedPlace || savePlace.isPending) && (
        <Button
          variant="ghost"
          size="sm"
          disabled={!canSave || savePlace.isPending}
          onClick={() => savePlace.mutate({
            name: value.name.trim(),
            address: value.address.trim(),
            category: 'other',
          })}
        >
          <BookmarkPlus size={15} />
          {exactSavedPlace ? 'Saved place' : savePlace.isPending ? 'Saving…' : 'Save place'}
        </Button>
      )}
      {savePlace.isError && (
        <p role="alert" className="text-caption text-casa-error">
          {savePlace.error instanceof Error ? savePlace.error.message : 'Could not save this place.'}
        </p>
      )}
    </div>
  )
}

export default function EventTransportationSection({
  event,
  plan,
  onQuickChange,
  onSave,
  suggestedPlan = false,
  noRouteReason = null,
}: EventTransportationSectionProps) {
  const [editorOpen, setEditorOpen] = useState(false)
  const [removeConfirmOpen, setRemoveConfirmOpen] = useState(false)
  const [draft, setDraft] = useState<EventTransportationPlan | null>(null)
  const [savingTrip, setSavingTrip] = useState(false)
  const [tripError, setTripError] = useState<string | null>(null)
  const [savingPassenger, setSavingPassenger] = useState<string | null>(null)
  const [savingQuickChange, setSavingQuickChange] = useState(false)
  const [expandedLegId, setExpandedLegId] = useState<string | null>(null)
  const sheetExitResolverRef = useRef<(() => void) | null>(null)
  const desktopEditor = useDesktopTransportationEditor()
  const { data: household = [] } = useFamilyMembers()
  const { data: savedPlaces = [] } = useSavedPlaces()
  const queryClient = useQueryClient()
  const { data: homeConfig } = useQuery({
    queryKey: ['home-config'],
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from('settings').select('value').eq('key', 'home_config').maybeSingle()
      if (error) throw error
      return (data?.value ?? null) as { address?: string; city?: string; state?: string; zip?: string } | null
    },
  })
  const homeAddress = [homeConfig?.address, homeConfig?.city, homeConfig?.state, homeConfig?.zip].filter(Boolean).join(', ').trim()
  const defaultDriver = household.find((member) => member.can_drive && (member.role === 'parent' || member.role === 'caregiver')) ?? null
  const placeOptions = useMemo<PlaceOption[]>(() => {
    const options: PlaceOption[] = [{ name: 'Home', address: homeAddress }]
    if (event.location_name || event.address) {
      options.push({
        name: event.location_name?.trim() || event.address?.trim() || 'Event location',
        address: event.address?.trim() || '',
      })
    }
    savedPlaces.forEach((place) => {
      const address = savedPlaceAddress(place)
      if (!options.some((option) => option.name.toLowerCase() === place.name.toLowerCase())) {
        options.push({ name: place.name, address })
      }
    })
    return options
  }, [event.address, event.location_name, homeAddress, savedPlaces])

  const hydratedPlan = useMemo(
    () => plan
      ? syncTransportationAttendees(
          hydrateTransportationEventPlaces(plan, event),
          eventPassengerNames(event),
        )
      : null,
    [event, plan],
  )
  const supportsWait = Boolean(
    hydratedPlan?.legs.some((leg) => leg.purpose === 'appointment')
    && hydratedPlan?.legs.some((leg) => leg.purpose === 'return'),
  )

  const openEditor = () => {
    const nextDraft = hydratedPlan ?? createDefaultTransportationPlan(event, homeAddress, defaultDriver)
    setDraft(nextDraft)
    setExpandedLegId(nextDraft.legs[0]?.id ?? null)
    setTripError(null)
    setEditorOpen(true)
  }

  const addLeg = () => {
    if (!draft) return
    const previous = draft.legs.at(-1)
    const origin = previous?.destination ?? { name: 'Home', address: homeAddress }
    const nextLeg: TransportationLeg = {
      id: crypto.randomUUID(),
      origin,
      destination: { name: '', address: '' },
      driverId: previous?.driverId ?? defaultDriver?.id ?? null,
      driverName: previous?.driverName ?? defaultDriver?.name ?? '',
      passengers: previous ? [...previous.passengers] : [],
      purpose: 'drive',
      timing: 'arrive_by',
      time: '',
    }
    setDraft({
      ...draft,
      legs: [...draft.legs, nextLeg],
    })
    setExpandedLegId(nextLeg.id)
  }

  const closeEditorBeforeScope = () => new Promise<void>((resolve) => {
    sheetExitResolverRef.current = resolve
    setEditorOpen(false)
  })

  const updatePlanPlace = async (
    legIndex: number,
    side: 'origin' | 'destination',
    place: TransportationPlace,
  ) => {
    if (!hydratedPlan || savingQuickChange) return
    const current = hydratedPlan.legs[legIndex]?.[side]
    const nextPlan = current && isTransportationEventPlace(current)
      ? updateTransportationEventPlace(hydratedPlan, place)
      : updateTransportationPlace(hydratedPlan, legIndex, side, place)
    setTripError(null)
    setSavingQuickChange(true)
    try {
      await onQuickChange(
        nextPlan,
        current && isTransportationEventPlace(current) && !transportationPlaceMatchesEvent(place, event)
          ? place
          : undefined,
      )
    } catch (cause) {
      setTripError(cause instanceof Error ? cause.message : 'Could not save this trip change.')
    } finally {
      setSavingQuickChange(false)
    }
  }

  const updatePlanDriver = async (
    legIndex: number,
    driver: { id: string | null; name: string },
    applyToRemaining: boolean,
  ) => {
    if (!hydratedPlan || savingQuickChange) return
    setTripError(null)
    setSavingQuickChange(true)
    try {
      await onQuickChange(updateTransportationDriver(hydratedPlan, legIndex, driver, applyToRemaining))
    } catch (cause) {
      setTripError(cause instanceof Error ? cause.message : 'Could not save this driver change.')
    } finally {
      setSavingQuickChange(false)
    }
  }

  const updateWait = async (waitOnSite: boolean) => {
    if (!hydratedPlan || savingQuickChange) return
    setTripError(null)
    setSavingQuickChange(true)
    try {
      await onQuickChange(updateTransportationWait(hydratedPlan, waitOnSite))
    } catch (cause) {
      setTripError(cause instanceof Error ? cause.message : 'Could not save the waiting plan.')
    } finally {
      setSavingQuickChange(false)
    }
  }

  const updateDraftPlace = (
    legIndex: number,
    side: 'origin' | 'destination',
    place: TransportationPlace,
  ) => {
    if (!draft) return
    const current = draft.legs[legIndex]?.[side]
    setTripError(null)
    setDraft(current && isTransportationEventPlace(current)
      ? updateTransportationEventPlace(draft, place)
      : updateTransportationPlace(draft, legIndex, side, place))
  }

  const togglePassenger = async (
    legId: string,
    member: FamilyMember,
    selected: boolean,
  ) => {
    if (!draft) return
    setTripError(null)
    const updated = updateLeg(draft, legId, {
      passengers: selected
        ? [...new Set([...draft.legs.find((leg) => leg.id === legId)!.passengers, member.name])]
        : draft.legs.find((leg) => leg.id === legId)!.passengers.filter((name) => name !== member.name),
    })
    setDraft(selected
      ? { ...updated, attendeeRoster: [...new Set([...(updated.attendeeRoster ?? []), member.name])] }
      : updated)
    if (!selected || event.members.some((eventMember) => eventMember.family_member?.id === member.id)) return
    setSavingPassenger(member.name)
    const { error } = await supabase.from('event_members').upsert(
      { event_id: event.id, family_member_id: member.id, role: 'attendee' },
      { onConflict: 'event_id,family_member_id', ignoreDuplicates: true },
    )
    setSavingPassenger(null)
    if (error) {
      setDraft((current) => {
        if (!current) return current
        const rolledBack = updateLeg(current, legId, {
          passengers: current.legs.find((leg) => leg.id === legId)!.passengers.filter((name) => name !== member.name),
        })
        return {
          ...rolledBack,
          attendeeRoster: rolledBack.attendeeRoster?.filter((name) => name !== member.name),
        }
      })
      setTripError(`Could not add ${member.name} to the event: ${error.message}`)
      return
    }
    queryClient.invalidateQueries({ queryKey: ['events'] })
  }

  const handleEditorExitComplete = () => {
    sheetExitResolverRef.current?.()
    sheetExitResolverRef.current = null
  }

  const removeDraftLeg = (legId: string) => {
    if (!draft) return
    const nextLegs = draft.legs.filter((leg) => leg.id !== legId)
    setDraft({ ...draft, legs: nextLegs })
    if (expandedLegId === legId) setExpandedLegId(nextLegs[0]?.id ?? null)
  }

  const addReturnHome = () => {
    if (!draft) return
    const nextDraft = appendReturnHomeLeg(draft, event, homeAddress)
    setDraft(nextDraft)
    setExpandedLegId(nextDraft.legs.at(-1)?.id ?? null)
  }

  const saveDraft = async () => {
    if (!draft) return
    setSavingTrip(true)
    setTripError(null)
    try {
      const eventPlace = draft.legs
        .flatMap((leg) => [leg.origin, leg.destination])
        .find(isTransportationEventPlace)
      await closeEditorBeforeScope()
      const result = await onSave(
        draft,
        eventPlace && !transportationPlaceMatchesEvent(eventPlace, event)
          ? eventPlace
          : undefined,
      )
      if (result === 'cancelled') setEditorOpen(true)
    } catch (cause) {
      setTripError(cause instanceof Error ? cause.message : 'Could not save this trip.')
      setEditorOpen(true)
    } finally {
      setSavingTrip(false)
    }
  }

  const editorTitle = plan ? 'Edit transportation' : 'Add transportation'
  const editorContent = draft && (
    <div className="flex min-h-0 flex-1 flex-col bg-casa-bg-2">
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
        <p className="text-body-sm text-casa-muted">
          Add only the driving that needs coordination. Open a leg to change its driver, places, timing, or passengers.
        </p>
        <div className="space-y-3">
          {draft.legs.map((leg, index) => {
            const expanded = expandedLegId === leg.id
            return (
              <Card key={leg.id} tone="subtle" padding="none" className="overflow-visible">
                <div className="flex items-center gap-2 p-2">
                  <Button
                    variant="ghost"
                    fullWidth
                    align="start"
                    className="min-w-0"
                    contentClassName="min-w-0 flex-1 justify-between"
                    aria-expanded={expanded}
                    onClick={() => setExpandedLegId(expanded ? null : leg.id)}
                  >
                    <span className="min-w-0 text-left">
                      <span className="block text-body font-semibold text-casa-navy">Leg {index + 1}</span>
                      <span className="mt-0.5 block truncate text-caption font-normal text-casa-muted">
                        {transportationLegSummary(leg)}
                      </span>
                    </span>
                    <ChevronDown size={17} className={expanded ? 'rotate-180' : undefined} aria-hidden="true" />
                  </Button>
                  {draft.legs.length > 1 && (
                    <IconButton
                      icon={<Trash2 size={16} />}
                      aria-label={`Remove leg ${index + 1}`}
                      variant="danger"
                      size="sm"
                      onClick={() => removeDraftLeg(leg.id)}
                    />
                  )}
                </div>

                {expanded && (
                  <div className="space-y-4 border-t border-casa-border p-4">
                    <div className="grid gap-4 md:grid-cols-2">
                      <Field label="Driver">
                        <Select
                          value={leg.driverId ?? '__other__'}
                          onChange={(changeEvent) => {
                            const member = household.find((candidate) => candidate.id === changeEvent.target.value)
                            setDraft(updateLeg(draft, leg.id, {
                              driverId: member?.id ?? null,
                              driverName: member?.name ?? '',
                            }))
                          }}
                        >
                          {household.filter((member) => member.can_drive).map((member) => (
                            <option key={member.id} value={member.id}>{member.name}</option>
                          ))}
                          <option value="__other__">Someone else</option>
                        </Select>
                      </Field>
                      {!leg.driverId && (
                        <Field label="Driver name">
                          <Input
                            value={leg.driverName}
                            placeholder="e.g. Giselle"
                            onChange={(changeEvent) => setDraft(updateLeg(draft, leg.id, { driverName: changeEvent.target.value }))}
                          />
                        </Field>
                      )}
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <TripPlaceFields
                        label="From"
                        value={leg.origin}
                        savedPlaces={savedPlaces}
                        onChange={(place) => updateDraftPlace(index, 'origin', place)}
                      />
                      <TripPlaceFields
                        label="To"
                        value={leg.destination}
                        savedPlaces={savedPlaces}
                        onChange={(place) => updateDraftPlace(index, 'destination', place)}
                      />
                    </div>

                    <div className="grid gap-4 md:grid-cols-3">
                      <Field label="Purpose">
                        <Select
                          value={leg.purpose}
                          onChange={(changeEvent) => setDraft(updateLeg(draft, leg.id, { purpose: changeEvent.target.value as TransportationLeg['purpose'] }))}
                        >
                          {Object.entries(PURPOSE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                        </Select>
                      </Field>
                      <Field label="Schedule by">
                        <Select
                          value={leg.timing}
                          onChange={(changeEvent) => setDraft(updateLeg(draft, leg.id, { timing: changeEvent.target.value as TransportationLeg['timing'] }))}
                        >
                          <option value="arrive_by">Arrive by</option>
                          <option value="depart_at">Leave at</option>
                        </Select>
                      </Field>
                      <Field label="Time">
                        <Input
                          type="time"
                          value={leg.time}
                          onChange={(changeEvent) => setDraft(updateLeg(draft, leg.id, { time: changeEvent.target.value }))}
                        />
                      </Field>
                    </div>

                    <Field label="Passengers" hint="Tap the people riding this leg. Event attendees are selected by default.">
                      <PassengerChipSelector
                        members={household}
                        selectedNames={leg.passengers}
                        disabledNames={savingPassenger ? [savingPassenger] : []}
                        onToggle={(member, selected) => void togglePassenger(leg.id, member, selected)}
                        onRemoveExternal={(name) => setDraft(updateLeg(draft, leg.id, {
                          passengers: leg.passengers.filter((passenger) => passenger !== name),
                        }))}
                      />
                    </Field>
                  </div>
                )}
              </Card>
            )
          })}
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <Button variant="secondary" onClick={addLeg}>
            <Plus size={16} /> Add another leg
          </Button>
          <Button variant="secondary" onClick={addReturnHome}>
            <House size={16} /> Add return home
          </Button>
        </div>

        {draft.legs.some((leg) => leg.purpose === 'appointment')
          && draft.legs.some((leg) => leg.purpose === 'return') && (
            <Switch
              checked={draft.waitOnSite === true}
              onCheckedChange={(checked) => setDraft(updateTransportationWait(draft, checked))}
              label="Driver waits on site"
              className="rounded-button border border-casa-border bg-casa-bg px-3"
            />
          )}
        {tripError && <p role="alert" className="text-caption text-casa-error">{tripError}</p>}
      </div>

      <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-casa-border bg-casa-surface px-5 py-3 sm:flex-row sm:justify-between">
        <Button variant="danger" onClick={() => setRemoveConfirmOpen(true)}>
          Remove driving plan
        </Button>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setEditorOpen(false)}>Cancel</Button>
          <Button
            variant="primary"
            loading={savingTrip}
            disabled={draft.legs.some((leg) =>
              !leg.origin.name.trim()
              || !leg.destination.name.trim()
              || !leg.time
              || (isTransportationEventPlace(leg.origin) && !leg.origin.address.trim())
              || (isTransportationEventPlace(leg.destination) && !leg.destination.address.trim()),
            )}
            onClick={() => void saveDraft()}
          >
            Save trip
          </Button>
        </div>
      </div>
    </div>
  )

  return (
    <>
      <section aria-label="The Plan">
        {hydratedPlan ? (
          <Card tone="surface" padding="none" className="overflow-visible">
            <div className="flex items-center justify-between gap-3 rounded-t-card bg-casa-navy px-[18px] py-3.5">
              <div className="min-w-0">
                <p className="text-caption font-bold uppercase tracking-widest text-white/70">The Plan</p>
                <p className="mt-0.5 font-display text-body-lg font-semibold text-white">
                  {hydratedPlan.legs.length} driving {hydratedPlan.legs.length === 1 ? 'leg' : 'legs'}
                  {supportsWait && hydratedPlan.waitOnSite ? ' · driver waits on site' : ' · live traffic'}
                </p>
                {hydratedPlan.source === 'generated' && (
                  <p className="mt-1 text-caption font-semibold text-white/70">Casa generated · review anytime</p>
                )}
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="rounded-pill bg-white/10 px-2.5 text-caption font-bold text-white hover:bg-white/20 hover:text-white"
                onClick={openEditor}
              >
                <Pencil size={14} /> Edit entire plan
              </Button>
            </div>
            <p className="px-[18px] pt-3 text-caption text-casa-muted">
              Use a place pencil or driver menu for a quick change.
            </p>
            {savingQuickChange && <p className="px-[18px] pt-2 text-caption text-casa-muted">Saving trip change…</p>}
            {tripError && <p role="alert" className="px-[18px] pt-2 text-caption text-casa-error">{tripError}</p>}
            <ol className="px-[18px] pb-2">
              {hydratedPlan.legs.map((leg, index) => (
                <TripLegTimeline
                  key={leg.id}
                  event={event}
                  leg={leg}
                  last={index === hydratedPlan.legs.length - 1}
                  household={household}
                  placeOptions={placeOptions}
                  onPlaceChange={(side, place) => updatePlanPlace(index, side, place)}
                  onDriverChange={(driver, applyToRemaining) => updatePlanDriver(index, driver, applyToRemaining)}
                />
              ))}
            </ol>
            {supportsWait && (
              <div className="border-t border-casa-border px-[18px] py-3">
                <Switch
                  checked={hydratedPlan.waitOnSite === true}
                  onCheckedChange={(checked) => void updateWait(checked)}
                  label="Driver waits on site"
                  disabled={savingQuickChange}
                />
              </div>
            )}
            <div className="flex flex-wrap gap-2 border-t border-casa-border px-[18px] py-3">
              <Button variant="secondary" size="sm" onClick={openEditor}>
                <Plus size={15} /> Add or reorder stops
              </Button>
            </div>
          </Card>
        ) : (
          <Card tone="surface" padding="none" className="overflow-hidden">
            <div className="rounded-t-card bg-casa-navy px-[18px] py-3.5">
              <p className="text-caption font-bold uppercase tracking-widest text-white/70">The Plan</p>
              <p className="mt-0.5 font-display text-body-lg font-semibold text-white">
                {suggestedPlan
                  ? 'Casa is preparing the round trip'
                  : noRouteReason === 'trip'
                    ? 'No local driving route attached'
                    : 'No driving logistics needed'}
              </p>
            </div>
            <div className="flex items-center gap-4 px-[18px] py-4">
              <span className="flex size-control shrink-0 items-center justify-center rounded-button bg-casa-bg text-casa-muted">
                <Car size={19} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-body-sm text-casa-muted">
                  {suggestedPlan
                    ? 'The driver, outbound leg, return leg, and waiting plan will appear here.'
                    : noRouteReason === 'trip'
                      ? 'Flights and destination trips stay truthful until someone adds the local driving that actually needs coordination.'
                      : 'The event location stays visible without assigning a trip.'}
                </p>
              </div>
              <Button variant="secondary" size="sm" onClick={openEditor}>
                {suggestedPlan ? 'Set up trip' : 'Add a trip'}
              </Button>
            </div>
          </Card>
        )}
      </section>

      {desktopEditor ? (
        <Modal
          open={editorOpen}
          onClose={() => setEditorOpen(false)}
          onExitComplete={handleEditorExitComplete}
          title={editorTitle}
          size="xl"
          panelClassName="flex max-h-[85dvh] flex-col overflow-hidden"
          contentClassName="flex min-h-0 flex-1 flex-col overflow-hidden p-0"
        >
          {editorContent}
        </Modal>
      ) : (
        <Sheet
          open={editorOpen}
          onClose={() => setEditorOpen(false)}
          onExitComplete={handleEditorExitComplete}
          title={editorTitle}
          side="bottom"
          showHandle
          panelClassName="max-h-[92dvh]"
          contentClassName="flex min-h-0 flex-1 flex-col overflow-hidden p-0"
        >
          {editorContent}
        </Sheet>
      )}
      <ConfirmationDialog
        open={removeConfirmOpen}
        onClose={() => setRemoveConfirmOpen(false)}
        onConfirm={() => {
          setSavingTrip(true)
          setTripError(null)
          setRemoveConfirmOpen(false)
          void closeEditorBeforeScope().then(() => onSave(null)).then((result) => {
            if (result === 'cancelled') setEditorOpen(true)
          }).then(() => {
            setRemoveConfirmOpen(false)
          }).catch((cause) => {
            setTripError(cause instanceof Error ? cause.message : 'Could not remove this driving plan.')
            setEditorOpen(true)
          }).finally(() => {
            setSavingTrip(false)
          })
        }}
        title="Remove driving plan?"
        description="This removes every driving leg from this event. The event and its location will stay in Casa."
        confirmLabel="Remove driving plan"
        destructive
        loading={savingTrip}
      />
    </>
  )
}
