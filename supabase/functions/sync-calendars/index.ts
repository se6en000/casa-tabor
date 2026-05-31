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
  return r.json()
}

async function syncOne(sb: SupabaseClient, tok: Record<string, string>) {
  let accessToken = tok.access_token
  if (!accessToken || new Date(tok.expires_at).getTime() - Date.now() < 60000) {
    const t = await refreshToken(tok)
    accessToken = t.access_token
    await sb.from('google_tokens').update({ access_token: t.access_token, expires_at: new Date(Date.now() + t.expires_in * 1000).toISOString(), updated_at: new Date().toISOString() }).eq('family_member_id', tok.family_member_id)
  }
  const now = Date.now()
  const timeMin = new Date(now - 7 * 86400000).toISOString()
  const timeMax = new Date(now + 90 * 86400000).toISOString()
  let pageToken: string | undefined, syncToken = tok.sync_token, pulled = 0, upserted = 0
  do {
    const params = new URLSearchParams({ singleEvents: 'true', maxResults: '250' })
    if (pageToken) params.set('pageToken', pageToken)
    else if (syncToken) params.set('syncToken', syncToken)
    else { params.set('timeMin', timeMin); params.set('timeMax', timeMax); params.set('orderBy', 'startTime') }
    const r = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events?' + params, { headers: { authorization: 'Bearer ' + accessToken } })
    if (!r.ok) { const t = await r.text(); throw new Error('Calendar API ' + r.status + ': ' + t) }
    const page = await r.json()
    pulled += page.items?.length ?? 0
    for (const ev of page.items ?? []) { await upsertEvent(sb, tok.family_member_id, ev); upserted++ }
    pageToken = page.nextPageToken
    if (page.nextSyncToken) syncToken = page.nextSyncToken
  } while (pageToken)
  await sb.from('google_tokens').update({ sync_token: syncToken ?? null, last_sync_at: new Date().toISOString(), last_sync_error: null, updated_at: new Date().toISOString() }).eq('family_member_id', tok.family_member_id)
  return { pulled, upserted }
}

async function upsertEvent(sb: SupabaseClient, sourceMemberId: string, ev: Record<string, unknown>) {
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
      // Event has been enriched/manually edited — "last writer wins" on times.
      // If our DB updated_at is newer than Google's updated timestamp, the user has local
      // changes that either haven't pushed yet or pushed successfully (Google's timestamp
      // will be >= ours only after a successful patch). Skip overwrite if we're newer.
      const googleUpdated = ev.updated as string | undefined
      const dbUpdated = existing.updated_at as string | undefined
      if (googleUpdated && dbUpdated && new Date(dbUpdated) > new Date(googleUpdated)) {
        // Our record is newer — don't let Google overwrite the user's saved times
        return
      }
      // Google is newer (or no timestamps) — sync timing + status, never overwrite title/location/members
      await sb.from('events').update({
        start_time: startTime,
        end_time: endTime,
        all_day: !start?.dateTime,
        status: 'confirmed',
        updated_at: new Date().toISOString(),
      }).eq('id', eventId)
    } else {
      // Not enriched yet — safe to overwrite everything from Google
      const row = { title: (ev.summary as string) ?? '(untitled)', description: (ev.description as string) ?? null, start_time: startTime, end_time: endTime, all_day: !start?.dateTime, location_name: (ev.location as string) ?? null, address: (ev.location as string) ?? null, google_event_id: ev.id as string, source_member_id: sourceMemberId, status: 'confirmed', updated_at: new Date().toISOString() }
      await sb.from('events').update(row).eq('id', eventId)
      // Only sync members for un-enriched events
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
    // New event — insert with all Google data
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
