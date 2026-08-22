-- ============================================================================
-- Calendar Performance RPCs & Foreign Key Index Optimization
-- 1. Index missing foreign keys on event_members and event_plan_overrides
-- 2. Fast Calendar Feed Aggregation RPC (get_calendar_feed)
-- 3. Atomic Event Mutation RPC (upsert_event_bundle)
-- ============================================================================

-- 1. Missing Foreign Key & Join Indexes
create index if not exists idx_event_members_family_member_id 
  on public.event_members(family_member_id);

create index if not exists idx_event_members_event_id 
  on public.event_members(event_id);

create index if not exists idx_event_plan_overrides_event_id 
  on public.event_plan_overrides(event_id);

create index if not exists idx_event_enrichments_event_id 
  on public.event_enrichments(event_id);

create index if not exists idx_event_action_items_event_id 
  on public.event_action_items(event_id);

-- 2. High-Performance Calendar Feed Aggregation RPC
create or replace function public.get_calendar_feed(
  p_start timestamptz,
  p_end timestamptz
)
returns jsonb
language sql
stable
set search_path = public
as $$
  with range_events as (
    select e.*
    from public.events e
    where e.start_time < p_end
      and e.end_time > p_start
      and e.record_kind <> 'series_template'
      and e.deleted_at is null
    order by e.start_time
  ),
  members_agg as (
    select 
      em.event_id,
      jsonb_agg(jsonb_build_object(
        'id', em.id,
        'role', em.role,
        'family_member', jsonb_build_object(
          'id', fm.id,
          'name', fm.name,
          'role', fm.role,
          'color_hex', fm.color_hex,
          'can_drive', fm.can_drive
        )
      )) as members
    from public.event_members em
    join public.family_members fm on fm.id = em.family_member_id
    where em.event_id in (select id from range_events)
    group by em.event_id
  ),
  overrides_agg as (
    select 
      epo.event_id,
      jsonb_agg(to_jsonb(epo)) as plan_overrides
    from public.event_plan_overrides epo
    where epo.event_id in (select id from range_events)
    group by epo.event_id
  ),
  enrichments_agg as (
    select 
      ee.event_id,
      jsonb_agg(to_jsonb(ee)) as enrichments
    from public.event_enrichments ee
    where ee.event_id in (select id from range_events)
    group by ee.event_id
  ),
  actions_agg as (
    select 
      eai.event_id,
      jsonb_agg(to_jsonb(eai)) as action_items
    from public.event_action_items eai
    where eai.event_id in (select id from range_events)
    group by eai.event_id
  )
  select coalesce(jsonb_agg(
    to_jsonb(re) || jsonb_build_object(
      'event_members', coalesce(ma.members, '[]'::jsonb),
      'event_plan_overrides', coalesce(oa.plan_overrides, '[]'::jsonb),
      'event_enrichments', coalesce(ea.enrichments, '[]'::jsonb),
      'event_action_items', coalesce(aa.action_items, '[]'::jsonb)
    )
  ), '[]'::jsonb)
  from range_events re
  left join members_agg ma on ma.event_id = re.id
  left join overrides_agg oa on oa.event_id = re.id
  left join enrichments_agg ea on ea.event_id = re.id
  left join actions_agg aa on aa.event_id = re.id;
$$;

-- Grant execution to authenticated & anon roles
grant execute on function public.get_calendar_feed(timestamptz, timestamptz) to anon, authenticated, service_role;

