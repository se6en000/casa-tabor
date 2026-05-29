import { createClient } from 'npm:@supabase/supabase-js@2'
import { refreshAccessToken, createGoogleEvent } from '../_shared/google.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  const { event_id } = await req.json().catch(() => ({}))
  if (!event_id) return new Response(JSON.stringify({ error: 'event_id required' }), { status: 400, headers: { ...CORS, 'content-type': 'application/json' } })

  // Load event + members
  const { data: event, error: evErr } = await sb
    .from('events')
    .select('*, event_members(role, family_member_id)')
    .eq('id', event_id)
    .single()

  if (evErr || !event) return new Response(JSON.stringify({ error: evErr?.message ?? 'event not found' }), { status: 404, headers: { ...CORS, 'content-type': 'application/json' } })

  // If it already has a google_event_id, skip creation
  if (event.google_event_id) return new Response(JSON.stringify({ ok: true, skipped: 'already has google_event_id' }), { headers: { ...CORS, 'content-type': 'application/json' } })

  // Find the primary member to use for creating the event
  const primaryMemberId = event.event_members?.find((m: { role: string }) => m.role === 'primary')?.family_member_id
    ?? event.event_members?.[0]?.family_member_id

  if (!primaryMemberId) return new Response(JSON.stringify({ ok: true, skipped: 'no members' }), { headers: { ...CORS, 'content-type': 'application/json' } })

  // Get Google token
  const { data: tok } = await sb.from('google_tokens').select('*').eq('family_member_id', primaryMemberId).single()
  if (!tok) return new Response(JSON.stringify({ ok: true, skipped: 'no google token for primary member' }), { headers: { ...CORS, 'content-type': 'application/json' } })

  // Refresh token if needed
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
    }).eq('family_member_id', primaryMemberId)
  }

  const calendarId = tok.calendar_id ?? 'primary'

  // Build location string
  const locationParts = [event.location_name, event.address].filter((p: string | null, i: number, arr: (string | null)[]) => p && arr.indexOf(p) === i)
  const location = locationParts.length > 0 ? locationParts.join(', ') : undefined

  // Create in Google Calendar
  const created = await createGoogleEvent({
    accessToken,
    calendarId,
    event: {
      summary: event.title,
      ...(location ? { location } : {}),
      start: { dateTime: event.start_time },
      end: { dateTime: event.end_time },
    },
  })

  // Save google_event_id + google_calendar_id back to our DB
  await sb.from('events').update({
    google_event_id: created.id,
    google_calendar_id: calendarId,
    source_member_id: primaryMemberId,
    updated_at: new Date().toISOString(),
  }).eq('id', event_id)

  return new Response(JSON.stringify({ ok: true, google_event_id: created.id }), {
    headers: { ...CORS, 'content-type': 'application/json' },
  })
})
