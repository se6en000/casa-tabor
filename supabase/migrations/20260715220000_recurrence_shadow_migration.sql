create table if not exists public.recurrence_shadow_migrations (
  id uuid primary key default gen_random_uuid(),
  action_id text not null unique,
  plan_hash text not null,
  plan jsonb not null,
  manifest jsonb not null,
  actor jsonb not null default '{}'::jsonb,
  status text not null default 'applied' check (status in ('applied', 'rolled_back')),
  applied_at timestamptz not null default now(),
  rolled_back_at timestamptz
);

alter table public.recurrence_shadow_migrations enable row level security;

create or replace function public.enforce_event_end_30m_from_start()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.start_time is null or new.record_kind in ('series_template', 'occurrence') then
    return new;
  end if;
  if tg_op = 'INSERT' or new.start_time is distinct from old.start_time then
    new.end_time := new.start_time + interval '30 minutes';
  end if;
  return new;
end;
$$;

create or replace function public.trigger_enrich_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.record_kind = 'series_template' then return new; end if;
  perform net.http_post(
    url := 'https://sjiejymuuuqzqukyeagk.supabase.co/functions/v1/enrich-event',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'SUPABASE_SERVICE_ROLE_KEY'
        limit 1
      )
    ),
    body := jsonb_build_object('event_id', new.id)
  );
  return new;
exception when others then
  return new;
end;
$$;

create or replace function public.notify_event_added()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.record_kind = 'series_template' then return new; end if;
  insert into public.notifications (type, title, body, event_id, source)
  values ('event_added', 'New event added', new.title, new.id, 'manual');
  return new;
end;
$$;

create or replace function public.notify_event_updated()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.record_kind = 'series_template' then return new; end if;
  if new.title <> old.title
     or new.start_time <> old.start_time
     or new.end_time <> old.end_time
     or new.location_name is distinct from old.location_name then
    insert into public.notifications (type, title, body, event_id, source)
    values ('event_updated', 'Event updated', new.title, new.id, 'manual');
  end if;
  return new;
end;
$$;

create or replace function public.notify_event_enriched()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  ev_title text;
  ev_kind text;
begin
  select title, record_kind into ev_title, ev_kind
  from public.events
  where id = new.event_id;
  if ev_kind = 'series_template' then return new; end if;
  insert into public.notifications (type, title, body, event_id, source)
  values ('event_enriched', 'AI enriched event', ev_title, new.event_id, 'system');
  return new;
end;
$$;

create or replace function public.trigger_geocode_event_location()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  service_role_key text;
begin
  if new.record_kind = 'series_template' then return new; end if;
  if coalesce(trim(new.location_name), '') = '' and coalesce(trim(new.address), '') = '' then
    return new;
  end if;
  if tg_op = 'UPDATE'
     and coalesce(trim(new.location_name), '') = coalesce(trim(old.location_name), '')
     and coalesce(trim(new.address), '') = coalesce(trim(old.address), '') then
    return new;
  end if;
  select decrypted_secret into service_role_key
  from vault.decrypted_secrets
  where name = 'SUPABASE_SERVICE_ROLE_KEY'
  limit 1;
  if service_role_key is null then
    raise warning 'trigger_geocode_event_location: missing SUPABASE_SERVICE_ROLE_KEY secret';
    return new;
  end if;
  perform net.http_post(
    url := 'https://sjiejymuuuqzqukyeagk.supabase.co/functions/v1/geocode-event-location',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || service_role_key
    ),
    body := jsonb_build_object('event_id', new.id)
  );
  return new;
exception when others then
  raise warning 'trigger_geocode_event_location failed for event %: %', new.id, sqlerrm;
  return new;
end;
$$;

create or replace function public.trigger_analyze_conflicts_for_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  service_role_key text;
  pivot_start timestamptz;
begin
  if coalesce(new.record_kind, old.record_kind) = 'series_template' then
    return coalesce(new, old);
  end if;
  pivot_start := date_trunc('day', coalesce(new.start_time, old.start_time, now()));
  select decrypted_secret into service_role_key
  from vault.decrypted_secrets
  where name = 'SUPABASE_SERVICE_ROLE_KEY'
  limit 1;
  if service_role_key is null then
    raise warning 'trigger_analyze_conflicts_for_event: missing SUPABASE_SERVICE_ROLE_KEY secret';
    return coalesce(new, old);
  end if;
  perform net.http_post(
    url := 'https://sjiejymuuuqzqukyeagk.supabase.co/functions/v1/analyze-conflicts',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || service_role_key
    ),
    body := jsonb_build_object(
      'range_start', pivot_start,
      'range_end', pivot_start + interval '14 days'
    )
  );
  return coalesce(new, old);
