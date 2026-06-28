import { createClient } from 'npm:@supabase/supabase-js@2'
import { refreshAccessToken, createGoogleEvent, patchGoogleEvent } from '../_shared/google.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const TZ = 'America/New_York'

function toGoogleAllDayEndDate(inclusiveEndTime: string): string {
  const d = new Date(inclusiveEndTime)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })

  try {
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    const { master_event_id } = await req.json().catch(() => ({}))
    if (!master_event_id) return err('master_event_id required', 400)

    // Load master event
    const { data: master, error: evErr } = await sb
      .from('events')
      .select('id, title, description, start_time, end_time, all_day, location_name, address, rrule, google_event_id, google_calendar_id, source_member_id, event_type')
      .eq('id', master_event_id)
      .single()

    if (evErr || !master) return err(evErr?.message ?? 'master event not found', 404)
    if (master.event_type === 'reminder') return ok({ skipped: 'reminder' })

    // Get Google token — try source_member_id first, fall back to any
    const memberId = master.source_member_id
    let tok = memberId
      ? (await sb.from('google_tokens').select('*').eq('family_member_id', memberId).maybeSingle()).data
      : null
    if (!tok) {
      const { data: anyTok } = await sb.from('google_tokens').select('*').limit(1).maybeSingle()
      tok = anyTok ?? null
    }
    if (!tok) return ok({ skipped: 'no google token available' })

    // Refresh if expiring within 60s
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
      }).eq('family_member_id', tok.family_member_id)
    }

    const calendarId = master.google_calendar_id ?? (tok as Record<string, string>).calendar_id ?? 'primary'
    const isAllDay = master.all_day

    // Build start/end for Google
    const start = isAllDay
      ? { date: new Date(master.start_time).toISOString().slice(0, 10) }
      : { dateTime: new Date(master.start_time).toISOString(), timeZone: TZ }
    const end = isAllDay
      ? { date: toGoogleAllDayEndDate(master.end_time as string) }
      : { dateTime: new Date(master.end_time).toISOString(), timeZone: TZ }

    // Build location string
    const locationParts = [master.location_name, master.address]
      .filter((p, i, arr) => p && arr.indexOf(p) === i)
    const location = locationParts.length > 0 ? locationParts.join(', ') : undefined

    // Convert Casa RRULE (without prefix) to Google recurrence array format
    const recurrence: string[] = master.rrule ? [`RRULE:${master.rrule}`] : []

    const eventBody = {
      summary: master.title as string,
      ...(location !== undefined ? { location } : {}),
      ...(master.description ? { description: master.description as string } : {}),
      start,
      end,
      ...(recurrence.length > 0 ? { recurrence } : {}),
    }

    if (master.google_event_id) {
      // PATCH existing Google recurring event — updates title, times, location, recurrence rule
      await patchGoogleEvent({
        accessToken,
        calendarId,
        eventId: master.google_event_id as string,
        patch: eventBody,
      })
      console.log('[update-recurring-google] patched:', master.google_event_id)
      return ok({ patched: master.google_event_id })
    } else {
      // CREATE new Google recurring event and write ID back to master
      const created = await createGoogleEvent({
        accessToken,
        calendarId,
        event: eventBody,
      })
      await sb.from('events').update({
        google_event_id: created.id,
        google_calendar_id: calendarId,
        updated_at: new Date().toISOString(),
      }).eq('id', master_event_id)
      console.log('[update-recurring-google] created:', created.id)
      return ok({ created: created.id })
    }
  } catch (e) {
    const msg = (e as Error).message ?? String(e)
    console.error('[update-recurring-google] error:', msg)
    return err(msg)
  }
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
