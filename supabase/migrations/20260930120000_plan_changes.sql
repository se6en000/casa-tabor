-- Plan it with Casa, phase 4 (FAMILY_WALL_PLAN.md P3.25): change a saved project by talking — a step
-- changed, added or removed, or the whole project replaced (Jake, 2026-09-29: "if Olive changes her
-- costume from scuba diver to Chucky, it will need the ability to completely redo the plan"). A
-- replaced project is closed with its reason, not deleted ("let's at least mark it … so we know it's
-- closed/not active"): it stays in its parent as a closed row, off every active list, and can be reopened.
-- Every change is kept with what it was, so Undo puts it all back.

alter table public.todo_projects add column if not exists closed_reason text;

create or replace function public.todo_project_sync(p_project uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_project record;
  v_step record;
  v_live uuid[];
  v_id uuid;
  v_event uuid;
  v_parent uuid;
  v_today timestamptz := (date_trunc('day', now() at time zone 'America/New_York') at time zone 'America/New_York');
begin
  select * into v_project from public.todo_projects where id = p_project;
  if not found then return; end if;

  -- Groups 1..n, positions 1..n in reading order.
  with ranked as (
    select id, dense_rank() over (order by grp) as g, row_number() over (order by grp, position) as pos
    from public.todo_steps where project_id = p_project
  )
  update public.todo_steps s set grp = r.g, position = r.pos, updated_at = now()
  from ranked r where s.id = r.id and (s.grp is distinct from r.g or s.position is distinct from r.pos);

  -- Paused until a day that has come: going again.
  if v_project.status = 'paused' and v_project.paused_until is not null
     and v_project.paused_until <= (now() at time zone 'America/New_York')::date then
    update public.todo_projects set status = 'active', paused_until = null, updated_at = now() where id = p_project;
    v_project.status := 'active';
  end if;

  if exists (select 1 from public.todo_steps where project_id = p_project) then
    if v_project.status = 'active' and not exists (select 1 from public.todo_steps where project_id = p_project and done_at is null) then
      update public.todo_projects set status = 'done', done_at = now(), updated_at = now() where id = p_project;
      v_project.status := 'done';
    elsif v_project.status = 'done' and exists (select 1 from public.todo_steps where project_id = p_project and done_at is null) then
      update public.todo_projects set status = 'active', done_at = null, updated_at = now() where id = p_project;
      v_project.status := 'active';
    end if;
  end if;

  v_live := public.todo_project_live_steps(p_project);

  -- Reminders on steps that aren't in Now any more leave his list (a ticked one stays ticked).
  for v_step in
    select s.id, s.reminder_event_id from public.todo_steps s
    where s.project_id = p_project and s.reminder_event_id is not null and not (s.id = any(v_live))
  loop
    update public.events set deleted_at = now(), purge_after = now() + interval '30 days', updated_at = now()
      where id = v_step.reminder_event_id and deleted_at is null and status <> 'cancelled';
    update public.todo_steps set reminder_event_id = null, updated_at = now() where id = v_step.id and done_at is null;
  end loop;

  -- Each step in Now has its reminder, named "Project: step".
  foreach v_id in array v_live loop
    select * into v_step from public.todo_steps where id = v_id;
    v_event := null;
    select e.id into v_event from public.events e where e.id = v_step.reminder_event_id and e.deleted_at is null and e.status <> 'cancelled';
    if v_event is null then
      insert into public.events (title, start_time, end_time, event_type, has_due_date, all_day)
      values (v_project.title || ': ' || v_step.title, v_today, v_today + interval '15 minutes', 'reminder', false, false)
      returning id into v_event;
      update public.todo_steps set reminder_event_id = v_event, updated_at = now() where id = v_id;
    else
      update public.events set title = v_project.title || ': ' || v_step.title, updated_at = now()
        where id = v_event and title is distinct from v_project.title || ': ' || v_step.title;
    end if;
    insert into public.todo_details (event_id, shape, minutes, cost_cents, project_id, sorted_by, sorted_at)
    values (v_event, 'project', v_step.minutes, v_step.cost_cents, p_project, 'jake', now())
    on conflict (event_id) do update
      set shape = 'project', minutes = excluded.minutes, cost_cents = excluded.cost_cents, project_id = excluded.project_id,
          next_step = null, suggestion = null, sorted_by = 'jake', updated_at = now();
  end loop;

  -- A project inside: its row in the parent is done when it is (dropped: the row goes), open when it's
  -- open again; the parent then moves on.
  for v_parent in select distinct project_id from public.todo_steps where child_project_id = p_project loop
    update public.todo_steps set title = v_project.title, updated_at = now()
      where project_id = v_parent and child_project_id = p_project and title is distinct from v_project.title;
    if v_project.status = 'dropped' and v_project.closed_reason is not null then
      -- Closed for a reason ("changed to Chucky", P3.25 phase 4): the row stays in the parent, closed,
      -- so it's clear what happened, and it no longer holds the parent up.
      update public.todo_steps set done_at = coalesce(done_at, now()), updated_at = now() where project_id = v_parent and child_project_id = p_project and done_at is null;
    elsif v_project.status = 'dropped' then
      delete from public.todo_steps where project_id = v_parent and child_project_id = p_project;
    elsif v_project.status = 'done' then
      update public.todo_steps set done_at = coalesce(done_at, now()), updated_at = now() where project_id = v_parent and child_project_id = p_project and done_at is null;
    else
      update public.todo_steps set done_at = null, updated_at = now() where project_id = v_parent and child_project_id = p_project and done_at is not null;
    end if;
    perform public.todo_project_sync(v_parent);
  end loop;
end;
$$;

-- Reopen a closed project (its page's Reopen): active again, its steps back on the calendar.
create or replace function public.todo_project_reopen(p_project uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_calendar jsonb;
begin
  update public.todo_projects set status = 'active', closed_reason = null, updated_at = now() where id = p_project and status = 'dropped';
  v_calendar := public.todo_project_calendar_sync(p_project);
  perform public.todo_project_sync(p_project);
  return jsonb_build_object('ok', true, 'calendar', v_calendar);
end;
$$;

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
  v_edited jsonb := '[]'::jsonb;
  v_added jsonb := '[]'::jsonb;
  v_removed jsonb := '[]'::jsonb;
  v_closed jsonb := '[]'::jsonb;
  v_pid uuid;
  v_sid uuid;
  v_row jsonb;
  v_res jsonb;
  v_groups jsonb;
  v_arr jsonb;
  v_g jsonb;
  v_found boolean;
  v_ids jsonb;
  v_rows jsonb;
  v_args jsonb;
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

    -- Changes to a saved project (P3.25 phase 4), each kept with what it was, for Undo.
    elsif v_item->>'kind' = 'edit_step' then
      v_pid := (v_item->>'project_id')::uuid; v_sid := (v_item->>'step_id')::uuid;
      select jsonb_build_object('title', title, 'who', who, 'minutes', minutes, 'cost_cents', cost_cents, 'cal_start', cal_start, 'cal_end', cal_end)
        into v_row from public.todo_steps where id = v_sid and project_id = v_pid;
      if v_row is null then raise exception 'That step is gone'; end if;
      v_args := jsonb_build_object('step_id', v_sid) || (v_item->'changes');
      v_res := public.todo_project_edit_with_calendar(v_pid, 'set_step', v_args);
      v_calendar := v_calendar || coalesce(v_res->'calendar', '[]'::jsonb);
      v_edited := v_edited || jsonb_build_object('project_id', v_pid, 'step_id', v_sid, 'before', v_row);
      v_links := v_links || jsonb_build_object('id', v_item->>'id', 'kind', 'edit_step', 'project_id', v_pid);

    elsif v_item->>'kind' = 'add_step' then
      v_pid := (v_item->>'project_id')::uuid;
      -- Where it goes: its own group right after the step named, else at the end.
      select jsonb_agg(g order by grp) into v_groups from (
        select grp, jsonb_agg(id::text order by position) as g from public.todo_steps where project_id = v_pid group by grp) x;
      v_arr := '[]'::jsonb; v_found := false;
      for v_g in select value from jsonb_array_elements(coalesce(v_groups, '[]'::jsonb)) loop
        v_arr := v_arr || jsonb_build_array(v_g);
        if not v_found and nullif(v_item->>'after_step_id', '') is not null and v_g ? (v_item->>'after_step_id') then
          v_arr := v_arr || jsonb_build_array(jsonb_build_array('@new')); v_found := true;
        end if;
      end loop;
      if not v_found then v_arr := v_arr || jsonb_build_array(jsonb_build_array('@new')); end if;
      v_res := public.todo_project_edit_with_calendar(v_pid, 'add_step', jsonb_build_object('title', v_item->>'title', 'arrange', v_arr));
      v_sid := (v_res->>'step_id')::uuid;
      if (v_item->'changes') is not null and v_item->'changes' <> '{}'::jsonb then
        v_res := public.todo_project_edit_with_calendar(v_pid, 'set_step', jsonb_build_object('step_id', v_sid) || (v_item->'changes'));
      end if;
      v_calendar := v_calendar || coalesce(v_res->'calendar', '[]'::jsonb);
      v_added := v_added || jsonb_build_object('project_id', v_pid, 'step_id', v_sid);
      v_links := v_links || jsonb_build_object('id', v_item->>'id', 'kind', 'add_step', 'project_id', v_pid);

    elsif v_item->>'kind' = 'remove_step' then
      v_pid := (v_item->>'project_id')::uuid; v_sid := (v_item->>'step_id')::uuid;
      select to_jsonb(s) into v_row from public.todo_steps s where s.id = v_sid and s.project_id = v_pid and s.child_project_id is null;
      if v_row is null then raise exception 'That step is gone'; end if;
      v_res := public.todo_project_edit_with_calendar(v_pid, 'delete_step', jsonb_build_object('step_id', v_sid));
      v_calendar := v_calendar || coalesce(v_res->'calendar', '[]'::jsonb);
      v_removed := v_removed || jsonb_build_object('project_id', v_pid, 'row', v_row);
      v_links := v_links || jsonb_build_object('id', v_item->>'id', 'kind', 'remove_step', 'project_id', v_pid);

    elsif v_item->>'kind' = 'close_project' then
      -- Replaced ("changed to Chucky"): closed with its reason, not deleted. What its plans made that
      -- isn't bought, packed or past comes off; what's done stays.
      v_pid := (v_item->>'project_id')::uuid;
      select jsonb_build_object('project_id', id, 'status', status) into v_row from public.todo_projects where id = v_pid;
      if v_row is null then raise exception 'That project is gone'; end if;
      update public.todo_projects set status = 'dropped', closed_reason = coalesce(nullif(btrim(v_item->>'reason'), ''), 'Closed'), updated_at = now() where id = v_pid;
      with p as (select made from public.casa_plans where made->'projects' ? v_pid::text),
      g as (update public.grocery_items set deleted_at = now()
            where id in (select jsonb_array_elements_text(p.made->'grocery')::uuid from p) and not checked and deleted_at is null returning id)
      select coalesce(jsonb_agg(id), '[]'::jsonb) into v_ids from g;
      v_row := v_row || jsonb_build_object('grocery', v_ids);
      with p as (select made from public.casa_plans where made->'projects' ? v_pid::text),
      e as (update public.events set deleted_at = now(), purge_after = now() + interval '30 days', updated_at = now()
            where id in (select jsonb_array_elements_text(p.made->'events')::uuid from p) and start_time > now() and deleted_at is null returning id)
      select coalesce(jsonb_agg(id), '[]'::jsonb) into v_ids from e;
      v_row := v_row || jsonb_build_object('events', v_ids);
      v_calendar := v_calendar || coalesce((select jsonb_agg(jsonb_build_object('op', 'deleted', 'event_id', x)) from jsonb_array_elements_text(v_ids) x), '[]'::jsonb);
      with p as (select made from public.casa_plans where made->'projects' ? v_pid::text),
      c as (delete from public.event_checklist_items
            where id in (select jsonb_array_elements_text(p.made->'checklist')::uuid from p) and not checked returning to_jsonb(event_checklist_items) as r)
      select coalesce(jsonb_agg(r), '[]'::jsonb) into v_rows from c;
      v_row := v_row || jsonb_build_object('checklist', v_rows);
      v_calendar := v_calendar || public.todo_project_calendar_sync(v_pid);
      perform public.todo_project_sync(v_pid);
      v_closed := v_closed || v_row;
      v_links := v_links || jsonb_build_object('id', v_item->>'id', 'kind', 'close_project', 'project_id', v_pid);

    else
      raise exception 'Unknown plan item: %', v_item->>'kind';
    end if;
  end loop;

  update public.casa_plans set made = jsonb_build_object(
    'projects', v_projects, 'events', v_events, 'todos', v_todos, 'grocery', v_grocery,
    'checklist', v_checklist, 'ticked', v_ticked,
    'edited', v_edited, 'added_steps', v_added, 'removed_steps', v_removed, 'closed', v_closed)
  where id = v_plan;

  return jsonb_build_object('plan_id', v_plan, 'undo_until', v_until, 'links', v_links, 'calendar', v_calendar);
end;
$$;

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
  v_x jsonb;
  v_res jsonb;
begin
  select * into v from public.casa_plans where id = p_plan for update;
  if not found then raise exception 'That plan is gone'; end if;
  if v.status = 'undone' then return jsonb_build_object('ok', true, 'calendar', '[]'::jsonb); end if;
  if now() > v.undo_until then raise exception 'It''s too late to undo the whole plan. Change each thing where it lives.'; end if;

  -- Changes to saved projects (P3.25 phase 4), back as they were.
  for v_x in select value from jsonb_array_elements(coalesce(v.made->'closed', '[]'::jsonb)) loop
    update public.todo_projects set status = v_x->>'status', closed_reason = null, updated_at = now() where id = (v_x->>'project_id')::uuid;
    update public.grocery_items set deleted_at = null where id in (select jsonb_array_elements_text(v_x->'grocery')::uuid);
    update public.events set deleted_at = null, purge_after = null, updated_at = now() where id in (select jsonb_array_elements_text(v_x->'events')::uuid);
    v_calendar := v_calendar || coalesce((select jsonb_agg(jsonb_build_object('op', 'created', 'event_id', x)) from jsonb_array_elements_text(v_x->'events') x), '[]'::jsonb);
    insert into public.event_checklist_items select * from jsonb_populate_recordset(null::public.event_checklist_items, v_x->'checklist') on conflict do nothing;
    v_calendar := v_calendar || public.todo_project_calendar_sync((v_x->>'project_id')::uuid);
    perform public.todo_project_sync((v_x->>'project_id')::uuid);
  end loop;
  for v_x in select value from jsonb_array_elements(coalesce(v.made->'removed_steps', '[]'::jsonb)) loop
    insert into public.todo_steps select * from jsonb_populate_record(null::public.todo_steps, (v_x->'row') || jsonb_build_object('cal_event_id', null, 'reminder_event_id', null)) on conflict do nothing;
    v_calendar := v_calendar || public.todo_project_calendar_sync((v_x->>'project_id')::uuid);
    perform public.todo_project_sync((v_x->>'project_id')::uuid);
  end loop;
  for v_x in select value from jsonb_array_elements(coalesce(v.made->'added_steps', '[]'::jsonb)) loop
    v_res := public.todo_project_edit_with_calendar((v_x->>'project_id')::uuid, 'delete_step', jsonb_build_object('step_id', v_x->>'step_id'));
    v_calendar := v_calendar || coalesce(v_res->'calendar', '[]'::jsonb);
  end loop;
  for v_x in select value from jsonb_array_elements(coalesce(v.made->'edited', '[]'::jsonb)) loop
    v_res := public.todo_project_edit_with_calendar((v_x->>'project_id')::uuid, 'set_step', jsonb_build_object(
      'step_id', v_x->>'step_id', 'title', v_x->'before'->>'title', 'who', coalesce(v_x->'before'->>'who', ''),
      'minutes', coalesce(v_x->'before'->>'minutes', ''), 'cost_cents', coalesce(v_x->'before'->>'cost_cents', ''),
      'cal_start', coalesce(v_x->'before'->>'cal_start', ''), 'cal_end', coalesce(v_x->'before'->>'cal_end', '')));
    v_calendar := v_calendar || coalesce(v_res->'calendar', '[]'::jsonb);
  end loop;

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

revoke execute on function public.todo_project_reopen(uuid) from public, anon, authenticated;
revoke execute on function public.casa_plan_apply(text, jsonb, jsonb, text) from public, anon, authenticated;
revoke execute on function public.casa_plan_undo(uuid) from public, anon, authenticated;