exception when others then
  raise warning 'trigger_analyze_conflicts_for_event failed: %', sqlerrm;
  return coalesce(new, old);
end;
$$;

create or replace function public.trigger_analyze_conflicts_for_event_member()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  service_role_key text;
  event_start timestamptz;
  event_kind text;
  event_id_value uuid;
begin
  event_id_value := coalesce(new.event_id, old.event_id);
  select start_time, record_kind into event_start, event_kind
  from public.events
  where id = event_id_value;
  if event_kind = 'series_template' then return coalesce(new, old); end if;
  if event_start is null then event_start := now(); end if;
  select decrypted_secret into service_role_key
  from vault.decrypted_secrets
  where name = 'SUPABASE_SERVICE_ROLE_KEY'
  limit 1;
  if service_role_key is null then
    raise warning 'trigger_analyze_conflicts_for_event_member: missing SUPABASE_SERVICE_ROLE_KEY secret';
    return coalesce(new, old);
  end if;
  perform net.http_post(
    url := 'https://sjiejymuuuqzqukyeagk.supabase.co/functions/v1/analyze-conflicts',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || service_role_key
    ),
    body := jsonb_build_object(
      'range_start', date_trunc('day', event_start),
      'range_end', date_trunc('day', event_start) + interval '14 days'
    )
  );
  return coalesce(new, old);
exception when others then
  raise warning 'trigger_analyze_conflicts_for_event_member failed: %', sqlerrm;
  return coalesce(new, old);
end;
$$;

do $$
declare
  v_signature regprocedure :=
    'public.recurrence_reconcile_materialized_occurrences(uuid,bigint,jsonb,timestamptz,timestamptz,text)'::regprocedure;
  v_definition text;
  v_revised_definition text;
begin
  select pg_get_functiondef(v_signature) into v_definition;
  v_revised_definition := replace(
    v_definition,
    'status = v_template.status',
    'status = ''confirmed'''
  );
  if v_revised_definition = v_definition then
    raise exception 'Could not locate recurrence tombstone restore status';
  end if;
  execute v_revised_definition;
end;
$$;

