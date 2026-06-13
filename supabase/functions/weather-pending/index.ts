import { createClient } from 'npm:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  const now = new Date()
  const windowEnd = new Date(now.getTime() + 4 * 24 * 60 * 60 * 1000)

  const { data: events, error } = await sb
    .from('events')
    .select(`id, title, location_name, address, event_enrichments ( weather_at_event )`)
    .eq('status', 'confirmed')
    .gte('start_time', now.toISOString())
    .lte('start_time', windowEnd.toISOString())
    .order('start_time')
    .limit(20)

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...CORS, 'content-type': 'application/json' } })
  }

  const needsWeather = (events ?? []).filter((ev) => {
    if (!ev.location_name && !ev.address) return false
    const enr = Array.isArray(ev.event_enrichments) ? ev.event_enrichments[0] : ev.event_enrichments
    return !enr?.weather_at_event
  })

  const results: Record<string, unknown> = {}
  let updated = 0, skipped = 0, failed = 0

  for (const ev of needsWeather) {
    const { data, error: invokeError } = await sb.functions.invoke('fetch-event-weather', {
      body: { event_id: ev.id },
    })

    if (invokeError) {
      results[ev.id] = { error: invokeError.message }
      failed++
      continue
    }

    const payload = (data ?? {}) as { ok?: boolean; weather?: string; skipped?: string; error?: string; icon?: string }
    if (payload.ok && !payload.skipped) {
      results[ev.id] = { ok: true, weather: payload.weather, icon: payload.icon }
      updated++
    } else if (payload.skipped) {
      results[ev.id] = { skipped: payload.skipped }
      skipped++
    } else {
      results[ev.id] = { error: payload.error ?? 'fetch-event-weather failed' }
      failed++
    }
  }

  return new Response(
    JSON.stringify({ ok: true, updated, skipped, failed, total: needsWeather.length, results }),
    { headers: { ...CORS, 'content-type': 'application/json' } }
  )
})
