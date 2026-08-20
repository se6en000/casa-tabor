-- ============================================================================
-- Fix google_sync_jobs claim collision on expired leases
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

-- 2. Recover any other running jobs older than 10 mins
update public.google_sync_jobs
set status = 'retrying',
    worker_id = null,
    next_retry_at = now(),
    last_error = 'Recovered after worker lease expired.',
    updated_at = now()
where status = 'running'
  and last_attempt_at < now() - interval '10 minutes';

-- 3. Clean up any duplicate pending/retrying jobs per event
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

-- 4. Ensure unique partial index exists
create unique index if not exists google_sync_jobs_one_queued_per_event
  on public.google_sync_jobs (event_id)
  where status in ('pending', 'retrying');

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