create or replace function public.recurrence_apply_shadow_migration(
  p_action_id text,
  p_plan jsonb,
  p_actor jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing public.recurrence_shadow_migrations%rowtype;
  v_series_plan jsonb;
  v_occurrence jsonb;
  v_source public.events%rowtype;
  v_template_id uuid;
  v_series_id uuid;
  v_before jsonb := '[]'::jsonb;
  v_series_manifest jsonb := '[]'::jsonb;
  v_target_ids uuid[];
  v_planned_count integer := 0;
  v_updated_count integer := 0;
  v_plan_hash text;
  v_exception_paths jsonb;
begin
  if nullif(btrim(p_action_id), '') is null then raise exception 'Shadow migration action ID is required'; end if;
  if jsonb_typeof(p_plan->'series') <> 'array' or jsonb_array_length(p_plan->'series') = 0 then
    raise exception 'Shadow migration requires a non-empty series array';
  end if;
  v_plan_hash := md5(p_plan::text);

  select * into v_existing
  from public.recurrence_shadow_migrations
  where action_id = p_action_id
  for update;
  if found then
    if v_existing.plan_hash <> v_plan_hash then
      raise exception 'Shadow migration action ID already exists with a different plan';
    end if;
    return v_existing.manifest || jsonb_build_object('idempotent_replay', true);
  end if;

  select coalesce(array_agg((occurrence->>'eventId')::uuid), array[]::uuid[])
  into v_target_ids
  from jsonb_array_elements(p_plan->'series') series_plan,
       jsonb_array_elements(series_plan->'occurrences') occurrence;
  v_planned_count := cardinality(v_target_ids);
  if v_planned_count = 0 or v_planned_count <> (
    select count(distinct event_id) from unnest(v_target_ids) event_ids(event_id)
  ) then
    raise exception 'Shadow migration occurrence IDs must be non-empty and unique';
  end if;

  perform 1 from public.events where id = any(v_target_ids) for update;
  if (select count(*) from public.events where id = any(v_target_ids)) <> v_planned_count then
    raise exception 'One or more shadow migration events do not exist';
  end if;
  if exists (
    select 1 from public.events
    where id = any(v_target_ids)
      and (series_id is not null or record_kind <> 'single')
  ) then
    raise exception 'Shadow migration target is already recurrence-linked';
  end if;

  for v_series_plan in select value from jsonb_array_elements(p_plan->'series')
  loop
    if jsonb_typeof(v_series_plan->'recurrenceLines') <> 'array'
       or jsonb_array_length(v_series_plan->'recurrenceLines') = 0 then
      raise exception 'Series % has no recurrence lines', v_series_plan->>'googleMasterId';
    end if;
    select * into v_source
    from public.events
    where id = (v_series_plan->>'templateSourceEventId')::uuid;
    if not found or not (v_source.id = any(v_target_ids)) then
      raise exception 'Invalid template source for series %', v_series_plan->>'googleMasterId';
    end if;

    insert into public.events (
      title, description, start_time, end_time, all_day,
      location_name, address, lat, lng, venue_id,
      status, color_override, is_enriched, category, tags, event_type,
      record_kind, is_exception, exception_paths
    )
    values (
      v_source.title,
      v_source.description,
      (v_series_plan->>'masterStart')::timestamptz,
      (v_series_plan->>'masterEnd')::timestamptz,
      v_source.all_day,
      v_source.location_name,
      v_source.address,
      v_source.lat,
      v_source.lng,
      v_source.venue_id,
      'cancelled',
      v_source.color_override,
      v_source.is_enriched,
      v_source.category,
      v_source.tags,
      v_source.event_type,
      'series_template',
      false,
      '[]'::jsonb
    )
    returning id into v_template_id;

    perform public.recurrence_clone_reusable_graph(v_source.id, v_template_id, 1);

    insert into public.event_series (
      template_event_id, timezone, recurrence_lines, ownership,
      google_calendar_id, google_recurring_event_id, google_ical_uid,
      google_etag, google_updated_at
    )
    values (
      v_template_id,
      v_series_plan->>'timezone',
      v_series_plan->'recurrenceLines',
      'google_adopted',
      'primary',
      v_series_plan->>'googleMasterId',
      nullif(v_series_plan->>'iCalUID', ''),
      nullif(v_series_plan->>'googleEtag', ''),
      nullif(v_series_plan->>'googleUpdatedAt', '')::timestamptz
    )
    returning id into v_series_id;

    for v_occurrence in select value from jsonb_array_elements(v_series_plan->'occurrences')
    loop
      select v_before || jsonb_build_array(jsonb_build_object(
        'event_id', id,
        'record_kind', record_kind,
        'series_id', series_id,
        'occurrence_key', occurrence_key,
        'original_start_time', original_start_time,
        'original_start_date', original_start_date,
        'is_exception', is_exception,
        'exception_paths', exception_paths,
        'series_revision_applied', series_revision_applied,
        'google_ical_uid', google_ical_uid,
        'google_etag', google_etag,
        'google_updated_at', google_updated_at
      ))
      into v_before
      from public.events
      where id = (v_occurrence->>'eventId')::uuid;

      v_exception_paths := coalesce(v_occurrence->'exceptionPaths', '[]'::jsonb);
      update public.events
      set record_kind = 'occurrence',
          series_id = v_series_id,
          occurrence_key = v_occurrence->>'occurrenceKey',
          original_start_time = nullif(v_occurrence->>'originalStartTime', '')::timestamptz,
          original_start_date = nullif(v_occurrence->>'originalStartDate', '')::date,
          is_exception = jsonb_array_length(v_exception_paths) > 0,
          exception_paths = v_exception_paths,
          series_revision_applied = 1,
          google_ical_uid = nullif(v_series_plan->>'iCalUID', ''),
          google_etag = nullif(v_occurrence->>'googleEtag', ''),
          google_updated_at = nullif(v_occurrence->>'googleUpdatedAt', '')::timestamptz
      where id = (v_occurrence->>'eventId')::uuid;
      v_updated_count := v_updated_count + 1;
    end loop;

    v_series_manifest := v_series_manifest || jsonb_build_array(jsonb_build_object(
      'series_id', v_series_id,
      'template_event_id', v_template_id,
      'google_master_id', v_series_plan->>'googleMasterId'
    ));
  end loop;

  if v_updated_count <> v_planned_count then
    raise exception 'Shadow migration updated % rows but planned %', v_updated_count, v_planned_count;
  end if;

  v_existing.manifest := jsonb_build_object(
    'action_id', p_action_id,
    'plan_hash', v_plan_hash,
    'series', v_series_manifest,
    'occurrences_before', v_before,
    'series_count', jsonb_array_length(v_series_manifest),
    'occurrence_count', v_updated_count,
    'idempotent_replay', false
  );
  insert into public.recurrence_shadow_migrations (
    action_id, plan_hash, plan, manifest, actor
  ) values (
    p_action_id, v_plan_hash, p_plan, v_existing.manifest, coalesce(p_actor, '{}'::jsonb)
  );
  return v_existing.manifest;
end;
$$;

create or replace function public.recurrence_rollback_shadow_migration(p_action_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_migration public.recurrence_shadow_migrations%rowtype;
  v_occurrence jsonb;
  v_series jsonb;
  v_restored integer := 0;
begin
  select * into v_migration
  from public.recurrence_shadow_migrations
  where action_id = p_action_id
  for update;
  if not found then raise exception 'Shadow migration not found: %', p_action_id; end if;
  if v_migration.status = 'rolled_back' then
    return jsonb_build_object('action_id', p_action_id, 'idempotent_replay', true, 'status', 'rolled_back');
  end if;
  if exists (
    select 1
    from jsonb_array_elements(v_migration.manifest->'series') item
    join public.event_series series on series.id = (item->>'series_id')::uuid
    where series.revision <> 1
  ) then
    raise exception 'Shadow migration cannot roll back after a series revision changes';
  end if;

  for v_occurrence in select value from jsonb_array_elements(v_migration.manifest->'occurrences_before')
  loop
    update public.events
    set record_kind = v_occurrence->>'record_kind',
        series_id = nullif(v_occurrence->>'series_id', '')::uuid,
        occurrence_key = nullif(v_occurrence->>'occurrence_key', ''),
        original_start_time = nullif(v_occurrence->>'original_start_time', '')::timestamptz,
        original_start_date = nullif(v_occurrence->>'original_start_date', '')::date,
        is_exception = coalesce((v_occurrence->>'is_exception')::boolean, false),
        exception_paths = coalesce(v_occurrence->'exception_paths', '[]'::jsonb),
        series_revision_applied = nullif(v_occurrence->>'series_revision_applied', '')::bigint,
        google_ical_uid = nullif(v_occurrence->>'google_ical_uid', ''),
        google_etag = nullif(v_occurrence->>'google_etag', ''),
        google_updated_at = nullif(v_occurrence->>'google_updated_at', '')::timestamptz
    where id = (v_occurrence->>'event_id')::uuid;
    v_restored := v_restored + 1;
  end loop;

  for v_series in select value from jsonb_array_elements(v_migration.manifest->'series')
  loop
    delete from public.event_series where id = (v_series->>'series_id')::uuid;
    delete from public.events where id = (v_series->>'template_event_id')::uuid;
  end loop;

  update public.recurrence_shadow_migrations
  set status = 'rolled_back', rolled_back_at = now()
  where id = v_migration.id;
  return jsonb_build_object(
    'action_id', p_action_id,
    'status', 'rolled_back',
    'restored_occurrences', v_restored,
    'idempotent_replay', false
  );
end;
$$;

revoke all on table public.recurrence_shadow_migrations from public, anon, authenticated;
grant select, insert, update on table public.recurrence_shadow_migrations to service_role;
revoke all on function public.recurrence_apply_shadow_migration(text, jsonb, jsonb)
  from public, anon, authenticated;
revoke all on function public.recurrence_rollback_shadow_migration(text)
  from public, anon, authenticated;
grant execute on function public.recurrence_apply_shadow_migration(text, jsonb, jsonb) to service_role;
grant execute on function public.recurrence_rollback_shadow_migration(text) to service_role;
