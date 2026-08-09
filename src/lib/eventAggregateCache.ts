import type { QueryClient } from '@tanstack/react-query'
import type { EventWithDetails } from '../hooks/useCalendarEvents'
import type { EventTransportationPlan } from './eventTransportation'

export type EventAggregatePatch = Partial<EventWithDetails>

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function patchEventRecord(
  value: unknown,
  eventId: string,
  patch: EventAggregatePatch,
): unknown {
  if (!isRecord(value) || value.id !== eventId) return value
  return { ...value, ...patch }
}

function patchEventCollection(
  value: unknown,
  eventId: string,
  patch: EventAggregatePatch,
): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => patchEventRecord(entry, eventId, patch))
  }
  if (isRecord(value) && Array.isArray(value.events)) {
    return {
      ...value,
      events: value.events.map((entry) => patchEventRecord(entry, eventId, patch)),
    }
  }
  return patchEventRecord(value, eventId, patch)
}

function patchTransportationCollection(
  value: unknown,
  eventId: string,
  transportationPlan: EventTransportationPlan | null,
): unknown {
  if (!Array.isArray(value)) return value
  const existingIndex = value.findIndex((entry) => isRecord(entry) && entry.event_id === eventId)
  if (transportationPlan == null) {
    return existingIndex >= 0 ? value.filter((_, index) => index !== existingIndex) : value
  }
  if (existingIndex < 0) {
    return [...value, { event_id: eventId, transportation_plan: transportationPlan }]
  }
  return value.map((entry, index) => (
    index === existingIndex && isRecord(entry)
      ? { ...entry, transportation_plan: transportationPlan }
      : entry
  ))
}

export function applyEventAggregatePatch(
  queryClient: QueryClient,
  eventId: string,
  patch: EventAggregatePatch,
) {
  queryClient.setQueriesData(
    { queryKey: ['events'] },
    (current) => patchEventCollection(current, eventId, patch),
  )
  queryClient.setQueryData(
    ['event-details', eventId],
    (current: unknown) => patchEventCollection(current, eventId, patch),
  )

  if (
    patch.plan_override !== undefined
    && patch.plan_override !== null
    && Object.prototype.hasOwnProperty.call(patch.plan_override, 'transportation_plan')
  ) {
    queryClient.setQueriesData(
      { queryKey: ['event-transportation-plans'] },
      (current) => patchTransportationCollection(
        current,
        eventId,
        patch.plan_override?.transportation_plan ?? null,
      ),
    )
  }
}

export function publishEventAggregatePatch(
  queryClient: QueryClient,
  eventId: string,
  patch: EventAggregatePatch,
  target: EventTarget | null = typeof window === 'undefined' ? null : window,
) {
  applyEventAggregatePatch(queryClient, eventId, patch)
  if (!target) return
  target.dispatchEvent(new CustomEvent('casa:event-updated', {
    detail: { eventId, patch },
  }))
  target.dispatchEvent(new CustomEvent('casa:overrides-updated', {
    detail: { eventId },
  }))
}
