import { createClient } from 'npm:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })

  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const { limit = 10 } = await req.json().catch(() => ({}))

  try {
    const workerId = `google-sync-jobs:${crypto.randomUUID()}`
    const { data: jobs, error: loadError } = await sb.rpc('claim_google_sync_jobs', {
      p_worker_id: workerId,
      p_limit: Math.max(1, Math.min(Number(limit) || 10, 25)),
    })

    if (loadError) throw new Error(loadError.message)

    let processed = 0
    let succeeded = 0
    let failed = 0

    for (const job of jobs ?? []) {
      processed += 1
      const syncRes = await sb.functions.invoke('sync-event-to-google', {
        body: {
          event_id: job.event_id,
          audit_history_id: job.audit_history_id ?? null,
          enqueue_on_failure: false,
          title_only: job.sync_mode === 'title_only',
        },
      }).catch((err: Error) => ({ data: null, error: err }))

      const syncStatus = typeof syncRes?.data?.sync_status === 'string' ? syncRes.data.sync_status : null
      const syncError = syncRes?.error?.message ?? syncRes?.data?.error ?? (syncStatus === 'failed' ? 'sync-event-to-google failed' : null)
      if (!syncError && (syncStatus === 'synced' || syncStatus === 'not_needed')) {
        const { error: finishError } = await sb.rpc('finish_google_sync_job', {
          p_job_id: job.id,
          p_worker_id: workerId,
          p_success: true,
        })
        if (finishError) throw new Error(finishError.message)

        if (job.audit_history_id) {
          await sb
            .from('ai_event_edit_history')
            .update({ sync_status: 'succeeded' })
            .eq('id', job.audit_history_id)
        }

        succeeded += 1
        continue
      }

      const exhausted = Number(job.attempts ?? 0) >= Number(job.max_attempts ?? 5)
      const { error: finishError } = await sb.rpc('finish_google_sync_job', {
        p_job_id: job.id,
        p_worker_id: workerId,
        p_success: false,
        p_error: syncError,
      })
      if (finishError) throw new Error(finishError.message)

      if (job.audit_history_id) {
        await sb
          .from('ai_event_edit_history')
          .update({ sync_status: exhausted ? 'failed' : 'retrying', error_message: syncError })
          .eq('id', job.audit_history_id)
      }

      failed += 1
    }

    return new Response(JSON.stringify({ success: true, processed, succeeded, failed }), {
      headers: { ...CORS, 'content-type': 'application/json' },
    })
  } catch (error) {
    return new Response(JSON.stringify({ success: false, error: (error as Error).message ?? 'Retry worker failed' }), {
      status: 500,
      headers: { ...CORS, 'content-type': 'application/json' },
    })
  }
})
