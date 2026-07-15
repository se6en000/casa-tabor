import { createClient } from 'npm:@supabase/supabase-js@2'
import { patchGoogleEvent, createGoogleEvent } from '../_shared/google.ts'
import { loadWritableGoogleConnection, markGoogleConnectionHealthy } from '../_shared/google-connection.ts'

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

  const enr = Array.isArray(event.event_enrichments) ? event.event_enrichments[0] : event.event_enrichments
  const calendarId = connection.calendar_id

  // ── Build Google Calendar patch ──
  // Send all editable fields: title, times, location, description+enrichment

  // title — strip any "Name | " prefix that Casa adds for display, send the clean title
  const summary = (event.title as string) ?? undefined

  // location — prefer location_name; append address only if it's different
  const locationParts = [event.location_name, event.address].filter((p, i, arr) => p && arr.indexOf(p) === i)
  const location = locationParts.length > 0 ? locationParts.join(', ') : undefined

  // description = structured enrichment block appended to original description
  const descLines: string[] = []

  if (enr) {
    const primaryMember = (event.event_members as { role: string; family_members: { name: string } }[] | undefined)
      ?.find(m => m.role === 'primary')?.family_members?.name
    const attendees = (event.event_members as { role: string; family_members: { name: string } }[] | undefined)
      ?.filter(m => m.role === 'attendee').map(m => m.family_members?.name).filter(Boolean)

    if (primaryMember) descLines.push(`👤 Primary: ${primaryMember}`)
    if (attendees?.length) descLines.push(`👥 Also: ${attendees.join(', ')}`)
    if (enr.prep_notes) descLines.push(`\n📋 Prep Notes\n${enr.prep_notes}`)
    if (enr.what_to_bring?.length) descLines.push(`\n🎒 What to Bring\n${(enr.what_to_bring as string[]).join('\n')}`)
    if (enr.outfit_suggestion) descLines.push(`\n👗 Outfit\n${enr.outfit_suggestion}`)
    if (enr.parking_notes) descLines.push(`\n🅿️ Parking\n${enr.parking_notes}`)
    if (enr.contact_name) {
      const contact = [enr.contact_name, enr.contact_phone].filter(Boolean).join(' · ')
      descLines.push(`\n📞 Contact\n${contact}`)
    }
    if (enr.cost_estimate) descLines.push(`\n💰 Cost\n${enr.cost_estimate}`)
    if (enr.dietary_notes) descLines.push(`\n🥗 Dietary\n${enr.dietary_notes}`)
    if (enr.meal_impact) descLines.push(`\n🍽️ Meal Impact\n${enr.meal_impact}`)
  }

  const enrichmentBlock = descLines.length > 0
    ? `\n\n━━━━━━━━━━━━━━━━━━━━━\n🏠 Casa Tabor Details\n━━━━━━━━━━━━━━━━━━━━━\n${descLines.join('\n')}`
    : ''

  // Strip any previous Casa Tabor block before re-appending
  const originalDesc = (event.description as string | null)?.replace(/\n*━━━━━━━━━━━━━━━━━━━━━\n🏠 Casa Tabor Details[\s\S]*$/, '') ?? ''
  const description = originalDesc + enrichmentBlock

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

  const patch = {
    summary,
    ...(location !== undefined ? { location } : {}),
    description,
    start: isAllDay
      ? { date: toGoogleAllDayDate(event.start_time as string) }
      : { dateTime: toISO(event.start_time), timeZone: TZ },
    end: isAllDay
      ? { date: toGoogleAllDayEndDate(event.end_time as string) }
      : { dateTime: toISO(event.end_time), timeZone: TZ },
  }
  console.log('[push-to-google] patch payload:', JSON.stringify(patch))

  try {
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
        description,
        start: patch.start,
        end: patch.end,
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
