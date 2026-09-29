-- A step on the calendar (P3.23 step 2) against the real database, rolled back — nothing is kept.
-- Run: (echo begin; cat this; echo rollback;) | bash scripts/supabase-cli.sh db query --linked -f /dev/stdin
-- It ends with "ALL PASSED" (raised, so the transaction is thrown away) or the first "FAIL n".
do $$
declare v_p uuid; a uuid; b uuid; r jsonb; ev uuid; t text; s timestamptz; e timestamptz;
begin
  select (public.todo_create_project('ZZ cal paint', '[{"title":"painter"},{"title":"touch"}]'::jsonb)->>'project_id')::uuid into v_p;
  select id into a from todo_steps where project_id = v_p and title = 'painter';
  select id into b from todo_steps where project_id = v_p and title = 'touch';
  r := todo_project_edit_with_calendar(v_p, 'set_step', jsonb_build_object('step_id', a, 'cal_start', '2026-11-09', 'cal_end', '2026-11-13'));
  if r->'calendar'->0->>'op' <> 'created' then raise exception 'FAIL 1 %', r; end if;
  select cal_event_id into ev from todo_steps where id = a;
  select title, start_time, end_time into t, s, e from events where id = ev;
  if t <> 'ZZ cal paint: painter' or s <> '2026-11-09 00:00:00+00' or e <> '2026-11-13 23:59:59+00' then raise exception 'FAIL 2 % % %', t, s, e; end if;
  r := todo_project_edit_with_calendar(v_p, 'set_step', jsonb_build_object('step_id', a, 'cal_start', '2026-11-16'));
  if r->'calendar'->0->>'op' <> 'updated' or (select start_time from events where id = ev) <> '2026-11-16 00:00:00+00' or (select end_time from events where id = ev) <> '2026-11-20 23:59:59+00' then raise exception 'FAIL 3 %', r; end if;
  r := todo_project_edit_with_calendar(v_p, 'rename', '{"title":"ZZ cal house"}');
  if (select title from events where id = ev) <> 'ZZ cal house: painter' then raise exception 'FAIL 4'; end if;
  r := todo_project_edit_with_calendar(v_p, 'arrange', jsonb_build_object('groups', jsonb_build_array(jsonb_build_array(b), jsonb_build_array(a))));
  if jsonb_array_length(r->'calendar') <> 0 then raise exception 'FAIL 5 nothing should change %', r; end if;
  r := todo_project_edit_with_calendar(v_p, 'set_step', jsonb_build_object('step_id', a, 'cal_start', ''));
  if r->'calendar'->0->>'op' <> 'deleted' or (select deleted_at from events where id = ev) is null then raise exception 'FAIL 6 %', r; end if;
  r := todo_project_edit_with_calendar(v_p, 'set_step', jsonb_build_object('step_id', b, 'cal_start', '2026-11-20'));
  select cal_event_id into ev from todo_steps where id = b;
  r := todo_project_edit_with_calendar(v_p, 'delete_step', jsonb_build_object('step_id', b));
  if r->'calendar'->0->>'op' <> 'deleted' or (select deleted_at from events where id = ev) is null then raise exception 'FAIL 7 %', r; end if;
  raise exception 'ALL PASSED';
end $$;
