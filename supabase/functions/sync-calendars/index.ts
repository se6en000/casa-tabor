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
// Cancellations per incremental sync that trigger quarantine. Kept intentionally
// low to guard against rogue mass-deletes. When the limit is exceeded the code
// falls back to a full reconciliation (see below) instead of hard-failing, so
// legitimate large batches (e.g. deleting a recurring series) self-recover.
const MAX_INCREMENTAL_CANCELLATIONS = 100
const INITIAL_SYNC_PAST_DAYS = 7
const INITIAL_SYNC_FUTURE_DAYS = 90

function toErrorMessage(cause: unknown): string {
  if (cause instanceof Error) return cause.message
  if (typeof cause === 'object' && cause !== null) {
    if ('message' in cause && typeof (cause as { message: unknown }).message === 'string') {
      return (cause as { message: string }).message
    }
    try {
      return JSON.stringify(cause)
    } catch {
      return String(cause)
    }
  }
  return String(cause)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {}
  const results: Record<string, unknown> = {}
  if (body.connection_id) {
    try {
      const { data: connection, error: connErr } = await sb
        .from('calendar_connections')
        .select('*')
        .eq('id', body.connection_id)
        .single()
      if (connErr || !connection) throw new Error(connErr?.message || 'Connection not found')
      const resolved = await resolveGoogleConnection(sb, connection as CalendarConnection)
      results[connection.family_member_id] = await syncOne(sb, resolved)
    } catch (cause) {
      const message = toErrorMessage(cause)
      results[body.connection_id] = { error: message }
    }
  } else if (body.family_member_id) {
    try {
      const resolved = await loadMemberGoogleConnection(sb, body.family_member_id)
      results[body.family_member_id] = await syncOne(sb, resolved)
    } catch (cause) {
      const message = toErrorMessage(cause)
      results[body.family_member_id] = { error: message }
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
        const syncErrorMessage = toErrorMessage(cause)
        results[connection.family_member_id] = { error: syncErrorMessage }
      }
    }

    // Auto-renew or register webhook push notification channels
    const nowMs = Date.now()
    const needsWebhookRenew = (connections ?? []).some((c: any) => {
      if (!c.webhook_expires_at || c.webhook_status !== 'active') return true
      const expMs = new Date(c.webhook_expires_at).getTime()
      return isNaN(expMs) || expMs < nowMs + 24 * 3600 * 1000
    })

    if (needsWebhookRenew) {
      sb.functions.invoke('register-google-calendar-webhook', { body: {} }).catch((whErr: unknown) => {
        console.warn('[sync-calendars] Webhook auto-registration notice:', whErr)
      })
    }
  }
  return new Response(JSON.stringify({ ok: true, results }), { headers: { ...CORS, 'content-type': 'application/json' } })
})

