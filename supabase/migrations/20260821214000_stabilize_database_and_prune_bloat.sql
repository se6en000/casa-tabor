-- ============================================================================
-- Database Stabilization & Free-Tier Bloat Control
-- 1. Index missing FK on event_action_items(event_id)
-- 2. Partial index on events(start_time, end_time) for ultra-fast calendar feed loads
-- 3. Drop unused bloated indexes on ai_drawer_debug_events
-- 4. Tune autovacuum scale factors on high-churn queue/document tables
-- 5. Enhance prune_operational_logs() to keep disk footprint strictly bounded
-- ============================================================================

-- 1. Foreign key index to eliminate full table sequential scans on calendar fetches
create index if not exists idx_event_action_items_event_id 
  on public.event_action_items(event_id);

-- 2. High-performance partial range index for active calendar range loads
create index if not exists idx_events_active_calendar 
  on public.events (start_time, end_time) 
  where (record_kind <> 'series_template' and deleted_at is null);

-- 3. Drop unused indexes that bloat disk and cache
drop index if exists public.ai_drawer_debug_events_dedupe_key_uidx;
drop index if exists public.ai_drawer_debug_events_correlation_idx;
drop index if exists public.ai_drawer_debug_events_event_idx;
drop index if exists public.ai_drawer_debug_events_session_idx;
drop index if exists public.ai_drawer_debug_events_action_idx;

-- 4. Aggressive autovacuum tuning for queue/churn tables (5% threshold instead of default 20%)
alter table public.family_data_index_queue set (autovacuum_vacuum_scale_factor = 0.05);
alter table public.family_data_documents set (autovacuum_vacuum_scale_factor = 0.05);
alter table public.family_data_chunks set (autovacuum_vacuum_scale_factor = 0.05);
alter table public.google_sync_jobs set (autovacuum_vacuum_scale_factor = 0.05);
alter table public.event_transportation_generation_queue set (autovacuum_vacuum_scale_factor = 0.05);

-- 5. Enhanced operational log pruning stored procedure
create or replace function public.prune_operational_logs(
  p_debug_retention interval default interval '3 days',
  p_cron_retention interval default interval '2 days'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_debug_deleted integer := 0;
  v_cron_deleted integer := 0;
  v_usage_deleted integer := 0;
  v_expired_docs_deleted integer := 0;
  v_http_response_deleted integer := 0;
begin
  delete from public.ai_drawer_debug_events
  where received_at < now() - p_debug_retention;
  get diagnostics v_debug_deleted = row_count;

  delete from cron.job_run_details
  where start_time < now() - p_cron_retention;
  get diagnostics v_cron_deleted = row_count;

  delete from public.ai_usage_log
  where created_at < now() - p_debug_retention;
  get diagnostics v_usage_deleted = row_count;

  delete from public.family_data_documents
  where expires_at is not null and expires_at < now();
  get diagnostics v_expired_docs_deleted = row_count;

  delete from net._http_response
  where created < now() - interval '1 day';
  get diagnostics v_http_response_deleted = row_count;

  return jsonb_build_object(
    'debug_deleted', v_debug_deleted,
    'cron_deleted', v_cron_deleted,
    'usage_deleted', v_usage_deleted,
    'expired_docs_deleted', v_expired_docs_deleted,
    'http_responses_deleted', v_http_response_deleted,
    'ran_at', now()
  );
end;
$$;
