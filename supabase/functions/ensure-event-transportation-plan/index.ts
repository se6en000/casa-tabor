import { createClient } from 'npm:@supabase/supabase-js@2'
import {
  buildGeneratedTransportationPlan,
  classifyTransportationDefault,
  mayReplaceTransportationPlan,
} from '../_shared/event-transportation-defaults.mjs'
import { selectConfidentEventPlace } from '../_shared/event-place-resolution.mjs'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-casa-transportation-trigger, x-client-info, apikey, content-type',
}

interface PlaceSearchResponse {
  places?: Array<{
    id?: string
    displayName?: { text?: string }
    formattedAddress?: string
    location?: { latitude?: number; longitude?: number }
    primaryType?: string
  }>
  error?: { message?: string }
}

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'content-type': 'application/json' },
  })
}

function bearerToken(req: Request) {
  const header = req.headers.get('authorization') ?? ''
  return header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : ''
}

function locationSignature(event: {
  location_name?: string | null
  address?: string | null
  lat?: number | null
  lng?: number | null
}) {
  return [
    event.location_name?.trim().toLowerCase() ?? '',
    event.address?.trim().toLowerCase() ?? '',
    event.lat ?? '',
    event.lng ?? '',
  ].join('|')
}

function hasStateOrPostalHint(value: string) {
  const normalized = value.trim()
  return /,\s*[A-Z]{2}\b/.test(normalized)
    || /\b(?:\d{5})(?:-\d{4})?\b/.test(normalized)
}

