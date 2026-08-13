import { createClient } from 'npm:@supabase/supabase-js@2'
import { createGoogleEvent, getGoogleEvent, patchGoogleEvent } from '../_shared/google.ts'
import { loadWritableGoogleConnection, markGoogleConnectionHealthy } from '../_shared/google-connection.ts'
import { buildGoogleEventDescription, googleLocationForEvent } from '../_shared/google-event-details-core.mjs'

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
      .select('id, title, description, start_time, end_time, all_day, location_name, address, rrule, google_event_id, google_calendar_id, google_connection_id, source_member_id, event_type')
      .eq('id', master_event_id)
      .single()

    if (evErr || !master) return err(evErr?.message ?? 'master event not found', 404)
    if (master.event_type === 'reminder') return ok({ skipped: 'reminder' })

    const { connection, accessToken } = await loadWritableGoogleConnection(sb)
    const calendarId = connection.calendar_id
    const isAllDay = master.all_day
    const { data: bundle, error: bundleError } = await sb.rpc('recurrence_build_reusable_patch', {
      p_event_id: master_event_id,
    })
    if (bundleError) throw bundleError

    // Build start/end for Google
    const start = isAllDay
      ? { date: new Date(master.start_time).toISOString().slice(0, 10) }
      : { dateTime: new Date(master.start_time).toISOString(), timeZone: TZ }
    const end = isAllDay
      ? { date: toGoogleAllDayEndDate(master.end_time as string) }
      : { dateTime: new Date(master.end_time).toISOString(), timeZone: TZ }

    const location = googleLocationForEvent(master, bundle)

    // Convert Casa RRULE (without prefix) to Google recurrence array format
    const recurrence: string[] = master.rrule ? [`RRULE:${master.rrule}`] : []

    const eventBody = {
      summary: master.title as string,
      ...(location !== undefined ? { location } : {}),
      start,
      end,
      ...(recurrence.length > 0 ? { recurrence } : {}),
    }

    if (master.google_event_id) {
      // PATCH existing Google recurring event — updates title, times, location, recurrence rule
      // If the ID was an occurrence ID with timestamp suffix, use the base series ID for recurring patch
      const targetGoogleId = (master.google_event_id as string).includes('_')
        ? (master.google_event_id as string).split('_')[0]
        : (master.google_event_id as string)

      try {
        const current = await getGoogleEvent({
          accessToken,
          calendarId,
          eventId: targetGoogleId,
        })
        await patchGoogleEvent({
          accessToken,
          calendarId,
          eventId: targetGoogleId,
          patch: {
            ...eventBody,
            description: buildGoogleEventDescription({
              bundle,
              existingDescription: current.description ?? master.description ?? '',
              eventId: master.id,
            }),
          },
        })
        await sb.from('events').update({
          google_event_id: targetGoogleId,
          google_connection_id: connection.id,
          source_member_id: connection.family_member_id,
          google_calendar_id: calendarId,
          updated_at: new Date().toISOString(),
        }).eq('id', master_event_id)
        await markGoogleConnectionHealthy(sb, connection.id)
        console.log('[update-recurring-google] patched:', targetGoogleId)
        return ok({ patched: targetGoogleId })
      } catch (errPatch) {
        const msg = (errPatch as Error).message ?? String(errPatch)
        if (!msg.includes('404')) throw errPatch
        const created = await createGoogleEvent({
          accessToken,
          calendarId,
          event: {
            ...eventBody,
            description: buildGoogleEventDescription({
              bundle,
              existingDescription: master.description ?? '',
              eventId: master.id,
            }),
          },
        })
        await sb.from('events').update({
          google_event_id: created.id,
          google_calendar_id: calendarId,
          google_connection_id: connection.id,
          source_member_id: connection.family_member_id,
          updated_at: new Date().toISOString(),
        }).eq('id', master_event_id)
        await markGoogleConnectionHealthy(sb, connection.id)
        console.log('[update-recurring-google] recreated on target account:', created.id)
        return ok({ recreated: created.id })
      }
    } else {
      // CREATE new Google recurring event and write ID back to master
      const created = await createGoogleEvent({
        accessToken,
        calendarId,
        event: {
          ...eventBody,
          description: buildGoogleEventDescription({
            bundle,
            existingDescription: master.description ?? '',
            eventId: master.id,
          }),
        },
      })
      await sb.from('events').update({
        google_event_id: created.id,
        google_calendar_id: calendarId,
        google_connection_id: connection.id,
        source_member_id: connection.family_member_id,
        updated_at: new Date().toISOString(),
      }).eq('id', master_event_id)
      await markGoogleConnectionHealthy(sb, connection.id)
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
