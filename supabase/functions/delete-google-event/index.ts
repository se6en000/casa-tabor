import { createClient } from 'npm:@supabase/supabase-js@2'
import { deleteGoogleEvent } from '../_shared/google.ts'
import {
  markGoogleConnectionFailure,
  markGoogleConnectionHealthy,
  resolveGoogleConnection,
  type CalendarConnection,
} from '../_shared/google-connection.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  const { event_id, search_q } = payload
  if (!event_id && !payload.google_event_id && !search_q) return err('event_id, google_event_id or search_q required', 400)

  let googleEventId = payload.google_event_id as string | undefined
  let googleCalendarId = payload.google_calendar_id as string | undefined
  let googleConnectionId = payload.google_connection_id as string | undefined
  let sourceMemberId = payload.source_member_id as string | undefined

  if (search_q) {
    // Bulk search and delete mode directly against Google Calendar API
    let connection: CalendarConnection | null = null
    if (sourceMemberId) {
      const { data: conn } = await sb
        .from('calendar_connections')
        .select('*')
        .eq('family_member_id', sourceMemberId)
        .eq('is_enabled', true)
        .maybeSingle()
      connection = conn as CalendarConnection | null
    }
    if (!connection) {
      const { data: conn } = await sb
        .from('calendar_connections')
        .select('*')
        .eq('access_mode', 'writable')
        .eq('is_enabled', true)
        .maybeSingle()
      connection = conn as CalendarConnection | null
    }
    if (!connection) return err('No valid Google connection found for search_q', 400)

    try {
      const resolved = await resolveGoogleConnection(sb, connection)
      const calendarId = googleCalendarId || resolved.connection.calendar_id

      let pageToken: string | undefined
      const deletedGoogleIds: string[] = []
      let totalFound = 0

      do {
        const urlParams = new URLSearchParams({
          q: search_q,
          singleEvents: 'true',
          maxResults: '250',
        })
        if (pageToken) urlParams.set('pageToken', pageToken)

        const listRes = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${urlParams}`,
          { headers: { authorization: `Bearer ${resolved.accessToken}` } }
        )

        if (!listRes.ok) {
          const listErrText = await listRes.text()
          throw new Error(`Google events.list failed: ${listRes.status} ${listErrText}`)
        }

        const listData = await listRes.json()
        const items = listData.items ?? []
        totalFound += items.length

        for (const item of items) {
          if (!item.id) continue
          try {
            await deleteGoogleEvent({
              accessToken: resolved.accessToken,
              calendarId,
              eventId: item.id,
            })
            deletedGoogleIds.push(item.id)
            
            // Clean up DB reference if exists
            await sb.from('events').update({
              google_event_id: null,
              google_calendar_id: null,
              google_connection_id: null,
              status: 'cancelled',
              updated_at: new Date().toISOString(),
            }).eq('google_event_id', item.id)
          } catch (delErr) {
            console.warn(`Failed to delete Google event ${item.id}:`, delErr)
          }
        }

        pageToken = listData.nextPageToken
      } while (pageToken)

      await markGoogleConnectionHealthy(sb, connection.id)
      return ok({ search_q, totalFound, deletedCount: deletedGoogleIds.length, deletedGoogleIds })
    } catch (cause) {
      const error = cause instanceof Error ? cause : new Error(String(cause))
      if (connection) await markGoogleConnectionFailure(sb, connection.id, error)
      return err(error.message)
    }
  }

  // If Google IDs not directly provided in payload, load from events table
  if (!googleEventId && event_id) {
    const { data: event, error: evErr } = await sb
      .from('events')
      .select('id, google_event_id, google_calendar_id, google_connection_id, source_member_id')
      .eq('id', event_id)
      .maybeSingle()

    if (event) {
      googleEventId = event.google_event_id
      googleCalendarId = event.google_calendar_id
      googleConnectionId = event.google_connection_id
      sourceMemberId = event.source_member_id
    }
  }

  if (!googleEventId) {
    // No Google event to delete — nothing to do
    return ok({ skipped: 'no google_event_id' })
  }

  let connection: CalendarConnection | null = null
  if (googleConnectionId) {
    const { data: conn, error: connectionError } = await sb
      .from('calendar_connections')
      .select('*')
      .eq('id', googleConnectionId)
      .maybeSingle()
    if (connectionError) return err(connectionError.message)
    connection = conn as CalendarConnection | null
  }
  const source_member_id = sourceMemberId
  if (!connection && source_member_id) {
    const { data: conn } = await sb
      .from('calendar_connections')
      .select('*')
      .eq('family_member_id', source_member_id)
      .eq('is_enabled', true)
      .maybeSingle()
    connection = conn as CalendarConnection | null
  }
  if (!connection) {
    const { data: conn } = await sb
      .from('calendar_connections')
      .select('*')
      .eq('access_mode', 'writable')
      .eq('is_enabled', true)
      .maybeSingle()
    connection = conn as CalendarConnection | null
  }

  if (!connection) return ok({ skipped: 'no valid google connection found' })
  if (connection.access_mode !== 'writable') {
    return ok({ skipped: 'read-only Google source is never deleted by Casa' })
  }
  try {
    const resolved = await resolveGoogleConnection(sb, connection)
    await deleteGoogleEvent({
      accessToken: resolved.accessToken,
      calendarId: googleCalendarId || resolved.connection.calendar_id,
      eventId: googleEventId,
    })
    await markGoogleConnectionHealthy(sb, resolved.connection.id)
  } catch (cause) {
    const error = cause instanceof Error ? cause : new Error(String(cause))
    await markGoogleConnectionFailure(sb, connection.id, error)
    return err(error.message)
  }

  if (event_id) {
    await sb.from('events').update({
      google_event_id: null,
      google_calendar_id: null,
      google_connection_id: null,
      updated_at: new Date().toISOString(),
    }).eq('id', event_id)
  }

  return ok({ deleted: googleEventId })
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
