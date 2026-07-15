alter table public.calendar_connections
  add column if not exists recurrence_sync_token text,
  add column if not exists last_recurrence_sync_at timestamptz,
  add column if not exists last_recurrence_full_sync_at timestamptz,
  add column if not exists last_recurrence_sync_error text;

create table if not exists public.google_recurrence_import_runs (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.calendar_connections(id) on delete cascade,
  correlation_id text not null,
  mode text not null check (mode in ('initial', 'incremental', 'reconciliation')),
  status text not null default 'running' check (status in ('running', 'succeeded', 'failed')),
  staged_resource_count integer not null default 0,
  adopted_master_count integer not null default 0,
  linked_occurrence_count integer not null default 0,
  error_message text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (connection_id, correlation_id)
);

create table if not exists public.google_recurrence_resources (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.calendar_connections(id) on delete cascade,
  google_event_id text not null,
  resource_type text not null check (resource_type in ('master', 'exception')),
  google_recurring_event_id text,
  google_ical_uid text,
  google_etag text,
  google_updated_at timestamptz,
  google_status text not null default 'confirmed',
  recurrence_lines jsonb not null default '[]'::jsonb
    check (jsonb_typeof(recurrence_lines) = 'array'),
  original_start_time timestamptz,
  original_start_date date,
  payload jsonb not null,
  adoption_status text not null default 'not_applicable'
    check (adoption_status in ('not_applicable', 'pending_automatic', 'pending_explicit', 'adopted', 'ignored')),
  adopted_series_id uuid references public.event_series(id) on delete set null,
  last_seen_run_id uuid references public.google_recurrence_import_runs(id) on delete set null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  retired_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (connection_id, google_event_id),
  check (
    (resource_type = 'master' and google_recurring_event_id is null)
    or
    (resource_type = 'exception' and google_recurring_event_id is not null)
  ),
  check (
    original_start_time is null
    or original_start_date is null
  )
);

create unique index if not exists event_series_google_source_unique
  on public.event_series (source_connection_id, google_recurring_event_id)
  where source_connection_id is not null and google_recurring_event_id is not null;

create index if not exists google_recurrence_resources_master_idx
  on public.google_recurrence_resources (connection_id, google_recurring_event_id)
  where resource_type = 'exception';

create index if not exists google_recurrence_resources_pending_idx
  on public.google_recurrence_resources (connection_id, adoption_status, last_seen_at desc)
  where resource_type = 'master' and retired_at is null;

drop trigger if exists google_recurrence_resources_updated_at on public.google_recurrence_resources;
create trigger google_recurrence_resources_updated_at
  before update on public.google_recurrence_resources
  for each row execute function public.set_updated_at();

alter table public.google_recurrence_import_runs enable row level security;
alter table public.google_recurrence_resources enable row level security;
revoke all on public.google_recurrence_import_runs from public, anon, authenticated;
revoke all on public.google_recurrence_resources from public, anon, authenticated;

