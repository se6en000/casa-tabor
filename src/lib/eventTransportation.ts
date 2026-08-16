import type { EventWithDetails } from '../hooks/useCalendarEvents'

export type LogisticsMode = 'stay' | 'dropoff_only' | 'pickup_only' | 'two_way' | 'none'
export type TransportationPurpose = 'drive' | 'pickup' | 'dropoff' | 'appointment' | 'return'
export type TransportationTiming = 'arrive_by' | 'depart_at'

export interface TransportationPlace {
  name: string
  address: string
  kind?: 'event'
  source?: 'manual' | 'saved' | 'google'
  placeId?: string
  lat?: number | null
  lng?: number | null
}

export interface TransportationLeg {
  id: string
  origin: TransportationPlace
  destination: TransportationPlace
  driverId: string | null
  driverName: string
  passengers: string[]
  purpose: TransportationPurpose
  timing: TransportationTiming
  time: string
}

export interface EventTransportationPlan {
  version: 1
  source?: 'generated' | 'manual'
  waitOnSite?: boolean
  legs: TransportationLeg[]
  attendeeRoster?: string[]
}

const PURPOSES = new Set<TransportationPurpose>(['drive', 'pickup', 'dropoff', 'appointment', 'return'])
const TIMINGS = new Set<TransportationTiming>(['arrive_by', 'depart_at'])

function normalizePlace(value: unknown): TransportationPlace | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as Record<string, unknown>
  const name = typeof raw.name === 'string' ? raw.name.trim() : ''
  const address = typeof raw.address === 'string' ? raw.address.trim() : ''
  if (!name && !address) return null
  return {
    name: name || address,
    address,
    ...(raw.kind === 'event' ? { kind: 'event' as const } : {}),
    ...(raw.source === 'manual' || raw.source === 'saved' || raw.source === 'google'
      ? { source: raw.source }
      : {}),
    ...(typeof raw.placeId === 'string' && raw.placeId.trim() ? { placeId: raw.placeId.trim() } : {}),
    ...(typeof raw.lat === 'number' ? { lat: raw.lat } : {}),
    ...(typeof raw.lng === 'number' ? { lng: raw.lng } : {}),
  }
}

export function normalizeTransportationPlan(value: unknown): EventTransportationPlan | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as Record<string, unknown>
  if (raw.version !== 1 || !Array.isArray(raw.legs)) return null

  const legs = raw.legs.flatMap((candidate): TransportationLeg[] => {
    if (!candidate || typeof candidate !== 'object') return []
    const leg = candidate as Record<string, unknown>
    const origin = normalizePlace(leg.origin)
    const destination = normalizePlace(leg.destination)
    const purpose = typeof leg.purpose === 'string' && PURPOSES.has(leg.purpose as TransportationPurpose)
      ? leg.purpose as TransportationPurpose
      : 'drive'
    const timing = typeof leg.timing === 'string' && TIMINGS.has(leg.timing as TransportationTiming)
      ? leg.timing as TransportationTiming
      : 'arrive_by'
    const time = typeof leg.time === 'string' && /^\d{2}:\d{2}$/.test(leg.time) ? leg.time : ''
    if (!origin || !destination) return []
    return [{
      id: typeof leg.id === 'string' && leg.id.trim() ? leg.id : crypto.randomUUID(),
      origin,
      destination,
      driverId: typeof leg.driverId === 'string' && leg.driverId ? leg.driverId : null,
      driverName: typeof leg.driverName === 'string' ? leg.driverName.trim() : '',
      passengers: Array.isArray(leg.passengers)
        ? leg.passengers.filter((passenger): passenger is string => typeof passenger === 'string').map((passenger) => passenger.trim()).filter(Boolean)
        : [],
      purpose,
      timing,
      time,
    }]
  })

  const attendeeRoster = Array.isArray(raw.attendeeRoster)
    ? raw.attendeeRoster
        .filter((name): name is string => typeof name === 'string')
        .map((name) => name.trim())
        .filter(Boolean)
    : undefined
  return legs.length > 0
    ? {
        version: 1,
        ...(raw.source === 'generated' || raw.source === 'manual' ? { source: raw.source } : {}),
        ...(typeof raw.waitOnSite === 'boolean' ? { waitOnSite: raw.waitOnSite } : {}),
        legs,
        ...(attendeeRoster ? { attendeeRoster } : {}),
      }
    : null
}