function applyHomeStateBias(query: string, homeState?: string | null) {
  const state = homeState?.trim()
  if (!state || hasStateOrPostalHint(query)) return query
  return `${query}, ${state}`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const triggerSecret = Deno.env.get('TRANSPORTATION_TRIGGER_SECRET')
  if (!supabaseUrl || !serviceRoleKey) return json({ error: 'Service credentials are missing' }, 500)
  const serviceAuthorized = bearerToken(req) === serviceRoleKey
  const triggerAuthorized = Boolean(
    triggerSecret
    && req.headers.get('x-casa-transportation-trigger') === triggerSecret,
  )
  if (!serviceAuthorized && !triggerAuthorized) return json({ error: 'Unauthorized' }, 401)

  const body = await req.json().catch(() => null) as { event_id?: string } | null
  const eventId = body?.event_id?.trim()
  if (!eventId) return json({ error: 'event_id required' }, 400)

  const sb = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })
  const complete = async (payload: Record<string, unknown>) => {
    const { error } = await sb
      .from('event_transportation_generation_queue')
      .delete()
      .eq('event_id', eventId)
    if (error) return json({ error: `Plan saved but queue acknowledgement failed: ${error.message}` }, 500)
    return json(payload)
  }
  const { data: rawEvent, error: eventError } = await sb
    .from('events')
    .select(`
      id, title, start_time, end_time, all_day, event_type, status, deleted_at,
      location_name, address, lat, lng, record_kind, series_id, exception_paths,
      event_enrichments(category),
      event_plan_overrides(
        event_id, waits, driver_overrides, mode_override, transportation_plan,
        verified, location_signature, location_projection_blocked
      ),
      event_members(
        role,
        family_member:family_members(id, name, role, can_drive)
      )
    `)
    .eq('id', eventId)
    .maybeSingle()
  if (eventError) return json({ error: eventError.message }, 500)
  if (!rawEvent) return json({ error: 'event not found' }, 404)

  const enrichment = Array.isArray(rawEvent.event_enrichments)
    ? rawEvent.event_enrichments[0] ?? null
    : rawEvent.event_enrichments
  const override = Array.isArray(rawEvent.event_plan_overrides)
    ? rawEvent.event_plan_overrides[0] ?? null
    : rawEvent.event_plan_overrides
  const members = (rawEvent.event_members ?? []).flatMap((membership) => {
    const familyMember = Array.isArray(membership.family_member)
      ? membership.family_member[0]
      : membership.family_member
    if (!familyMember) return []
    return [{
      ...familyMember,
      assignment_role: membership.role,
    }]
  })
  let event = {
    ...rawEvent,
    category: enrichment?.category ?? null,
  }
  const legacy = {
    waits: override?.waits ?? null,
    driver_overrides: override?.driver_overrides ?? {},
    mode_override: override?.mode_override ?? null,
  }
  const currentPlan = override?.transportation_plan ?? null
  if (!mayReplaceTransportationPlan(currentPlan)) {
    return complete({ ok: true, skipped: 'manual_plan' })
  }
  if (
    event.record_kind === 'occurrence'
    && event.series_id
    && Array.isArray(event.exception_paths)
    && event.exception_paths.length === 0
  ) {
    const { data: series, error: seriesError } = await sb
      .from('event_series')
      .select('template_event_id')
      .eq('id', event.series_id)
      .maybeSingle()
    if (seriesError) return json({ error: seriesError.message }, 500)
    if (series?.template_event_id) {
      const { data: templateOverride, error: templateError } = await sb
        .from('event_plan_overrides')
        .select('transportation_plan')
        .eq('event_id', series.template_event_id)
        .maybeSingle()
      if (templateError) return json({ error: templateError.message }, 500)
      if (templateOverride?.transportation_plan?.source === 'generated') {
        const { error: inheritError } = await sb
          .from('event_plan_overrides')
          .upsert({
            event_id: eventId,
            transportation_plan: templateOverride.transportation_plan,
          }, { onConflict: 'event_id' })
        if (inheritError) return json({ error: inheritError.message }, 500)
        return complete({
          ok: true,
          event_id: eventId,
          generated: true,
          inherited_from_template: series.template_event_id,
        })
      }
    }
  }

  const { data: homeSetting, error: homeError } = await sb
    .from('settings')
    .select('value')
    .eq('key', 'home_config')
    .maybeSingle()
  if (homeError) return json({ error: homeError.message }, 500)
  const homeConfig = homeSetting?.value as {
    address?: string
    city?: string
    state?: string
    zip?: string
  } | null

  const initialClassification = classifyTransportationDefault(event, legacy)
  if (
    !event.address?.trim()
    && (initialClassification.kind === 'appointment' || initialClassification.kind === 'pickup')
  ) {
    const query = event.location_name?.trim()
    if (!query) return complete({ ok: true, skipped: 'missing_location_query' })

    const { data: reusableLocation, error: reusableError } = await sb
      .from('events')
      .select('location_name, address, lat, lng')
      .eq('title', event.title)
      .eq('location_name', event.location_name)
      .neq('id', eventId)
      .not('address', 'is', null)
      .neq('address', '')
      .limit(1)
      .maybeSingle()
    if (reusableError) return json({ error: reusableError.message }, 500)

    let match: NonNullable<PlaceSearchResponse['places']>[number] | null = reusableLocation
      ? {
          displayName: { text: reusableLocation.location_name ?? undefined },
          formattedAddress: reusableLocation.address ?? undefined,
          location: {
            latitude: reusableLocation.lat ?? undefined,
            longitude: reusableLocation.lng ?? undefined,
          },
        }
      : null
    if (!match) {
      const mapsApiKey = Deno.env.get('GOOGLE_MAPS_API_KEY')
      if (!mapsApiKey) return json({ error: 'GOOGLE_MAPS_API_KEY not set' }, 500)
      const textQuery = applyHomeStateBias(query, homeConfig?.state)
      const placesResponse = await fetch('https://places.googleapis.com/v1/places:searchText', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'X-Goog-Api-Key': mapsApiKey,
          'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location,places.primaryType',
        },
        body: JSON.stringify({ textQuery, maxResultCount: 1 }),
      })
      const places = await placesResponse.json() as PlaceSearchResponse
      if (!placesResponse.ok) {
        return json({ error: places.error?.message ?? 'Places API error' }, 502)
      }
      const candidate = places.places?.[0] ?? null
      match = candidate && selectConfidentEventPlace(query, [{
        name: candidate.displayName?.text,
        address: candidate.formattedAddress,
        primary_type: candidate.primaryType,
      }])
        ? candidate
        : null
    }
    const address = match?.formattedAddress?.trim()
    if (!address) return complete({ ok: true, skipped: 'no_place_match' })

    const { error: blockError } = await sb
      .from('event_plan_overrides')
      .upsert({
        event_id: eventId,
        verified: false,
        location_projection_blocked: true,
      }, { onConflict: 'event_id' })
    if (blockError) return json({ error: blockError.message }, 500)

    const updatedLocation = {
      location_name: match?.displayName?.text?.trim() || event.location_name?.trim() || address,
      address,
      lat: match?.location?.latitude ?? null,
      lng: match?.location?.longitude ?? null,
      updated_at: new Date().toISOString(),
    }
    const { data: updatedEvent, error: updateError } = await sb
      .from('events')
      .update(updatedLocation)
      .eq('id', eventId)
      .select('location_name, address, lat, lng')
      .single()
    if (updateError) return json({ error: updateError.message }, 500)
    event = { ...event, ...updatedEvent }

    const { error: reviewError } = await sb
      .from('event_plan_overrides')
      .upsert({
        event_id: eventId,
        verified: false,
        location_signature: locationSignature(event),
        location_projection_blocked: true,
      }, { onConflict: 'event_id' })
    if (reviewError) return json({ error: reviewError.message }, 500)
  }

  const homeAddress = [
    homeConfig?.address,
    homeConfig?.city,
    homeConfig?.state,
    homeConfig?.zip,
  ].filter(Boolean).join(', ').trim()

  const { data: householdMembers, error: householdError } = await sb
    .from('family_members')
    .select('id, name, role, can_drive')
  if (householdError) return json({ error: householdError.message }, 500)

  const generated = buildGeneratedTransportationPlan({
    event,
    homeAddress,
    members,
    householdMembers: householdMembers ?? [],
    legacy,
  })
  const { error: planError } = await sb
    .from('event_plan_overrides')
    .upsert({
      event_id: eventId,
      transportation_plan: generated.plan,
    }, { onConflict: 'event_id' })
  if (planError) return json({ error: planError.message }, 500)

  if (generated.plan && event.record_kind === 'series_template') {
    const { data: seriesRows, error: seriesError } = await sb
      .from('event_series')
      .select('id')
      .eq('template_event_id', eventId)
    if (seriesError) return json({ error: seriesError.message }, 500)
    for (const series of seriesRows ?? []) {
      const response = await fetch(`${supabaseUrl}/functions/v1/materialize-recurring-events`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${serviceRoleKey}`,
          apikey: serviceRoleKey,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ series_id: series.id }),
      })
      const materialized = await response.json().catch(() => null)
      if (!response.ok || materialized?.error || materialized?.success === false) {
        return json({
          error: materialized?.error
            ?? `Could not propagate transportation plan for series ${series.id}`,
        }, 500)
      }
    }
  }

  return complete({
    ok: true,
    event_id: eventId,
    classification: generated.classification,
    generated: Boolean(generated.plan),
    location_projection_blocked: Boolean(
      !rawEvent.address?.trim() && event.address?.trim(),
    ),
  })
})
