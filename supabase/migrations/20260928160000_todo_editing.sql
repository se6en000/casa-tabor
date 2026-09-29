-- Editing projects and to-dos by touch (FAMILY_WALL_PLAN.md P3.22 step 5; Jake 2026-09-28: "I need
-- the ability to tap into the projects and the reminders … to edit/modify/delete them … modify the
-- project steps, reorganize, delete steps … remove a time/date, add a time/date, change the title",
-- and "a goal/target date"). Server-side only; the `todos` function calls these.
--
-- One rule keeps his phone right: a project's first unfinished step owns the one reminder on his iOS
-- list ("Paint the house: Fix cracks"). After any change, todo_project_sync renames that reminder,
-- moves it to the step that is now first, creates it, or removes it when nothing is left.

create or replace function public.todo_project_sync(p_project uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_project record;
  v_current record;
  v_live record;
  v_event uuid;
  v_today timestamptz := (date_trunc('day', now() at time zone 'America/New_York') at time zone 'America/New_York');
begin
  select * into v_project from public.todo_projects where id = p_project;
  if not found then return; end if;
  select * into v_current from public.todo_steps where project_id = p_project and done_at is null order by position limit 1;
  -- The step that holds the live reminder now (if any).
  select s.id as step_id, e.id as event_id into v_live
  from public.todo_steps s join public.events e on e.id = s.reminder_event_id
  where s.project_id = p_project and e.deleted_at is null and e.status <> 'cancelled'
  limit 1;

  if v_project.status <> 'active' or v_current.id is null then
    -- Finished, dropped, or no steps left: no reminder on his list.
    if v_live.event_id is not null then
      update public.events set deleted_at = now(), purge_after = now() + interval '30 days', updated_at = now() where id = v_live.event_id;
      update public.todo_steps set reminder_event_id = null, updated_at = now() where id = v_live.step_id;
    end if;
    if v_project.status = 'active' and exists (select 1 from public.todo_steps where project_id = p_project) then
      update public.todo_projects set status = 'done', done_at = now(), updated_at = now() where id = p_project;
    end if;
    return;
  end if;

  if v_live.event_id is not null then
    v_event := v_live.event_id;
    if v_live.step_id <> v_current.id then
      update public.todo_steps set reminder_event_id = null, updated_at = now() where id = v_live.step_id;
    end if;
    update public.events set title = v_project.title || ': ' || v_current.title, updated_at = now()
      where id = v_event and title is distinct from v_project.title || ': ' || v_current.title;
  else
    insert into public.events (title, start_time, end_time, event_type, has_due_date, all_day)
    values (v_project.title || ': ' || v_current.title, v_today, v_today + interval '15 minutes', 'reminder', false, false)
    returning id into v_event;
  end if;
  update public.todo_steps set reminder_event_id = v_event, updated_at = now() where id = v_current.id;
  insert into public.todo_details (event_id, shape, minutes, cost_cents, project_id, sorted_by, sorted_at)
  values (v_event, 'project', v_current.minutes, v_current.cost_cents, p_project, 'jake', now())
  on conflict (event_id) do update
    set shape = 'project', minutes = excluded.minutes, cost_cents = excluded.cost_cents, project_id = excluded.project_id,
        next_step = null, suggestion = null, sorted_by = 'jake', updated_at = now();
end;
$$;

create or replace function public.todo_project_edit(p_project uuid, p_op text, p_args jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_step uuid := nullif(p_args->>'step_id', '')::uuid;
  v_title text := nullif(btrim(p_args->>'title'), '');
  v_pos integer;
  v_swap record;
  v_live uuid;
begin
  if not exists (select 1 from public.todo_projects where id = p_project) then raise exception 'That project is gone'; end if;

  if p_op = 'rename' then
    if v_title is null then raise exception 'A project needs a name'; end if;
    update public.todo_projects set title = v_title, updated_at = now() where id = p_project;

  elsif p_op = 'target' then
    -- The goal date (null clears it).
    update public.todo_projects set aim_date = nullif(p_args->>'date', '')::date, updated_at = now() where id = p_project;

  elsif p_op = 'add_step' then
    if v_title is null then raise exception 'A step needs a title'; end if;
    -- After a given step, or at the end.
    v_pos := coalesce((select position from public.todo_steps where id = v_step and project_id = p_project), (select max(position) from public.todo_steps where project_id = p_project), 0);
    update public.todo_steps set position = position + 1, updated_at = now() where project_id = p_project and position > v_pos;
    insert into public.todo_steps (project_id, position, title, minutes, cost_cents)
    values (p_project, v_pos + 1, v_title, nullif(p_args->>'minutes', '')::integer, nullif(p_args->>'cost_cents', '')::integer);

  elsif p_op = 'edit_step' then
    update public.todo_steps
      set title = coalesce(v_title, title),
          minutes = case when p_args ? 'minutes' then nullif(p_args->>'minutes', '')::integer else minutes end,
          cost_cents = case when p_args ? 'cost_cents' then nullif(p_args->>'cost_cents', '')::integer else cost_cents end,
          updated_at = now()
      where id = v_step and project_id = p_project;

  elsif p_op = 'move_step' then
    select position into v_pos from public.todo_steps where id = v_step and project_id = p_project;
    select id, position into v_swap from public.todo_steps
      where project_id = p_project and (case when p_args->>'dir' = 'up' then position < v_pos else position > v_pos end)
      order by case when p_args->>'dir' = 'up' then -position else position end limit 1;
    if v_swap.id is not null then
      update public.todo_steps set position = v_swap.position, updated_at = now() where id = v_step;
      update public.todo_steps set position = v_pos, updated_at = now() where id = v_swap.id;
    end if;

  elsif p_op = 'delete_step' then
    -- If it holds the reminder on his list, that reminder goes too; the sync gives the new first step one.
    select reminder_event_id into v_live from public.todo_steps where id = v_step and project_id = p_project;
    delete from public.todo_steps where id = v_step and project_id = p_project;
    if v_live is not null then
      update public.events set deleted_at = now(), purge_after = now() + interval '30 days', updated_at = now() where id = v_live and deleted_at is null;
    end if;

  elsif p_op = 'done_step' then
    -- The current step: complete its reminder, as a tick on his watch would (todo_advance_project
    -- then brings up the next). Any other step: just mark it done.
    select s.reminder_event_id into v_live from public.todo_steps s join public.events e on e.id = s.reminder_event_id
      where s.id = v_step and s.project_id = p_project and s.done_at is null and e.deleted_at is null and e.status <> 'cancelled';
    if v_live is not null then
      update public.events set status = 'cancelled', updated_at = now() where id = v_live;
    else
      update public.todo_steps set done_at = now(), updated_at = now() where id = v_step and project_id = p_project and done_at is null;
    end if;

  elsif p_op = 'undo_step' then
    update public.todo_steps set done_at = null, updated_at = now() where id = v_step and project_id = p_project;
    update public.todo_projects set status = 'active', done_at = null, updated_at = now() where id = p_project and status = 'done';

  elsif p_op = 'delete_project' then
    update public.todo_projects set status = 'dropped', updated_at = now() where id = p_project;

  else
    raise exception 'Unknown change: %', p_op;
  end if;

  perform public.todo_project_sync(p_project);
  return jsonb_build_object('ok', true);
end;
$$;

-- A single to-do: title; a date with a time, a date without one (5 PM, as his iOS sync stores it), or
-- no date at all (today, has_due_date false).
create or replace function public.todo_update(p_id uuid, p_patch jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_title text := nullif(btrim(p_patch->>'title'), '');
  v_due date := nullif(p_patch->>'due', '')::date;
  v_time time := nullif(p_patch->>'time', '')::time;
  v_start timestamptz;
begin
  if not exists (select 1 from public.events where id = p_id and event_type = 'reminder' and deleted_at is null) then
    raise exception 'That to-do is gone';
  end if;
  if v_title is not null then
    update public.events set title = v_title, updated_at = now() where id = p_id;
  end if;
  if p_patch ? 'due' then
    if v_due is null then
      v_start := date_trunc('day', now() at time zone 'America/New_York') at time zone 'America/New_York';
      update public.events set start_time = v_start, end_time = v_start + interval '15 minutes', has_due_date = false, updated_at = now() where id = p_id;
    else
      v_start := case when v_time is not null then (v_due + v_time) at time zone 'America/New_York'
                      else (v_due::timestamp + interval '17 hours') at time zone 'America/New_York' end;
      update public.events set start_time = v_start, end_time = v_start + interval '15 minutes', has_due_date = true, updated_at = now() where id = p_id;
    end if;
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

-- Delete a to-do (it leaves his iOS list too). A project step's reminder deletes that step instead.
create or replace function public.todo_delete(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_step record;
begin
  select id, project_id into v_step from public.todo_steps where reminder_event_id = p_id limit 1;
  if v_step.id is not null then
    delete from public.todo_steps where id = v_step.id;
    update public.events set deleted_at = now(), purge_after = now() + interval '30 days', updated_at = now() where id = p_id and deleted_at is null;
    perform public.todo_project_sync(v_step.project_id);
  else
    update public.events set deleted_at = now(), purge_after = now() + interval '30 days', updated_at = now()
      where id = p_id and event_type = 'reminder' and deleted_at is null;
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

revoke execute on function public.todo_project_sync(uuid) from public, anon, authenticated;
revoke execute on function public.todo_project_edit(uuid, text, jsonb) from public, anon, authenticated;
revoke execute on function public.todo_update(uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.todo_delete(uuid) from public, anon, authenticated;
