import { createClient } from 'npm:@supabase/supabase-js@2'
import { patchGoogleEvent, createGoogleEvent, getGoogleEvent } from '../_shared/google.ts'
import { loadWritableGoogleConnection, markGoogleConnectionHealthy } from '../_shared/google-connection.ts'
import { buildGoogleEventDescription, googleLocationForEvent } from '../_shared/google-event-details-core.mjs'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  const { event_id, title_only = false } = await req.json().catch(() => ({}))
  if (!event_id) return new Response(JSON.stringify({ error: 'event_id required' }), { status: 400, headers: { ...CORS, 'content-type': 'application/json' } })

  try {

  // Load event + enrichment
  const { data: event, error: evErr } = await sb
    .from('events')
    .select('id, title, description, start_time, end_time, all_day, event_type, location_name, address, google_event_id, google_calendar_id, google_connection_id, source_member_id, event_enrichments(*), event_members(role, family_members(name))')
    .eq('id', event_id)
    .single()

  if (evErr || !event) return new Response(JSON.stringify({ error: evErr?.message ?? 'event not found' }), { status: 404, headers: { ...CORS, 'content-type': 'application/json' } })
  if (!event.google_event_id) return new Response(JSON.stringify({ ok: true, skipped: 'no google_event_id' }), { headers: { ...CORS, 'content-type': 'application/json' } })

  // Reminders stay in Casa only — never push to Google Calendar
  if (event.event_type === 'reminder') return new Response(JSON.stringify({ ok: true, skipped: 'reminder' }), { headers: { ...CORS, 'content-type': 'application/json' } })

  const { connection, accessToken } = await loadWritableGoogleConnection(sb)

  const calendarId = connection.calendar_id
  const summary = (event.title as string) ?? undefined

  if (title_only === true) {
    const current = await getGoogleEvent({
      accessToken,
      calendarId,
      eventId: event.google_event_id,
    })
    if (current.eventType && current.eventType !== 'default') {
      if (current.summary?.includes(' | ')) {
        throw new Error(
          `Immutable Google ${current.eventType} title still contains legacy pipe formatting and cannot be patched.`,
        )
      }
      return new Response(JSON.stringify({
        ok: true,
        skipped: 'immutable_google_event',
        google_event_type: current.eventType,
        verified_summary: current.summary,
      }), { headers: { ...CORS, 'content-type': 'application/json' } })
    }
    await patchGoogleEvent({
      accessToken,
      calendarId,
      eventId: event.google_event_id,
      patch: { summary },
    })
    const verified = await getGoogleEvent({
      accessToken,
      calendarId,
      eventId: event.google_event_id,
    })
    if (verified.summary !== summary) {
      throw new Error('Google title verification failed after patch.')
    }
    await sb.from('events').update({
      google_connection_id: connection.id,
      source_member_id: connection.family_member_id,
      google_calendar_id: calendarId,
      updated_at: new Date().toISOString(),
    }).eq('id', event_id)
    await markGoogleConnectionHealthy(sb, connection.id)
    return new Response(JSON.stringify({
      ok: true,
      connection_id: connection.id,
      projection: 'title_only',
      verified_summary: verified.summary,
    }), { headers: { ...CORS, 'content-type': 'application/json' } })
  }

  const { data: bundle, error: bundleError } = await sb.rpc('recurrence_build_reusable_patch', {
    p_event_id: event_id,
  })
  if (bundleError) throw bundleError

  // ── Build Google Calendar patch ──
  // Send all editable fields: title, times, location, description+enrichment

  // Casa stores the authoritative literal title; Google receives the same title.
  const location = googleLocationForEvent(event, bundle)

  const isAllDay = event.all_day || (!event.start_time?.includes('T') && !event.start_time?.includes(' '))
  const toISO = (t: string) => new Date(t).toISOString()
  const toGoogleAllDayDate = (iso: string) => new Date(iso).toISOString().slice(0, 10)
  const toGoogleAllDayEndDate = (endTime: string) => {
    const dateOnly = !endTime.includes('T')
    const midnightBoundary = /T00:00(?::00(?:\.000)?)?(?:Z|[+-]\d{2}:\d{2})?$/.test(endTime)
    const end = new Date(endTime)
    if (dateOnly || midnightBoundary) return end.toISOString().slice(0, 10)
    end.setUTCDate(end.getUTCDate() + 1)
    return end.toISOString().slice(0, 10)
  }
  // Google Calendar requires timeZone when using dateTime (especially when switching from all-day)
  const TZ = 'America/New_York'

  const projectionFields = {
    summary,
    ...(location !== undefined ? { location } : {}),
    start: isAllDay
      ? { date: toGoogleAllDayDate(event.start_time as string) }
      : { dateTime: toISO(event.start_time), timeZone: TZ },
    end: isAllDay
      ? { date: toGoogleAllDayEndDate(event.end_time as string) }
      : { dateTime: toISO(event.end_time), timeZone: TZ },
  }

  try {
    const current = await getGoogleEvent({
      accessToken,
      calendarId,
      eventId: event.google_event_id,
    })
    const patch = {
      ...projectionFields,
      description: buildGoogleEventDescription({
        bundle,
        existingDescription: current.description ?? event.description ?? '',
        eventId: event.id,
      }),
    }
    console.log('[push-to-google] patch payload:', JSON.stringify(patch))
    await patchGoogleEvent({
      accessToken,
      calendarId,
      eventId: event.google_event_id,
      patch,
    })
    await sb.from('events').update({
      google_connection_id: connection.id,
      source_member_id: connection.family_member_id,
      google_calendar_id: calendarId,
      updated_at: new Date().toISOString(),
    }).eq('id', event_id)
  } catch (err) {
    const msg = (err as Error).message ?? String(err)
    // Legacy events may still point at a different Google account's event ID.
    // If that ID is missing in the target account, recreate in the configured account and relink.
    if (!msg.includes('404')) throw err
    const created = await createGoogleEvent({
      accessToken,
      calendarId,
      event: {
        summary: summary ?? event.title,
        ...(location !== undefined ? { location } : {}),
        description: buildGoogleEventDescription({
          bundle,
          existingDescription: event.description ?? '',
          eventId: event.id,
        }),
        start: projectionFields.start,
        end: projectionFields.end,
      },
    })
    await sb.from('events').update({
      google_event_id: created.id,
      google_calendar_id: calendarId,
      google_connection_id: connection.id,
      source_member_id: connection.family_member_id,
      updated_at: new Date().toISOString(),
    }).eq('id', event_id)
  }
  await markGoogleConnectionHealthy(sb, connection.id)

  return new Response(JSON.stringify({ ok: true, connection_id: connection.id }), { headers: { ...CORS, 'content-type': 'application/json' } })
  } catch (err) {
    const msg = (err as Error).message ?? String(err)
    console.error('[push-to-google] error:', msg)
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: { ...CORS, 'content-type': 'application/json' } })
  }
})
