// Casa -> iOS "To Do" reminders export, structural twin of sync-casa-to-ios
// (grocery/Shopping) but for the app's Today's To-Dos (events with
// event_type = 'reminder'). See supabase/migrations/20260917130000_todo_reminder_sync.sql
// for get_todo_reminder_deltas, which does the events<->event_ios_reminder_links
// join server-side.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { requireEnv } from '../_shared/env.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })

  try {
    const sb = createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'))
    const { since, limit = 200 } = await req.json().catch(() => ({}))
    const effectiveLimit = Math.max(1, Math.min(Number(limit) || 200, 500))

    const parsedSince =
      typeof since === 'string' && !Number.isNaN(Date.parse(since))
        ? since
        : null

    const { data, error } = await sb.rpc('get_todo_reminder_deltas', {
      p_since: parsedSince,
      p_limit: effectiveLimit,
    })
    if (error) throw new Error(error.message)

    const rows = data ?? []
    const nextCursor = rows.length > 0 ? rows[rows.length - 1].updated_at : parsedSince

    // Best-effort heartbeat, same pattern as sync-casa-to-ios: this endpoint is
    // polled unconditionally by the Mac's Casa->iOS to-do poller every tick.
    try {
      await sb.from('sync_heartbeats').upsert({
        job_name: 'sync-casa-todos-to-ios',
        last_seen_at: new Date().toISOString(),
        meta: { since: parsedSince, returned: rows.length },
      })
    } catch (_heartbeatError) {
      // Observability only -- swallow.
    }

    return new Response(
      JSON.stringify({
        success: true,
        since: parsedSince,
        next_cursor: nextCursor,
        server_time: new Date().toISOString(),
        deltas: rows,
      }),
      { headers: { ...CORS, 'content-type': 'application/json' } }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ success: false, error: (error as Error).message ?? 'sync-casa-todos-to-ios failed' }),
      { status: 500, headers: { ...CORS, 'content-type': 'application/json' } }
    )
  }
})
