alter table public.calendar_sync_operations
  add column if not exists worker_id text,
  add column if not exists conflict_detected boolean not null default false;

drop policy if exists "allow all" on public.calendar_sync_operations;
revoke all on table public.calendar_sync_operations from anon, authenticated;

create or replace function public.recurrence_claim_google_sync_operations(
  p_worker_id text,
  p_limit integer default 10
)
returns setof public.calendar_sync_operations
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

  update public.calendar_sync_operations
  set status = 'retrying',
      worker_id = null,
      next_retry_at = now(),
      last_error = 'Recovered after worker lease expired.'
  where status = 'running'
    and last_attempt_at < now() - interval '10 minutes';

  return query
  with ready as (
    select operation.id
    from public.calendar_sync_operations operation
    left join public.calendar_sync_operations dependency
      on dependency.id = operation.depends_on_operation_id
    where operation.status in ('pending', 'retrying')
      and operation.next_retry_at <= now()
      and (dependency.id is null or dependency.status = 'succeeded')
    order by operation.created_at
    for update of operation skip locked
    limit p_limit
  )
  update public.calendar_sync_operations operation
  set status = 'running',
      attempts = operation.attempts + 1,
      last_attempt_at = now(),
      worker_id = p_worker_id,
      last_error = null
  from ready
  where operation.id = ready.id
  returning operation.*;
end;
$$;

create or replace function public.recurrence_finish_google_sync_operation(
  p_operation_id uuid,
  p_worker_id text,
  p_success boolean,
  p_retryable boolean default false,
  p_google_response jsonb default null,
  p_error text default null,
  p_conflict_detected boolean default false
)
returns public.calendar_sync_operations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_operation public.calendar_sync_operations%rowtype;
begin
  select * into v_operation
  from public.calendar_sync_operations
  where id = p_operation_id
  for update;
  if not found then raise exception 'Sync operation not found'; end if;
  if v_operation.status <> 'running' or v_operation.worker_id is distinct from p_worker_id then
    raise exception 'Sync operation lease is no longer owned by this worker';
  end if;

  update public.calendar_sync_operations
  set status = case
        when p_success then 'succeeded'
        when p_retryable and attempts < max_attempts then 'retrying'
        else 'failed'
      end,
      next_retry_at = case
        when not p_success and p_retryable and attempts < max_attempts
          then now() + make_interval(secs => least(3600, 15 * power(2, greatest(0, attempts - 1)))::integer)
        else next_retry_at
      end,
      completed_at = case
        when p_success or not p_retryable or attempts >= max_attempts then now()
        else null
      end,
      google_response = p_google_response,
      last_error = case when p_success then null else nullif(p_error, '') end,
      conflict_detected = p_conflict_detected,
      worker_id = null
  where id = p_operation_id
  returning * into v_operation;
  return v_operation;
end;
$$;

create or replace function public.recurrence_retry_google_sync_operation(
  p_operation_id uuid
)
returns public.calendar_sync_operations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_operation public.calendar_sync_operations%rowtype;
begin
  update public.calendar_sync_operations
  set status = 'retrying',
      next_retry_at = now(),
      completed_at = null,
      worker_id = null
  where id = p_operation_id
    and status = 'failed'
  returning * into v_operation;
  if not found then raise exception 'Only failed sync operations can be retried'; end if;
  return v_operation;
end;
$$;

revoke all on function public.recurrence_claim_google_sync_operations(text, integer)
  from public, anon, authenticated;
revoke all on function public.recurrence_finish_google_sync_operation(uuid, text, boolean, boolean, jsonb, text, boolean)
  from public, anon, authenticated;
revoke all on function public.recurrence_retry_google_sync_operation(uuid)
  from public, anon, authenticated;
grant execute on function public.recurrence_claim_google_sync_operations(text, integer) to service_role;
grant execute on function public.recurrence_finish_google_sync_operation(uuid, text, boolean, boolean, jsonb, text, boolean) to service_role;
grant execute on function public.recurrence_retry_google_sync_operation(uuid) to service_role;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'google-recurrence-outbox') then
    perform cron.unschedule('google-recurrence-outbox');
  end if;
end;
$$;

select cron.schedule(
  'google-recurrence-outbox',
  '* * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'SUPABASE_URL' limit 1)
      || '/functions/v1/process-google-recurrence-outbox',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'SUPABASE_SERVICE_ROLE_KEY'
        limit 1
      )
    ),
    body := '{"limit":10}'::jsonb
  );
  $$
);
