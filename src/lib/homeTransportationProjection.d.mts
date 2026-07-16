import type { EventWithDetails } from '../hooks/useCalendarEvents'
import type { EventTransportationPlan, TransportationLeg } from './eventTransportation'

export interface ProjectedHomeDriver {
  id: string
  name: string
}

export interface ProjectedHomeTransportation {
  drivers: ProjectedHomeDriver[]
  nextDriver: ProjectedHomeDriver | null
  summary: string
  nextLeg: {
    leg: TransportationLeg
    index: number
    timingIso: string
    origin: string
    destination: string
  } | null
  hasUnassignedLeg: boolean
}

export function transportationLegTimeIso(
  event: Pick<EventWithDetails, 'start_time' | 'end_time'>,
  leg: TransportationLeg,
): string | null

export function projectHomeTransportation(
  event: Pick<EventWithDetails, 'start_time' | 'end_time'>,
  plan: EventTransportationPlan | null | undefined,
  now?: Date,
): ProjectedHomeTransportation | null
