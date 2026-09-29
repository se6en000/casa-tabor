-- Plan it with Casa (FAMILY_WALL_PLAN.md P3.25 phase 3; canvas 12c/12d, approved by Jake 2026-09-29):
-- a plan talked through with Casa is saved with one Agree — in one transaction, so it all saves or
-- none of it does — and the whole plan can be undone until the end of the next day.
--
-- A plan's items (normalized by the edge function; each has an "id" for the ticks on the card):
--   project   {title, aim_date?, part_of_project_id?, steps: [{title, minutes?, cost_cents?, who?, cal_start?, cal_end?}]}
--   tick_step {project_id, step_id}               a saved step this settles ("Ask the kids" → done)
--   event     {title, start, end}                 timed, ISO with offset
--   todo      {title, due?}
--   shopping  {name}
--   pack      {label, event_id? | event_ref?}     on a saved event, or on an event of this plan
-- `made` keeps every row it created, for Undo.

create table if not exists public.casa_plans (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  status text not null default 'saved' check (status in ('saved', 'undone')),
  items jsonb not null,
  skipped jsonb not null default '[]'::jsonb,
  made jsonb not null default '{}'::jsonb,
  surface text,
  created_at timestamptz not null default now(),
  undo_until timestamptz not null,
  undone_at timestamptz
);
alter table public.casa_plans enable row level security;

