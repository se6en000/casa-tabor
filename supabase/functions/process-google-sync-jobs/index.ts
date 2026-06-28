import { createClient } from 'npm:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function nextRetryDelayMinutes(attempt: number): number {
  if (attempt <= 1) return 5
  if (attempt === 2) return 15
  if (attempt === 3) return 60
  return 180
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })

  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const { limit = 10 } = await req.json().catch(() => ({}))

  try {
    const nowIso = new Date().toISOString()
    const { data: jobs, error: loadError } = await sb
      .from('google_sync_jobs')
      .select('id, event_id, audit_history_id, attempts, max_attempts')
      .in('status', ['pending', 'retrying'])
      .lte('next_retry_at', nowIso)
      .order('created_at', { ascending: true })
      .limit(Math.max(1, Math.min(Number(limit) || 10, 25)))

    if (loadError) throw new Error(loadError.message)

    let processed = 0
    let succeeded = 0
    let failed = 0

    for (const job of jobs ?? []) {
      processed += 1
      const attemptNumber = Number(job.attempts ?? 0) + 1
      const startedAt = new Date().toISOString()

      await sb
        .from('google_sync_jobs')
        .update({
          status: 'running',
          attempts: attemptNumber,
          last_attempt_at: startedAt,
          updated_at: startedAt,
        })
        .eq('id', job.id)

      const syncRes = await sb.functions.invoke('sync-event-to-google', {
        body: {
          event_id: job.event_id,
          audit_history_id: job.audit_history_id ?? null,
          enqueue_on_failure: false,
        },
      }).catch((err: Error) => ({ data: null, error: err }))

      const syncStatus = typeof syncRes?.data?.sync_status === 'string' ? syncRes.data.sync_status : null
      const syncError = syncRes?.error?.message ?? syncRes?.data?.error ?? (syncStatus === 'failed' ? 'sync-event-to-google failed' : null)
      if (!syncError && (syncStatus === 'synced' || syncStatus === 'not_needed')) {
        const finishedAt = new Date().toISOString()
        await sb
          .from('google_sync_jobs')
          .update({
            status: 'succeeded',
            last_error: null,
            completed_at: finishedAt,
            updated_at: finishedAt,
          })
          .eq('id', job.id)

        if (job.audit_history_id) {
          await sb
            .from('ai_event_edit_history')
            .update({ sync_status: 'succeeded' })
            .eq('id', job.audit_history_id)
        }

        succeeded += 1
        continue
      }

      const exhausted = attemptNumber >= Number(job.max_attempts ?? 5)
      const nextRetryAt = new Date(Date.now() + nextRetryDelayMinutes(attemptNumber) * 60_000).toISOString()
      const nextStatus = exhausted ? 'failed' : 'retrying'
      const finishedAt = new Date().toISOString()

      await sb
        .from('google_sync_jobs')
        .update({
          status: nextStatus,
          last_error: syncError,
          next_retry_at: exhausted ? finishedAt : nextRetryAt,
          completed_at: exhausted ? finishedAt : null,
          updated_at: finishedAt,
        })
        .eq('id', job.id)

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