async function syncOne(sb: SupabaseClient, resolved: ResolvedGoogleConnection) {
  const { connection, accessToken } = resolved
  const now = Date.now()
  const { data: members } = await sb.from('family_members').select('id,email').not('email', 'is', null)
  const emailToId = new Map((members ?? []).map((m: { id: string; email: string }) => [m.email.toLowerCase(), m.id]))
  let pageToken: string | undefined
  let syncToken: string | null = connection.sync_token
  let isFullReconciliation = !syncToken
  let pulled = 0
  let upserted = 0
  let pendingCancellations: Record<string, unknown>[] = []
  let quarantineTripped = false
  try {
    do {
      const params = new URLSearchParams({
        singleEvents: 'true',
        showDeleted: 'true',
        maxResults: '2500',
      })
      if (syncToken) params.set('syncToken', syncToken)
      if (pageToken) params.set('pageToken', pageToken)
      const r = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(connection.calendar_id)}/events?${params}`,
        { headers: { authorization: 'Bearer ' + accessToken } },
      )
      if (r.status === 410) {
        syncToken = null
        pageToken = undefined
        isFullReconciliation = true
        pendingCancellations = []
        const { error } = await sb.from('calendar_connections').update({ sync_token: null }).eq('id', connection.id)
        if (error) throw new Error(`Could not clear expired sync cursor: ${error.message}`)
        continue
      }
      if (!r.ok) { const t = await r.text(); throw new Error('Calendar API ' + r.status + ': ' + t) }
      const page = await r.json()
      pulled += page.items?.length ?? 0
      for (const ev of page.items ?? []) {
        if (ev.status === 'cancelled') {
          // A full scan includes historical tombstones, which are not new cancellation commands.
          if (!isFullReconciliation) pendingCancellations.push(ev)
          continue
        }
        if (isFullReconciliation && !isWithinInitialSyncWindow(ev, now)) continue
        await upsertEvent(sb, connection, ev, accessToken, emailToId)
        upserted++
      }
      pageToken = page.nextPageToken
      if (page.nextSyncToken) syncToken = page.nextSyncToken
    } while (pageToken)

    // Cancellation guard: if the incremental batch is unexpectedly large it may
    // indicate stale/replayed data rather than genuine user deletes. When tripped,
    // fall back to a fresh full reconciliation (discarding the stale cancellation
    // batch) so the connection self-heals instead of staying permanently broken.
    if (pendingCancellations.length > MAX_INCREMENTAL_CANCELLATIONS) {
      quarantineTripped = true
      console.warn(
        `[sync-calendars] QUARANTINE: ${pendingCancellations.length} cancellations exceed limit ` +
        `${MAX_INCREMENTAL_CANCELLATIONS} — discarding batch and falling back to full reconciliation ` +
        `(connection ${connection.id})`
      )
      syncToken = null
      pageToken = undefined
      isFullReconciliation = true
      pendingCancellations = []
      pulled = 0
      upserted = 0
      // Clear stored sync token so the next scheduled sync also starts fresh
      const { error: clearErr } = await sb.from('calendar_connections').update({ sync_token: null }).eq('id', connection.id)
      if (clearErr) throw new Error(`Could not clear quarantined sync cursor: ${clearErr.message}`)
      // Re-run inline as a full reconciliation, skipping all historical tombstones
      do {
        const params2 = new URLSearchParams({
          singleEvents: 'true',
          showDeleted: 'true',
          maxResults: '2500',
        })
        if (pageToken) params2.set('pageToken', pageToken)
        const r2 = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(connection.calendar_id)}/events?${params2}`,
          { headers: { authorization: 'Bearer ' + accessToken } },
        )
        if (!r2.ok) { const t = await r2.text(); throw new Error('Calendar API (recovery) ' + r2.status + ': ' + t) }
        const page2 = await r2.json()
        pulled += page2.items?.length ?? 0
        for (const ev of page2.items ?? []) {
          if (ev.status === 'cancelled') continue
          if (isFullReconciliation && !isWithinInitialSyncWindow(ev, now)) continue
          await upsertEvent(sb, connection, ev, accessToken, emailToId)
          upserted++
        }
        pageToken = page2.nextPageToken
        if (page2.nextSyncToken) syncToken = page2.nextSyncToken
      } while (pageToken)
    }

    for (const ev of pendingCancellations) {
      await upsertEvent(sb, connection, ev, accessToken, emailToId, connection.calendar_id, false)
      upserted++
    }

    // Sync secondary read-only calendars
    const readIds = (connection.read_calendar_ids || []).filter(
      (id) => id && id !== connection.calendar_id
    )
    for (const readCalId of readIds) {
      try {
        const readParams = new URLSearchParams({
          singleEvents: 'true',
          showDeleted: 'true',
          maxResults: '2500',
          timeMin: new Date(now - INITIAL_SYNC_PAST_DAYS * 86400000).toISOString(),
          timeMax: new Date(now + INITIAL_SYNC_FUTURE_DAYS * 86400000).toISOString(),
        })
        const readRes = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(readCalId)}/events?${readParams}`,
          { headers: { authorization: 'Bearer ' + accessToken } },
        )
        if (readRes.ok) {
          const readPage = await readRes.json()
          pulled += readPage.items?.length ?? 0
          for (const ev of readPage.items ?? []) {
            if (ev.status === 'cancelled') {
              await sb
                .from('events')
                .update({ status: 'cancelled', updated_at: new Date().toISOString() })
                .eq('google_connection_id', connection.id)
                .eq('google_calendar_id', readCalId)
                .eq('google_event_id', ev.id)
              continue
            }
            await upsertEvent(sb, connection, ev, accessToken, emailToId, readCalId, true)
            upserted++
          }
        }
      } catch (readErr) {
        console.warn(`[sync-calendars] Secondary calendar sync notice for ${readCalId}:`, readErr)
      }
    }

    const syncedAt = new Date().toISOString()
    await markGoogleConnectionHealthy(sb, connection.id, {
      sync_token: syncToken,
      last_incremental_sync_at: syncedAt,
    })

    // Keep recurring series synchronized with Google
    sb.functions.invoke('import-google-recurrence', {
      body: { connection_id: connection.id },
    }).catch((recurErr: unknown) => {
      console.warn(`[sync-calendars] Recurrence import notice for connection ${connection.id}:`, recurErr)
    })

    return { pulled, upserted, quarantine_recovery: quarantineTripped, connection_id: connection.id }
  } catch (cause) {
    const errorMsg = toErrorMessage(cause)
    const error = cause instanceof Error ? cause : new Error(errorMsg)
    await markGoogleConnectionFailure(sb, connection.id, error)
    throw error
  }
}

function isWithinInitialSyncWindow(ev: Record<string, unknown>, now: number): boolean {
  const start = ev.start as { dateTime?: string; date?: string } | undefined
  const end = ev.end as { dateTime?: string; date?: string } | undefined
  const startTime = start?.dateTime ?? start?.date
  const endTime = end?.dateTime ?? end?.date
  if (!startTime || !endTime) return false
  const rangeStart = now - INITIAL_SYNC_PAST_DAYS * 86400000
  const rangeEnd = now + INITIAL_SYNC_FUTURE_DAYS * 86400000
  return new Date(endTime).getTime() >= rangeStart && new Date(startTime).getTime() <= rangeEnd
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
  if (seriesError) throw new Error(seriesError.message)
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
  const { data: occurrenceList, error: occurrenceError } = await occurrenceQuery.limit(1)
  if (occurrenceError) throw new Error(occurrenceError.message)
  const occurrence = occurrenceList?.[0] ?? null
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

async function upsertEvent(
  sb: SupabaseClient,
  connection: CalendarConnection,
  ev: Record<string, unknown>,
  accessToken: string,
  emailToId: Map<string, string>,
  calendarId: string = connection.calendar_id,
  isReadOnly: boolean = false,
) {
  const sourceMemberId = connection.family_member_id
  if (await linkCanonicalOccurrence(sb, connection, ev)) return
  if (ev.status === 'cancelled') {
    await sb.from('events').update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('google_connection_id', connection.id)
      .eq('google_calendar_id', calendarId)
      .eq('google_event_id', ev.id)
    return
  }
  const start = ev.start as Record<string, string> | undefined
  const end = ev.end as Record<string, string> | undefined
  const isAllDay = !start?.dateTime && Boolean(start?.date)
  let startTime: string | null = null
  let endTime: string | null = null

  if (isAllDay && start?.date) {
    startTime = `${start.date}T00:00:00Z`
    if (end?.date) {
      // Google Calendar API provides end.date as an exclusive boundary (the day after the event ends).
      // In Casa Tabor, all-day events end at 23:59:59Z on the final inclusive day.
      const endD = new Date(`${end.date}T00:00:00Z`)
      endD.setUTCDate(endD.getUTCDate() - 1)
      const startD = new Date(`${start.date}T00:00:00Z`)
      const safeEndD = endD < startD ? startD : endD
      const endIsoDate = safeEndD.toISOString().slice(0, 10)
      endTime = `${endIsoDate}T23:59:59Z`
    } else {
      endTime = `${start.date}T23:59:59Z`
    }
  } else {
    startTime = start?.dateTime ?? (start?.date ? start.date + 'T00:00:00Z' : null)
    endTime = end?.dateTime ?? (end?.date ? end.date + 'T23:59:59Z' : null)
  }
  if (!startTime || !endTime) return

  let { data: existing } = await sb
    .from('events')
    .select('id, is_enriched, updated_at, source_member_id, google_connection_id')
    .eq('google_connection_id', connection.id)
    .eq('google_calendar_id', calendarId)
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
        google_calendar_id: calendarId,
        source_member_id: sourceMemberId,
        updated_at: new Date().toISOString(),
      }).eq('id', eventId)
    } else {
      const row = {
        title: (ev.summary as string) ?? '(untitled)',
        description: (ev.description as string) ?? null,
        start_time: startTime,
        end_time: endTime,
        all_day: !start?.dateTime,
        location_name: (ev.location as string) ?? null,
        address: (ev.location as string) ?? null,
        google_event_id: ev.id as string,
        google_calendar_id: calendarId,
        google_connection_id: connection.id,
        source_member_id: sourceMemberId,
        status: 'confirmed',
        updated_at: new Date().toISOString(),
      }
      await sb.from('events').update(row).eq('id', eventId)
      const attendees = ev.attendees as Array<{ email: string }> | undefined
      const emails = new Set((attendees ?? []).map(a => a.email.toLowerCase()))
      const memberIds = new Set([sourceMemberId])
      for (const email of emails) { const id = emailToId.get(email); if (id) memberIds.add(id) }
      await sb.from('event_members').delete().eq('event_id', eventId)
      await sb.from('event_members').insert([...memberIds].map(fm => ({ event_id: eventId, family_member_id: fm, role: 'attendee', rsvp_status: 'accepted' })))
    }
  } else {
    // New event — check for an existing event at this time for this member.
    // If one exists and is enriched, patch the incoming Google event with our canonical data
    // so both calendar entries stay consistent. Then skip the DB insert.
    const { data: existingAtTimeList } = await sb.from('events')
      .select('id, is_enriched, title, location_name, address, event_enrichments(contact_name, contact_phone)')
      .eq('source_member_id', sourceMemberId)
      .eq('start_time', startTime)
      .limit(1)

    const existingAtTime = existingAtTimeList?.[0] ?? null

    if (existingAtTime) {
      if (!isReadOnly && existingAtTime.is_enriched && connection.access_mode === 'writable') {
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
        return
      }
    }

    // Genuinely new event — insert
    const row = {
      title: (ev.summary as string) ?? '(untitled)',
      description: (ev.description as string) ?? null,
      start_time: startTime,
      end_time: endTime,
      all_day: !start?.dateTime,
      location_name: (ev.location as string) ?? null,
      address: (ev.location as string) ?? null,
      google_event_id: ev.id as string,
      google_calendar_id: calendarId,
      google_connection_id: connection.id,
      source_member_id: sourceMemberId,
      status: 'confirmed',
      updated_at: new Date().toISOString()
    }
    const { data: ins, error } = await sb.from('events').insert({ ...row, is_enriched: false }).select('id').single()
    if (error) throw new Error(error.message)
    eventId = ins.id
    await sb.from('event_enrichments').insert({ event_id: eventId, confidence: 'low', what_to_bring: [] })
    const attendees = ev.attendees as Array<{ email: string }> | undefined
    const emails = new Set((attendees ?? []).map(a => a.email.toLowerCase()))
    const memberIds = new Set([sourceMemberId])
    for (const email of emails) { const id = emailToId.get(email); if (id) memberIds.add(id) }
    await sb.from('event_members').delete().eq('event_id', eventId)
    await sb.from('event_members').insert([...memberIds].map(fm => ({ event_id: eventId, family_member_id: fm, role: 'attendee', rsvp_status: 'accepted' })))
  }
}
