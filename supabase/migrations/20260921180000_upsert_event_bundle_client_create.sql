-- ============================================================================
-- One atomic round trip for "create an event with attendees (+ optional new
-- directory place)": public.upsert_event_bundle(p_payload jsonb).
--
-- Why: measured 2026-09-21 -- the quick-create card and the chat create_event
-- executor each made 3-5 SEQUENTIAL round trips (saved_places insert -> events
-- insert -> event_members insert [-> find_similar_places / family_members
-- lookups]). On a fresh DB connection every one of those can pay the
-- cold-backend tax (event insert alone: ~1.8s cold vs ~80ms warm). GUARDRAILS.md
-- already mandates a single RPC for multi-table writes; this function existed
-- (20260821235000) but was unused, service_role-only, and would not have run:
-- it inserted a text variable into a uuid id column and into the event_status
-- enum, and its enrichment block mismatched column types (confidence is an
-- enum, what_to_bring an array). Rewritten with correct types and safe to call
-- from the app (RLS on these tables is already open USING (true)).
--
-- Payload:
--   id            uuid, optional (client-generated => idempotent retry + the
--                 optimistic cache entry keeps its real id)
--   event         { title, description, start_time, end_time, all_day,
--                   event_type, location_name, address, lat, lng, status,
--                   record_kind, is_enriched, is_exception }
--   members       [{ family_member_id, role, rsvp_status }]   (optional)
--   saved_place   { name, address, city, state, zip, lat, lng, category }
--                 optional; best-effort directory insert that can never fail
--                 the event write
--   enrichment    { category, category_locked, departure_time, drive_time_mins }
--   plan_override { verified, waits, driver_overrides, mode_override,
--                   two_driver_confirmed, transportation_plan }
-- Returns { success, event_id, created_at, updated_at }.
-- ============================================================================