-- 3. Atomic Event Mutation RPC
create or replace function public.upsert_event_bundle(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event_id text;
  v_event_data jsonb;
  v_members jsonb;
  v_enrichment jsonb;
  v_override jsonb;
  v_member jsonb;
begin
  v_event_id := p_payload->>'id';
  v_event_data := p_payload->'event';
  v_members := p_payload->'members';
  v_enrichment := p_payload->'enrichment';
  v_override := p_payload->'plan_override';

  if v_event_id is null or v_event_data is null then
    raise exception 'Missing required event id or event data';
  end if;

  -- 1. Upsert Event Record
  insert into public.events (
    id, title, description, start_time, end_time, all_day, event_type,
    location_name, address, status, is_enriched, record_kind, is_exception,
    updated_at
  ) values (
    v_event_id,
    v_event_data->>'title',
    v_event_data->>'description',
    (v_event_data->>'start_time')::timestamptz,
    (v_event_data->>'end_time')::timestamptz,
    coalesce((v_event_data->>'all_day')::boolean, false),
    coalesce(v_event_data->>'event_type', 'event'),
    v_event_data->>'location_name',
    v_event_data->>'address',
    coalesce(v_event_data->>'status', 'confirmed'),
    coalesce((v_event_data->>'is_enriched')::boolean, true),
    coalesce(v_event_data->>'record_kind', 'single'),
    coalesce((v_event_data->>'is_exception')::boolean, false),
    now()
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
    status = excluded.status,
    is_enriched = excluded.is_enriched,
    updated_at = now();

  -- 2. Upsert Members if supplied
  if v_members is not null and jsonb_array_length(v_members) > 0 then
    delete from public.event_members where event_id = v_event_id;
    for v_member in select * from jsonb_array_elements(v_members) loop
      insert into public.event_members (event_id, family_member_id, role, rsvp_status)
      values (
        v_event_id,
        v_member->>'family_member_id',
        coalesce(v_member->>'role', 'passenger'),
        coalesce(v_member->>'rsvp_status', 'accepted')
      )
      on conflict (event_id, family_member_id) do update set
        role = excluded.role,
        rsvp_status = excluded.rsvp_status;
    end loop;
  end if;

  -- 3. Upsert Enrichment
  if v_enrichment is not null then
    insert into public.event_enrichments (
      event_id, category, category_locked, confidence, what_to_bring,
      departure_time, drive_time_mins, updated_at
    ) values (
      v_event_id,
      v_enrichment->>'category',
      coalesce((v_enrichment->>'category_locked')::boolean, false),
      coalesce((v_enrichment->>'confidence')::numeric, 1.0),
      v_enrichment->'what_to_bring',
      (v_enrichment->>'departure_time')::timestamptz,
      (v_enrichment->>'drive_time_mins')::integer,
      now()
    )
    on conflict (event_id) do update set
      category = coalesce(excluded.category, event_enrichments.category),
      what_to_bring = coalesce(excluded.what_to_bring, event_enrichments.what_to_bring),
      departure_time = excluded.departure_time,
      drive_time_mins = excluded.drive_time_mins,
      updated_at = now();
  end if;

  -- 4. Upsert Plan Override
  if v_override is not null then
    insert into public.event_plan_overrides (
      event_id, verified, waits, driver_overrides, mode_override,
      two_driver_confirmed, transportation_plan, updated_at
    ) values (
      v_event_id,
      coalesce((v_override->>'verified')::boolean, false),
      coalesce((v_override->>'waits')::boolean, false),
      v_override->'driver_overrides',
      v_override->>'mode_override',
      coalesce((v_override->>'two_driver_confirmed')::boolean, false),
      v_override->'transportation_plan',
      now()
    )
    on conflict (event_id) do update set
      verified = coalesce(excluded.verified, event_plan_overrides.verified),
      waits = coalesce(excluded.waits, event_plan_overrides.waits),
      driver_overrides = coalesce(excluded.driver_overrides, event_plan_overrides.driver_overrides),
      mode_override = coalesce(excluded.mode_override, event_plan_overrides.mode_override),
      two_driver_confirmed = coalesce(excluded.two_driver_confirmed, event_plan_overrides.two_driver_confirmed),
      transportation_plan = coalesce(excluded.transportation_plan, event_plan_overrides.transportation_plan),
      updated_at = now();
  end if;

  return jsonb_build_object('success', true, 'event_id', v_event_id);
end;
$$;

-- Grant execution to authenticated & anon roles
grant execute on function public.upsert_event_bundle(jsonb) to anon, authenticated, service_role;