create or replace function public.recurrence_adopt_google_master_core(
  p_resource_id uuid,
  p_explicit boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_resource public.google_recurrence_resources%rowtype;
  v_connection public.calendar_connections%rowtype;
  v_existing public.event_series%rowtype;
  v_template_id uuid;
  v_series_id uuid;
  v_start timestamptz;
  v_end timestamptz;
  v_all_day boolean;
  v_timezone text;
  v_title text;
begin
  select * into v_resource
  from public.google_recurrence_resources
  where id = p_resource_id
  for update;
  if not found or v_resource.resource_type <> 'master' then
    raise exception 'Google recurring master resource not found';
  end if;
  if v_resource.retired_at is not null or v_resource.google_status = 'cancelled' then
    raise exception 'Cancelled or retired Google recurring masters cannot be adopted';
  end if;

  select * into v_connection
  from public.calendar_connections
  where id = v_resource.connection_id
    and is_enabled
  for update;
  if not found then raise exception 'Enabled Google connection not found'; end if;
  if v_connection.adoption_policy <> 'automatic' and not p_explicit then
    raise exception 'Explicit adoption is required for this Google connection';
  end if;

  select * into v_existing
  from public.event_series
  where source_connection_id = v_connection.id
    and google_recurring_event_id = v_resource.google_event_id
  for update;
  if found then
    update public.event_series
    set google_ical_uid = v_resource.google_ical_uid,
        google_etag = v_resource.google_etag,
        google_updated_at = v_resource.google_updated_at,
        updated_at = now()
    where id = v_existing.id;
    update public.google_recurrence_resources
    set adoption_status = 'adopted',
        adopted_series_id = v_existing.id
    where id = v_resource.id;
    return jsonb_build_object('series_id', v_existing.id, 'created', false);
  end if;

  v_all_day := (v_resource.payload->'start'->>'date') is not null;
  v_timezone := coalesce(
    nullif(v_resource.payload->'start'->>'timeZone', ''),
    nullif(v_resource.payload->'end'->>'timeZone', ''),
    'America/New_York'
  );
  v_start := case
    when v_all_day then ((v_resource.payload->'start'->>'date')::date::timestamp at time zone v_timezone)
    else (v_resource.payload->'start'->>'dateTime')::timestamptz
  end;
  v_end := case
    when v_all_day then ((v_resource.payload->'end'->>'date')::date::timestamp at time zone v_timezone)
    else (v_resource.payload->'end'->>'dateTime')::timestamptz
  end;
  if v_start is null or v_end is null or v_end <= v_start then
    raise exception 'Google recurring master has invalid start/end data';
  end if;
  v_title := coalesce(nullif(btrim(v_resource.payload->>'summary'), ''), '(untitled)');

  insert into public.events (
    title, description, start_time, end_time, all_day,
    location_name, address, status, is_enriched, event_type,
    record_kind, google_event_id, google_calendar_id,
    google_connection_id, source_member_id,
    google_ical_uid, google_etag, google_updated_at
  ) values (
    v_title,
    nullif(v_resource.payload->>'description', ''),
    v_start,
    v_end,
    v_all_day,
    nullif(v_resource.payload->>'location', ''),
    nullif(v_resource.payload->>'location', ''),
    'cancelled',
    false,
    'event',
    'series_template',
    null,
    v_connection.calendar_id,
    v_connection.id,
    v_connection.family_member_id,
    v_resource.google_ical_uid,
    v_resource.google_etag,
    v_resource.google_updated_at
  )
  returning id into v_template_id;

  insert into public.event_series (
    template_event_id, timezone, recurrence_lines, ownership,
    source_connection_id, google_calendar_id, google_recurring_event_id,
    google_ical_uid, google_etag, google_updated_at
  ) values (
    v_template_id,
    v_timezone,
    v_resource.recurrence_lines,
    case when v_connection.access_mode = 'writable' then 'google_adopted' else 'read_only_import' end,
    v_connection.id,
    v_connection.calendar_id,
    v_resource.google_event_id,
    v_resource.google_ical_uid,
    v_resource.google_etag,
    v_resource.google_updated_at
  )
  returning id into v_series_id;

  update public.google_recurrence_resources
  set adoption_status = 'adopted',
      adopted_series_id = v_series_id
  where id = v_resource.id;
  return jsonb_build_object('series_id', v_series_id, 'template_event_id', v_template_id, 'created', true);
end;
$$;

create or replace function public.recurrence_adopt_google_masters_core(
  p_resource_ids uuid[],
  p_explicit boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_resource_id uuid;
  v_result jsonb;
  v_created integer := 0;
  v_existing integer := 0;
begin
  if coalesce(cardinality(p_resource_ids), 0) > 2500 then
    raise exception 'Google recurring master adoption batch exceeds 2500 resources';
  end if;
  foreach v_resource_id in array coalesce(p_resource_ids, array[]::uuid[])
  loop
    v_result := public.recurrence_adopt_google_master_core(v_resource_id, p_explicit);
    if coalesce((v_result->>'created')::boolean, false) then
      v_created := v_created + 1;
    else
      v_existing := v_existing + 1;
    end if;
  end loop;
  return jsonb_build_object(
    'processed', coalesce(cardinality(p_resource_ids), 0),
    'created', v_created,
    'existing', v_existing
  );
end;
$$;

create or replace function public.recurrence_stage_google_resources_core(
  p_run_id uuid,
  p_resources jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run public.google_recurrence_import_runs%rowtype;
  v_resource jsonb;
  v_row public.google_recurrence_resources%rowtype;
  v_master_ids uuid[] := array[]::uuid[];
  v_count integer := 0;
begin
  if jsonb_typeof(p_resources) <> 'array' then
    raise exception 'Google recurrence resources must be an array';
  end if;
  if jsonb_array_length(p_resources) > 2500 then
    raise exception 'Google recurrence resource page exceeds 2500 items';
  end if;
  select * into v_run
  from public.google_recurrence_import_runs
  where id = p_run_id
    and status = 'running'
  for update;
  if not found then raise exception 'Running Google recurrence import not found'; end if;

  for v_resource in select value from jsonb_array_elements(p_resources)
  loop
    if nullif(v_resource->>'google_event_id', '') is null then
      raise exception 'Google recurrence resource ID is required';
    end if;
    insert into public.google_recurrence_resources (
      connection_id, google_event_id, resource_type, google_recurring_event_id,
      google_ical_uid, google_etag, google_updated_at, google_status,
      recurrence_lines, original_start_time, original_start_date, payload,
      adoption_status, last_seen_run_id, last_seen_at, retired_at
    ) values (
      v_run.connection_id,
      v_resource->>'google_event_id',
      v_resource->>'resource_type',
      nullif(v_resource->>'google_recurring_event_id', ''),
      nullif(v_resource->>'google_ical_uid', ''),
      nullif(v_resource->>'google_etag', ''),
      nullif(v_resource->>'google_updated_at', '')::timestamptz,
      coalesce(nullif(v_resource->>'google_status', ''), 'confirmed'),
      coalesce(v_resource->'recurrence_lines', '[]'::jsonb),
      nullif(v_resource->>'original_start_time', '')::timestamptz,
      nullif(v_resource->>'original_start_date', '')::date,
      v_resource->'payload',
      v_resource->>'adoption_status',
      p_run_id,
      now(),
      null
    )
    on conflict (connection_id, google_event_id) do update
    set resource_type = excluded.resource_type,
        google_recurring_event_id = excluded.google_recurring_event_id,
        google_ical_uid = excluded.google_ical_uid,
        google_etag = excluded.google_etag,
        google_updated_at = excluded.google_updated_at,
        google_status = excluded.google_status,
        recurrence_lines = excluded.recurrence_lines,
        original_start_time = excluded.original_start_time,
        original_start_date = excluded.original_start_date,
        payload = excluded.payload,
        adoption_status = case
          when google_recurrence_resources.adoption_status in ('adopted', 'ignored')
            then google_recurrence_resources.adoption_status
          else excluded.adoption_status
        end,
        last_seen_run_id = excluded.last_seen_run_id,
        last_seen_at = excluded.last_seen_at,
        retired_at = null
    returning * into v_row;
    v_count := v_count + 1;
    if v_row.resource_type = 'master' and v_row.adoption_status <> 'ignored' then
      v_master_ids := array_append(v_master_ids, v_row.id);
    end if;
  end loop;

  update public.google_recurrence_import_runs
  set staged_resource_count = staged_resource_count + v_count
  where id = p_run_id;
  return jsonb_build_object('staged', v_count, 'master_resource_ids', to_jsonb(v_master_ids));
end;
$$;

create or replace function public.recurrence_finalize_google_import_core(
  p_run_id uuid,
  p_next_sync_token text,
  p_full_reconciliation boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run public.google_recurrence_import_runs%rowtype;
  v_retired integer := 0;
  v_now timestamptz := now();
begin
  select * into v_run
  from public.google_recurrence_import_runs
  where id = p_run_id
  for update;
  if not found or v_run.status <> 'running' then
    raise exception 'Running Google recurrence import not found';
  end if;
  if nullif(btrim(p_next_sync_token), '') is null then
    raise exception 'Google recurrence import did not return a sync token';
  end if;

  if p_full_reconciliation then
    update public.google_recurrence_resources
    set retired_at = v_now
    where connection_id = v_run.connection_id
      and retired_at is null
      and last_seen_run_id is distinct from p_run_id;
    get diagnostics v_retired = row_count;
  end if;

  update public.calendar_connections
  set recurrence_sync_token = p_next_sync_token,
      last_recurrence_sync_at = v_now,
      last_recurrence_full_sync_at = case
        when p_full_reconciliation then v_now
        else last_recurrence_full_sync_at
      end,
      last_recurrence_sync_error = null
  where id = v_run.connection_id;

  update public.google_recurrence_import_runs
  set status = 'succeeded',
      completed_at = v_now
  where id = p_run_id;

  return jsonb_build_object('run_id', p_run_id, 'retired', v_retired);
end;
$$;

create or replace function public.recurrence_link_google_occurrences_core(
  p_connection_id uuid,
  p_instances jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_connection public.calendar_connections%rowtype;
  v_instance jsonb;
  v_series_id uuid;
  v_is_exception boolean;
  v_linked integer := 0;
  v_unmatched integer := 0;
begin
  if jsonb_typeof(p_instances) <> 'array' then
    raise exception 'Google recurrence instances must be an array';
  end if;
  if jsonb_array_length(p_instances) > 5000 then
    raise exception 'Google recurrence instance batch exceeds 5000 items';
  end if;
  select * into v_connection
  from public.calendar_connections
  where id = p_connection_id and is_enabled = true;
  if not found then raise exception 'Enabled Google connection not found'; end if;

  for v_instance in select value from jsonb_array_elements(p_instances)
  loop
    select id into v_series_id
    from public.event_series
    where source_connection_id = p_connection_id
      and google_recurring_event_id = v_instance->>'google_recurring_event_id';
    if v_series_id is null then continue; end if;
    select exists (
      select 1
      from public.google_recurrence_resources
      where connection_id = p_connection_id
        and google_event_id = v_instance->>'google_event_id'
        and resource_type = 'exception'
        and retired_at is null
    ) into v_is_exception;

    update public.events
    set google_connection_id = coalesce(google_connection_id, p_connection_id),
        series_id = coalesce(series_id, v_series_id),
        record_kind = case
          when record_kind = 'single' then 'occurrence'
          else record_kind
        end,
        original_start_time = coalesce(
          original_start_time,
          nullif(v_instance->>'original_start_time', '')::timestamptz
        ),
        original_start_date = coalesce(
          original_start_date,
          nullif(v_instance->>'original_start_date', '')::date
        ),
        occurrence_key = coalesce(
          occurrence_key,
          nullif(v_instance->>'occurrence_key', '')
        ),
        is_exception = is_exception or v_is_exception,
        google_ical_uid = coalesce(nullif(v_instance->>'google_ical_uid', ''), google_ical_uid),
        google_etag = coalesce(nullif(v_instance->>'google_etag', ''), google_etag),
        google_updated_at = coalesce(
          nullif(v_instance->>'google_updated_at', '')::timestamptz,
          google_updated_at
        )
    where google_event_id = v_instance->>'google_event_id'
      and (
        google_connection_id = p_connection_id
        or (
          google_connection_id is null
          and source_member_id = v_connection.family_member_id
        )
      );
    if found then v_linked := v_linked + 1;
    else v_unmatched := v_unmatched + 1;
    end if;
    v_series_id := null;
  end loop;
  return jsonb_build_object('linked', v_linked, 'unmatched', v_unmatched);
end;
$$;

revoke all on function public.recurrence_adopt_google_master_core(uuid, boolean)
  from public, anon, authenticated;
revoke all on function public.recurrence_adopt_google_masters_core(uuid[], boolean)
  from public, anon, authenticated;
revoke all on function public.recurrence_stage_google_resources_core(uuid, jsonb)
  from public, anon, authenticated;
revoke all on function public.recurrence_finalize_google_import_core(uuid, text, boolean)
  from public, anon, authenticated;
revoke all on function public.recurrence_link_google_occurrences_core(uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.recurrence_adopt_google_master_core(uuid, boolean) to service_role;
grant execute on function public.recurrence_adopt_google_masters_core(uuid[], boolean) to service_role;
grant execute on function public.recurrence_stage_google_resources_core(uuid, jsonb) to service_role;
grant execute on function public.recurrence_finalize_google_import_core(uuid, text, boolean) to service_role;
grant execute on function public.recurrence_link_google_occurrences_core(uuid, jsonb) to service_role;

comment on column public.calendar_connections.recurrence_sync_token is
  'Dedicated singleEvents=false cursor. Never share with flattened occurrence sync.';

do $$
declare
  v_job_id bigint;
begin
  select jobid into v_job_id
  from cron.job
  where jobname = 'import-google-recurrence-v2'
  limit 1;
  if v_job_id is not null then perform cron.unschedule(v_job_id); end if;
end;
$$;

select cron.schedule(
  'import-google-recurrence-v2',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://sjiejymuuuqzqukyeagk.supabase.co/functions/v1/import-google-recurrence',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'SUPABASE_SERVICE_ROLE_KEY'
        limit 1
      )
    ),
    body := '{}'::jsonb
  );
  $$
);