export function eventTimeValue(iso: string | null | undefined): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

export function transportationTimeIso(event: EventWithDetails, leg: TransportationLeg): string | null {
  if (!leg.time) return null
  const [hours, minutes] = leg.time.split(':').map(Number)
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return null
  const anchor = new Date(leg.timing === 'depart_at' ? event.end_time : event.start_time)
  if (Number.isNaN(anchor.getTime())) return null
  anchor.setHours(hours, minutes, 0, 0)
  return anchor.toISOString()
}

export function eventPassengerNames(event: Pick<EventWithDetails, 'members'>): string[] {
  return [...(event.members ?? [])]
    .sort((left, right) => (left.role === 'primary' ? -1 : right.role === 'primary' ? 1 : 0))
    .map((member) => member.family_member?.name?.trim())
    .filter((name): name is string => Boolean(name))
}

export function createDefaultTransportationPlan(
  event: EventWithDetails,
  homeAddress: string,
  driver?: { id: string | null; name: string } | null,
): EventTransportationPlan {
  const destinationName = event.location_name?.trim() || event.address?.trim() || 'Event location'
  const attendeeRoster = eventPassengerNames(event)
  return {
    version: 1,
    source: 'manual',
    waitOnSite: false,
    attendeeRoster,
    legs: [{
      id: crypto.randomUUID(),
      origin: { name: 'Home', address: homeAddress },
      destination: { name: destinationName, address: event.address?.trim() || '', kind: 'event' },
      driverId: driver?.id ?? null,
      driverName: driver?.name ?? '',
      passengers: attendeeRoster,
      purpose: 'drive',
      timing: 'arrive_by',
      time: eventTimeValue(event.start_time),
    }],
  }
}

export function markTransportationPlanManual(plan: EventTransportationPlan): EventTransportationPlan {
  return plan.source === 'manual' ? plan : { ...plan, source: 'manual' }
}

export function updateTransportationWait(
  plan: EventTransportationPlan,
  waitOnSite: boolean,
): EventTransportationPlan {
  return { ...plan, waitOnSite }
}

export function syncTransportationAttendees(
  plan: EventTransportationPlan,
  attendeeNames: string[],
): EventTransportationPlan {
  const nextRoster = [...new Set(attendeeNames.map((name) => name.trim()).filter(Boolean))]
  const previousRoster = plan.attendeeRoster
  const added = previousRoster
    ? nextRoster.filter((name) => !previousRoster.includes(name))
    : nextRoster
  const removed = previousRoster
    ? previousRoster.filter((name) => !nextRoster.includes(name))
    : []
  if (added.length === 0 && removed.length === 0 && previousRoster) return plan
  return {
    ...plan,
    attendeeRoster: nextRoster,
    legs: plan.legs.map((leg) => ({
      ...leg,
      passengers: [
        ...leg.passengers.filter((name) => !removed.includes(name)),
        ...added.filter((name) => !leg.passengers.includes(name)),
      ],
    })),
  }
}

export function eventTransportationPlace(event: Pick<EventWithDetails, 'location_name' | 'address'>): TransportationPlace {
  const address = event.address?.trim() || ''
  return {
    name: event.location_name?.trim() || address || 'Event location',
    address,
    kind: 'event',
  }
}

export function transportationPlaceMatchesEvent(
  place: TransportationPlace,
  event: Pick<EventWithDetails, 'location_name' | 'address'>,
): boolean {
  return place.name.trim() === (event.location_name?.trim() || event.address?.trim() || '')
    && place.address.trim() === (event.address?.trim() || '')
}

export function isTransportationEventPlace(place: TransportationPlace): boolean {
  return place.kind === 'event' || place.name.trim().toLowerCase() === 'event location'
}

