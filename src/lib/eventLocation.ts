import type { EventWithDetails } from '../hooks/useCalendarEvents'
import { supabase } from './supabase'
import {
  normalizeTransportationPlan,
  updateTransportationEventPlace,
  type TransportationPlace,
} from './eventTransportation'

export type EventLocationScope = 'this' | 'future' | 'all'

interface UpdatedEventLocation {
  id: string
  location_name: string | null
  address: string | null
  lat: number | null
  lng: number | null
}

function locationSignature(event: UpdatedEventLocation): string {
  return [
    event.location_name?.trim().toLowerCase() ?? '',
    event.address?.trim().toLowerCase() ?? '',
    event.lat ?? '',
    event.lng ?? '',
  ].join('|')
}

export function isTrustedPlaceSelection(place: TransportationPlace): boolean {
  return place.source === 'google' || place.source === 'saved'
}

export async function persistScopedEventLocation({
  event,
  place,
  scope,
}: {
  event: EventWithDetails
  place: TransportationPlace
  scope: EventLocationScope
}): Promise<UpdatedEventLocation[]> {
  const locationName = place.name.trim() || null
  const address = place.address.trim() || null
  if (!locationName && !address) throw new Error('Choose or enter an event location.')

  const trusted = isTrustedPlaceSelection(place)
  const payload = {
    location_name: locationName,
    address,
    lat: trusted ? (place.lat ?? null) : null,
    lng: trusted ? (place.lng ?? null) : null,
    updated_at: new Date().toISOString(),
  }
  const masterId = event.recurrence_master_id ?? event.id
  const recurring = Boolean(event.rrule || event.recurrence_master_id)

  let update = supabase.from('events').update(payload)
  if (!recurring || scope === 'this') {
    update = update.eq('id', event.id)
  } else if (scope === 'all') {
    update = update.or(`id.eq.${masterId},recurrence_master_id.eq.${masterId}`)
  } else {
    update = update.or(
      `id.eq.${masterId},and(recurrence_master_id.eq.${masterId},start_time.gte.${event.start_time})`,
    )
  }

  const { data: updated, error } = await update.select('id, location_name, address, lat, lng')
  if (error) throw new Error(`Could not update event location: ${error.message}`)
  const rows = (updated ?? []) as UpdatedEventLocation[]
  if (rows.length === 0) throw new Error('No matching events were updated.')

  const ids = rows.map((row) => row.id)
  const { data: overrides, error: overridesError } = await supabase
    .from('event_plan_overrides')
    .select('event_id, transportation_plan')
    .in('event_id', ids)
  if (overridesError) throw new Error(`Location saved, but its event plans could not be updated: ${overridesError.message}`)

  const overridesByEvent = new Map((overrides ?? []).map((override) => [override.event_id, override]))
  const nextPlace = { ...place, name: locationName ?? address ?? '', address: address ?? '', kind: 'event' as const }
  const overrideRows = rows.map((row) => {
    const currentPlan = normalizeTransportationPlan(overridesByEvent.get(row.id)?.transportation_plan)
    return {
      event_id: row.id,
      verified: false,
      location_signature: locationSignature(row),
      location_projection_blocked: false,
      transportation_plan: currentPlan ? updateTransportationEventPlace(currentPlan, nextPlace) : null,
    }
  })
  const { error: upsertError } = await supabase
    .from('event_plan_overrides')
    .upsert(overrideRows, { onConflict: 'event_id' })
  if (upsertError) throw new Error(`Location saved, but its review state could not be updated: ${upsertError.message}`)

  if (!recurring || scope === 'this') {
    void supabase.functions.invoke('sync-event-to-google', { body: { event_id: event.id } })
  } else {
    void supabase.functions.invoke('update-recurring-google', { body: { master_event_id: masterId } })
  }

  return rows
}
