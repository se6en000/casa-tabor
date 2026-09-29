-- A project step on the calendar (FAMILY_WALL_PLAN.md P3.23 step 2, canvas 10c/10e): a step with dates
-- ("The painter: Nov 9 – 13") is a real all-day event on the family calendar, "Paint the house: The
-- painter …", kept in step with the step — moved when its dates change, renamed with it, and taken off
-- when its dates are cleared, the step is deleted or moved away, or the project is dropped. The `todos`
-- function then tells Google (create / update / delete), as the assistant does for its own events.

alter table public.todo_steps
  add column if not exists cal_event_id uuid references public.events(id) on delete set null;
create index if not exists todo_steps_cal_event_id_idx on public.todo_steps (cal_event_id);

-- Moving a step's start carries its end along (Nov 9–13 moved to start Nov 16 is Nov 16–20), unless
-- the end was changed in the same breath.
create or replace function public.todo_step_keep_length()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if new.cal_start is distinct from old.cal_start and old.cal_start is not null and new.cal_start is not null
     and old.cal_end is not null and new.cal_end is not distinct from old.cal_end then
    new.cal_end := old.cal_end + (new.cal_start - old.cal_start);
  end if;
  if new.cal_end is not null and new.cal_start is not null and new.cal_end < new.cal_start then
    new.cal_end := null;
  end if;
  return new;
end;
$$;
drop trigger if exists todo_steps_keep_length on public.todo_steps;
create trigger todo_steps_keep_length before update of cal_start, cal_end on public.todo_steps for each row execute function public.todo_step_keep_length();

-- Brings one project's calendar events in line with its steps; returns what changed:
-- [{ "op": "created" | "updated" | "deleted", "event_id": … }].
create or replace function public.todo_project_calendar_sync(p_project uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_project record;
  v_step record;
  v_event record;
  v_id uuid;
  v_title text;
  v_start timestamptz;
  v_end timestamptz;
  v_changes jsonb := '[]'::jsonb;
begin
  select * into v_project from public.todo_projects where id = p_project;
  if not found then return v_changes; end if;
  for v_step in select * from public.todo_steps where project_id = p_project and child_project_id is null loop
    select id, title, start_time, end_time into v_event from public.events where id = v_step.cal_event_id and deleted_at is null;
    if v_step.cal_start is null or v_project.status = 'dropped' then
      -- Off the calendar.
      if v_event.id is not null then
        update public.events set deleted_at = now(), purge_after = now() + interval '30 days', updated_at = now() where id = v_event.id;
        v_changes := v_changes || jsonb_build_object('op', 'deleted', 'event_id', v_event.id);
      end if;
      if v_step.cal_event_id is not null then
        update public.todo_steps set cal_event_id = null, updated_at = now() where id = v_step.id;
      end if;
      continue;
    end if;
    -- All day, as Casa stores them: the first day at midnight to the last at 23:59:59.
    v_title := v_project.title || ': ' || v_step.title;
    v_start := (v_step.cal_start::timestamp) at time zone 'UTC';
    v_end := (greatest(coalesce(v_step.cal_end, v_step.cal_start), v_step.cal_start)::timestamp + interval '23 hours 59 minutes 59 seconds') at time zone 'UTC';
    if v_event.id is null then
      insert into public.events (title, start_time, end_time, all_day, event_type, description)
      values (v_title, v_start, v_end, true, 'event', 'Casa · a step of ' || v_project.title)
      returning id into v_id;
      update public.todo_steps set cal_event_id = v_id, updated_at = now() where id = v_step.id;
      v_changes := v_changes || jsonb_build_object('op', 'created', 'event_id', v_id);
    elsif v_event.title is distinct from v_title or v_event.start_time is distinct from v_start or v_event.end_time is distinct from v_end then
      update public.events set title = v_title, start_time = v_start, end_time = v_end, updated_at = now() where id = v_event.id;
      v_changes := v_changes || jsonb_build_object('op', 'updated', 'event_id', v_event.id);
    end if;
  end loop;
  return v_changes;
end;
$$;

-- A step leaving its project (deleted, or moved to another) takes its calendar event with it first.
create or replace function public.todo_step_calendar_off(p_step uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_event uuid;
begin
  select e.id into v_event from public.todo_steps s join public.events e on e.id = s.cal_event_id where s.id = p_step and e.deleted_at is null;
  if v_event is null then return '[]'::jsonb; end if;
  update public.events set deleted_at = now(), purge_after = now() + interval '30 days', updated_at = now() where id = v_event;
  update public.todo_steps set cal_event_id = null, updated_at = now() where id = p_step;
  return jsonb_build_array(jsonb_build_object('op', 'deleted', 'event_id', v_event));
end;
$$;

-- Every change on the page keeps the calendar in step too, and says what changed so Google can follow.
create or replace function public.todo_project_edit_with_calendar(p_project uuid, p_op text, p_args jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_changes jsonb := '[]'::jsonb;
  v_result jsonb;
  v_step uuid := nullif(p_args->>'step_id', '')::uuid;
begin
  if p_op in ('delete_step', 'move_to') and v_step is not null then
    v_changes := public.todo_step_calendar_off(v_step);
  end if;
  v_result := public.todo_project_edit(p_project, p_op, p_args);
  v_changes := v_changes || public.todo_project_calendar_sync(p_project);
  return v_result || jsonb_build_object('calendar', v_changes);
end;
$$;

revoke execute on function public.todo_project_calendar_sync(uuid) from public, anon, authenticated;
revoke execute on function public.todo_step_calendar_off(uuid) from public, anon, authenticated;
revoke execute on function public.todo_project_edit_with_calendar(uuid, text, jsonb) from public, anon, authenticated;