export function updateTransportationEventPlace(
  plan: EventTransportationPlan,
  place: TransportationPlace,
): EventTransportationPlan {
  const eventPlace = { ...place, kind: 'event' as const }
  return {
    ...plan,
    legs: plan.legs.map((leg) => ({
      ...leg,
      origin: isTransportationEventPlace(leg.origin) ? eventPlace : leg.origin,
      destination: isTransportationEventPlace(leg.destination) ? eventPlace : leg.destination,
    })),
  }
}

export function hydrateTransportationEventPlaces(
  plan: EventTransportationPlan,
  event: Pick<EventWithDetails, 'location_name' | 'address'>,
): EventTransportationPlan {
  const current = eventTransportationPlace(event)
  const hasStoredEventLocation = Boolean(event.location_name?.trim() || event.address?.trim())
  return {
    ...plan,
    legs: plan.legs.map((leg) => ({
      ...leg,
      origin: isTransportationEventPlace(leg.origin)
        ? (hasStoredEventLocation ? current : { ...leg.origin, kind: 'event' })
        : leg.origin,
      destination: isTransportationEventPlace(leg.destination)
        ? (hasStoredEventLocation ? current : { ...leg.destination, kind: 'event' })
        : leg.destination,
    })),
  }
}

export function appendReturnHomeLeg(
  plan: EventTransportationPlan,
  event: EventWithDetails,
  homeAddress: string,
): EventTransportationPlan {
  const previous = plan.legs.at(-1)
  if (!previous) return plan
  return {
    ...plan,
    legs: [
      ...plan.legs,
      {
        id: crypto.randomUUID(),
        origin: previous.destination,
        destination: { name: 'Home', address: homeAddress },
        driverId: previous.driverId,
        driverName: previous.driverName,
        passengers: [...previous.passengers],
        purpose: 'return',
        timing: 'depart_at',
        time: eventTimeValue(event.end_time),
      },
    ],
  }
}

export function updateTransportationPlace(
  plan: EventTransportationPlan,
  legIndex: number,
  side: 'origin' | 'destination',
  place: TransportationPlace,
): EventTransportationPlan {
  const changed = plan.legs[legIndex]
  if (!changed) return plan
  const previousPlace = changed[side]
  const legs = plan.legs.map((leg) => ({
    ...leg,
    origin: { ...leg.origin },
    destination: { ...leg.destination },
  }))
  legs[legIndex] = { ...legs[legIndex], [side]: place }

  if (
    side === 'destination'
    && legs[legIndex + 1]
    && legs[legIndex + 1].origin.name === previousPlace.name
    && legs[legIndex + 1].origin.address === previousPlace.address
  ) {
    legs[legIndex + 1] = { ...legs[legIndex + 1], origin: place }
  }
  if (
    side === 'origin'
    && legs[legIndex - 1]
    && legs[legIndex - 1].destination.name === previousPlace.name
    && legs[legIndex - 1].destination.address === previousPlace.address
  ) {
    legs[legIndex - 1] = { ...legs[legIndex - 1], destination: place }
  }
  return { ...plan, legs }
}

export function updateTransportationDriver(
  plan: EventTransportationPlan,
  legIndex: number,
  driver: { id: string | null; name: string },
  applyToRemaining: boolean,
): EventTransportationPlan {
  return {
    ...plan,
    legs: plan.legs.map((leg, index) =>
      index === legIndex || (applyToRemaining && index > legIndex)
        ? { ...leg, driverId: driver.id, driverName: driver.name }
        : leg,
    ),
  }
}

export function buildEventTransportationPlan(
  event: EventWithDetails,
  homeAddress: string,
  driver?: { id: string | null; name: string } | null,
  options?: { waitOnSite?: boolean },
): EventTransportationPlan {
  const base = createDefaultTransportationPlan(event, homeAddress, driver)
  const waitOnSite = options?.waitOnSite ?? true
  const withWait = updateTransportationWait(base, waitOnSite)
  const fullPlan = appendReturnHomeLeg(withWait, event, homeAddress)
  if (driver) {
    return updateTransportationDriver(fullPlan, 0, driver, true)
  }
  return fullPlan
}

