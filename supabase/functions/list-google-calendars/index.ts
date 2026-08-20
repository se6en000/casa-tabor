import { createClient } from 'npm:@supabase/supabase-js@2'
import {
  loadMemberGoogleConnection,
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
  const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {}

  try {
    let resolved
    if (body.connection_id) {
      const { data: connection, error } = await sb
        .from('calendar_connections')
        .select('*')
        .eq('id', body.connection_id)
        .single()
      if (error || !connection) throw new Error(error?.message || 'Connection not found')
      resolved = await resolveGoogleConnection(sb, connection as CalendarConnection)
    } else {
      let familyMemberId = body.family_member_id
      if (!familyMemberId) {
        const { data: writableConn } = await sb
          .from('calendar_connections')
          .select('family_member_id')
          .eq('access_mode', 'writable')
          .eq('is_enabled', true)
          .maybeSingle()
        familyMemberId = writableConn?.family_member_id
      }
      if (!familyMemberId) throw new Error('family_member_id or connection_id required')
      resolved = await loadMemberGoogleConnection(sb, familyMemberId)
    }

    const { connection, accessToken } = resolved

    // If user requested to save target calendar and read-only calendars
    if (body.save_selection || body.select_calendar_id || Array.isArray(body.select_read_calendar_ids)) {
      const targetCalendarId = typeof body.select_calendar_id === 'string' ? body.select_calendar_id.trim() : connection.calendar_id
      const readCalendarIds = Array.isArray(body.select_read_calendar_ids)
        ? body.select_read_calendar_ids.map((id: any) => String(id).trim()).filter(Boolean)
        : (connection.read_calendar_ids || [])
      const readMetadata = Array.isArray(body.read_calendar_metadata) ? body.read_calendar_metadata : []

      const { error: updateError } = await sb
        .from('calendar_connections')
        .update({
          calendar_id: targetCalendarId,
          read_calendar_ids: readCalendarIds,
          read_calendar_metadata: readMetadata,
          sync_token: null,
          recurrence_sync_token: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', connection.id)

      if (updateError) throw updateError

      return new Response(
        JSON.stringify({
          ok: true,
          updated: true,
          selected_calendar_id: targetCalendarId,
          selected_read_calendar_ids: readCalendarIds,
        }),
        { headers: { ...CORS, 'content-type': 'application/json' } }
      )
    }

    // Fetch user's Google Calendars (all accessible calendars)
    const calListRes = await fetch(
      'https://www.googleapis.com/calendar/v3/users/me/calendarList',
      { headers: { authorization: `Bearer ${accessToken}` } }
    )

    if (!calListRes.ok) {
      const errText = await calListRes.text()
      throw new Error(`Google CalendarList API ${calListRes.status}: ${errText}`)
    }

    const calList = await calListRes.json()
    const readIds = new Set(connection.read_calendar_ids || [])
    const calendars = (calList.items ?? []).map((c: any) => ({
      id: c.id,
      summary: c.summaryOverride || c.summary || c.id,
      description: c.description || null,
      primary: Boolean(c.primary),
      accessRole: c.accessRole,
      backgroundColor: c.backgroundColor || null,
      foregroundColor: c.foregroundColor || null,
      is_write_target: c.id === connection.calendar_id,
      is_read_selected: readIds.has(c.id),
      can_write: c.accessRole === 'owner' || c.accessRole === 'writer',
    }))

    return new Response(
      JSON.stringify({
        ok: true,
        connection_id: connection.id,
        current_calendar_id: connection.calendar_id,
        read_calendar_ids: connection.read_calendar_ids || [],
        calendars,
      }),
      { headers: { ...CORS, 'content-type': 'application/json' } }
    )
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const isReauth =
      msg.includes('expired') ||
      msg.includes('revoked') ||
      msg.includes('invalid_grant') ||
      msg.includes('REAUTHORIZATION') ||
      msg.includes('missing') ||
      msg.includes('401') ||
      msg.includes('403') ||
      msg.includes('insufficient') ||
      msg.includes('insufficientPermissions') ||
      msg.includes('ACCESS_TOKEN_SCOPE_INSUFFICIENT')

    return new Response(
      JSON.stringify({
        ok: false,
        reauth_required: isReauth,
        error: isReauth
          ? 'Google authorization needs to be refreshed. Please click Reconnect below to grant full calendar permissions.'
          : msg,
        calendars: [],
      }),
      {
        status: 200,
        headers: { ...CORS, 'content-type': 'application/json' },
      }
    )
  }
})
