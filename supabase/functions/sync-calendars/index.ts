import { createClient, SupabaseClient } from 'npm:@supabase/supabase-js@2'
import {
  loadMemberGoogleConnection,
  markGoogleConnectionFailure,
  markGoogleConnectionHealthy,
  resolveGoogleConnection,
  type CalendarConnection,
  type ResolvedGoogleConnection,
} from '../_shared/google-connection.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {}
  const results: Record<string, unknown> = {}
  if (body.family_member_id) {
    try {
      const resolved = await loadMemberGoogleConnection(sb, body.family_member_id)
      results[body.family_member_id] = await syncOne(sb, resolved)
    } catch (cause) {
      const error = cause instanceof Error ? cause : new Error(String(cause))
      results[body.family_member_id] = { error: error.message }
    }
  } else {
    const { data: connections, error } = await sb
      .from('calendar_connections')
      .select('*')
      .eq('is_enabled', true)
      .order('created_at')
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...CORS, 'content-type': 'application/json' } })
    for (const connection of connections ?? []) {
      try {
        const resolved = await resolveGoogleConnection(sb, connection as CalendarConnection)
        results[connection.family_member_id] = await syncOne(sb, resolved)
      } catch (cause) {
        const syncError = cause instanceof Error ? cause : new Error(String(cause))
        results[connection.family_member_id] = { error: syncError.message }
      }
    }
  }
  return new Response(JSON.stringify({ ok: true, results }), { headers: { ...CORS, 'content-type': 'application/json' } })
})

