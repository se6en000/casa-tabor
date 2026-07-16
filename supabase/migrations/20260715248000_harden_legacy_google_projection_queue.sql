alter table public.google_sync_jobs
  add column if not exists worker_id text;

with ranked as (
  select
    id,
    row_number() over (partition by event_id order by created_at, id) as queue_position
  from public.google_sync_jobs
  where status in ('pending', 'retrying')
)
delete from public.google_sync_jobs job
using ranked
where job.id = ranked.id
  and ranked.queue_position > 1;

create unique index if not exists google_sync_jobs_one_queued_per_event
  on public.google_sync_jobs (event_id)
  where status in ('pending', 'retrying');

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

  update public.google_sync_jobs
  set status = 'retrying',
      worker_id = null,
      next_retry_at = now(),
      last_error = 'Recovered after worker lease expired.',
      updated_at = now()
  where status = 'running'
    and last_attempt_at < now() - interval '10 minutes';

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

  update public.google_sync_jobs
  set status = case
        when p_success then 'succeeded'
        when v_exhausted then 'failed'
        else 'retrying'
      end,
      last_error = case when p_success then null else nullif(p_error, '') end,
      next_retry_at = case
        when not p_success and not v_exhausted then now() + make_interval(mins => v_delay_minutes)
        else next_retry_at
      end,
      completed_at = case when p_success or v_exhausted then now() else null end,
      worker_id = null,
      updated_at = now()
  where id = p_job_id
  returning * into v_job;

  return v_job;
end;
$$;

revoke all on function public.claim_google_sync_jobs(text, integer) from public, anon, authenticated;
revoke all on function public.finish_google_sync_job(uuid, text, boolean, text) from public, anon, authenticated;
grant execute on function public.claim_google_sync_jobs(text, integer) to service_role;
grant execute on function public.finish_google_sync_job(uuid, text, boolean, text) to service_role;
