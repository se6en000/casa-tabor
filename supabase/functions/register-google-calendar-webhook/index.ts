import { createClient, SupabaseClient } from 'npm:@supabase/supabase-js@2'
import {
  resolveGoogleConnection,
  type CalendarConnection,
} from '../_shared/google-connection.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS })
  }

  const sb = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {}
  const results: Record<string, unknown> = {}

  let connectionsToRegister: CalendarConnection[] = []

  if (body.connection_id) {
    const { data, error } = await sb
      .from('calendar_connections')
      .select('*')
      .eq('id', body.connection_id)
      .eq('is_enabled', true)
    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...CORS, 'content-type': 'application/json' },
      })
    }
    connectionsToRegister = (data ?? []) as CalendarConnection[]
  } else if (body.family_member_id) {
    const { data, error } = await sb
      .from('calendar_connections')
      .select('*')
      .eq('family_member_id', body.family_member_id)
      .eq('is_enabled', true)
    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...CORS, 'content-type': 'application/json' },
      })
    }
    connectionsToRegister = (data ?? []) as CalendarConnection[]
  } else {
    const { data, error } = await sb
      .from('calendar_connections')
      .select('*')
      .eq('is_enabled', true)
    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...CORS, 'content-type': 'application/json' },
      })
    }
    connectionsToRegister = (data ?? []) as CalendarConnection[]
  }

  for (const connection of connectionsToRegister) {
    try {
      results[connection.id] = await registerWatchChannel(sb, connection)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[register-google-calendar-webhook] Failed for connection ${connection.id}:`, msg)
      results[connection.id] = { error: msg }
    }
  }

  return new Response(JSON.stringify({ ok: true, results }), {
    headers: { ...CORS, 'content-type': 'application/json' },
  })
})

async function registerWatchChannel(
  sb: SupabaseClient,
  connection: CalendarConnection,
) {
  const resolved = await resolveGoogleConnection(sb, connection)
  const { accessToken } = resolved
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const webhookUrl = `${supabaseUrl}/functions/v1/google-calendar-webhook`

  // 1. If an existing channel is active, gracefully attempt to stop it
  const { data: currentConn } = await sb
    .from('calendar_connections')
    .select('webhook_channel_id, webhook_resource_id')
    .eq('id', connection.id)
    .single()

  if (currentConn?.webhook_channel_id && currentConn?.webhook_resource_id) {
    try {
      await fetch('https://www.googleapis.com/calendar/v3/channels/stop', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${accessToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          id: currentConn.webhook_channel_id,
          resourceId: currentConn.webhook_resource_id,
        }),
      })
      console.log(`[register-google-calendar-webhook] Stopped previous channel ${currentConn.webhook_channel_id}`)
    } catch (stopErr) {
      console.warn(`[register-google-calendar-webhook] Previous channel stop warning:`, stopErr)
    }
  }

  // 2. Generate new channel parameters
  const newChannelId = crypto.randomUUID()
  const newChannelToken = crypto.randomUUID()

  // Google Calendar watch channels support up to 7 days TTL (604800 seconds)
  const watchPayload = {
    id: newChannelId,
    type: 'web_hook',
    address: webhookUrl,
    token: newChannelToken,
    params: {
      ttl: '604800',
    },
  }

  const calendarId = connection.calendar_id || 'primary'
  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/watch`,
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(watchPayload),
    },
  )

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Google Calendar watch API returned ${response.status}: ${errorText}`)
  }

  const data = await response.json()
  const expirationMs = Number(data.expiration)
  const expirationDate = !isNaN(expirationMs) && expirationMs > 0
    ? new Date(expirationMs).toISOString()
    : new Date(Date.now() + 6 * 86400000).toISOString()

  // 3. Persist active channel subscription in DB
  const nowIso = new Date().toISOString()
  const { error: updateError } = await sb
    .from('calendar_connections')
    .update({
      webhook_channel_id: newChannelId,
      webhook_resource_id: data.resourceId,
      webhook_channel_token: newChannelToken,
      webhook_expires_at: expirationDate,
      webhook_status: 'active',
      updated_at: nowIso,
    })
    .eq('id', connection.id)

  if (updateError) {
    throw new Error(`Failed to update calendar_connections with webhook metadata: ${updateError.message}`)
  }

  console.log(`[register-google-calendar-webhook] Successfully registered channel ${newChannelId} for ${connection.google_email}, expires: ${expirationDate}`)

  return {
    channel_id: newChannelId,
    resource_id: data.resourceId,
    expires_at: expirationDate,
    status: 'active',
  }
}
