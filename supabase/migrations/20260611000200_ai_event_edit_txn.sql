create or replace function public.ai_apply_event_update(
  p_event_id uuid,
  p_event_updates jsonb default '{}'::jsonb,
  p_enrichment_updates jsonb default '{}'::jsonb,
  p_checklist_items jsonb default null,
  p_action_items jsonb default null,
  p_members_add uuid[] default array[]::uuid[],
  p_members_remove uuid[] default array[]::uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_item jsonb;
  v_index integer := 0;
begin
  update public.events
  set
    title = case when p_event_updates ? 'title' then nullif(btrim(p_event_updates->>'title'), '') else title end,
    start_time = case when p_event_updates ? 'start_time' then (p_event_updates->>'start_time')::timestamptz else start_time end,
    end_time = case when p_event_updates ? 'end_time' then (p_event_updates->>'end_time')::timestamptz else end_time end,
    location_name = case when p_event_updates ? 'location_name' then nullif(btrim(p_event_updates->>'location_name'), '') else location_name end,
    address = case when p_event_updates ? 'address' then nullif(btrim(p_event_updates->>'address'), '') else address end,
    description = case when p_event_updates ? 'description' then nullif(btrim(p_event_updates->>'description'), '') else description end,
    all_day = case when p_event_updates ? 'all_day' then (p_event_updates->>'all_day')::boolean else all_day end,
    is_enriched = case when p_event_updates ? 'is_enriched' then (p_event_updates->>'is_enriched')::boolean else is_enriched end,
    updated_at = v_now
  where id = p_event_id;

  if p_enrichment_updates <> '{}'::jsonb then
    insert into public.event_enrichments (
      event_id,
      confidence,
      what_to_bring,
      prep_notes,
      category,
      outfit_suggestion,
      parking_notes,
      contact_name,
      contact_phone,
      cost_estimate,
      dietary_notes,
      meal_impact,
      created_at,
      updated_at
    )
    values (
      p_event_id,
      'low',
      case
        when p_enrichment_updates ? 'what_to_bring'
          then array(select jsonb_array_elements_text(p_enrichment_updates->'what_to_bring'))
        else array[]::text[]
      end,
      case when p_enrichment_updates ? 'prep_notes' then nullif(btrim(p_enrichment_updates->>'prep_notes'), '') else null end,
      case when p_enrichment_updates ? 'category' then nullif(btrim(p_enrichment_updates->>'category'), '') else null end,
      case when p_enrichment_updates ? 'outfit_suggestion' then nullif(btrim(p_enrichment_updates->>'outfit_suggestion'), '') else null end,
      case when p_enrichment_updates ? 'parking_notes' then nullif(btrim(p_enrichment_updates->>'parking_notes'), '') else null end,
      case when p_enrichment_updates ? 'contact_name' then nullif(btrim(p_enrichment_updates->>'contact_name'), '') else null end,
      case when p_enrichment_updates ? 'contact_phone' then nullif(btrim(p_enrichment_updates->>'contact_phone'), '') else null end,
      case when p_enrichment_updates ? 'cost_estimate' then nullif(btrim(p_enrichment_updates->>'cost_estimate'), '') else null end,
      case when p_enrichment_updates ? 'dietary_notes' then nullif(btrim(p_enrichment_updates->>'dietary_notes'), '') else null end,
      case when p_enrichment_updates ? 'meal_impact' then nullif(btrim(p_enrichment_updates->>'meal_impact'), '') else null end,
      v_now,
      v_now
    )
    on conflict (event_id) do update set
      what_to_bring = case when p_enrichment_updates ? 'what_to_bring' then excluded.what_to_bring else public.event_enrichments.what_to_bring end,
      prep_notes = case when p_enrichment_updates ? 'prep_notes' then excluded.prep_notes else public.event_enrichments.prep_notes end,
      category = case when p_enrichment_updates ? 'category' then excluded.category else public.event_enrichments.category end,
      outfit_suggestion = case when p_enrichment_updates ? 'outfit_suggestion' then excluded.outfit_suggestion else public.event_enrichments.outfit_suggestion end,
      parking_notes = case when p_enrichment_updates ? 'parking_notes' then excluded.parking_notes else public.event_enrichments.parking_notes end,
      contact_name = case when p_enrichment_updates ? 'contact_name' then excluded.contact_name else public.event_enrichments.contact_name end,
      contact_phone = case when p_enrichment_updates ? 'contact_phone' then excluded.contact_phone else public.event_enrichments.contact_phone end,
      cost_estimate = case when p_enrichment_updates ? 'cost_estimate' then excluded.cost_estimate else public.event_enrichments.cost_estimate end,
      dietary_notes = case when p_enrichment_updates ? 'dietary_notes' then excluded.dietary_notes else public.event_enrichments.dietary_notes end,
      meal_impact = case when p_enrichment_updates ? 'meal_impact' then excluded.meal_impact else public.event_enrichments.meal_impact end,
      updated_at = v_now;
  end if;

  if p_checklist_items is not null then
    delete from public.event_checklist_items where event_id = p_event_id;
    if jsonb_typeof(p_checklist_items) = 'array' then
      v_index := 0;
      for v_item in select value from jsonb_array_elements(p_checklist_items)
      loop
        if nullif(btrim(v_item->>'label'), '') is not null then
          insert into public.event_checklist_items (
            id, event_id, label, note, checked, category, sort_order
          )
          values (
            coalesce(nullif(v_item->>'id', '')::uuid, gen_random_uuid()),
            p_event_id,
            btrim(v_item->>'label'),
            nullif(btrim(v_item->>'note'), ''),
            coalesce((v_item->>'checked')::boolean, false),
            nullif(btrim(v_item->>'category'), ''),
            v_index
          );
          v_index := v_index + 1;
        end if;
      end loop;
    end if;
  end if;

  if p_action_items is not null then
    delete from public.event_action_items where event_id = p_event_id;
    if jsonb_typeof(p_action_items) = 'array' then
      for v_item in select value from jsonb_array_elements(p_action_items)
      loop
        if nullif(btrim(v_item->>'title'), '') is not null then
          insert into public.event_action_items (
            id, event_id, title, description, due_date, is_urgent, completed, completed_at, assigned_to
          )
          values (
            coalesce(nullif(v_item->>'id', '')::uuid, gen_random_uuid()),
            p_event_id,
            btrim(v_item->>'title'),
            nullif(btrim(v_item->>'description'), ''),
            case when nullif(btrim(v_item->>'due_date'), '') is not null then (v_item->>'due_date')::timestamptz else null end,
            coalesce((v_item->>'is_urgent')::boolean, false),
            coalesce((v_item->>'completed')::boolean, false),
            case
              when coalesce((v_item->>'completed')::boolean, false) then coalesce(nullif(v_item->>'completed_at', '')::timestamptz, v_now)
              else null
            end,
            nullif(btrim(v_item->>'assigned_to'), '')
          );
        end if;
      end loop;
    end if;
  end if;

  if array_length(p_members_add, 1) is not null then
    insert into public.event_members (event_id, family_member_id, role, rsvp_status)
    select p_event_id, member_id, 'attendee', 'accepted'
    from unnest(p_members_add) as member_id
    on conflict (event_id, family_member_id) do nothing;
  end if;

  if array_length(p_members_remove, 1) is not null then
    delete from public.event_members
    where event_id = p_event_id
      and family_member_id = any(p_members_remove);
  end if;

  return jsonb_build_object('event_id', p_event_id);
end;
$$;
