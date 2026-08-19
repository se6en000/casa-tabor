import { createClient } from 'npm:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-goog-channel-id, x-goog-channel-token, x-goog-resource-state, x-goog-resource-id, x-goog-resource-uri, x-goog-message-number',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS })
  }

  // Google Push notifications send metadata in request headers
  const channelId = req.headers.get('x-goog-channel-id') || req.headers.get('X-Goog-Channel-ID')
  const resourceState = req.headers.get('x-goog-resource-state') || req.headers.get('X-Goog-Resource-State')
  const channelToken = req.headers.get('x-goog-channel-token') || req.headers.get('X-Goog-Channel-Token')
  const resourceId = req.headers.get('x-goog-resource-id') || req.headers.get('X-Goog-Resource-ID')
  const messageNumber = req.headers.get('x-goog-message-number') || req.headers.get('X-Goog-Message-Number')

  console.log(`[google-calendar-webhook] Notification received: channel=${channelId} state=${resourceState} msg=${messageNumber}`)

  // 1. Initial Google Handshake / Validation ping
  if (resourceState === 'sync') {
    console.log(`[google-calendar-webhook] Handshake confirmed for channel ${channelId}`)
    return new Response(JSON.stringify({ ok: true, state: 'sync', channel_id: channelId }), {
      status: 200,
      headers: { ...CORS, 'content-type': 'application/json' },
    })
  }

  // 2. No channel ID provided
  if (!channelId) {
    return new Response(JSON.stringify({ ok: false, error: 'Missing x-goog-channel-id header' }), {
      status: 200, // Return 200 so Google does not retry invalid ping
      headers: { ...CORS, 'content-type': 'application/json' },
    })
  }

  const sb = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // 3. Find matching calendar connection
  const { data: connection, error } = await sb
    .from('calendar_connections')
    .select('id, family_member_id, google_email, calendar_id, webhook_channel_token, is_enabled')
    .eq('webhook_channel_id', channelId)
    .maybeSingle()

  if (error) {
    console.error('[google-calendar-webhook] Database lookup error:', error.message)
    return new Response(JSON.stringify({ ok: false, error: error.message }), {
      status: 200,
      headers: { ...CORS, 'content-type': 'application/json' },
    })
  }

  if (!connection) {
    console.warn(`[google-calendar-webhook] No active connection found for channel ${channelId}`)
    return new Response(JSON.stringify({ ok: true, notice: 'Channel not found or inactive' }), {
      status: 200,
      headers: { ...CORS, 'content-type': 'application/json' },
    })
  }

  // Verify optional channel token if configured
  if (connection.webhook_channel_token && channelToken && connection.webhook_channel_token !== channelToken) {
    console.warn(`[google-calendar-webhook] Security token mismatch for connection ${connection.id}`)
    return new Response(JSON.stringify({ ok: false, error: 'Token mismatch' }), {
      status: 200,
      headers: { ...CORS, 'content-type': 'application/json' },
    })
  }

  // Record webhook delivery receipt
  const nowIso = new Date().toISOString()
  await sb
    .from('calendar_connections')
    .update({ last_webhook_received_at: nowIso, webhook_status: 'active' })
    .eq('id', connection.id)

  // 4. Trigger immediate incremental synchronization
  if (resourceState === 'exists' || !resourceState) {
    console.log(`[google-calendar-webhook] Triggering immediate sync for connection ${connection.id} (${connection.google_email})`)
    try {
      const syncRes = await sb.functions.invoke('sync-calendars', {
        body: { connection_id: connection.id },
      })
      console.log(`[google-calendar-webhook] Sync completed:`, syncRes.data)
    } catch (syncErr) {
      console.error('[google-calendar-webhook] Sync trigger error:', syncErr)
    }
  }

  return new Response(
    JSON.stringify({
      ok: true,
      channel_id: channelId,
      connection_id: connection.id,
      state: resourceState,
    }),
    {
      status: 200,
      headers: { ...CORS, 'content-type': 'application/json' },
    },
  )
})
