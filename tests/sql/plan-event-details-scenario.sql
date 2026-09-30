-- P3.24: a photo's details for an event already on the calendar (event_details), against the real database,
-- rolled back. Run: (echo 'begin;'; cat supabase/migrations/20261001210000_plan_event_details.sql this; echo 'rollback;') | bash scripts/supabase-cli.sh db query --linked -f /dev/stdin
do $$
declare v_trip uuid; v_owen uuid; r jsonb; v_plan uuid; e record; n int;
begin
  select id into v_owen from family_members where name = 'Owen' limit 1;
  insert into events (title, start_time, end_time, all_day, event_type, description, record_kind, status)
    values ('ZZ Field trip', '2026-10-01T04:00:00Z', '2026-10-02T03:59:00Z', true, 'event', 'From the school calendar', 'single', 'confirmed') returning id into v_trip;

  -- 1: the flyer's times, place, notes and Owen go onto it; the packing goes on it too; one plan
  r := casa_plan_apply('ZZ Owen’s field trip', jsonb_build_array(
    jsonb_build_object('id', 'i1', 'kind', 'event_details', 'event_id', v_trip, 'changes', jsonb_build_object(
      'start', '2026-10-01T09:30:00-04:00', 'end', '2026-10-01T12:00:00-04:00', 'place', 'ZZ Glazer Hall',
      'notes', 'By bus. Questions: Kim Kerry (561) 329-1269', 'people', jsonb_build_array('Owen'))),
    jsonb_build_object('id', 'i2', 'kind', 'pack', 'label', 'ZZ neon pink shirt', 'event_id', v_trip)));
  v_plan := (r->>'plan_id')::uuid;
  select * into e from events where id = v_trip;
  if e.all_day or e.start_time <> '2026-10-01T13:30:00Z' or e.end_time <> '2026-10-01T16:00:00Z' then raise exception 'FAIL 1 times % % %', e.all_day, e.start_time, e.end_time; end if;
  if e.location_name <> 'ZZ Glazer Hall' then raise exception 'FAIL 1 place'; end if;
  if e.description <> E'From the school calendar\n\nBy bus. Questions: Kim Kerry (561) 329-1269' then raise exception 'FAIL 1 notes: %', e.description; end if;
  if v_owen is not null and not exists (select 1 from event_members where event_id = v_trip and family_member_id = v_owen) then raise exception 'FAIL 1 Owen'; end if;
  if not exists (select 1 from jsonb_array_elements(r->'calendar') c where c.value->>'op' = 'updated' and c.value->>'event_id' = v_trip::text) then raise exception 'FAIL 1 google %', r->'calendar'; end if;
  if not exists (select 1 from event_checklist_items where event_id = v_trip and label = 'ZZ neon pink shirt') then raise exception 'FAIL 1 pack'; end if;

  -- 2: Undo puts the event back as it was (and Owen off it, since the plan put him there)
  r := casa_plan_undo(v_plan);
  select * into e from events where id = v_trip;
  if not e.all_day or e.start_time <> '2026-10-01T04:00:00Z' or e.location_name is not null or e.description <> 'From the school calendar' then raise exception 'FAIL 2 back %', row_to_json(e); end if;
  if v_owen is not null and exists (select 1 from event_members where event_id = v_trip and family_member_id = v_owen) then raise exception 'FAIL 2 Owen still on'; end if;
  if not exists (select 1 from jsonb_array_elements(r->'calendar') c where c.value->>'op' = 'updated' and c.value->>'event_id' = v_trip::text) then raise exception 'FAIL 2 google back'; end if;

  -- 3: someone already on it stays on it after Undo
  if v_owen is not null then
    insert into event_members (event_id, family_member_id) values (v_trip, v_owen);
    r := casa_plan_apply('ZZ again', jsonb_build_array(jsonb_build_object('id', 'i1', 'kind', 'event_details', 'event_id', v_trip, 'changes', jsonb_build_object('place', 'ZZ Hall', 'people', jsonb_build_array('Owen')))));
    r := casa_plan_undo((r->>'plan_id')::uuid);
    if not exists (select 1 from event_members where event_id = v_trip and family_member_id = v_owen) then raise exception 'FAIL 3 Owen taken off'; end if;
  end if;
  raise exception 'ALL PASSED';
end $$;
