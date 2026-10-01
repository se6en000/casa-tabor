-- Saving one of a person's routines replaces only that routine's rows; saving the Work routine read from plain
-- "Working hours" rows replaces them. Against the real database, rolled back.
-- Run: (echo 'begin;'; cat supabase/migrations/20261001260000_casa_routine_save.sql this; echo 'rollback;') | bash scripts/supabase-cli.sh db query --linked -f /dev/stdin
do $$
declare
  v_m uuid;
  v_main text := '{"type":"family_routine","title":"School","venueName":"ZZ School","venueAddress":"","dropoffDriverName":"Jake","pickupDriverName":"Kelly","enabled":true}';
  v_class text := '{"type":"family_routine","key":"class-1","routineType":"custom","title":"Piano","venueName":"ZZ Piano","venueAddress":"","dropoffDriverName":"Jake","pickupDriverName":"Jake","enabled":true}';
  v_n int; r jsonb;
begin
  insert into family_members (name, role, sort_order, color_hex, color_name) values ('ZZ Person', 'child', 99, '#000000', 'Black') returning id into v_m;
  insert into member_availability_rules (member_id, day_of_week, start_local, end_local, availability_type, reason)
    values (v_m, 1, '08:00', '15:00', 'unavailable', v_main), (v_m, 2, '08:00', '15:00', 'unavailable', v_main),
           (v_m, 3, '09:00', '17:00', 'unavailable', 'Working hours'), (v_m, 4, '09:00', '17:00', 'unavailable', 'Working hours'),
           (v_m, 5, '10:00', '11:00', 'available', 'ZZ free');

  -- 1. Add a class: the school rows stay.
  r := casa_routine_save(v_m, 'class-1', jsonb_build_array(jsonb_build_object('day_of_week', 3, 'start_local', '16:00', 'end_local', '17:00', 'reason', v_class)));
  if (r->>'removed')::int <> 0 or (r->>'added')::int <> 1 then raise exception 'FAIL 1 add class %', r; end if;
  select count(*) into v_n from member_availability_rules where member_id = v_m and casa_routine_payload(reason)->>'title' = 'School';
  if v_n <> 2 then raise exception 'FAIL 1 school kept: %', v_n; end if;

  -- 2. Save the main (keyless older rows): only they are replaced; the class stays.
  r := casa_routine_save(v_m, 'main', jsonb_build_array(jsonb_build_object('day_of_week', 1, 'start_local', '07:35', 'end_local', '14:00', 'reason', v_main)));
  if (r->>'removed')::int <> 2 then raise exception 'FAIL 2 main replaced %', r; end if;
  if not exists (select 1 from member_availability_rules where member_id = v_m and casa_routine_payload(reason)->>'key' = 'class-1') then raise exception 'FAIL 2 class kept'; end if;

  -- 3. Save the Work routine: the plain working-hours rows go; the "available" row and the others stay.
  r := casa_routine_save(v_m, 'work-hours', jsonb_build_array(jsonb_build_object('day_of_week', 3, 'start_local', '09:00', 'end_local', '18:00', 'reason', '{"type":"family_routine","key":"work-hours","routineType":"work","title":"Work","venueName":"","venueAddress":"","dropoffDriverName":"","pickupDriverName":"","enabled":true}')));
  if (r->>'removed')::int <> 2 then raise exception 'FAIL 3 plain hours replaced %', r; end if;
  select count(*) into v_n from member_availability_rules where member_id = v_m;
  if v_n <> 4 then raise exception 'FAIL 3 rows left: %', v_n; end if;

  -- 4. Removing a routine is saving it with no rows.
  r := casa_routine_save(v_m, 'class-1', '[]'::jsonb);
  if (r->>'removed')::int <> 1 or (r->>'added')::int <> 0 then raise exception 'FAIL 4 remove %', r; end if;

  -- 5. A reason that isn't JSON never breaks it.
  if casa_routine_payload('{not json') is not null or casa_routine_payload(null) is not null then raise exception 'FAIL 5 payload'; end if;

  raise exception 'ALL PASSED';
end $$;
