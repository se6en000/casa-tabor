-- Plan it with Casa (P3.25 phase 3) against the real database, rolled back — nothing is kept.
-- Run: (echo begin; cat supabase/migrations/20260930100000_casa_plans.sql this; echo rollback;) | bash scripts/supabase-cli.sh db query --linked -f /dev/stdin
-- It ends with "ALL PASSED" (raised, so the transaction is thrown away) or the first "FAIL n".
do $$
declare v_parent uuid; v_ask uuid; r jsonb; v_plan uuid; v_child uuid; v_ev uuid; n integer; v_step uuid; v_cal jsonb;
begin
  -- His saved Halloween costumes project, with "Ask the kids" as its first step.
  select (public.todo_create_project('ZZ plan costumes', '[{"title":"ZZ ask the kids"},{"title":"ZZ buy"}]'::jsonb)->>'project_id')::uuid into v_parent;
  select id into v_ask from todo_steps where project_id = v_parent and title = 'ZZ ask the kids';

  r := casa_plan_apply('ZZ jellyfish', jsonb_build_array(
    jsonb_build_object('id', 'i1', 'kind', 'project', 'title', 'ZZ Emme jellyfish', 'part_of_project_id', v_parent,
      'steps', jsonb_build_array(
        jsonb_build_object('title', 'ZZ buy the parts', 'minutes', 30, 'cost_cents', 4500),
        jsonb_build_object('title', 'ZZ build night', 'minutes', 120, 'who', 'Jake + Emme', 'cal_start', '2026-10-17'),
        jsonb_build_object('title', 'ZZ try on', 'cal_start', '2026-10-25'))),
    jsonb_build_object('id', 'i2', 'kind', 'tick_step', 'project_id', v_parent, 'step_id', v_ask),
    jsonb_build_object('id', 'i3', 'kind', 'event', 'title', 'ZZ trick or treat', 'start', '2026-10-31T18:00:00-04:00', 'end', '2026-10-31T20:00:00-04:00'),
    jsonb_build_object('id', 'i4', 'kind', 'shopping', 'name', 'ZZ clear dome umbrella'),
    jsonb_build_object('id', 'i5', 'kind', 'todo', 'title', 'ZZ charge the fairy lights'),
    jsonb_build_object('id', 'i6', 'kind', 'pack', 'label', 'ZZ spare AA batteries', 'event_ref', 'i3'),
    jsonb_build_object('id', 'i7', 'kind', 'shopping', 'name', 'ZZ skipped line')
  ), '["i7"]'::jsonb, 'wall');
  v_plan := (r->>'plan_id')::uuid;

  -- 1: the project, inside his, with its steps, who and dates
  v_child := (select (value->>'project_id')::uuid from jsonb_array_elements(r->'links') where value->>'id' = 'i1');
  if (select count(*) from todo_steps where project_id = v_child) <> 3 then raise exception 'FAIL 1 steps'; end if;
  if not exists (select 1 from todo_steps where project_id = v_parent and child_project_id = v_child) then raise exception 'FAIL 1 not inside'; end if;
  select id into v_step from todo_steps where project_id = v_child and title = 'ZZ build night';
  if (select who from todo_steps where id = v_step) <> 'Jake + Emme' or (select cal_start from todo_steps where id = v_step) <> '2026-10-17' then raise exception 'FAIL 1 details'; end if;
  -- 2: the dated steps are on the calendar (two), and the plan's event too — all for Google
  if (select count(*) from jsonb_array_elements(r->'calendar') c where c.value->>'op' = 'created') <> 3 then raise exception 'FAIL 2 %', r->'calendar'; end if;
  -- 3: "Ask the kids" is ticked
  if (select done_at from todo_steps where id = v_ask) is null then raise exception 'FAIL 3'; end if;
  -- 4: the event, the pack line on it, the shopping line, the to-do; the skipped line isn't there
  v_ev := (select (value->>'event_id')::uuid from jsonb_array_elements(r->'links') where value->>'id' = 'i3');
  if not exists (select 1 from event_checklist_items where event_id = v_ev and label = 'ZZ spare AA batteries') then raise exception 'FAIL 4 pack'; end if;
  if not exists (select 1 from grocery_items where name = 'ZZ clear dome umbrella' and deleted_at is null) then raise exception 'FAIL 4 shopping'; end if;
  if exists (select 1 from grocery_items where name = 'ZZ skipped line') then raise exception 'FAIL 4 skipped'; end if;
  if not exists (select 1 from events where title = 'ZZ charge the fairy lights' and event_type = 'reminder' and deleted_at is null) then raise exception 'FAIL 4 todo'; end if;
  -- 5: all or nothing — a bad item and nothing of the plan is kept
  begin
    perform casa_plan_apply('ZZ broken', '[{"id":"i1","kind":"shopping","name":"ZZ half saved"},{"id":"i2","kind":"pack","label":"ZZ nowhere"}]'::jsonb);
    raise exception 'FAIL 5 no error';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
  if exists (select 1 from grocery_items where name = 'ZZ half saved') then raise exception 'FAIL 5 half saved'; end if;

  -- 6: Undo takes it all back, and Google hears about each event
  r := casa_plan_undo(v_plan);
  if (select status from todo_projects where id = v_child) <> 'dropped' then raise exception 'FAIL 6 project'; end if;
  if exists (select 1 from todo_steps where project_id = v_parent and child_project_id = v_child) then raise exception 'FAIL 6 still inside'; end if;
  if (select done_at from todo_steps where id = v_ask) is not null then raise exception 'FAIL 6 tick'; end if;
  if (select deleted_at from events where id = v_ev) is null then raise exception 'FAIL 6 event'; end if;
  if exists (select 1 from event_checklist_items where event_id = v_ev) then raise exception 'FAIL 6 pack'; end if;
  if exists (select 1 from grocery_items where name = 'ZZ clear dome umbrella' and deleted_at is null) then raise exception 'FAIL 6 shopping'; end if;
  if exists (select 1 from events where title = 'ZZ charge the fairy lights' and deleted_at is null) then raise exception 'FAIL 6 todo'; end if;
  if (select count(*) from jsonb_array_elements(r->'calendar') c where c.value->>'op' = 'deleted') <> 3 then raise exception 'FAIL 6 calendar %', r->'calendar'; end if;
  -- 7: undone once is enough; too late is refused
  r := casa_plan_undo(v_plan);
  if r->>'ok' <> 'true' then raise exception 'FAIL 7'; end if;
  update casa_plans set status = 'saved', undo_until = now() - interval '1 minute' where id = v_plan;
  begin
    perform casa_plan_undo(v_plan);
    raise exception 'FAIL 7 too late allowed';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
  -- 8: an event left out takes its pack line with it (no error, nothing half saved)
  r := casa_plan_apply('ZZ left out', '[{"id":"i1","kind":"event","title":"ZZ skipped event","start":"2026-10-31T18:00:00-04:00","end":"2026-10-31T19:00:00-04:00"},{"id":"i2","kind":"pack","label":"ZZ orphan","event_ref":"i1"},{"id":"i3","kind":"shopping","name":"ZZ kept line"}]'::jsonb, '["i1"]'::jsonb);
  if exists (select 1 from events where title = 'ZZ skipped event') or exists (select 1 from event_checklist_items where label = 'ZZ orphan') or not exists (select 1 from grocery_items where name = 'ZZ kept line') then raise exception 'FAIL 8'; end if;
  raise exception 'ALL PASSED';
end $$;
