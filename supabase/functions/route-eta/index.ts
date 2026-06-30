import { createClient } from 'npm:@supabase/supabase-js@2'
import { computeTravelEta } from '../_shared/travel-eta.mjs'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })

  try {
    const mapsKey = Deno.env.get('GOOGLE_MAPS_API_KEY') ?? ''
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const body = await req.json().catch(() => ({}))

    const destination = String(body?.destination ?? '').trim()
    if (!destination) {
      return new Response(JSON.stringify({ found: false, error: 'Missing destination' }), {
        status: 400,
        headers: { ...CORS, 'content-type': 'application/json' },
      })
    }

    let origin = String(body?.origin ?? '').trim()
    if (!origin) {
      const { data } = await sb.from('settings').select('value').eq('key', 'home_config').maybeSingle()
      const hc = data?.value as { address?: string; city?: string; state?: string; zip?: string } | null
      origin = [hc?.address, hc?.city, hc?.state, hc?.zip].filter(Boolean).join(', ')
    }
    if (!origin) {
      return new Response(JSON.stringify({ found: false, error: 'No origin available. Configure Home Address in Settings.' }), {
        status: 400,
        headers: { ...CORS, 'content-type': 'application/json' },
      })
    }

    const arrivalTime = typeof body?.arrival_time === 'string' ? body.arrival_time : null
    const departureTime = typeof body?.departure_time === 'string' ? body.departure_time : null
    const rawBuffer = Number(body?.buffer_mins ?? 10)
    const bufferMins = Number.isFinite(rawBuffer) ? Math.max(0, Math.min(45, Math.round(rawBuffer))) : 10

    const result = await computeTravelEta({
      mapsKey,
      origin,
      destination,
      arrivalTimeIso: arrivalTime,
      departureTimeIso: departureTime,
      bufferMins,
    })

    return new Response(JSON.stringify(result), {
      status: result.found ? 200 : 502,
      headers: { ...CORS, 'content-type': 'application/json' },
    })
  } catch (error) {
    return new Response(JSON.stringify({ found: false, error: error instanceof Error ? error.message : 'Unexpected error' }), {
      status: 500,
      headers: { ...CORS, 'content-type': 'application/json' },
    })
  }
})
