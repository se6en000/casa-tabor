import { createClient, SupabaseClient } from 'npm:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {}
  let q = sb.from('google_tokens').select('*')
  if (body.family_member_id) q = q.eq('family_member_id', body.family_member_id)
  const { data: tokens, error } = await q
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...CORS, 'content-type': 'application/json' } })
  const results: Record<string, unknown> = {}
  for (const tok of tokens ?? []) {
    try { results[tok.family_member_id] = await syncOne(sb, tok) }
    catch (err) { results[tok.family_member_id] = { error: (err as Error).message }; await sb.from('google_tokens').update({ last_sync_error: (err as Error).message, updated_at: new Date().toISOString() }).eq('family_member_id', tok.family_member_id) }
  }
  return new Response(JSON.stringify({ ok: true, results }), { headers: { ...CORS, 'content-type': 'application/json' } })
})

async function refreshToken(tok: Record<string, string>) {
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ refresh_token: tok.refresh_token, client_id: Deno.env.get('GOOGLE_CLIENT_ID')!, client_secret: Deno.env.get('GOOGLE_CLIENT_SECRET')!, grant_type: 'refresh_token' }) })
  const t = await r.json()
  if (!r.ok || !t.access_token) throw new Error(`Token refresh failed: ${t.error_description ?? t.error ?? r.status}`)
  return t
}

async function syncOne(sb: SupabaseClient, tok: Record<string, string>) {
  let accessToken = tok.access_token
  if (!accessToken || new Date(tok.expires_at).getTime() - Date.now() < 60000) {
    const t = await refreshToken(tok)
    accessToken = t.access_token
    const expiresAt = t.expires_in
      ? new Date(Date.now() + t.expires_in * 1000).toISOString()
      : new Date(Date.now() + 3600 * 1000).toISOString() // default 1h if missing
    await sb.from('google_tokens').update({ access_token: t.access_token, expires_at: expiresAt, updated_at: new Date().toISOString() }).eq('family_member_id', tok.family_member_id)
  }
  const now = Date.now()
  const timeMin = new Date(now - 7 * 86400000).toISOString()
  const timeMax = new Date(now + 90 * 86400000).toISOString()
  let pageToken: string | undefined, syncToken: string | null = tok.sync_token ?? null, pulled = 0, upserted = 0
  do {
    const params = new URLSearchParams({ singleEvents: 'true', maxResults: '250' })
    if (pageToken) params.set('pageToken', pageToken)
    else if (syncToken) params.set('syncToken', syncToken)
    else { params.set('timeMin', timeMin); params.set('timeMax', timeMax); params.set('orderBy', 'startTime') }
    const r = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events?' + params, { headers: { authorization: 'Bearer ' + accessToken } })
    if (r.status === 410) {
      // Sync token expired — clear it and do a full re-sync from scratch
      syncToken = null
      pageToken = undefined
      await sb.from('google_tokens').update({ sync_token: null }).eq('family_member_id', tok.family_member_id)
      continue
    }
    if (!r.ok) { const t = await r.text(); throw new Error('Calendar API ' + r.status + ': ' + t) }
    const page = await r.json()
    pulled += page.items?.length ?? 0
    for (const ev of page.items ?? []) { await upsertEvent(sb, tok.family_member_id, ev, accessToken); upserted++ }
    pageToken = page.nextPageToken
    if (page.nextSyncToken) syncToken = page.nextSyncToken
  } while (pageToken)
  await sb.from('google_tokens').update({ sync_token: syncToken ?? null, last_sync_at: new Date().toISOString(), last_sync_error: null, updated_at: new Date().toISOString() }).eq('family_member_id', tok.family_member_id)
  return { pulled, upserted }
}

async function upsertEvent(sb: SupabaseClient, sourceMemberId: string, ev: Record<string, unknown>, accessToken: string) {
  if (ev.status === 'cancelled') { await sb.from('events').update({ status: 'cancelled', updated_at: new Date().toISOString() }).eq('google_event_id', ev.id); return }
  const start = ev.start as Record<string, string> | undefined
  const end = ev.end as Record<string, string> | undefined
  const startTime = start?.dateTime ?? (start?.date ? start.date + 'T00:00:00Z' : null)
  const endTime = end?.dateTime ?? (end?.date ? end.date + 'T23:59:59Z' : null)
  if (!startTime || !endTime) return

  const { data: existing } = await sb.from('events').select('id, is_enriched, updated_at').eq('google_event_id', ev.id).maybeSingle()
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
        updated_at: new Date().toISOString(),
      }).eq('id', eventId)
    } else {
      const row = { title: (ev.summary as string) ?? '(untitled)', description: (ev.description as string) ?? null, start_time: startTime, end_time: endTime, all_day: !start?.dateTime, location_name: (ev.location as string) ?? null, address: (ev.location as string) ?? null, google_event_id: ev.id as string, source_member_id: sourceMemberId, status: 'confirmed', updated_at: new Date().toISOString() }
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
      if (existingAtTime.is_enriched) {
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
        fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${ev.id}`, {
          method: 'PATCH',
          headers: { authorization: 'Bearer ' + accessToken, 'content-type': 'application/json' },
          body: JSON.stringify(patch),
        }).catch(() => {})
      }
      return
    }

    // Genuinely new event — insert
    const row = { title: (ev.summary as string) ?? '(untitled)', description: (ev.description as string) ?? null, start_time: startTime, end_time: endTime, all_day: !start?.dateTime, location_name: (ev.location as string) ?? null, address: (ev.location as string) ?? null, google_event_id: ev.id as string, source_member_id: sourceMemberId, status: 'confirmed', updated_at: new Date().toISOString() }
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
