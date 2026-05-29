import { createClient } from 'npm:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  const sb = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))

  // Find all un-enriched events from the last 90 days + next 90 days
  const now = new Date()
  const timeMin = new Date(now.getTime() - 7 * 86400000).toISOString()
  const timeMax = new Date(now.getTime() + 90 * 86400000).toISOString()

  const { data: events, error } = await sb
    .from('events')
    .select('id, title')
    .eq('is_enriched', false)
    .eq('status', 'confirmed')
    .gte('start_time', timeMin)
    .lte('start_time', timeMax)
    .order('start_time')
    .limit(5) // process max 5 per run to stay within Edge Function CPU budget

  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...CORS, 'content-type': 'application/json' } })

  const results: Record<string, unknown> = {}
  let enriched = 0, failed = 0

  for (const ev of events ?? []) {
    try {
      const r = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/enrich-event`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
        },
        body: JSON.stringify({ event_id: ev.id }),
      })
      const d = await r.json()
      if (d.ok) { results[ev.id] = { ok: true, title: ev.title }; enriched++ }
      else { results[ev.id] = { error: d.error, title: ev.title }; failed++ }
    } catch (err) {
      results[ev.id] = { error: (err as Error).message }
      failed++
    }
    // Small delay to avoid rate limiting
    await new Promise(res => setTimeout(res, 200))
  }

  return new Response(
    JSON.stringify({ ok: true, total: (events ?? []).length, enriched, failed, results }),
    { headers: { ...CORS, 'content-type': 'application/json' } }
  )
})
