import { createClient } from 'npm:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface PlaceSearchResponse {
  places?: Array<{
    id: string
    displayName?: { text?: string }
    formattedAddress?: string
    location?: { latitude?: number; longitude?: number }
  }>
  error?: { message?: string }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...CORS, 'content-type': 'application/json' },
    })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceRoleKey) {
    return new Response(JSON.stringify({ error: 'Supabase service credentials are missing' }), {
      status: 500,
      headers: { ...CORS, 'content-type': 'application/json' },
    })
  }
  const mapsApiKey = Deno.env.get('GOOGLE_MAPS_API_KEY')
  if (!mapsApiKey) {
    return new Response(JSON.stringify({ error: 'GOOGLE_MAPS_API_KEY not set' }), {
      status: 500,
      headers: { ...CORS, 'content-type': 'application/json' },
    })
  }

  const body = await req.json().catch(() => null) as { event_id?: string } | null
  const eventId = body?.event_id?.trim()
  if (!eventId) {
    return new Response(JSON.stringify({ error: 'event_id required' }), {
      status: 400,
      headers: { ...CORS, 'content-type': 'application/json' },
    })
  }

  const sb = createClient(supabaseUrl, serviceRoleKey)
  const { data: event, error: eventErr } = await sb
    .from('events')
    .select('id, location_name, address, lat, lng')
    .eq('id', eventId)
    .single()

  if (eventErr || !event) {
    return new Response(JSON.stringify({ error: eventErr?.message ?? 'event not found' }), {
      status: 404,
      headers: { ...CORS, 'content-type': 'application/json' },
    })
  }

  const locationName = event.location_name?.trim() || null
  const address = event.address?.trim() || null
  const query = [locationName, address].filter(Boolean).join(', ')

  if (!query) {
    const { error: clearErr } = await sb
      .from('events')
      .update({ lat: null, lng: null, updated_at: new Date().toISOString() })
      .eq('id', eventId)
    if (clearErr) {
      return new Response(JSON.stringify({ error: clearErr.message }), {
        status: 500,
        headers: { ...CORS, 'content-type': 'application/json' },
      })
    }
    return new Response(JSON.stringify({ ok: true, skipped: 'no_location', event_id: eventId }), {
      headers: { ...CORS, 'content-type': 'application/json' },
    })
  }

  const placesRes = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'X-Goog-Api-Key': mapsApiKey,
      'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.location',
    },
    body: JSON.stringify({ textQuery: query, maxResultCount: 1 }),
  })

  const placesData = await placesRes.json() as PlaceSearchResponse
  if (!placesRes.ok) {
    return new Response(JSON.stringify({ error: placesData.error?.message ?? 'Places API error' }), {
      status: 502,
      headers: { ...CORS, 'content-type': 'application/json' },
    })
  }

  const firstPlace = placesData.places?.[0]
  const latitude = firstPlace?.location?.latitude
  const longitude = firstPlace?.location?.longitude
  if (latitude == null || longitude == null) {
    return new Response(JSON.stringify({ ok: true, skipped: 'no_geocode_result', event_id: eventId }), {
      headers: { ...CORS, 'content-type': 'application/json' },
    })
  }

  const { error: updateErr } = await sb
    .from('events')
    .update({
      lat: latitude,
      lng: longitude,
      updated_at: new Date().toISOString(),
    })
    .eq('id', eventId)
  if (updateErr) {
    return new Response(JSON.stringify({ error: updateErr.message }), {
      status: 500,
      headers: { ...CORS, 'content-type': 'application/json' },
    })
  }

  return new Response(JSON.stringify({
    ok: true,
    event_id: eventId,
    lat: latitude,
    lng: longitude,
  }), {
    headers: { ...CORS, 'content-type': 'application/json' },
  })
})