create or replace function public.upsert_event_bundle(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event_id uuid;
  v_event jsonb := p_payload->'event';
  v_members jsonb := p_payload->'members';
  v_enrichment jsonb := p_payload->'enrichment';
  v_override jsonb := p_payload->'plan_override';
  v_place jsonb := p_payload->'saved_place';
  v_created_at timestamptz;
  v_updated_at timestamptz;
begin
  if v_event is null or jsonb_typeof(v_event) <> 'object' then
    raise exception 'Missing required event data';
  end if;
  if nullif(btrim(v_event->>'title'), '') is null then
    raise exception 'Event title is required';
  end if;

  v_event_id := coalesce(nullif(p_payload->>'id', '')::uuid, gen_random_uuid());

  -- 1. Optional new directory place. Best-effort: a duplicate/constraint
  --    failure must never block the event itself (matches the old client flow,
  --    which ignored saved_places insert errors).
  if v_place is not null and nullif(btrim(v_place->>'name'), '') is not null then
    begin
      insert into public.saved_places (
        name, aliases, address, city, state, zip, lat, lng,
        category, confirmed, source, occurrence_count
      ) values (
        btrim(v_place->>'name'),
        '{}',
        nullif(v_place->>'address', ''),
        nullif(v_place->>'city', ''),
        nullif(v_place->>'state', ''),
        nullif(v_place->>'zip', ''),
        nullif(v_place->>'lat', '')::numeric,
        nullif(v_place->>'lng', '')::numeric,
        coalesce(nullif(v_place->>'category', ''), 'other'),
        true,
        'manual',
        1
      );
    exception when others then
      raise warning 'upsert_event_bundle: saved_places insert skipped: %', sqlerrm;
    end;
  end if;

  -- 2. Event row.
  insert into public.events (
    id, title, description, start_time, end_time, all_day, event_type,
    location_name, address, lat, lng, status, is_enriched, record_kind, is_exception
  ) values (
    v_event_id,
    btrim(v_event->>'title'),
    nullif(v_event->>'description', ''),
    (v_event->>'start_time')::timestamptz,
    (v_event->>'end_time')::timestamptz,
    coalesce((v_event->>'all_day')::boolean, false),
    coalesce(nullif(v_event->>'event_type', ''), 'event'),
    nullif(v_event->>'location_name', ''),
    nullif(v_event->>'address', ''),
    nullif(v_event->>'lat', '')::double precision,
    nullif(v_event->>'lng', '')::double precision,
    coalesce(nullif(v_event->>'status', ''), 'confirmed')::public.event_status,
    coalesce((v_event->>'is_enriched')::boolean, false),
    coalesce(nullif(v_event->>'record_kind', ''), 'single'),
    coalesce((v_event->>'is_exception')::boolean, false)
  )
  on conflict (id) do update set
    title = excluded.title,
    description = excluded.description,
    start_time = excluded.start_time,
    end_time = excluded.end_time,
    all_day = excluded.all_day,
    event_type = excluded.event_type,
    location_name = excluded.location_name,
    address = excluded.address,
    lat = case when v_event ? 'lat' then excluded.lat else public.events.lat end,
    lng = case when v_event ? 'lng' then excluded.lng else public.events.lng end,
    status = excluded.status,
    is_enriched = excluded.is_enriched,
    updated_at = now()
  returning created_at, updated_at into v_created_at, v_updated_at;

  -- 3. Members (set-based; re-sending the same bundle is idempotent).
  if v_members is not null and jsonb_typeof(v_members) = 'array' and jsonb_array_length(v_members) > 0 then
    insert into public.event_members (event_id, family_member_id, role, rsvp_status)
    select distinct on (fid) v_event_id, fid,
           coalesce(nullif(m->>'role', ''), 'attendee'),
           coalesce(nullif(m->>'rsvp_status', ''), 'accepted')
    from (
      select (m->>'family_member_id')::uuid as fid, m
      from jsonb_array_elements(v_members) as m
      where nullif(m->>'family_member_id', '') is not null
    ) s
    order by fid
    on conflict (event_id, family_member_id) do update set
      role = excluded.role,
      rsvp_status = excluded.rsvp_status;

    delete from public.event_members em
    where em.event_id = v_event_id
      and em.family_member_id not in (
        select (m->>'family_member_id')::uuid
        from jsonb_array_elements(v_members) as m
        where nullif(m->>'family_member_id', '') is not null
      );
  end if;

  -- 4. Optional enrichment fields (category etc.; the rest is owned by enrich-event).
  if v_enrichment is not null and jsonb_typeof(v_enrichment) = 'object' then
    insert into public.event_enrichments (event_id, category, category_locked, departure_time, drive_time_mins)
    values (
      v_event_id,
      nullif(v_enrichment->>'category', ''),
      coalesce((v_enrichment->>'category_locked')::boolean, false),
      nullif(v_enrichment->>'departure_time', '')::timestamptz,
      nullif(v_enrichment->>'drive_time_mins', '')::integer
    )
    on conflict (event_id) do update set
      category = coalesce(excluded.category, public.event_enrichments.category),
      category_locked = excluded.category_locked,
      departure_time = coalesce(excluded.departure_time, public.event_enrichments.departure_time),
      drive_time_mins = coalesce(excluded.drive_time_mins, public.event_enrichments.drive_time_mins);
  end if;

  -- 5. Optional plan override.
  if v_override is not null and jsonb_typeof(v_override) = 'object' then
    insert into public.event_plan_overrides (
      event_id, verified, waits, driver_overrides, mode_override,
      two_driver_confirmed, transportation_plan
    ) values (
      v_event_id,
      coalesce((v_override->>'verified')::boolean, false),
      coalesce((v_override->>'waits')::boolean, false),
      coalesce(v_override->'driver_overrides', '{}'::jsonb),
      v_override->>'mode_override',
      coalesce((v_override->>'two_driver_confirmed')::boolean, false),
      v_override->'transportation_plan'
    )
    on conflict (event_id) do update set
      verified = excluded.verified,
      waits = excluded.waits,
      driver_overrides = coalesce(excluded.driver_overrides, public.event_plan_overrides.driver_overrides),
      mode_override = coalesce(excluded.mode_override, public.event_plan_overrides.mode_override),
      two_driver_confirmed = excluded.two_driver_confirmed,
      transportation_plan = coalesce(excluded.transportation_plan, public.event_plan_overrides.transportation_plan);
  end if;

  return jsonb_build_object(
    'success', true,
    'event_id', v_event_id,
    'created_at', v_created_at,
    'updated_at', v_updated_at
  );
end;
$$;

comment on function public.upsert_event_bundle(jsonb) is
  'Atomic single-round-trip create/update of an event + members (+ optional saved_place, enrichment, plan_override). Used by quick-create and the chat create_event executor.';

revoke all on function public.upsert_event_bundle(jsonb) from public;
grant execute on function public.upsert_event_bundle(jsonb) to anon, authenticated, service_role;