export function applyDriverChangeToPlan(
  plan: EventTransportationPlan,
  legIndex: number,
  driver: { id: string | null; name: string },
  syncBoth: boolean = false,
): EventTransportationPlan {
  const shouldSync = syncBoth || plan.waitOnSite || plan.legs.length <= 1
  return updateTransportationDriver(plan, legIndex, driver, shouldSync)
}

export function buildEventTransportationPlanForMode(
  event: EventWithDetails,
  homeAddress: string,
  mode: LogisticsMode,
  options?: {
    driver1?: { id: string | null; name: string } | null
    driver2?: { id: string | null; name: string } | null
  },
): EventTransportationPlan {
  const destinationName = event.location_name?.trim() || event.address?.trim() || 'Event location'
  const destinationAddress = event.address?.trim() || ''
  const attendeeRoster = eventPassengerNames(event)
  const d1 = options?.driver1 ?? null
  const d2 = options?.driver2 ?? d1

  if (mode === 'none') {
    return {
      version: 1,
      source: 'manual',
      waitOnSite: false,
      attendeeRoster,
      legs: [],
    }
  }

  if (mode === 'dropoff_only') {
    return {
      version: 1,
      source: 'manual',
      waitOnSite: false,
      attendeeRoster,
      legs: [{
        id: crypto.randomUUID(),
        origin: { name: 'Home', address: homeAddress },
        destination: { name: destinationName, address: destinationAddress, kind: 'event' },
        driverId: d1?.id ?? null,
        driverName: d1?.name ?? '',
        passengers: attendeeRoster,
        purpose: 'dropoff',
        timing: 'arrive_by',
        time: eventTimeValue(event.start_time),
      }],
    }
  }

  if (mode === 'pickup_only') {
    return {
      version: 1,
      source: 'manual',
      waitOnSite: false,
      attendeeRoster,
      legs: [{
        id: crypto.randomUUID(),
        origin: { name: destinationName, address: destinationAddress, kind: 'event' },
        destination: { name: 'Home', address: homeAddress },
        driverId: d2?.id ?? null,
        driverName: d2?.name ?? '',
        passengers: attendeeRoster,
        purpose: 'pickup',
        timing: 'depart_at',
        time: eventTimeValue(event.end_time),
      }],
    }
  }

  const waitOnSite = mode === 'stay'
  return {
    version: 1,
    source: 'manual',
    waitOnSite,
    attendeeRoster,
    legs: [
      {
        id: crypto.randomUUID(),
        origin: { name: 'Home', address: homeAddress },
        destination: { name: destinationName, address: destinationAddress, kind: 'event' },
        driverId: d1?.id ?? null,
        driverName: d1?.name ?? '',
        passengers: attendeeRoster,
        purpose: waitOnSite ? 'appointment' : 'dropoff',
        timing: 'arrive_by',
        time: eventTimeValue(event.start_time),
      },
      {
        id: crypto.randomUUID(),
        origin: { name: destinationName, address: destinationAddress, kind: 'event' },
        destination: { name: 'Home', address: homeAddress },
        driverId: (waitOnSite ? d1?.id : d2?.id) ?? null,
        driverName: (waitOnSite ? d1?.name : d2?.name) ?? '',
        passengers: attendeeRoster,
        purpose: waitOnSite ? 'return' : 'pickup',
        timing: 'depart_at',
        time: eventTimeValue(event.end_time),
      },
    ],
  }
}

export function applyLogisticsModeToPlan(
  plan: EventTransportationPlan,
  mode: LogisticsMode,
  event: EventWithDetails,
  homeAddress: string,
): EventTransportationPlan {
  const driver1 = plan.legs[0] ? { id: plan.legs[0].driverId, name: plan.legs[0].driverName } : null
  const driver2 = plan.legs[1] ? { id: plan.legs[1].driverId, name: plan.legs[1].driverName } : driver1
  return buildEventTransportationPlanForMode(event, homeAddress, mode, { driver1, driver2 })
}

