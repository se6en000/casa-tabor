alter table public.calendar_connections
  add column if not exists health_status text not null default 'connected',
  add column if not exists health_checked_at timestamptz,
  add column if not exists last_success_at timestamptz,
  add column if not exists last_error_at timestamptz,
  add column if not exists last_error_code text;

alter table public.calendar_connections
  drop constraint if exists calendar_connections_health_status_check,
  add constraint calendar_connections_health_status_check
    check (health_status in (
      'connected',
      'healthy',
      'degraded',
      'reauthorization_required',
      'disabled'
    )),
  drop constraint if exists calendar_connections_role_policy_check,
  add constraint calendar_connections_role_policy_check
    check (
      (access_mode = 'writable' and adoption_policy = 'automatic')
      or
      (access_mode = 'read_only' and adoption_policy in ('explicit', 'none'))
    );

create unique index if not exists calendar_connections_one_enabled_member
  on public.calendar_connections (family_member_id)
  where is_enabled;

create unique index if not exists calendar_connections_one_writable
  on public.calendar_connections ((access_mode))
  where is_enabled and access_mode = 'writable';

create unique index if not exists calendar_connections_one_automatic
  on public.calendar_connections ((adoption_policy))
  where is_enabled and adoption_policy = 'automatic';

insert into public.calendar_connections (
  family_member_id,
  google_email,
  calendar_id,
  access_mode,
  adoption_policy,
  is_enabled,
  sync_token,
  last_incremental_sync_at,
  last_sync_error,
  health_status,
  health_checked_at,
  last_success_at,
  last_error_at,
  last_error_code,
  created_at,
  updated_at
)
select
  tokens.family_member_id,
  lower(tokens.google_email),
  lower(tokens.google_email),
  case
    when lower(tokens.google_email) = 'jacobrtabor@gmail.com' then 'writable'
    else 'read_only'
  end,
  case
    when lower(tokens.google_email) = 'jacobrtabor@gmail.com' then 'automatic'
    else 'explicit'
  end,
  true,
  tokens.sync_token,
  tokens.last_sync_at,
  tokens.last_sync_error,
  case
    when tokens.last_sync_error is not null then 'degraded'
    when tokens.last_sync_at is not null then 'healthy'
    else 'connected'
  end,
  coalesce(tokens.last_sync_at, tokens.updated_at),
  tokens.last_sync_at,
  case when tokens.last_sync_error is not null then tokens.updated_at end,
  case when tokens.last_sync_error is not null then 'legacy_sync_error' end,
  tokens.connected_at,
  tokens.updated_at
from public.google_tokens tokens
on conflict (google_email, calendar_id) do update
set family_member_id = excluded.family_member_id,
    access_mode = excluded.access_mode,
    adoption_policy = excluded.adoption_policy,
    is_enabled = true,
    sync_token = excluded.sync_token,
    last_incremental_sync_at = excluded.last_incremental_sync_at,
    last_sync_error = excluded.last_sync_error,
    health_status = excluded.health_status,
    health_checked_at = excluded.health_checked_at,
    last_success_at = excluded.last_success_at,
    last_error_at = excluded.last_error_at,
    last_error_code = excluded.last_error_code,
    updated_at = excluded.updated_at;

alter table public.events
  add column if not exists google_connection_id uuid
    references public.calendar_connections(id) on delete set null;

update public.events event
set google_connection_id = connection.id,
    google_calendar_id = case
      when event.google_calendar_id is null or event.google_calendar_id = 'primary'
        then connection.calendar_id
      else event.google_calendar_id
    end
from public.calendar_connections connection
where event.google_connection_id is null
  and event.source_member_id = connection.family_member_id
  and event.google_event_id is not null;

create index if not exists events_google_connection_id_idx
  on public.events (google_connection_id)
  where google_connection_id is not null;

update public.event_series series
set source_connection_id = event.google_connection_id,
    google_calendar_id = case
      when series.google_calendar_id is null or series.google_calendar_id = 'primary'
        then connection.calendar_id
      else series.google_calendar_id
    end
from public.events event
join public.calendar_connections connection
  on connection.id = event.google_connection_id
where event.id = series.template_event_id
  and series.source_connection_id is null;

update public.event_series series
set source_connection_id = source.connection_id,
    google_calendar_id = case
      when series.google_calendar_id is null or series.google_calendar_id = 'primary'
        then connection.calendar_id
      else series.google_calendar_id
    end
from (
  select
    event.series_id,
    min(event.google_connection_id::text)::uuid as connection_id
  from public.events event
  where event.series_id is not null
    and event.google_connection_id is not null
  group by event.series_id
  having count(distinct event.google_connection_id) = 1
) source
join public.calendar_connections connection
  on connection.id = source.connection_id
where series.id = source.series_id
  and series.source_connection_id is null;

create or replace view public.google_connection_status as
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
  connection.health_status = 'reauthorization_required' as reauthorization_required
from public.google_tokens tokens
left join public.calendar_connections connection
  on connection.family_member_id = tokens.family_member_id
 and connection.is_enabled;

grant select on public.google_connection_status to anon, authenticated;

comment on column public.events.google_connection_id is
  'Durable Google account/calendar identity. Never infer this from calendar_id aliases.';
comment on column public.calendar_connections.health_status is
  'Operational connection state; reauthorization_required is explicit and user-actionable.';
