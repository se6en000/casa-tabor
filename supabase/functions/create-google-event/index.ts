import { createClient } from 'npm:@supabase/supabase-js@2'
import { createGoogleEvent } from '../_shared/google.ts'
import { loadWritableGoogleConnection, markGoogleConnectionHealthy } from '../_shared/google-connection.ts'
import { buildGoogleEventDescription } from '../_shared/google-event-details-core.mjs'

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

  const { connection, accessToken } = await loadWritableGoogleConnection(sb)
  const calendarId = connection.calendar_id
  const { data: bundle, error: bundleError } = await sb.rpc('recurrence_build_reusable_patch', {
    p_event_id: event_id,
  })
  if (bundleError) {
    return new Response(JSON.stringify({ error: bundleError.message }), { status: 500, headers: { ...CORS, 'content-type': 'application/json' } })
  }

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
      description: buildGoogleEventDescription({
        bundle,
        existingDescription: event.description ?? '',
        eventId: event.id,
      }),
      ...(recurrence.length > 0 ? { recurrence } : {}),
      start: startField,
      end: endField,
    },
  })

  // Save google_event_id + google_calendar_id back to our DB
  await sb.from('events').update({
    google_event_id: created.id,
    google_calendar_id: calendarId,
    google_connection_id: connection.id,
    source_member_id: connection.family_member_id,
    updated_at: new Date().toISOString(),
  }).eq('id', event_id)
  await markGoogleConnectionHealthy(sb, connection.id)

  return new Response(JSON.stringify({ ok: true, google_event_id: created.id, connection_id: connection.id }), {
    headers: { ...CORS, 'content-type': 'application/json' },
  })
})