export function applyWaitBehaviorToPlan(
  plan: EventTransportationPlan,
  behavior: 'stay' | 'dropoff' | LogisticsMode,
  event: EventWithDetails,
  homeAddress: string,
): EventTransportationPlan {
  if (behavior === 'stay') {
    return applyLogisticsModeToPlan(plan, 'stay', event, homeAddress)
  }
  if (behavior === 'dropoff' || behavior === 'two_way') {
    return applyLogisticsModeToPlan(plan, 'two_way', event, homeAddress)
  }
  if (behavior === 'dropoff_only') {
    return applyLogisticsModeToPlan(plan, 'dropoff_only', event, homeAddress)
  }
  if (behavior === 'pickup_only') {
    return applyLogisticsModeToPlan(plan, 'pickup_only', event, homeAddress)
  }
  if (behavior === 'none') {
    return applyLogisticsModeToPlan(plan, 'none', event, homeAddress)
  }
  return applyLogisticsModeToPlan(plan, 'stay', event, homeAddress)
}

export interface CalculatedRouteDetails {
  found: boolean
  driveMinutes: number
  distanceMiles: number
  departureTimeIso: string | null
  arrivalTimeIso: string | null
  trafficDelayMinutes: number
  routeSummary: string | null
  error?: string
}

export function parseDistanceMilesFromSummary(summary?: string | null): number {
  if (!summary) return 0
  const match = summary.match(/([0-9]+(?:\.[0-9]+)?)\s*mi\b/i)
  return match ? Number(match[1]) : 0
}

