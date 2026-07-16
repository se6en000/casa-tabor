create or replace function public.recurrence_link_google_instance(
  p_series_id uuid,
  p_occurrence_id uuid,
  p_connection_id uuid,
  p_calendar_id text,
  p_google_event_id text,
  p_google_ical_uid text default null,
  p_google_etag text default null,
  p_google_updated_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_series public.event_series%rowtype;
  v_occurrence public.events%rowtype;
  v_conflict public.events%rowtype;
  v_now timestamptz := now();
  v_retired_id uuid;
begin
  select * into v_series
  from public.event_series
  where id = p_series_id
    and status = 'active'
    and source_connection_id = p_connection_id
  for update;
  if not found then
    raise exception 'Writable canonical recurrence series not found';
  end if;

  select * into v_occurrence
  from public.events
  where id = p_occurrence_id
    and series_id = p_series_id
    and record_kind = 'occurrence'
  for update;
  if not found then
    raise exception 'Canonical recurrence occurrence not found';
  end if;

  select * into v_conflict
  from public.events
  where google_event_id = p_google_event_id
    and id <> p_occurrence_id
  for update;
  if found then
    if v_conflict.record_kind <> 'single'
      or v_conflict.series_id is not null
      or v_conflict.google_connection_id is distinct from p_connection_id
      or v_conflict.start_time is distinct from v_occurrence.start_time
    then
      raise exception 'Google instance identity belongs to a different Casa event';
    end if;

    update public.events
    set google_event_id = null,
        google_ical_uid = null,
        google_etag = null,
        google_updated_at = null,
        deleted_at = coalesce(deleted_at, v_now),
        purge_after = coalesce(purge_after, v_now + interval '30 days'),
        tombstone_origin = 'google',
        status = 'cancelled',
        updated_at = v_now
    where id = v_conflict.id;
    v_retired_id := v_conflict.id;
  end if;

  update public.events
  set google_event_id = p_google_event_id,
      google_calendar_id = p_calendar_id,
      google_connection_id = p_connection_id,
      google_ical_uid = p_google_ical_uid,
      google_etag = p_google_etag,
      google_updated_at = p_google_updated_at,
      updated_at = v_now
  where id = p_occurrence_id;

  return jsonb_build_object(
    'linked_occurrence_id', p_occurrence_id,
    'retired_legacy_event_id', v_retired_id
  );
end;
$$;

revoke all on function public.recurrence_link_google_instance(
  uuid, uuid, uuid, text, text, text, text, timestamptz
) from public, anon, authenticated;
grant execute on function public.recurrence_link_google_instance(
  uuid, uuid, uuid, text, text, text, text, timestamptz
) to service_role;
