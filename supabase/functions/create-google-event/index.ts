import { createClient } from 'npm:@supabase/supabase-js@2'
import { refreshAccessToken, createGoogleEvent } from '../_shared/google.ts'

const TARGET_SYNC_GOOGLE_EMAIL = (Deno.env.get('GOOGLE_SYNC_TARGET_EMAIL') ?? 'jacobrtabor@gmail.com').toLowerCase()

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

  // Reminders stay in Casa only — never push to Google Calendar
  if (event.event_type === 'reminder') return new Response(JSON.stringify({ ok: true, skipped: 'reminder' }), { headers: { ...CORS, 'content-type': 'application/json' } })

  const { data: tok } = await sb
    .from('google_tokens')
    .select('*')
    .eq('google_email', TARGET_SYNC_GOOGLE_EMAIL)
    .maybeSingle()
  if (!tok) {
    return new Response(JSON.stringify({ error: `no google token for configured sync account: ${TARGET_SYNC_GOOGLE_EMAIL}` }), {
      status: 500,
      headers: { ...CORS, 'content-type': 'application/json' },
    })
  }
  const resolvedMemberId = tok.family_member_id

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
    }).eq('family_member_id', resolvedMemberId)
  }

  const calendarId = tok.calendar_id ?? 'primary'

  // Build location string
  const locationParts = [event.location_name, event.address].filter((p: string | null, i: number, arr: (string | null)[]) => p && arr.indexOf(p) === i)
  const location = locationParts.length > 0 ? locationParts.join(', ') : undefined

  const TZ = 'America/New_York'
  const toGoogleAllDayDate = (iso: string) => new Date(iso).toISOString().slice(0, 10)
  const toGoogleAllDayEndDate = (endTime: string) => {
    const dateOnly = !endTime.includes('T')
    const midnightBoundary = /T00:00(?::00(?:\.000)?)?(?:Z|[+-]\d{2}:\d{2})?$/.test(endTime)
    const end = new Date(endTime)
    if (dateOnly || midnightBoundary) return end.toISOString().slice(0, 10)
    end.setUTCDate(end.getUTCDate() + 1)
    return end.toISOString().slice(0, 10)
  }
  const isAllDay = event.all_day || (!event.start_time?.includes('T') && !event.start_time?.includes(' '))
  const startField = isAllDay
    ? { date: toGoogleAllDayDate(event.start_time as string) }
    : { dateTime: new Date(event.start_time).toISOString(), timeZone: TZ }
  const endField = isAllDay
    ? { date: toGoogleAllDayEndDate(event.end_time as string) }
    : { dateTime: new Date(event.end_time).toISOString(), timeZone: TZ }

  // If this is a master recurring event, include the RRULE so Google creates it as a series
  const recurrence: string[] = (event as Record<string, unknown>).rrule
    ? [`RRULE:${(event as Record<string, unknown>).rrule}`]
    : []

  // Create in Google Calendar
  const created = await createGoogleEvent({
    accessToken,
    calendarId,
    event: {
      summary: event.title,
      ...(location ? { location } : {}),
      ...(recurrence.length > 0 ? { recurrence } : {}),
      start: startField,
      end: endField,
    },
  })

  // Save google_event_id + google_calendar_id back to our DB
  await sb.from('events').update({
    google_event_id: created.id,
    google_calendar_id: calendarId,
    source_member_id: resolvedMemberId,
    updated_at: new Date().toISOString(),
  }).eq('id', event_id)

  return new Response(JSON.stringify({ ok: true, google_event_id: created.id }), {
    headers: { ...CORS, 'content-type': 'application/json' },
  })
})