create or replace function public.casa_plan_apply(p_title text, p_items jsonb, p_skip jsonb default '[]'::jsonb, p_surface text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_plan uuid;
  v_item jsonb;
  v_step jsonb;
  v_ord integer;
  v_project uuid;
  v_step_id uuid;
  v_id uuid;
  v_event uuid;
  v_list uuid;
  v_refs jsonb := '{}'::jsonb;
  v_projects jsonb := '[]'::jsonb;
  v_events jsonb := '[]'::jsonb;
  v_todos jsonb := '[]'::jsonb;
  v_grocery jsonb := '[]'::jsonb;
  v_checklist jsonb := '[]'::jsonb;
  v_ticked jsonb := '[]'::jsonb;
  v_calendar jsonb := '[]'::jsonb;
  v_links jsonb := '[]'::jsonb;
  v_skip jsonb := coalesce(p_skip, '[]'::jsonb);
  v_today date := (now() at time zone 'America/New_York')::date;
  v_until timestamptz := ((v_today + 2)::timestamp at time zone 'America/New_York');
begin
  if nullif(btrim(p_title), '') is null then raise exception 'A plan needs a name'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'A plan needs something in it'; end if;

  insert into public.casa_plans (title, items, skipped, surface, undo_until)
  values (btrim(p_title), p_items, v_skip, p_surface, v_until)
  returning id into v_plan;

  for v_item in select value from jsonb_array_elements(p_items) loop
    continue when v_skip ? (v_item->>'id');
    -- A pack line for an event of this plan that was left out: nothing to pack for.
    continue when v_item->>'kind' = 'pack' and v_skip ? coalesce(v_item->>'event_ref', '');

    if v_item->>'kind' = 'project' then
      v_project := (public.todo_create_project(v_item->>'title', v_item->'steps', nullif(v_item->>'aim_date', '')::date)->>'project_id')::uuid;
      for v_step, v_ord in select value, ordinality from jsonb_array_elements(v_item->'steps') with ordinality loop
        select id into v_step_id from public.todo_steps where project_id = v_project and position = v_ord;
        if v_step_id is not null and (v_step ? 'who' or v_step ? 'cal_start') then
          perform public.todo_project_edit(v_project, 'set_step',
            jsonb_strip_nulls(jsonb_build_object('step_id', v_step_id, 'who', v_step->>'who', 'cal_start', v_step->>'cal_start', 'cal_end', v_step->>'cal_end')));
        end if;
      end loop;
      if nullif(v_item->>'part_of_project_id', '') is not null then
        perform public.todo_project_edit(v_project, 'part_of', jsonb_build_object('parent_id', v_item->>'part_of_project_id'));
      end if;
      v_calendar := v_calendar || public.todo_project_calendar_sync(v_project);
      v_projects := v_projects || to_jsonb(v_project);
      v_links := v_links || jsonb_build_object('id', v_item->>'id', 'kind', 'project', 'project_id', v_project);

    elsif v_item->>'kind' = 'tick_step' then
      perform public.todo_project_edit((v_item->>'project_id')::uuid, 'done_step', jsonb_build_object('step_id', v_item->>'step_id'));
      v_ticked := v_ticked || jsonb_build_object('project_id', v_item->>'project_id', 'step_id', v_item->>'step_id');
      v_links := v_links || jsonb_build_object('id', v_item->>'id', 'kind', 'tick_step', 'project_id', v_item->>'project_id');

    elsif v_item->>'kind' = 'event' then
      insert into public.events (title, start_time, end_time, all_day, event_type, description)
      values (btrim(v_item->>'title'), (v_item->>'start')::timestamptz, (v_item->>'end')::timestamptz, false, 'event', 'Casa · planned: ' || btrim(p_title))
      returning id into v_event;
      v_refs := v_refs || jsonb_build_object(v_item->>'id', v_event);
      v_events := v_events || to_jsonb(v_event);
      v_calendar := v_calendar || jsonb_build_array(jsonb_build_object('op', 'created', 'event_id', v_event));
      v_links := v_links || jsonb_build_object('id', v_item->>'id', 'kind', 'event', 'event_id', v_event, 'start', v_item->>'start');

    elsif v_item->>'kind' = 'todo' then
      v_id := public.todo_add(v_item->>'title', nullif(v_item->>'due', '')::date);
      v_todos := v_todos || to_jsonb(v_id);
      v_links := v_links || jsonb_build_object('id', v_item->>'id', 'kind', 'todo', 'event_id', v_id);

    elsif v_item->>'kind' = 'shopping' then
      if v_list is null then select id into v_list from public.grocery_lists order by created_at limit 1; end if;
      if v_list is null then raise exception 'No grocery list found'; end if;
      -- Already on the list, unticked: leave it (nothing new to undo).
      if not exists (select 1 from public.grocery_items where list_id = v_list and lower(name) = lower(btrim(v_item->>'name')) and not checked and deleted_at is null) then
        insert into public.grocery_items (list_id, name, category, checked, last_modified_source)
        values (v_list, btrim(v_item->>'name'), 'other', false, 'casa')
        returning id into v_id;
        v_grocery := v_grocery || to_jsonb(v_id);
      end if;
      v_links := v_links || jsonb_build_object('id', v_item->>'id', 'kind', 'shopping');

    elsif v_item->>'kind' = 'pack' then
      v_event := coalesce(nullif(v_item->>'event_id', '')::uuid, nullif(v_refs->>(v_item->>'event_ref'), '')::uuid);
      if v_event is null then raise exception 'A pack line needs its event'; end if;
      insert into public.event_checklist_items (event_id, label, sort_order)
      values (v_event, btrim(v_item->>'label'), coalesce((select max(sort_order) + 1 from public.event_checklist_items where event_id = v_event), 0))
      returning id into v_id;
      v_checklist := v_checklist || to_jsonb(v_id);
      v_links := v_links || jsonb_build_object('id', v_item->>'id', 'kind', 'pack', 'event_id', v_event);

    else
      raise exception 'Unknown plan item: %', v_item->>'kind';
    end if;
  end loop;

  update public.casa_plans set made = jsonb_build_object(
    'projects', v_projects, 'events', v_events, 'todos', v_todos, 'grocery', v_grocery,
    'checklist', v_checklist, 'ticked', v_ticked)
  where id = v_plan;

  return jsonb_build_object('plan_id', v_plan, 'undo_until', v_until, 'links', v_links, 'calendar', v_calendar);
end;
$$;

-- Undo the whole plan (until the end of the next day): everything it made comes off, what it ticked
-- is unticked. Google follows through the returned calendar changes.
create or replace function public.casa_plan_undo(p_plan uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v public.casa_plans%rowtype;
  v_id text;
  v_tick jsonb;
  v_parent uuid;
  v_calendar jsonb := '[]'::jsonb;
begin
  select * into v from public.casa_plans where id = p_plan for update;
  if not found then raise exception 'That plan is gone'; end if;
  if v.status = 'undone' then return jsonb_build_object('ok', true, 'calendar', '[]'::jsonb); end if;
  if now() > v.undo_until then raise exception 'It''s too late to undo the whole plan. Change each thing where it lives.'; end if;

  for v_id in select jsonb_array_elements_text(coalesce(v.made->'projects', '[]'::jsonb)) loop
    for v_parent in select project_id from public.todo_steps where child_project_id = v_id::uuid loop
      delete from public.todo_steps where child_project_id = v_id::uuid and project_id = v_parent;
      perform public.todo_project_sync(v_parent);
    end loop;
    update public.events set deleted_at = now(), purge_after = now() + interval '30 days', updated_at = now()
      where id in (select reminder_event_id from public.todo_steps where project_id = v_id::uuid and reminder_event_id is not null) and deleted_at is null;
    perform public.todo_project_edit(v_id::uuid, 'delete_project', '{}'::jsonb);
    v_calendar := v_calendar || public.todo_project_calendar_sync(v_id::uuid);
  end loop;

  for v_tick in select value from jsonb_array_elements(coalesce(v.made->'ticked', '[]'::jsonb)) loop
    perform public.todo_project_edit((v_tick->>'project_id')::uuid, 'undo_step', jsonb_build_object('step_id', v_tick->>'step_id'));
    perform public.todo_project_sync((v_tick->>'project_id')::uuid);
  end loop;

  for v_id in select jsonb_array_elements_text(coalesce(v.made->'events', '[]'::jsonb)) loop
    update public.events set deleted_at = now(), purge_after = now() + interval '30 days', updated_at = now() where id = v_id::uuid and deleted_at is null;
    v_calendar := v_calendar || jsonb_build_array(jsonb_build_object('op', 'deleted', 'event_id', v_id));
  end loop;

  update public.events set deleted_at = now(), purge_after = now() + interval '30 days', updated_at = now()
    where id in (select jsonb_array_elements_text(coalesce(v.made->'todos', '[]'::jsonb))::uuid) and deleted_at is null;
  update public.grocery_items set deleted_at = now()
    where id in (select jsonb_array_elements_text(coalesce(v.made->'grocery', '[]'::jsonb))::uuid) and deleted_at is null;
  delete from public.event_checklist_items
    where id in (select jsonb_array_elements_text(coalesce(v.made->'checklist', '[]'::jsonb))::uuid);

  update public.casa_plans set status = 'undone', undone_at = now() where id = p_plan;
  return jsonb_build_object('ok', true, 'calendar', v_calendar);
end;
$$;

revoke execute on function public.casa_plan_apply(text, jsonb, jsonb, text) from public, anon, authenticated;
revoke execute on function public.casa_plan_undo(uuid) from public, anon, authenticated;
