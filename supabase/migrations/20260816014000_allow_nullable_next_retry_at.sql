-- ============================================================================
-- Allow null next_retry_at for completed/failed jobs
-- ============================================================================

alter table public.google_sync_jobs
  alter column next_retry_at drop not null;

-- Ensure finish_google_sync_job has clean null handling
create or replace function public.finish_google_sync_job(
  p_job_id uuid,
  p_worker_id text,
  p_success boolean,
  p_error text default null
)
returns public.google_sync_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.google_sync_jobs%rowtype;
  v_exhausted boolean;
  v_delay_minutes integer;
  v_has_pending_job boolean;
begin
  select *
  into v_job
  from public.google_sync_jobs
  where id = p_job_id
  for update;

  if not found then
    raise exception 'Google sync job not found';
  end if;
  if v_job.status <> 'running' or v_job.worker_id is distinct from p_worker_id then
    raise exception 'Google sync job lease is no longer owned by this worker';
  end if;

  v_exhausted := not p_success and v_job.attempts >= v_job.max_attempts;
  v_delay_minutes := case v_job.attempts
    when 1 then 5
    when 2 then 15
    when 3 then 60
    else 180
  end;

  -- Check if another job for this event_id was enqueued while this worker was running
  select exists (
    select 1
    from public.google_sync_jobs
    where event_id = v_job.event_id
      and id <> p_job_id
      and status in ('pending', 'retrying')
  ) into v_has_pending_job;

  if v_has_pending_job and not p_success then
    -- A newer job is already pending for this event; finish this worker execution as failed so we don't collide with the pending job
    update public.google_sync_jobs
    set status = 'failed',
        next_retry_at = null,
        completed_at = now(),
        last_error = coalesce(p_error, last_error),
        worker_id = null,
        updated_at = now()
    where id = p_job_id
    returning * into v_job;
  else
    update public.google_sync_jobs
    set status = case
          when p_success then 'succeeded'
          when v_exhausted then 'failed'
          else 'retrying'
        end,
        next_retry_at = case
          when p_success or v_exhausted then null
          else now() + (v_delay_minutes || ' minutes')::interval
        end,
        completed_at = case when p_success or v_exhausted then now() else null end,
        last_error = coalesce(p_error, last_error),
        worker_id = null,
        updated_at = now()
    where id = p_job_id
    returning * into v_job;
  end if;

  return v_job;
end;
$$;
