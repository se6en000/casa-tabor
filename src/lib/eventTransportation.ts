import type { EventWithDetails } from '../hooks/useCalendarEvents'

export type TransportationPurpose = 'drive' | 'pickup' | 'dropoff' | 'appointment' | 'return'
export type TransportationTiming = 'arrive_by' | 'depart_at'

export interface TransportationPlace {
  name: string
  address: string
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
  legs: TransportationLeg[]
}

const PURPOSES = new Set<TransportationPurpose>(['drive', 'pickup', 'dropoff', 'appointment', 'return'])
const TIMINGS = new Set<TransportationTiming>(['arrive_by', 'depart_at'])

function normalizePlace(value: unknown): TransportationPlace | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as Record<string, unknown>
  const name = typeof raw.name === 'string' ? raw.name.trim() : ''
  const address = typeof raw.address === 'string' ? raw.address.trim() : ''
  if (!name && !address) return null
  return { name: name || address, address }
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

  return legs.length > 0 ? { version: 1, legs } : null
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

export function createDefaultTransportationPlan(
  event: EventWithDetails,
  homeAddress: string,
  driver?: { id: string; name: string } | null,
): EventTransportationPlan {
  const destinationName = event.location_name?.trim() || event.address?.trim() || 'Event location'
  return {
    version: 1,
    legs: [{
      id: crypto.randomUUID(),
      origin: { name: 'Home', address: homeAddress },
      destination: { name: destinationName, address: event.address?.trim() || '' },
      driverId: driver?.id ?? null,
      driverName: driver?.name ?? '',
      passengers: [],
      purpose: 'drive',
      timing: 'arrive_by',
      time: eventTimeValue(event.start_time),
    }],
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
