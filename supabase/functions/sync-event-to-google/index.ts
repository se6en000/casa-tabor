import { createClient } from 'npm:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'content-type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })

  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const {
    event_id,
    audit_history_id = null,
    enqueue_on_failure = true,
    title_only = false,
  } = await req.json().catch(() => ({}))

  if (!event_id || typeof event_id !== 'string') {
    return json({ ok: false, sync_status: 'failed', error: 'event_id required' }, 400)
  }

  const { data: event, error: eventError } = await sb
    .from('events')
    .select('id, event_type, google_event_id, record_kind, series_id, deleted_at')
    .eq('id', event_id)
    .maybeSingle()

  if (eventError || !event) {
    return json({ ok: false, sync_status: 'failed', error: eventError?.message ?? 'event not found' }, 404)
  }

  if (event.event_type === 'reminder') {
    if (event.google_event_id) {
      const delRes = await sb.functions.invoke('delete-google-event', {
        body: { event_id },
      }).catch((err: Error) => ({ data: null, error: err }))
      const delError = delRes?.error?.message ?? delRes?.data?.error ?? null
      if (delError && !delError.includes('404')) {
        console.warn(`[sync-event-to-google] delete-google-event notice for reminder ${event_id}:`, delError)
      }
      await sb.from('events').update({
        google_event_id: null,
        google_calendar_id: null,
        google_connection_id: null,
        updated_at: new Date().toISOString(),
      }).eq('id', event_id)

      return json({
        ok: true,
        sync_status: 'deleted_from_google',
        skipped: 'reminder_deleted_from_google',
      })
    }
    return json({ ok: true, sync_status: 'not_needed', skipped: 'reminder' })
  }
  if (event.deleted_at) {
    return json({ ok: true, sync_status: 'not_needed', skipped: 'deleted_event' })
  }
  if (event.record_kind === 'occurrence' && event.series_id) {
    return json({
      ok: true,
      sync_status: 'not_needed',
      skipped: 'canonical_recurrence_uses_outbox',
    })
  }

  const targetFn = event.google_event_id ? 'push-to-google' : 'create-google-event'
  const syncRes = await sb.functions.invoke(targetFn, {
    body: { event_id, title_only: title_only === true },
  }).catch((err: Error) => ({ data: null, error: err }))

  let syncError: string | null = null
  if (syncRes?.error) {
    try {
      if (syncRes.error.context && typeof syncRes.error.context.json === 'function') {
        const body = await syncRes.error.context.json()
        syncError = body?.error || body?.message || syncRes.error.message
      } else if (syncRes.error.context && typeof syncRes.error.context.text === 'function') {
        const txt = await syncRes.error.context.text()
        try {
          const parsed = JSON.parse(txt)
          syncError = parsed?.error || parsed?.message || txt
        } catch {
          syncError = txt || syncRes.error.message
        }
      } else {
        syncError = syncRes.error.message
      }
    } catch {
      syncError = syncRes.error.message
    }
  } else if (syncRes?.data?.error) {
    syncError = syncRes.data.error
  }

  const skipped = typeof syncRes?.data?.skipped === 'string' ? syncRes.data.skipped : null

  const successSkips = new Set(['already has google_event_id', 'reminder', 'immutable_google_event'])
  if (!syncError && (!skipped || successSkips.has(skipped))) {
    await sb.from('google_sync_jobs').delete().eq('event_id', event_id)
    return json({
      ok: true,
      sync_status: 'synced',
      google_event_id: syncRes?.data?.google_event_id ?? null,
      via: targetFn,
    })
  }

  const reason = syncError ?? (skipped ? `sync skipped: ${skipped}` : 'unknown sync failure')
  if (!enqueue_on_failure) {
    return json({ ok: false, sync_status: 'failed', error: reason, via: targetFn }, 500)
  }

  const { data: existingJob } = await sb
    .from('google_sync_jobs')
    .select('id')
    .eq('event_id', event_id)
    .in('status', ['pending', 'retrying', 'running'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existingJob?.id) {
    return json({
      ok: true,
      sync_status: 'queued',
      sync_job_id: existingJob.id,
      sync_warning: `Saved in Casa Tabor. Google sync is queued and still in progress: ${reason}`,
      via: targetFn,
    })
  }

  const { data: jobId, error: queueError } = await sb.rpc('enqueue_google_sync_job', {
    p_event_id: event_id,
    p_audit_history_id: audit_history_id,
    p_error: reason,
  })

  if (queueError) {
    return json({
      ok: false,
      sync_status: 'failed',
      error: `sync failed and queueing failed: ${queueError.message}; original: ${reason}`,
      via: targetFn,
    }, 500)
  }

  return json({
    ok: true,
    sync_status: 'queued',
    sync_job_id: jobId,
    sync_warning: `Saved in Casa Tabor. Google sync is queued and still in progress: ${reason}`,
    via: targetFn,
  })
})
