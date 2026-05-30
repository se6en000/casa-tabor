import { createClient } from 'npm:@supabase/supabase-js@2'
import { refreshAccessToken, patchGoogleEvent } from '../_shared/google.ts'

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
    .select('id, title, description, start_time, end_time, all_day, location_name, address, google_event_id, google_calendar_id, source_member_id, event_enrichments(*), event_members(role, family_members(name))')
    .eq('id', event_id)
    .single()

  if (evErr || !event) return new Response(JSON.stringify({ error: evErr?.message ?? 'event not found' }), { status: 404, headers: { ...CORS, 'content-type': 'application/json' } })
  if (!event.google_event_id) return new Response(JSON.stringify({ ok: true, skipped: 'no google_event_id' }), { headers: { ...CORS, 'content-type': 'application/json' } })

  // Get the token for the source member
  const memberId = event.source_member_id
  if (!memberId) return new Response(JSON.stringify({ ok: true, skipped: 'no source_member_id' }), { headers: { ...CORS, 'content-type': 'application/json' } })

  const { data: tok } = await sb.from('google_tokens').select('*').eq('family_member_id', memberId).single()
  if (!tok) return new Response(JSON.stringify({ ok: true, skipped: 'no google token for member' }), { headers: { ...CORS, 'content-type': 'application/json' } })

  // Refresh token if expired
  let accessToken = tok.access_token
  if (tok.expires_at && new Date(tok.expires_at) < new Date(Date.now() + 60_000)) {
    const clientId = Deno.env.get('GOOGLE_CLIENT_ID')!
    const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET')!
    const t = await refreshAccessToken({ refreshToken: tok.refresh_token, clientId, clientSecret })
    accessToken = t.access_token
    await sb.from('google_tokens').update({ access_token: t.access_token, expires_at: new Date(Date.now() + t.expires_in * 1000).toISOString(), updated_at: new Date().toISOString() }).eq('family_member_id', memberId)
  }

  const enr = Array.isArray(event.event_enrichments) ? event.event_enrichments[0] : event.event_enrichments
  const calendarId = event.google_calendar_id ?? 'primary'

  // ── Build Google Calendar patch ──
  // Note: We intentionally do NOT update `summary` (title) — Gmail-auto-created events
  // reject title changes with 400, and Google's title is the source of truth there.

  // location = "Location Name, Address" or whichever we have
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

  const patch = {
    ...(location !== undefined ? { location } : {}),
    description,
    start: isAllDay
      ? { date: new Date(event.start_time).toISOString().slice(0, 10) }
      : { dateTime: toISO(event.start_time) },
    end: isAllDay
      ? { date: new Date(event.end_time).toISOString().slice(0, 10) }
      : { dateTime: toISO(event.end_time) },
  }
  console.log('[push-to-google] patch payload:', JSON.stringify(patch))

  await patchGoogleEvent({
    accessToken,
    calendarId,
    eventId: event.google_event_id,
    patch,
  })

  return new Response(JSON.stringify({ ok: true }), { headers: { ...CORS, 'content-type': 'application/json' } })
  } catch (err) {
    const msg = (err as Error).message ?? String(err)
    console.error('[push-to-google] error:', msg)
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: { ...CORS, 'content-type': 'application/json' } })
  }
})
