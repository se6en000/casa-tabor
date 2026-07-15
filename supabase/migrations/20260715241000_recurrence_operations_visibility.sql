create or replace view public.recurrence_sync_operation_status
with (security_barrier = true)
as
select
  operation.id,
  operation.action_id,
  operation.operation_key,
  operation.series_id,
  operation.event_id,
  operation.operation_type,
  operation.casa_revision,
  operation.status,
  operation.attempts,
  operation.max_attempts,
  operation.next_retry_at,
  operation.last_attempt_at,
  operation.last_error,
  operation.correlation_id,
  operation.conflict_detected,
  operation.completed_at,
  operation.created_at,
  series.status as series_status,
  series.ownership,
  template.title as event_title,
  connection.google_email,
  connection.health_status as connection_health
from public.calendar_sync_operations operation
left join public.event_series series on series.id = operation.series_id
left join public.events template on template.id = series.template_event_id
left join public.calendar_connections connection on connection.id = operation.connection_id;

create or replace view public.recurrence_operations_summary
with (security_barrier = true)
as
select
  (select count(*) from public.calendar_sync_operations where status in ('pending', 'retrying', 'running'))::integer as active_syncs,
  (select count(*) from public.calendar_sync_operations where status = 'failed')::integer as failed_syncs,
  (select count(*) from public.calendar_sync_operations where conflict_detected)::integer as casa_wins_conflicts,
  (select count(*) from public.events where deleted_at is not null)::integer as tombstones,
  (select count(*) from public.google_recurrence_resources where adoption_status like 'pending%')::integer as pending_imports,
  (select count(*) from public.event_series where template_event_id is null or jsonb_typeof(recurrence_lines) <> 'array')::integer as migration_anomalies,
  coalesce((select value from public.settings where key = 'recurrence_v2_flags'), '{}'::jsonb) as rollout_flags;

grant select on public.recurrence_sync_operation_status to anon, authenticated;
grant select on public.recurrence_operations_summary to anon, authenticated;

create or replace function public.recurrence_request_google_sync_retry(
  p_operation_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.calendar_sync_operations
  set status = 'retrying',
      next_retry_at = now(),
      completed_at = null,
      worker_id = null
  where id = p_operation_id
    and status = 'failed';
  if not found then raise exception 'Only failed sync operations can be retried'; end if;
end;
$$;

revoke all on function public.recurrence_request_google_sync_retry(uuid) from public;
grant execute on function public.recurrence_request_google_sync_retry(uuid) to anon, authenticated;