async function syncOne(sb: SupabaseClient, resolved: ResolvedGoogleConnection) {
  const { connection, accessToken } = resolved
  const now = Date.now()
  const timeMin = new Date(now - 7 * 86400000).toISOString()
  const timeMax = new Date(now + 90 * 86400000).toISOString()
  let pageToken: string | undefined
  let syncToken: string | null = connection.sync_token
  let pulled = 0
  let upserted = 0
  try {
    do {
      const params = new URLSearchParams({
        singleEvents: 'true',
        showDeleted: 'true',
        maxResults: '250',
      })
      if (pageToken) params.set('pageToken', pageToken)
      else if (syncToken) params.set('syncToken', syncToken)
      else { params.set('timeMin', timeMin); params.set('timeMax', timeMax); params.set('orderBy', 'startTime') }
      const r = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(connection.calendar_id)}/events?${params}`,
        { headers: { authorization: 'Bearer ' + accessToken } },
      )
      if (r.status === 410) {
        syncToken = null
        pageToken = undefined
        const { error } = await sb.from('calendar_connections').update({ sync_token: null }).eq('id', connection.id)
        if (error) throw new Error(`Could not clear expired sync cursor: ${error.message}`)
        continue
      }
      if (!r.ok) { const t = await r.text(); throw new Error('Calendar API ' + r.status + ': ' + t) }
      const page = await r.json()
      pulled += page.items?.length ?? 0
      for (const ev of page.items ?? []) {
        await upsertEvent(sb, connection, ev, accessToken)
        upserted++
      }
      pageToken = page.nextPageToken
      if (page.nextSyncToken) syncToken = page.nextSyncToken
    } while (pageToken)
    const syncedAt = new Date().toISOString()
    await markGoogleConnectionHealthy(sb, connection.id, {
      sync_token: syncToken,
      last_incremental_sync_at: syncedAt,
    })
    return { pulled, upserted, connection_id: connection.id }
  } catch (cause) {
    const error = cause instanceof Error ? cause : new Error(String(cause))
    await markGoogleConnectionFailure(sb, connection.id, error)
    throw error
  }
}

async function linkCanonicalOccurrence(
  sb: SupabaseClient,
  connection: CalendarConnection,
  ev: Record<string, unknown>,
) {
  const recurringEventId = typeof ev.recurringEventId === 'string' ? ev.recurringEventId : null
  const extendedProperties = ev.extendedProperties as {
    private?: { casaSeriesId?: unknown }
  } | undefined
  const privateSeriesId = typeof extendedProperties?.private?.casaSeriesId === 'string'
    ? extendedProperties.private.casaSeriesId
    : null
  if (!recurringEventId && !privateSeriesId) return false

  let seriesQuery = sb
    .from('event_series')
    .select('id,google_recurring_event_id')
    .eq('source_connection_id', connection.id)
    .eq('status', 'active')
  seriesQuery = privateSeriesId
    ? seriesQuery.eq('id', privateSeriesId)
    : seriesQuery.eq('google_recurring_event_id', recurringEventId)
  const { data: series, error: seriesError } = await seriesQuery.maybeSingle()
  if (seriesError) throw seriesError
  if (!series) return false
  if (
    recurringEventId
    && series.google_recurring_event_id
    && recurringEventId !== series.google_recurring_event_id
  ) {
    return false
  }

  const originalStart = ev.originalStartTime as { dateTime?: string; date?: string } | undefined
  const start = ev.start as { dateTime?: string; date?: string } | undefined
  let occurrenceQuery = sb
    .from('events')
    .select('id')
    .eq('series_id', series.id)
    .eq('record_kind', 'occurrence')
  if (originalStart?.date) {
    occurrenceQuery = occurrenceQuery.eq('original_start_date', originalStart.date)
  } else {
    const originalStartTime = originalStart?.dateTime ?? start?.dateTime
    if (!originalStartTime) return true
    occurrenceQuery = occurrenceQuery.eq('original_start_time', originalStartTime)
  }
  const { data: occurrence, error: occurrenceError } = await occurrenceQuery.maybeSingle()
  if (occurrenceError) throw occurrenceError
  if (!occurrence) return true

  const { error: linkError } = await sb.rpc('recurrence_link_google_instance', {
    p_series_id: series.id,
    p_occurrence_id: occurrence.id,
    p_connection_id: connection.id,
    p_calendar_id: connection.calendar_id,
    p_google_event_id: ev.id,
    p_google_ical_uid: ev.iCalUID ?? null,
    p_google_etag: ev.etag ?? null,
    p_google_updated_at: ev.updated ?? null,
  })
  if (linkError) throw new Error(linkError.message)
  return true
}

async function upsertEvent(sb: SupabaseClient, connection: CalendarConnection, ev: Record<string, unknown>, accessToken: string) {
  const sourceMemberId = connection.family_member_id
  if (await linkCanonicalOccurrence(sb, connection, ev)) return
  if (ev.status === 'cancelled') {
    await sb.from('events').update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('google_connection_id', connection.id)
      .eq('google_event_id', ev.id)
    return
  }
  const start = ev.start as Record<string, string> | undefined
  const end = ev.end as Record<string, string> | undefined
  const startTime = start?.dateTime ?? (start?.date ? start.date + 'T00:00:00Z' : null)
  const endTime = end?.dateTime ?? (end?.date ? end.date + 'T23:59:59Z' : null)
  if (!startTime || !endTime) return

  let { data: existing } = await sb
    .from('events')
    .select('id, is_enriched, updated_at, source_member_id, google_connection_id')
    .eq('google_connection_id', connection.id)
    .eq('google_event_id', ev.id)
    .maybeSingle()
  if (!existing) {
    const { data: legacy } = await sb
      .from('events')
      .select('id, is_enriched, updated_at, source_member_id, google_connection_id')
      .eq('google_event_id', ev.id)
      .maybeSingle()
    if (legacy && (!legacy.source_member_id || legacy.source_member_id === sourceMemberId)) {
      existing = legacy
    }
  }
  let eventId: string

  if (existing) {
    eventId = existing.id
    if (existing.is_enriched) {
      const googleUpdated = ev.updated as string | undefined
      const dbUpdated = existing.updated_at as string | undefined
      if (googleUpdated && dbUpdated && new Date(dbUpdated) > new Date(googleUpdated)) {
        return
      }
      await sb.from('events').update({
        start_time: startTime,
        end_time: endTime,
        all_day: !start?.dateTime,
        status: 'confirmed',
        google_connection_id: connection.id,
        google_calendar_id: connection.calendar_id,
        source_member_id: sourceMemberId,
        updated_at: new Date().toISOString(),
      }).eq('id', eventId)
    } else {
      const row = { title: (ev.summary as string) ?? '(untitled)', description: (ev.description as string) ?? null, start_time: startTime, end_time: endTime, all_day: !start?.dateTime, location_name: (ev.location as string) ?? null, address: (ev.location as string) ?? null, google_event_id: ev.id as string, google_calendar_id: connection.calendar_id, google_connection_id: connection.id, source_member_id: sourceMemberId, status: 'confirmed', updated_at: new Date().toISOString() }
      await sb.from('events').update(row).eq('id', eventId)
      const attendees = ev.attendees as Array<{ email: string }> | undefined
      const emails = new Set((attendees ?? []).map(a => a.email.toLowerCase()))
      const { data: members } = await sb.from('family_members').select('id,email').not('email', 'is', null)
      const emailToId = new Map((members ?? []).map((m: { id: string; email: string }) => [m.email.toLowerCase(), m.id]))
      const memberIds = new Set([sourceMemberId])
      for (const email of emails) { const id = emailToId.get(email); if (id) memberIds.add(id) }
      await sb.from('event_members').delete().eq('event_id', eventId)
      await sb.from('event_members').insert([...memberIds].map(fm => ({ event_id: eventId, family_member_id: fm, role: 'attendee', rsvp_status: 'accepted' })))
    }
  } else {
    // New event — check for an existing event at this time for this member.
    // If one exists and is enriched, patch the incoming Google event with our canonical data
    // so both calendar entries stay consistent. Then skip the DB insert.
    const { data: existingAtTime } = await sb.from('events')
      .select('id, is_enriched, title, location_name, address, event_enrichments(contact_name, contact_phone)')
      .eq('source_member_id', sourceMemberId)
      .eq('start_time', startTime)
      .maybeSingle()

    if (existingAtTime) {
      if (existingAtTime.is_enriched && connection.access_mode === 'writable') {
        const enr = (existingAtTime.event_enrichments as Record<string, string>[] | null)?.[0]
        const patch: Record<string, unknown> = { summary: existingAtTime.title }
        if (existingAtTime.location_name || existingAtTime.address) {
          patch.location = existingAtTime.location_name ?? existingAtTime.address
        }
        if (enr?.contact_phone) {
          patch.description = [
            enr.contact_name ? `Contact: ${enr.contact_name}` : null,
            enr.contact_phone ? `Phone: ${enr.contact_phone}` : null,
          ].filter(Boolean).join('\n') || undefined
        }
        fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(connection.calendar_id)}/events/${encodeURIComponent(ev.id as string)}`, {
          method: 'PATCH',
          headers: { authorization: 'Bearer ' + accessToken, 'content-type': 'application/json' },
          body: JSON.stringify(patch),
        }).catch(() => {})
      }
      return
    }

    // Genuinely new event — insert
    const row = { title: (ev.summary as string) ?? '(untitled)', description: (ev.description as string) ?? null, start_time: startTime, end_time: endTime, all_day: !start?.dateTime, location_name: (ev.location as string) ?? null, address: (ev.location as string) ?? null, google_event_id: ev.id as string, google_calendar_id: connection.calendar_id, google_connection_id: connection.id, source_member_id: sourceMemberId, status: 'confirmed', updated_at: new Date().toISOString() }
    const { data: ins, error } = await sb.from('events').insert({ ...row, is_enriched: false }).select('id').single()
    if (error) throw error
    eventId = ins.id
    await sb.from('event_enrichments').insert({ event_id: eventId, confidence: 'low', what_to_bring: [] })
    const attendees = ev.attendees as Array<{ email: string }> | undefined
    const emails = new Set((attendees ?? []).map(a => a.email.toLowerCase()))
    const { data: members } = await sb.from('family_members').select('id,email').not('email', 'is', null)
    const emailToId = new Map((members ?? []).map((m: { id: string; email: string }) => [m.email.toLowerCase(), m.id]))
    const memberIds = new Set([sourceMemberId])
    for (const email of emails) { const id = emailToId.get(email); if (id) memberIds.add(id) }
    await sb.from('event_members').delete().eq('event_id', eventId)
    await sb.from('event_members').insert([...memberIds].map(fm => ({ event_id: eventId, family_member_id: fm, role: 'attendee', rsvp_status: 'accepted' })))
  }
}
