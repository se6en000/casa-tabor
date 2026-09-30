-- Plan it with Casa, phase 4 (P3.25) against the real database, rolled back — nothing is kept.
-- Run: (echo 'begin;'; cat supabase/migrations/20260930120000_plan_changes.sql this; echo 'rollback;') | bash scripts/supabase-cli.sh db query --linked -f /dev/stdin
-- It ends with "ALL PASSED" (raised, so the transaction is thrown away) or the first "FAIL n".
do $$
declare v_parent uuid; v_scuba uuid; r jsonb; v_plan uuid; v_buy uuid; v_fit uuid; v_mask uuid; v_new uuid; v_ev uuid; v_grp_buy int; v_grp_new int; v_old_title text;
begin
  -- Liv's scuba diver, saved from a plan inside ZZ costumes: two steps (one dated), a shopping line, a timed event.
  select (public.todo_create_project('ZZ costumes', '[{"title":"ZZ ask"}]'::jsonb)->>'project_id')::uuid into v_parent;
  r := casa_plan_apply('ZZ scuba', jsonb_build_array(
    jsonb_build_object('id', 'i1', 'kind', 'project', 'title', 'ZZ Liv scuba diver', 'part_of_project_id', v_parent,
      'steps', jsonb_build_array(jsonb_build_object('title', 'ZZ buy the mask'), jsonb_build_object('title', 'ZZ fitting', 'cal_start', '2026-10-24'))),
    jsonb_build_object('id', 'i2', 'kind', 'shopping', 'name', 'ZZ snorkel mask'),
    jsonb_build_object('id', 'i3', 'kind', 'event', 'title', 'ZZ build the tank', 'start', '2026-10-17T18:00:00-04:00', 'end', '2026-10-17T20:00:00-04:00')));
  v_scuba := (select (value->>'project_id')::uuid from jsonb_array_elements(r->'links') where value->>'id' = 'i1');
  v_ev := (select (value->>'event_id')::uuid from jsonb_array_elements(r->'links') where value->>'id' = 'i3');
  select id into v_buy from todo_steps where project_id = v_scuba and title = 'ZZ buy the mask';
  select id into v_fit from todo_steps where project_id = v_scuba and title = 'ZZ fitting';

  -- 1: a change plan — move the fitting, give it to Kelly, add a step after "buy", remove nothing yet
  r := casa_plan_apply('ZZ changes', jsonb_build_array(
    jsonb_build_object('id', 'i1', 'kind', 'edit_step', 'project_id', v_scuba, 'step_id', v_fit, 'changes', jsonb_build_object('cal_start', '2026-10-25', 'who', 'Kelly')),
    jsonb_build_object('id', 'i2', 'kind', 'add_step', 'project_id', v_scuba, 'title', 'ZZ paint the tank', 'after_step_id', v_buy, 'changes', jsonb_build_object('minutes', 45))));
  v_plan := (r->>'plan_id')::uuid;
  if (select cal_start from todo_steps where id = v_fit) <> '2026-10-25' or (select who from todo_steps where id = v_fit) <> 'Kelly' then raise exception 'FAIL 1 edit'; end if;
  select id, grp into v_new, v_grp_new from todo_steps where project_id = v_scuba and title = 'ZZ paint the tank';
  select grp into v_grp_buy from todo_steps where id = v_buy;
  if v_new is null or v_grp_new <> v_grp_buy + 1 or (select minutes from todo_steps where id = v_new) <> 45 then raise exception 'FAIL 1 add % %', v_grp_new, v_grp_buy; end if;
  if (select count(*) from jsonb_array_elements(r->'calendar') c where c.value->>'op' = 'updated') < 1 then raise exception 'FAIL 1 calendar %', r->'calendar'; end if;
  -- 2: Undo puts the step back where and as it was, and the added one goes
  r := casa_plan_undo(v_plan);
  if (select cal_start from todo_steps where id = v_fit) <> '2026-10-24' or (select who from todo_steps where id = v_fit) is not null then raise exception 'FAIL 2 edit back'; end if;
  if exists (select 1 from todo_steps where id = v_new) then raise exception 'FAIL 2 added still there'; end if;

  -- 3: remove a step, then undo brings it back
  r := casa_plan_apply('ZZ remove', jsonb_build_array(jsonb_build_object('id', 'i1', 'kind', 'remove_step', 'project_id', v_scuba, 'step_id', v_fit)));
  if exists (select 1 from todo_steps where id = v_fit) then raise exception 'FAIL 3 not removed'; end if;
  r := casa_plan_undo((r->>'plan_id')::uuid);
  if not exists (select 1 from todo_steps where id = v_fit and cal_start = '2026-10-24') then raise exception 'FAIL 3 not back'; end if;

  -- 4: Liv changes her mind — close the scuba diver ("changed to Chucky") and add Chucky, one plan
  update grocery_items set checked = false where name = 'ZZ snorkel mask';
  r := casa_plan_apply('ZZ Chucky', jsonb_build_array(
    jsonb_build_object('id', 'i1', 'kind', 'close_project', 'project_id', v_scuba, 'reason', 'Changed to Chucky'),
    jsonb_build_object('id', 'i2', 'kind', 'project', 'title', 'ZZ Liv Chucky', 'part_of_project_id', v_parent, 'steps', jsonb_build_array(jsonb_build_object('title', 'ZZ buy overalls')))));
  v_plan := (r->>'plan_id')::uuid;
  if (select status from todo_projects where id = v_scuba) <> 'dropped' or (select closed_reason from todo_projects where id = v_scuba) <> 'Changed to Chucky' then raise exception 'FAIL 4 closed'; end if;
  if not exists (select 1 from todo_steps where project_id = v_parent and child_project_id = v_scuba and done_at is not null) then raise exception 'FAIL 4 closed row stays in the parent'; end if;
  if exists (select 1 from grocery_items where name = 'ZZ snorkel mask' and deleted_at is null) then raise exception 'FAIL 4 unbought line stays'; end if;
  if (select deleted_at from events where id = v_ev) is null then raise exception 'FAIL 4 future event stays'; end if;
  if exists (select 1 from events e join todo_steps s on s.cal_event_id = e.id where s.id = v_fit and e.deleted_at is null) then raise exception 'FAIL 4 step still on the calendar'; end if;
  if (select count(*) from jsonb_array_elements(r->'calendar') c where c.value->>'op' = 'deleted') < 2 then raise exception 'FAIL 4 google %', r->'calendar'; end if;
  -- 5: the closed project no longer holds the parent up; Chucky is inside it
  if not exists (select 1 from todo_steps s join todo_projects p on p.id = s.child_project_id where s.project_id = v_parent and p.title = 'ZZ Liv Chucky') then raise exception 'FAIL 5 chucky'; end if;
  -- 6: Undo reopens the scuba diver with its line, its event and its calendar entry, and Chucky goes
  r := casa_plan_undo(v_plan);
  if (select status from todo_projects where id = v_scuba) <> 'active' or (select closed_reason from todo_projects where id = v_scuba) is not null then raise exception 'FAIL 6 reopen'; end if;
  if not exists (select 1 from grocery_items where name = 'ZZ snorkel mask' and deleted_at is null) then raise exception 'FAIL 6 line'; end if;
  if (select deleted_at from events where id = v_ev) is not null then raise exception 'FAIL 6 event'; end if;
  if not exists (select 1 from events e join todo_steps s on s.cal_event_id = e.id where s.id = v_fit and e.deleted_at is null) then raise exception 'FAIL 6 step calendar'; end if;
  if not exists (select 1 from todo_steps where project_id = v_parent and child_project_id = v_scuba and done_at is null) then raise exception 'FAIL 6 open again in the parent'; end if;
  if exists (select 1 from todo_projects where title = 'ZZ Liv Chucky' and status <> 'dropped') then raise exception 'FAIL 6 chucky still there'; end if;
  -- 7: Reopen by hand, after a close
  r := casa_plan_apply('ZZ close again', jsonb_build_array(jsonb_build_object('id', 'i1', 'kind', 'close_project', 'project_id', v_scuba, 'reason', 'Changed to Chucky')));
  r := todo_project_reopen(v_scuba);
  if (select status from todo_projects where id = v_scuba) <> 'active' then raise exception 'FAIL 7'; end if;
  -- 8: a plain delete still takes the row out of its parent (unchanged)
  perform todo_project_edit(v_scuba, 'delete_project', '{}'::jsonb);
  perform todo_project_sync(v_scuba);
  if exists (select 1 from todo_steps where project_id = v_parent and child_project_id = v_scuba) then raise exception 'FAIL 8'; end if;
  raise exception 'ALL PASSED';
end $$;
