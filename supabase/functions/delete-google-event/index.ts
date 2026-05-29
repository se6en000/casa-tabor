import { createClient } from 'npm:@supabase/supabase-js@2'
import { refreshAccessToken, deleteGoogleEvent } from '../_shared/google.ts'

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
    .select('id, google_event_id, google_calendar_id, source_member_id')
    .eq('id', event_id)
    .single()

  if (evErr || !event) return err(evErr?.message ?? 'event not found', 404)
  if (!event.google_event_id) {
    // No Google event to delete — nothing to do
    return ok({ skipped: 'no google_event_id' })
  }

  const memberId = event.source_member_id
  if (!memberId) return ok({ skipped: 'no source_member_id' })

  const { data: tok } = await sb
    .from('google_tokens')
    .select('*')
    .eq('family_member_id', memberId)
    .single()

  if (!tok) return ok({ skipped: 'no google token for member' })

  // Refresh token if expired
  let accessToken = tok.access_token
  if (tok.expires_at && new Date(tok.expires_at) < new Date(Date.now() + 60_000)) {
    const t = await refreshAccessToken({
      refreshToken: tok.refresh_token,
      clientId: Deno.env.get('GOOGLE_CLIENT_ID')!,
      clientSecret: Deno.env.get('GOOGLE_CLIENT_SECRET')!,
    })
    accessToken = t.access_token
    await sb.from('google_tokens').update({
      access_token: t.access_token,
      expires_at: new Date(Date.now() + t.expires_in * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('family_member_id', memberId)
  }

  const calendarId = event.google_calendar_id ?? 'primary'

  await deleteGoogleEvent({ accessToken, calendarId, eventId: event.google_event_id })

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
