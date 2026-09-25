-- ============================================================================
-- Resume the family-data index worker at a guardrail-compliant cadence
--
-- The `process-family-data-index` cron (every 5 minutes) was deactivated in the
-- 2026-08-25 pg_cron/connection-pool cleanup -- correctly, it violated the
-- >=15-minute rule -- but was never rescheduled. Since then
-- public.family_data_index_queue has not drained: ~3,870 jobs pending and 91
-- stranded in 'processing' (locked mid-run when the job was disabled), and the
-- assistant's family-data retrieval index has been ~4 weeks stale.
--
-- Cost/blast radius (deliberately small):
--   * index-family-data only calls gemini-embedding-001 (no generation model).
--   * batch_size 25 every 15 minutes => at most 2,400 jobs/day.
--   * one net.http_post per run, 10s client timeout (GUARDRAILS.md).
--   * the anon key is read from the vault (SUPABASE_ANON_KEY) -- nothing
--     embedded in the job definition.
-- ============================================================================

-- 1. Release jobs stranded in 'processing' by the disabled worker.
update public.family_data_index_queue
set status = 'pending',
    locked_at = null,
    locked_by = null,
    updated_at = now()
where status = 'processing'
  and coalesce(locked_at, updated_at) < now() - interval '1 hour';

-- 2. Replace the old disabled job (idempotent).
do $$
declare
  v_job record;
begin
  for v_job in select jobid from cron.job where jobname = 'process-family-data-index' loop
    perform cron.unschedule(v_job.jobid);
  end loop;
end;
$$;

-- 3. Reschedule every 15 minutes with a bounded batch.
select cron.schedule(
  'process-family-data-index',
  '*/15 * * * *',
  $$
  select net.http_post(
    url     := 'https://sjiejymuuuqzqukyeagk.supabase.co/functions/v1/index-family-data',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'apikey',        s.k,
      'Authorization', 'Bearer ' || s.k
    ),
    body    := '{"batch_size": 25}'::jsonb,
    timeout_milliseconds := 10000
  )
  from (
    select decrypted_secret as k
    from vault.decrypted_secrets
    where name = 'SUPABASE_ANON_KEY'
    limit 1
  ) s;
  $$
);