export function buildLogisticsStepsFromRoute({
  eventId,
  eventTitle,
  startTime,
  endTime,
  venueName,
  venueAddress,
  homeAddress,
  driveMinutes,
  distanceMiles,
  driverLeg1 = 'Jake',
  driverLeg2 = 'Jake',
  attendees = [],
  waitOnSite = true,
  mode,
  bufferMinutes = 5,
}: {
  eventId: string
  eventTitle: string
  startTime: string
  endTime: string
  venueName: string
  venueAddress: string
  homeAddress?: string
  driveMinutes: number
  distanceMiles: number
  driverLeg1?: string
  driverLeg2?: string
  attendees?: string[]
  waitOnSite?: boolean
  mode?: LogisticsMode | 'stay' | 'dropoff'
  bufferMinutes?: number
}) {
  const resolvedMode: LogisticsMode = mode === 'dropoff'
    ? 'two_way'
    : (mode ?? (waitOnSite ? 'stay' : 'two_way'))

  if (resolvedMode === 'none') {
    return []
  }

  const startDate = new Date(startTime)
  const endDate = new Date(endTime)
  const isInvalidDate = Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())

  const totalPreMinutes = Math.max(0, driveMinutes) + Math.max(0, bufferMinutes)
  const departureDate = isInvalidDate ? new Date() : new Date(startDate.getTime() - totalPreMinutes * 60_000)
  const returnDate = isInvalidDate ? new Date() : new Date(endDate.getTime() + Math.max(0, driveMinutes) * 60_000)
  const pickupDepartDate = isInvalidDate ? new Date() : new Date(endDate.getTime() - totalPreMinutes * 60_000)

  const attendeesText = attendees.length > 0 ? attendees.join(', ') : 'Family'
  const durationMinutes = isInvalidDate ? 60 : Math.max(15, Math.round((endDate.getTime() - startDate.getTime()) / 60_000))
  const hours = Math.floor(durationMinutes / 60)
  const mins = durationMinutes % 60
  const durationText = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`

  if (resolvedMode === 'dropoff_only') {
    return [
      {
        id: crypto.randomUUID(),
        event_id: eventId,
        sort_order: 1,
        step_type: 'departure',
        icon: '🚗',
        title: 'Leg 1: Drop Off Drive',
        description: `${driveMinutes} min drive · ${distanceMiles} miles · ${driverLeg1} driving ${attendeesText}`,
        time: departureDate.toISOString(),
        location_name: 'Home',
        address: homeAddress || '',
      },
      {
        id: crypto.randomUUID(),
        event_id: eventId,
        sort_order: 2,
        step_type: 'arrival',
        icon: '📍',
        title: venueName || eventTitle || 'Destination',
        description: `${attendeesText} at venue · Driver departs after drop-off`,
        time: startDate.toISOString(),
        location_name: venueName || 'Destination',
        address: venueAddress || '',
      },
    ]
  }

  if (resolvedMode === 'pickup_only') {
    return [
      {
        id: crypto.randomUUID(),
        event_id: eventId,
        sort_order: 1,
        step_type: 'departure',
        icon: '🚗',
        title: 'Leg 1: Pickup Departure Drive',
        description: `${driveMinutes} min drive · ${distanceMiles} miles · ${driverLeg2 || driverLeg1} leaving to pick up ${attendeesText}`,
        time: pickupDepartDate.toISOString(),
        location_name: 'Home',
        address: homeAddress || '',
      },
      {
        id: crypto.randomUUID(),
        event_id: eventId,
        sort_order: 2,
        step_type: 'return',
        icon: '🏠',
        title: 'Return Home with Passengers',
        description: `${driveMinutes} min return drive · ${driverLeg2 || driverLeg1} driving ${attendeesText}`,
        time: returnDate.toISOString(),
        location_name: 'Home',
        address: homeAddress || '',
      },
    ]
  }

  if (resolvedMode === 'stay') {
    return [
      {
        id: crypto.randomUUID(),
        event_id: eventId,
        sort_order: 1,
        step_type: 'departure',
        icon: '🚗',
        title: 'Depart Home Together',
        description: `${driveMinutes} min drive · ${distanceMiles} miles · ${driverLeg1} driving ${attendeesText}`,
        time: departureDate.toISOString(),
        location_name: 'Home',
        address: homeAddress || '',
      },
      {
        id: crypto.randomUUID(),
        event_id: eventId,
        sort_order: 2,
        step_type: 'arrival',
        icon: '📍',
        title: venueName || eventTitle || 'Destination',
        description: `${driverLeg1} stays on site with ${attendeesText} (${durationText})`,
        time: startDate.toISOString(),
        location_name: venueName || 'Destination',
        address: venueAddress || '',
      },
      {
        id: crypto.randomUUID(),
        event_id: eventId,
        sort_order: 3,
        step_type: 'return',
        icon: '🏠',
        title: 'Return Home Together',
        description: `${driveMinutes} min return drive · ${driverLeg1} driving`,
        time: returnDate.toISOString(),
        location_name: 'Home',
        address: homeAddress || '',
      },
    ]
  }

  // resolvedMode === 'two_way'
  return [
    {
      id: crypto.randomUUID(),
      event_id: eventId,
      sort_order: 1,
      step_type: 'departure',
      icon: '🚗',
      title: 'Leg 1: Drop Off Drive',
      description: `${driveMinutes} min drive · ${distanceMiles} miles · ${driverLeg1} driving ${attendeesText}`,
      time: departureDate.toISOString(),
      location_name: 'Home',
      address: homeAddress || '',
    },
    {
      id: crypto.randomUUID(),
      event_id: eventId,
      sort_order: 2,
      step_type: 'arrival',
      icon: '📍',
      title: venueName || eventTitle || 'Destination',
      description: `${attendeesText} at venue · Pickup scheduled at end`,
      time: startDate.toISOString(),
      location_name: venueName || 'Destination',
      address: venueAddress || '',
    },
    {
      id: crypto.randomUUID(),
      event_id: eventId,
      sort_order: 3,
      step_type: 'pickup',
      icon: '🏠',
      title: 'Leg 2: Return Pickup Drive',
      description: `${driveMinutes} min return drive · ${driverLeg2} driving`,
      time: returnDate.toISOString(),
      location_name: 'Home',
      address: homeAddress || '',
    },
  ]
}
