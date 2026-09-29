-- Projects on the to-do list (FAMILY_WALL_PLAN.md P3.22; Jake 2026-09-28: "I'd like Casa to handle a
-- natural way of adding a large project to the to-do list"). A project is created in one go: the
-- project, its ordered steps, and the first step as a reminder — so his iOS "To Do" list shows one
-- next move per project ("Paint the house: get 3 quotes"). Ticking the current step anywhere (the wall,
-- his watch, via the Reminders sync) brings up the next, and the last one finishes the project.

create or replace function public.todo_create_project(p_title text, p_steps jsonb, p_aim_date date default null, p_from_event_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_title text := nullif(btrim(p_title), '');
  v_project uuid;
  v_first record;
  v_event uuid;
  v_today timestamptz := (date_trunc('day', now() at time zone 'America/New_York') at time zone 'America/New_York');
begin
  if v_title is null then raise exception 'A project needs a title'; end if;
  if jsonb_typeof(p_steps) <> 'array' or jsonb_array_length(p_steps) = 0 then raise exception 'A project needs at least one step'; end if;

  insert into public.todo_projects (title, aim_date, origin_event_id)
  values (v_title, p_aim_date, p_from_event_id)
  returning id into v_project;

  insert into public.todo_steps (project_id, position, title, minutes, cost_cents)
  select v_project, s.ord::integer, btrim(s.value->>'title'),
         nullif(s.value->>'minutes', '')::integer, nullif(s.value->>'cost_cents', '')::integer
  from jsonb_array_elements(p_steps) with ordinality as s(value, ord)
  where nullif(btrim(s.value->>'title'), '') is not null;

  select * into v_first from public.todo_steps where project_id = v_project order by position limit 1;

  -- Grown from the reminder he already captured ("Paint the house" from his watch), rather than a
  -- duplicate: that reminder becomes the first step.
  if p_from_event_id is not null then
    update public.events
      set title = v_title || ': ' || v_first.title, status = 'confirmed', updated_at = now()
      where id = p_from_event_id and event_type = 'reminder' and deleted_at is null
      returning id into v_event;
  end if;
  if v_event is null then
    insert into public.events (title, start_time, end_time, event_type, has_due_date, all_day)
    values (v_title || ': ' || v_first.title, v_today, v_today + interval '15 minutes', 'reminder', false, false)
    returning id into v_event;
  end if;

  update public.todo_steps set reminder_event_id = v_event, updated_at = now() where id = v_first.id;
  insert into public.todo_details (event_id, shape, minutes, cost_cents, project_id, sorted_by, sorted_at)
  values (v_event, 'project', v_first.minutes, v_first.cost_cents, v_project, 'jake', now())
  on conflict (event_id) do update
    set shape = 'project', minutes = excluded.minutes, cost_cents = excluded.cost_cents, next_step = null,
        project_id = excluded.project_id, suggestion = null, sorted_by = 'jake', sorted_at = now(), updated_at = now();

  return jsonb_build_object('project_id', v_project, 'first_event_id', v_event, 'steps', (select count(*) from public.todo_steps where project_id = v_project));
end;
$$;

revoke execute on function public.todo_create_project(text, jsonb, date, uuid) from public, anon, authenticated;

-- A step's reminder ticked off (the app marks a done to-do 'cancelled'): that step is done, and the
-- next one becomes the reminder; after the last, the project is done.
create or replace function public.todo_advance_project()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_step record;
  v_next record;
  v_project record;
  v_event uuid;
  v_today timestamptz := (date_trunc('day', now() at time zone 'America/New_York') at time zone 'America/New_York');
begin
  if not (new.status = 'cancelled' and old.status is distinct from 'cancelled' and new.event_type = 'reminder') then
    return new;
  end if;
  select * into v_step from public.todo_steps where reminder_event_id = new.id and done_at is null limit 1;
  if not found then return new; end if;

  update public.todo_steps set done_at = now(), updated_at = now() where id = v_step.id;
  select * into v_project from public.todo_projects where id = v_step.project_id;
  select * into v_next from public.todo_steps
    where project_id = v_step.project_id and done_at is null and position > v_step.position
    order by position limit 1;

  if found then
    insert into public.events (title, start_time, end_time, event_type, has_due_date, all_day)
    values (v_project.title || ': ' || v_next.title, v_today, v_today + interval '15 minutes', 'reminder', false, false)
    returning id into v_event;
    update public.todo_steps set reminder_event_id = v_event, updated_at = now() where id = v_next.id;
    insert into public.todo_details (event_id, shape, minutes, cost_cents, project_id, sorted_by, sorted_at)
    values (v_event, 'project', v_next.minutes, v_next.cost_cents, v_project.id, 'jake', now());
  else
    update public.todo_projects set status = 'done', done_at = now(), updated_at = now() where id = v_project.id;
  end if;
  return new;
end;
$$;

drop trigger if exists todo_step_done_advances on public.events;
create trigger todo_step_done_advances
  after update of status on public.events
  for each row
  execute function public.todo_advance_project();
