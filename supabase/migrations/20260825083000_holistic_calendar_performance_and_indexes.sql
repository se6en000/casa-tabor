-- ============================================================================
-- Holistic Calendar Performance Optimization & Composite Index Architecture
-- 1. Index missing composite foreign keys on event_members and availability
-- 2. Range lookup partial index on events
-- 3. Optimized Correlated Single-Pass Calendar Feed RPC (get_calendar_feed)
-- ============================================================================

-- 1. Composite & Foreign Key Indexes for Zero-Scan Joins
create index if not exists idx_event_members_event_family_comp
  on public.event_members (event_id, family_member_id);

create index if not exists idx_member_availability_rules_member
  on public.member_availability_rules (member_id);

create index if not exists idx_events_range_lookup
  on public.events (start_time, end_time) 
  where record_kind <> 'series_template' and deleted_at is null;

-- 2. High-Performance Single-Pass Correlated Calendar Feed Aggregation RPC
create or replace function public.get_calendar_feed(
  p_start timestamptz,
  p_end timestamptz
)
returns jsonb
language sql
stable
set search_path = public
as $$
  select coalesce(jsonb_agg(
    to_jsonb(e) || jsonb_build_object(
      'event_members', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', em.id,
          'role', em.role,
          'family_member', jsonb_build_object(
            'id', fm.id,
            'name', fm.name,
            'role', fm.role,
            'color_hex', fm.color_hex,
            'can_drive', fm.can_drive
          )
        ))
        from public.event_members em
        join public.family_members fm on fm.id = em.family_member_id
        where em.event_id = e.id
      ), '[]'::jsonb),
      'event_plan_overrides', coalesce((
        select jsonb_agg(to_jsonb(epo))
        from public.event_plan_overrides epo
        where epo.event_id = e.id
      ), '[]'::jsonb),
      'event_enrichments', coalesce((
        select jsonb_agg(to_jsonb(ee))
        from public.event_enrichments ee
        where ee.event_id = e.id
      ), '[]'::jsonb),
      'event_action_items', coalesce((
        select jsonb_agg(to_jsonb(eai))
        from public.event_action_items eai
        where eai.event_id = e.id
      ), '[]'::jsonb)
    )
  ), '[]'::jsonb)
  from public.events e
  where e.start_time < p_end
    and e.end_time > p_start
    and e.record_kind <> 'series_template'
    and e.deleted_at is null;
$$;

-- Grant execution to authenticated & anon roles
grant execute on function public.get_calendar_feed(timestamptz, timestamptz) to anon, authenticated, service_role;
