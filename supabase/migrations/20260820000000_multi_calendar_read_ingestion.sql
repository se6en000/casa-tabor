alter table public.calendar_connections
  add column if not exists read_calendar_ids text[] not null default '{}'::text[],
  add column if not exists read_calendar_metadata jsonb not null default '[]'::jsonb;

drop view if exists public.google_connection_status;

create view public.google_connection_status as
select
  tokens.family_member_id,
  tokens.google_email,
  tokens.connected_at,
  connection.last_incremental_sync_at as last_sync_at,
  connection.last_sync_error,
  tokens.gmail_scan_enabled,
  connection.id as connection_id,
  connection.calendar_id,
  connection.access_mode,
  connection.adoption_policy,
  connection.is_enabled,
  connection.health_status,
  connection.health_checked_at,
  connection.last_success_at,
  connection.last_error_at,
  connection.last_error_code,
  connection.health_status = 'reauthorization_required' as reauthorization_required,
  tokens.gmail_last_scan_attempt_at,
  tokens.gmail_last_scan_success_at,
  tokens.gmail_last_scan_error,
  coalesce(connection.read_calendar_ids, '{}'::text[]) as read_calendar_ids,
  coalesce(connection.read_calendar_metadata, '[]'::jsonb) as read_calendar_metadata
from public.google_tokens tokens
left join public.calendar_connections connection
  on connection.family_member_id = tokens.family_member_id
 and connection.is_enabled;

grant select on public.google_connection_status to anon, authenticated;
