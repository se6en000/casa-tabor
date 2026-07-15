import { createClient } from 'npm:@supabase/supabase-js@2'
import { deleteGoogleEvent } from '../_shared/google.ts'
import { resolveGoogleConnection, markGoogleConnectionHealthy, type CalendarConnection } from '../_shared/google-connection.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  const { event_id } = await req.json().catch(() => ({}))
  if (!event_id) return err('event_id required', 400)

  // Load event — only need Google IDs and source member
  const { data: event, error: evErr } = await sb
    .from('events')
    .select('id, google_event_id, google_calendar_id, google_connection_id, source_member_id')
    .eq('id', event_id)
    .single()

  if (evErr || !event) return err(evErr?.message ?? 'event not found', 404)
  if (!event.google_event_id) {
    // No Google event to delete — nothing to do
    return ok({ skipped: 'no google_event_id' })
  }

  if (!event.google_connection_id) return ok({ skipped: 'no google_connection_id' })
  const { data: connection, error: connectionError } = await sb
    .from('calendar_connections')
    .select('*')
    .eq('id', event.google_connection_id)
    .maybeSingle()
  if (connectionError) return err(connectionError.message)
  if (!connection) return ok({ skipped: 'google connection no longer exists' })
  if (connection.access_mode !== 'writable') {
    return ok({ skipped: 'read-only Google source is never deleted by Casa' })
  }
  const resolved = await resolveGoogleConnection(sb, connection as CalendarConnection)
  await deleteGoogleEvent({
    accessToken: resolved.accessToken,
    calendarId: resolved.connection.calendar_id,
    eventId: event.google_event_id,
  })
  await markGoogleConnectionHealthy(sb, resolved.connection.id)

  return ok({ deleted: event.google_event_id })
})

function ok(body: object) {
  return new Response(JSON.stringify({ ok: true, ...body }), {
    headers: { ...CORS, 'content-type': 'application/json' },
  })
}

function err(msg: string, status = 500) {
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { ...CORS, 'content-type': 'application/json' },
  })
}
