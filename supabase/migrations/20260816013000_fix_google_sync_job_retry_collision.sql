-- ============================================================================
-- Fix google_sync_jobs retry collision on unique index
-- ============================================================================

-- 1. Clean up any lingering expired running jobs that conflict with pending/retrying jobs
update public.google_sync_jobs expired
set status = 'failed',
    worker_id = null,
    completed_at = now(),
    last_error = 'Expired lease superseded by newer queued job.',
    updated_at = now()
where expired.status = 'running'
  and exists (
    select 1
    from public.google_sync_jobs other
    where other.event_id = expired.event_id
      and other.id <> expired.id
      and other.status in ('pending', 'retrying')
  );

-- 2. Clean up any duplicate pending/retrying jobs per event
with ranked as (
  select
    id,
    row_number() over (partition by event_id order by created_at desc, id) as queue_position
  from public.google_sync_jobs
  where status in ('pending', 'retrying')
)
delete from public.google_sync_jobs job
using ranked
where job.id = ranked.id
  and ranked.queue_position > 1;

-- 3. Ensure unique partial index exists
create unique index if not exists google_sync_jobs_one_queued_per_event
  on public.google_sync_jobs (event_id)
  where status in ('pending', 'retrying');

-- 4. Harden enqueue_google_sync_job
create or replace function public.enqueue_google_sync_job(
  p_event_id uuid,
  p_audit_history_id uuid default null,
  p_error text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job_id uuid;
begin
  select id
  into v_job_id
  from public.google_sync_jobs
  where event_id = p_event_id
    and status in ('pending', 'retrying')
  order by created_at desc
  limit 1
  for update;

  if found then
    update public.google_sync_jobs
    set next_retry_at = now(),
        last_error = coalesce(p_error, last_error),
        audit_history_id = coalesce(p_audit_history_id, audit_history_id),
        updated_at = now()
    where id = v_job_id;
    return v_job_id;
  end if;

  insert into public.google_sync_jobs (
    event_id,
    audit_history_id,
    status,
    last_error,
    next_retry_at,
    updated_at
  )
  values (
    p_event_id,
    p_audit_history_id,
    'pending',
    p_error,
    now(),
    now()
  )
  on conflict (event_id) where status in ('pending', 'retrying')
  do update
  set next_retry_at = now(),
      last_error = coalesce(excluded.last_error, google_sync_jobs.last_error),
      audit_history_id = coalesce(excluded.audit_history_id, google_sync_jobs.audit_history_id),
      updated_at = now()
  returning id into v_job_id;

  return v_job_id;
end;
$$;

-- 5. Harden claim_google_sync_jobs
create or replace function public.claim_google_sync_jobs(
  p_worker_id text,
  p_limit integer default 10
)
returns setof public.google_sync_jobs
language plpgsql
security definer
set search_path = public
as $$
begin
  if nullif(trim(p_worker_id), '') is null then
    raise exception 'worker_id is required';
  end if;
  if p_limit < 1 or p_limit > 25 then
    raise exception 'limit must be between 1 and 25';
  end if;

  -- 5a. For expired running jobs where another pending/retrying job exists, mark as failed so we don't collide
  update public.google_sync_jobs expired
  set status = 'failed',
      worker_id = null,
      completed_at = now(),
      last_error = 'Expired lease superseded by newer queued job.',
      updated_at = now()
  where expired.status = 'running'
    and expired.last_attempt_at < now() - interval '10 minutes'
    and exists (
      select 1
      from public.google_sync_jobs other
      where other.event_id = expired.event_id
        and other.id <> expired.id
        and other.status in ('pending', 'retrying')
    );

  -- 5b. For expired running jobs with no other queued job, safely recover to 'retrying'
  update public.google_sync_jobs
  set status = 'retrying',
      worker_id = null,
      next_retry_at = now(),
      last_error = 'Recovered after worker lease expired.',
      updated_at = now()
  where status = 'running'
    and last_attempt_at < now() - interval '10 minutes';

  -- 5c. Claim ready jobs
  return query
  with ready as (
    select job.id
    from public.google_sync_jobs job
    where job.status in ('pending', 'retrying')
      and job.next_retry_at <= now()
    order by job.created_at
    for update skip locked
    limit p_limit
  )
  update public.google_sync_jobs job
  set status = 'running',
      attempts = job.attempts + 1,
      last_attempt_at = now(),
      worker_id = p_worker_id,
      last_error = null,
      updated_at = now()
  from ready
  where job.id = ready.id
  returning job.*;
end;
$$;

-- 6. Harden finish_google_sync_job to prevent unique constraint violation on retry
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
