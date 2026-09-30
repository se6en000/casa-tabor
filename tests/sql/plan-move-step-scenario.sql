-- "Move the painter after the stucco" (P3.25 step 4) against the real database, rolled back.
-- Run: (echo 'begin;'; cat supabase/migrations/20261001200000_plan_move_step.sql this; echo 'rollback;') | bash scripts/supabase-cli.sh db query --linked -f /dev/stdin
do $$
declare v_p uuid; v_quotes uuid; v_painter uuid; v_stucco uuid; v_paint uuid; r jsonb; v_plan uuid;
  order_of text;
begin
  select (public.todo_create_project('ZZ paint the house', '[{"title":"ZZ quotes"},{"title":"ZZ hire the painter"},{"title":"ZZ fix the stucco"},{"title":"ZZ paint"}]'::jsonb)->>'project_id')::uuid into v_p;
  select id into v_quotes from todo_steps where project_id = v_p and title = 'ZZ quotes';
  select id into v_painter from todo_steps where project_id = v_p and title = 'ZZ hire the painter';
  select id into v_stucco from todo_steps where project_id = v_p and title = 'ZZ fix the stucco';
  select id into v_paint from todo_steps where project_id = v_p and title = 'ZZ paint';

  -- 1: the painter after the stucco
  r := casa_plan_apply('ZZ order', jsonb_build_array(jsonb_build_object('id', 'i1', 'kind', 'move_step', 'project_id', v_p, 'step_id', v_painter, 'after_step_id', v_stucco)));
  v_plan := (r->>'plan_id')::uuid;
  select string_agg(replace(title, 'ZZ ', ''), ' > ' order by grp, position) into order_of from todo_steps where project_id = v_p;
  if order_of <> 'quotes > fix the stucco > hire the painter > paint' then raise exception 'FAIL 1 order: %', order_of; end if;
  if (select grp from todo_steps where id = v_painter) = (select grp from todo_steps where id = v_stucco) then raise exception 'FAIL 1 its own group'; end if;

  -- 2: Undo puts the order back
  r := casa_plan_undo(v_plan);
  select string_agg(replace(title, 'ZZ ', ''), ' > ' order by grp, position) into order_of from todo_steps where project_id = v_p;
  if order_of <> 'quotes > hire the painter > fix the stucco > paint' then raise exception 'FAIL 2 undo: %', order_of; end if;

  -- 3: no step named → first
  r := casa_plan_apply('ZZ first', jsonb_build_array(jsonb_build_object('id', 'i1', 'kind', 'move_step', 'project_id', v_p, 'step_id', v_paint)));
  select string_agg(replace(title, 'ZZ ', ''), ' > ' order by grp, position) into order_of from todo_steps where project_id = v_p;
  if order_of <> 'paint > quotes > hire the painter > fix the stucco' then raise exception 'FAIL 3 first: %', order_of; end if;

  -- 4: a step that isn't in the project is refused (nothing half-done)
  begin
    r := casa_plan_apply('ZZ bad', jsonb_build_array(jsonb_build_object('id', 'i1', 'kind', 'move_step', 'project_id', v_p, 'step_id', gen_random_uuid(), 'after_step_id', v_quotes)));
    raise exception 'FAIL 4 accepted';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
  end;
  raise exception 'ALL PASSED';
end $$;
