alter table public.events
  add column if not exists tombstone_origin text,
  drop constraint if exists events_tombstone_origin_check,
  add constraint events_tombstone_origin_check
    check (tombstone_origin is null or tombstone_origin in ('user', 'recurrence', 'google'));

alter table public.event_series
  add column if not exists materialized_range_start timestamptz,
  add column if not exists materialized_range_end timestamptz,
  add column if not exists last_materialized_at timestamptz,
  add column if not exists materialization_error text;

create or replace function public.set_event_tombstone_origin()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.deleted_at is null then
    new.tombstone_origin := null;
  elsif old.deleted_at is null and new.tombstone_origin is null then
    new.tombstone_origin := 'user';
  end if;
  return new;
end;
$$;

drop trigger if exists events_tombstone_origin on public.events;
create trigger events_tombstone_origin
  before update of deleted_at, tombstone_origin on public.events
  for each row execute function public.set_event_tombstone_origin();

create or replace function public.recurrence_reconcile_materialized_occurrences(
  p_series_id uuid,
  p_expected_series_revision bigint,
  p_occurrences jsonb,
  p_range_start timestamptz,
  p_range_end timestamptz,
  p_correlation_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_series public.event_series%rowtype;
  v_template public.events%rowtype;
  v_occurrence jsonb;
  v_existing public.events%rowtype;
  v_event_id uuid;
  v_start timestamptz;
  v_end timestamptz;
  v_key text;
  v_original_start_time timestamptz;
  v_original_start_date date;
  v_generated_keys text[];
  v_created integer := 0;
  v_reconciled integer := 0;
  v_preserved integer := 0;
  v_tombstoned integer := 0;
  v_restored integer := 0;
  v_now timestamptz := now();
  v_inherited_paths text[] := array[
    'event.title',
    'event.description',
    'event.allDay',
    'event.eventType',
    'event.locationName',
    'event.address',
    'event.lat',
    'event.lng',
    'assignments',
    'enrichment',
    'transportationPlan',
    'logistics',
    'checklistDefinitions',
    'actionDefinitions'
  ];
  v_template_patch jsonb;
begin
  if p_range_end <= p_range_start then
    raise exception 'Materialization range end must follow its start';
  end if;
  if jsonb_typeof(p_occurrences) <> 'array' then
    raise exception 'Materialized occurrences must be an array';
  end if;
  if jsonb_array_length(p_occurrences) > 5000 then
    raise exception 'Materialization batch exceeds 5000 occurrences';
  end if;

  select * into v_series
  from public.event_series
  where id = p_series_id
  for update;
  if not found then raise exception 'Series not found: %', p_series_id; end if;
  if v_series.status <> 'active' then raise exception 'Series is not active: %', p_series_id; end if;
  if v_series.revision <> p_expected_series_revision then
    raise exception using
      errcode = 'P0001',
      message = format(
        'Series revision conflict: expected revision %s, current revision %s',
        p_expected_series_revision,
        v_series.revision
      ),
      detail = 'RECURRENCE_REVISION_CONFLICT';
  end if;

  select * into v_template
  from public.events
  where id = v_series.template_event_id
    and record_kind = 'series_template'
  for update;
  if not found then raise exception 'Series template not found: %', v_series.template_event_id; end if;

  select coalesce(array_agg(value->>'occurrenceKey'), array[]::text[])
  into v_generated_keys
  from jsonb_array_elements(p_occurrences);
  if cardinality(v_generated_keys) <> (
    select count(distinct generated_key)
    from unnest(v_generated_keys) as generated_keys(generated_key)
  ) then
    raise exception 'Materialized occurrence keys must be unique';
  end if;

  v_template_patch := public.recurrence_build_reusable_patch(v_template.id);

  for v_occurrence in select value from jsonb_array_elements(p_occurrences)
  loop
    v_key := nullif(btrim(v_occurrence->>'occurrenceKey'), '');
    v_start := nullif(v_occurrence->>'start', '')::timestamptz;
    v_end := nullif(v_occurrence->>'end', '')::timestamptz;
    v_original_start_time := nullif(v_occurrence->>'originalStartTime', '')::timestamptz;
    v_original_start_date := nullif(v_occurrence->>'originalStartDate', '')::date;

    if v_key is null or v_start is null or v_end is null or v_end <= v_start then
      raise exception 'Invalid generated occurrence payload: %', v_occurrence;
    end if;
    if v_start < p_range_start or v_start > p_range_end then
      raise exception 'Generated occurrence % falls outside its materialization range', v_key;
    end if;
    if v_template.all_day and v_original_start_date is null then
      raise exception 'All-day occurrence % requires originalStartDate', v_key;
    end if;
    if not v_template.all_day and v_original_start_time is null then
      raise exception 'Timed occurrence % requires originalStartTime', v_key;
    end if;

    select * into v_existing
    from public.events
    where series_id = p_series_id
      and occurrence_key = v_key
    for update;

    if not found then
      insert into public.events (
        title, description, start_time, end_time, all_day,
        location_name, address, lat, lng, venue_id,
        status, color_override, is_enriched, category, tags, event_type,
        record_kind, series_id, occurrence_key,
        original_start_time, original_start_date,
        is_exception, exception_paths, series_revision_applied
      )
      values (
        v_template.title, v_template.description, v_start, v_end, v_template.all_day,
        v_template.location_name, v_template.address, v_template.lat, v_template.lng, v_template.venue_id,
        'confirmed', v_template.color_override, v_template.is_enriched, v_template.category, v_template.tags,
        v_template.event_type, 'occurrence', p_series_id, v_key,
        v_original_start_time, v_original_start_date,
        false, '[]'::jsonb, v_series.revision
      )
      returning id into v_event_id;

      perform public.recurrence_clone_reusable_graph(v_template.id, v_event_id, v_series.revision);
      v_created := v_created + 1;
      continue;
    end if;

    if v_existing.deleted_at is not null and coalesce(v_existing.tombstone_origin, 'user') <> 'recurrence' then
      v_preserved := v_preserved + 1;
      continue;
    end if;

    if v_existing.deleted_at is not null and v_existing.tombstone_origin = 'recurrence' then
      update public.events
      set deleted_at = null,
          purge_after = null,
          tombstone_origin = null,
          status = v_template.status
      where id = v_existing.id;
      v_restored := v_restored + 1;
    end if;

    if public.recurrence_path_is_inherited(v_existing.exception_paths, 'event.startTime')
       and public.recurrence_path_is_inherited(v_existing.exception_paths, 'event.endTime')
       and public.recurrence_path_is_inherited(v_existing.exception_paths, 'event.durationMs') then
      update public.events
      set start_time = v_start,
          end_time = v_end,
          original_start_time = v_original_start_time,
          original_start_date = v_original_start_date,
          series_revision_applied = v_series.revision,
          updated_at = v_now
      where id = v_existing.id;
    else
      update public.events
      set original_start_time = v_original_start_time,
          original_start_date = v_original_start_date,
          series_revision_applied = v_series.revision,
          updated_at = v_now
      where id = v_existing.id;
    end if;

    perform public.recurrence_apply_reusable_graph(
      v_existing.id,
      v_template_patch,
      v_inherited_paths,
      true,
      v_series.revision
    );
    v_reconciled := v_reconciled + 1;
  end loop;

  update public.events
  set deleted_at = v_now,
      purge_after = v_now + interval '30 days',
      tombstone_origin = 'recurrence',
      status = 'cancelled',
      updated_at = v_now
  where series_id = p_series_id
    and record_kind = 'occurrence'
    and deleted_at is null
    and not is_exception
    and start_time >= p_range_start
    and start_time <= p_range_end
    and not (occurrence_key = any(v_generated_keys));
  get diagnostics v_tombstoned = row_count;

  update public.event_series
  set materialized_range_start = case
        when materialized_range_start is null then p_range_start
        else least(materialized_range_start, p_range_start)
      end,
      materialized_range_end = case
        when materialized_range_end is null then p_range_end
        else greatest(materialized_range_end, p_range_end)
      end,
      last_materialized_at = v_now,
      materialization_error = null
  where id = p_series_id;

  return jsonb_build_object(
    'series_id', p_series_id,
    'series_revision', v_series.revision,
    'created', v_created,
    'reconciled', v_reconciled,
    'preserved', v_preserved,
    'restored', v_restored,
    'tombstoned', v_tombstoned,
    'generated', jsonb_array_length(p_occurrences),
    'range_start', p_range_start,
    'range_end', p_range_end,
    'correlation_id', p_correlation_id
  );
end;
$$;

revoke all on function public.recurrence_build_event_snapshot(uuid) from public, anon, authenticated;
revoke all on function public.recurrence_build_reusable_patch(uuid) from public, anon, authenticated;
revoke all on function public.recurrence_apply_event_patch(uuid, jsonb, text[], boolean, bigint) from public, anon, authenticated;
revoke all on function public.recurrence_apply_reusable_graph(uuid, jsonb, text[], boolean, bigint) from public, anon, authenticated;
revoke all on function public.recurrence_clone_reusable_graph(uuid, uuid, bigint) from public, anon, authenticated;
revoke all on function public.recurrence_reconcile_materialized_occurrences(uuid, bigint, jsonb, timestamptz, timestamptz, text)
  from public, anon, authenticated;

grant execute on function public.recurrence_build_event_snapshot(uuid) to service_role;
grant execute on function public.recurrence_build_reusable_patch(uuid) to service_role;
grant execute on function public.recurrence_apply_event_patch(uuid, jsonb, text[], boolean, bigint) to service_role;
grant execute on function public.recurrence_apply_reusable_graph(uuid, jsonb, text[], boolean, bigint) to service_role;
grant execute on function public.recurrence_clone_reusable_graph(uuid, uuid, bigint) to service_role;
grant execute on function public.recurrence_reconcile_materialized_occurrences(uuid, bigint, jsonb, timestamptz, timestamptz, text)
  to service_role;

comment on function public.recurrence_reconcile_materialized_occurrences(
  uuid, bigint, jsonb, timestamptz, timestamptz, text
) is
  'Service-only reconciliation for stable recurring occurrences. Preserves explicit exceptions and occurrence facts.';
