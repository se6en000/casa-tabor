import { useMemo, useRef, useState } from 'react'
import { Car, Check, ChevronDown, House, Pencil, Plus, Trash2 } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useFamilyMembers } from '../../hooks/useFamilyMembers'
import { useSavedPlaces } from '../../hooks/useSavedPlaces'
import { useTravelEta } from '../../hooks/useTravelEta'
import type { EventWithDetails } from '../../hooks/useCalendarEvents'
import type { FamilyMember } from '../../types'
import {
  appendReturnHomeLeg,
  createDefaultTransportationPlan,
  transportationTimeIso,
  updateTransportationDriver,
  updateTransportationPlace,
  type EventTransportationPlan,
  type TransportationLeg,
  type TransportationPlace,
} from '../../lib/eventTransportation'
import { Button, Card, Checkbox, Field, IconButton, Input, Select, Sheet } from '../ui'
import InlinePlaceEditor from './InlinePlaceEditor'

interface EventTransportationSectionProps {
  event: EventWithDetails
  plan: EventTransportationPlan | null
  onChange: (plan: EventTransportationPlan | null) => void
  suggestedPlan?: boolean
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
        <span className="flex size-6 items-center justify-center rounded-full bg-casa-navy text-caption font-bold text-white">
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
                <span className="flex size-7 items-center justify-center rounded-full bg-casa-navy text-caption font-bold text-white">
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
            onConfirm={(place) => onPlaceChange('origin', place)}
          />
          <div className="ml-control-sm flex items-center gap-2 text-caption text-casa-muted">
            <span className="h-4 w-px bg-casa-border" /> to
          </div>
          <InlinePlaceEditor
            value={leg.destination}
            ariaLabel={`${PURPOSE_LABELS[leg.purpose]} destination`}
            extraPlaces={placeOptions}
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

function placeFromName(name: string, options: PlaceOption[], fallback: TransportationPlace): TransportationPlace {
  const match = options.find((option) => option.name.toLowerCase() === name.trim().toLowerCase())
  return match ? { ...match } : { name, address: name === fallback.name ? fallback.address : '' }
}

export default function EventTransportationSection({
  event,
  plan,
  onChange,
  suggestedPlan = false,
}: EventTransportationSectionProps) {
  const [editorOpen, setEditorOpen] = useState(false)
  const [draft, setDraft] = useState<EventTransportationPlan | null>(null)
  const { data: household = [] } = useFamilyMembers()
  const { data: savedPlaces = [] } = useSavedPlaces()
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
      const address = [place.address, place.city, place.state, place.zip].filter(Boolean).join(', ')
      if (!options.some((option) => option.name.toLowerCase() === place.name.toLowerCase())) {
        options.push({ name: place.name, address })
      }
    })
    return options
  }, [event.address, event.location_name, homeAddress, savedPlaces])

  const openEditor = () => {
    setDraft(plan ?? createDefaultTransportationPlan(event, homeAddress, defaultDriver))
    setEditorOpen(true)
  }

  const addLeg = () => {
    if (!draft) return
    const previous = draft.legs.at(-1)
    const origin = previous?.destination ?? { name: 'Home', address: homeAddress }
    setDraft({
      ...draft,
      legs: [...draft.legs, {
        id: crypto.randomUUID(),
        origin,
        destination: { name: '', address: '' },
        driverId: previous?.driverId ?? defaultDriver?.id ?? null,
        driverName: previous?.driverName ?? defaultDriver?.name ?? '',
        passengers: previous ? [...previous.passengers] : [],
        purpose: 'drive',
        timing: 'arrive_by',
        time: '',
      }],
    })
  }

  const updatePlanPlace = (
    legIndex: number,
    side: 'origin' | 'destination',
    place: TransportationPlace,
  ) => {
    if (!plan) return
    onChange(updateTransportationPlace(plan, legIndex, side, place))
  }

  const updatePlanDriver = (
    legIndex: number,
    driver: { id: string | null; name: string },
    applyToRemaining: boolean,
  ) => {
    if (!plan) return
    onChange(updateTransportationDriver(plan, legIndex, driver, applyToRemaining))
  }

  return (
    <>
      <section aria-label="The Plan">
        {plan ? (
          <div className="overflow-visible rounded-2xl border border-casa-border">
            <div className="flex items-center justify-between gap-3 rounded-t-2xl bg-casa-navy px-[18px] py-3.5">
              <div className="min-w-0">
                <p className="text-caption font-bold uppercase tracking-widest text-white/70">The Plan</p>
                <p className="mt-0.5 font-display text-body-lg font-semibold text-white">
                  {plan.legs.length} driving {plan.legs.length === 1 ? 'leg' : 'legs'} · live traffic
                </p>
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
            <p className="px-[18px] pt-3 text-caption text-casa-muted">Tap any place or driver for a quick change.</p>
            <ol className="px-[18px] pb-2">
              {plan.legs.map((leg, index) => (
                <TripLegTimeline
                  key={leg.id}
                  event={event}
                  leg={leg}
                  last={index === plan.legs.length - 1}
                  household={household}
                  placeOptions={placeOptions}
                  onPlaceChange={(side, place) => updatePlanPlace(index, side, place)}
                  onDriverChange={(driver, applyToRemaining) => updatePlanDriver(index, driver, applyToRemaining)}
                />
              ))}
            </ol>
            <div className="flex flex-wrap gap-2 border-t border-casa-border px-[18px] py-3">
              <Button variant="secondary" size="sm" onClick={openEditor}>
                <Plus size={15} /> Add or reorder stops
              </Button>
              <Button variant="ghost" size="sm" className="text-casa-error" onClick={() => onChange(null)}>
                No driving logistics
              </Button>
            </div>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-casa-border">
            <div className="bg-casa-navy px-[18px] py-3.5">
              <p className="text-caption font-bold uppercase tracking-widest text-white/70">The Plan</p>
              <p className="mt-0.5 font-display text-body-lg font-semibold text-white">
                {suggestedPlan ? 'Casa suggested a simple route' : 'No driving logistics needed'}
              </p>
            </div>
            <div className="flex items-center gap-4 px-[18px] py-4">
              <span className="flex size-control shrink-0 items-center justify-center rounded-button bg-casa-bg text-casa-muted">
                <Car size={19} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-body-sm text-casa-muted">
                  {suggestedPlan
                    ? 'Customize it when the driver, origin, stops, or return route differ.'
                    : 'The event location stays visible without assigning a trip.'}
                </p>
              </div>
              <Button variant="secondary" size="sm" onClick={openEditor}>
                {suggestedPlan ? 'Customize trip' : 'Add a trip'}
              </Button>
            </div>
          </div>
        )}
      </section>

      <Sheet
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        title={plan ? 'Edit transportation' : 'Add transportation'}
        side="bottom"
        showHandle
        panelClassName="max-h-[92vh]"
      >
        {draft && (
          <div className="mx-auto max-w-3xl space-y-4">
            <p className="text-body-sm text-casa-muted">
              Add only the driving that needs coordination. Each leg can start and end somewhere different.
            </p>
            <datalist id={`transport-places-${event.id}`}>
              {placeOptions.map((place) => <option key={`${place.name}-${place.address}`} value={place.name}>{place.address}</option>)}
            </datalist>

            {draft.legs.map((leg, index) => (
              <Card key={leg.id} padding="md" className="space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-body font-semibold text-casa-navy">Leg {index + 1}</p>
                  {draft.legs.length > 1 && (
                    <IconButton
                      icon={<Trash2 size={16} />}
                      aria-label={`Remove leg ${index + 1}`}
                      variant="danger"
                      size="sm"
                      onClick={() => setDraft({ ...draft, legs: draft.legs.filter((item) => item.id !== leg.id) })}
                    />
                  )}
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="Driver">
                    <Select
                      value={leg.driverId ?? '__other__'}
                      onChange={(event) => {
                        const member = household.find((candidate) => candidate.id === event.target.value)
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
                        onChange={(event) => setDraft(updateLeg(draft, leg.id, { driverName: event.target.value }))}
                      />
                    </Field>
                  )}
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-3">
                    <Field label="From">
                      <Input
                        list={`transport-places-${event.id}`}
                        value={leg.origin.name}
                        placeholder="Starting place"
                        onChange={(event) => setDraft(updateLeg(draft, leg.id, {
                          origin: placeFromName(event.target.value, placeOptions, leg.origin),
                        }))}
                      />
                    </Field>
                    <Field label="From address">
                      <Input
                        value={leg.origin.address}
                        placeholder="Address for traffic"
                        onChange={(event) => setDraft(updateLeg(draft, leg.id, {
                          origin: { ...leg.origin, address: event.target.value },
                        }))}
                      />
                    </Field>
                  </div>
                  <div className="space-y-3">
                    <Field label="To">
                      <Input
                        list={`transport-places-${event.id}`}
                        value={leg.destination.name}
                        placeholder="Destination"
                        onChange={(event) => setDraft(updateLeg(draft, leg.id, {
                          destination: placeFromName(event.target.value, placeOptions, leg.destination),
                        }))}
                      />
                    </Field>
                    <Field label="To address">
                      <Input
                        value={leg.destination.address}
                        placeholder="Address for traffic"
                        onChange={(event) => setDraft(updateLeg(draft, leg.id, {
                          destination: { ...leg.destination, address: event.target.value },
                        }))}
                      />
                    </Field>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                  <Field label="Purpose">
                    <Select
                      value={leg.purpose}
                      onChange={(event) => setDraft(updateLeg(draft, leg.id, { purpose: event.target.value as TransportationLeg['purpose'] }))}
                    >
                      {Object.entries(PURPOSE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </Select>
                  </Field>
                  <Field label="Schedule by">
                    <Select
                      value={leg.timing}
                      onChange={(event) => setDraft(updateLeg(draft, leg.id, { timing: event.target.value as TransportationLeg['timing'] }))}
                    >
                      <option value="arrive_by">Arrive by</option>
                      <option value="depart_at">Leave at</option>
                    </Select>
                  </Field>
                  <Field label="Time">
                    <Input
                      type="time"
                      value={leg.time}
                      onChange={(event) => setDraft(updateLeg(draft, leg.id, { time: event.target.value }))}
                    />
                  </Field>
                </div>

                <Field label="Passengers" hint="Optional; separate names with commas.">
                  <Input
                    value={leg.passengers.join(', ')}
                    placeholder="e.g. Owen"
                    onChange={(event) => setDraft(updateLeg(draft, leg.id, {
                      passengers: event.target.value.split(',').map((name) => name.trim()).filter(Boolean),
                    }))}
                  />
                </Field>
              </Card>
            ))}

            <div className="grid gap-2 sm:grid-cols-2">
              <Button variant="secondary" onClick={addLeg}>
                <Plus size={16} /> Add another leg
              </Button>
              <Button
                variant="secondary"
                onClick={() => setDraft(appendReturnHomeLeg(draft, event, homeAddress))}
              >
                <House size={16} /> Add return home
              </Button>
            </div>

            <div className="flex flex-col-reverse gap-2 border-t border-casa-border pt-4 sm:flex-row sm:justify-between">
              <Button
                variant="danger"
                onClick={() => {
                  onChange(null)
                  setEditorOpen(false)
                }}
              >
                No driving logistics
              </Button>
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => setEditorOpen(false)}>Cancel</Button>
                <Button
                  variant="primary"
                  disabled={draft.legs.some((leg) => !leg.origin.name.trim() || !leg.destination.name.trim() || !leg.time)}
                  onClick={() => {
                    onChange(draft)
                    setEditorOpen(false)
                  }}
                >
                  Save trip
                </Button>
              </div>
            </div>
          </div>
        )}
      </Sheet>
    </>
  )
}
