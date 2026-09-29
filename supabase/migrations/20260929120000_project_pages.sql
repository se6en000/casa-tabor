-- Projects, your way (FAMILY_WALL_PLAN.md P3.23, canvas rows 10–11, approved by Jake 2026-09-29: "all
-- good to build, approved"). Three places, one job each: the project page (steps, their order, every
-- step's details), Project settings (the same screen for every project), and Coming up (dated things).
--
-- The order: top to bottom is the order, and steps that can happen side by side share a group (`grp`);
-- the "Then" lines on the page separate groups. The first group with anything left is "Now".
-- His phone: a project's Now group puts one reminder on his iOS list ("Paint the house: pick colours"),
-- or all of Now ("everything in Now", for Christmas lights' side-by-side steps), or nothing.
-- A project inside a project (Stucco cracks inside Paint the house) is a row in the parent's list
-- (`child_project_id`): it runs its own steps, and the parent's later groups wait for it. One level deep.

alter table public.todo_steps
  add column if not exists grp integer,
  add column if not exists who text,
  add column if not exists fits text[] not null default '{}',
  add column if not exists repeat_minutes integer check (repeat_minutes is null or repeat_minutes > 0),
  add column if not exists repeat_count integer check (repeat_count is null or repeat_count > 0),
  add column if not exists repeat_unit text,
  add column if not exists notes text,
  add column if not exists cal_start date,
  add column if not exists cal_end date,
  add column if not exists shop_item text,
  add column if not exists child_project_id uuid references public.todo_projects(id) on delete set null;
-- Until now every step stood alone, in order.
update public.todo_steps set grp = position where grp is null;
create index if not exists todo_steps_child_project_id_idx on public.todo_steps (child_project_id);

alter table public.todo_projects
  add column if not exists aim_firm boolean not null default false,
  add column if not exists budget_cents integer check (budget_cents is null or budget_cents >= 0),
  -- Who does what: [{ "name": "Gomez Painting", "role": "Painter", "contact": "(561) 555-0142" }].
  -- A step's "who" picks from these names.
  add column if not exists people jsonb not null default '[{"name":"Me"},{"name":"Kelly"}]'::jsonb,
  add column if not exists phone text not null default 'next',
  add column if not exists yearly boolean not null default false,
  add column if not exists season_id text,
  add column if not exists paused_until date;
alter table public.todo_projects drop constraint if exists todo_projects_phone_check;
alter table public.todo_projects add constraint todo_projects_phone_check check (phone in ('next', 'now', 'none'));
alter table public.todo_projects drop constraint if exists todo_projects_status_check;
alter table public.todo_projects add constraint todo_projects_status_check check (status in ('active', 'paused', 'done', 'dropped'));

-- A step added without a group (todo_create_project, older paths) stands alone at the end.
create or replace function public.todo_step_default_grp()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if new.grp is null then
    new.grp := coalesce((select max(grp) from public.todo_steps where project_id = new.project_id), 0) + 1;
  end if;
  return new;
end;
$$;
drop trigger if exists todo_steps_default_grp on public.todo_steps;
create trigger todo_steps_default_grp before insert on public.todo_steps for each row execute function public.todo_step_default_grp();

-- The steps that hold a reminder on his list right now: Now's first step, all of Now, or none.
-- A project inside is never one of them (it has its own).
create or replace function public.todo_project_live_steps(p_project uuid)
returns uuid[]
language sql
stable
security definer
set search_path to 'public'
as $$
  with p as (select status, phone from public.todo_projects where id = p_project),
  now_grp as (select min(grp) as g from public.todo_steps where project_id = p_project and done_at is null),
  candidates as (
    select s.id, s.position from public.todo_steps s, now_grp
    where s.project_id = p_project and s.done_at is null and s.child_project_id is null and s.grp = now_grp.g
  )
  select coalesce(case
    when (select status from p) <> 'active' or (select phone from p) = 'none' then '{}'::uuid[]
    when (select phone from p) = 'now' then (select array_agg(id order by position) from candidates)
    else (select array_agg(id) from (select id from candidates order by position limit 1) first_one)
  end, '{}'::uuid[]);
$$;

-- Keeps everything true after any change: groups numbered 1..n with positions in order; the project
-- done when nothing is left (and open again when something is); his reminders matching Now; and a
-- project inside telling its parent when it finishes.
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
    if v_project.status = 'dropped' then
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

-- The order, as the page shows it: [[step ids side by side], [the next group], …] top to bottom.
-- '@new' stands for a step just added (p_new). Steps not listed keep their order, after the rest.
create or replace function public.todo_project_arrange(p_project uuid, p_groups jsonb, p_new uuid default null)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_group jsonb;
  v_sid text;
  v_gi integer := 0;
  v_pos integer := 0;
  v_seen uuid[] := '{}';
  v_id uuid;
  v_rest record;
begin
  if jsonb_typeof(p_groups) <> 'array' then raise exception 'The order must be a list of groups'; end if;
  for v_group in select value from jsonb_array_elements(p_groups) loop
    if jsonb_typeof(v_group) <> 'array' or jsonb_array_length(v_group) = 0 then continue; end if;
    v_gi := v_gi + 1;
    for v_sid in select value from jsonb_array_elements_text(v_group) loop
      v_id := case when v_sid = '@new' then p_new else v_sid::uuid end;
      if v_id is null or v_id = any(v_seen) then continue; end if;
      v_pos := v_pos + 1;
      update public.todo_steps set grp = v_gi, position = v_pos, updated_at = now() where id = v_id and project_id = p_project;
      v_seen := v_seen || v_id;
    end loop;
  end loop;
  for v_rest in select id from public.todo_steps where project_id = p_project and not (id = any(v_seen)) order by grp, position loop
    v_gi := v_gi + 1;
    v_pos := v_pos + 1;
    update public.todo_steps set grp = v_gi, position = v_pos, updated_at = now() where id = v_rest.id;
  end loop;
end;
$$;

-- One level deep: a project inside can't hold projects, and a project holding one can't go inside.
create or replace function public.todo_project_can_nest(p_parent uuid, p_child uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select p_parent <> p_child
    and not exists (select 1 from public.todo_steps where child_project_id = p_parent)
    and not exists (select 1 from public.todo_steps where project_id = p_child and child_project_id is not null)
    and not exists (select 1 from public.todo_steps where child_project_id = p_child and project_id <> p_parent);
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
  v_new uuid;
  v_child uuid;
  v_live uuid;
  v_row record;
  v_swap record;
  v_pos integer;
  v_minutes integer;
  v_result jsonb := jsonb_build_object('ok', true);
begin
  if not exists (select 1 from public.todo_projects where id = p_project) then raise exception 'That project is gone'; end if;

  if p_op = 'rename' then
    if v_title is null then raise exception 'A project needs a name'; end if;
    update public.todo_projects set title = v_title, updated_at = now() where id = p_project;

  elsif p_op = 'target' then
    update public.todo_projects set aim_date = nullif(p_args->>'date', '')::date, updated_at = now() where id = p_project;

  elsif p_op = 'settings' then
    -- Project settings: only the keys given change.
    update public.todo_projects set
      aim_date = case when p_args ? 'aim_date' then nullif(p_args->>'aim_date', '')::date else aim_date end,
      aim_firm = case when p_args ? 'aim_firm' then coalesce((p_args->>'aim_firm')::boolean, false) else aim_firm end,
      budget_cents = case when p_args ? 'budget_cents' then nullif(p_args->>'budget_cents', '')::integer else budget_cents end,
      people = case when jsonb_typeof(p_args->'people') = 'array' then p_args->'people' else people end,
      phone = case when p_args ? 'phone' then p_args->>'phone' else phone end,
      yearly = case when p_args ? 'yearly' then coalesce((p_args->>'yearly')::boolean, false) else yearly end,
      notes = case when p_args ? 'notes' then nullif(btrim(p_args->>'notes'), '') else notes end,
      updated_at = now()
    where id = p_project;

  elsif p_op = 'status' then
    -- Going, paused (until a day), done, or dropped.
    if p_args->>'status' not in ('active', 'paused', 'done', 'dropped') then raise exception 'Unknown status'; end if;
    update public.todo_projects set status = p_args->>'status',
      paused_until = case when p_args->>'status' = 'paused' then nullif(p_args->>'until', '')::date else null end,
      done_at = case when p_args->>'status' = 'done' then now() else null end,
      updated_at = now()
    where id = p_project;
    if p_args->>'status' = 'done' then
      update public.todo_steps set done_at = now(), updated_at = now() where project_id = p_project and done_at is null;
    end if;

  elsif p_op = 'add_step' then
    -- Where it goes: `arrange` with '@new' in its place (a Then line's "+ Add here", "Split it up"),
    -- or a group of its own at the end.
    if v_title is null then raise exception 'A step needs a title'; end if;
    insert into public.todo_steps (project_id, position, title, grp, minutes)
    values (p_project, 100000, v_title, 100000, nullif(p_args->>'minutes', '')::integer)
    returning id into v_new;
    if jsonb_typeof(p_args->'arrange') = 'array' then perform public.todo_project_arrange(p_project, p_args->'arrange', v_new); end if;
    v_result := v_result || jsonb_build_object('step_id', v_new);

  elsif p_op = 'add_child' then
    -- A project inside this one: a new one by title, or one he already has.
    v_child := nullif(p_args->>'project_id', '')::uuid;
    if v_child is null then
      if v_title is null then raise exception 'A project needs a name'; end if;
      insert into public.todo_projects (title) values (v_title) returning id into v_child;
    elsif not public.todo_project_can_nest(p_project, v_child) then
      raise exception 'Only one level: that project can''t go inside this one';
    end if;
    if exists (select 1 from public.todo_steps where child_project_id = p_project) then
      raise exception 'Only one level: this project is already inside another';
    end if;
    insert into public.todo_steps (project_id, position, title, grp, child_project_id, done_at)
    select p_project, 100000, p.title, 100000, p.id, case when p.status = 'done' then now() end
    from public.todo_projects p where p.id = v_child
    returning id into v_new;
    if jsonb_typeof(p_args->'arrange') = 'array' then perform public.todo_project_arrange(p_project, p_args->'arrange', v_new); end if;
    v_result := v_result || jsonb_build_object('step_id', v_new, 'project_id', v_child);

  elsif p_op = 'take_out' then
    -- A project inside stands on its own again; the parent stops waiting for it.
    delete from public.todo_steps where id = v_step and project_id = p_project and child_project_id is not null;

  elsif p_op = 'part_of' then
    -- Settings' "Part of": put this project inside another (at the end of its plan), or on its own.
    for v_row in select distinct project_id from public.todo_steps where child_project_id = p_project loop
      delete from public.todo_steps where child_project_id = p_project and project_id = v_row.project_id;
      perform public.todo_project_sync(v_row.project_id);
    end loop;
    if nullif(p_args->>'parent_id', '') is not null then
      if not public.todo_project_can_nest((p_args->>'parent_id')::uuid, p_project) then
        raise exception 'Only one level: it can''t go inside that project';
      end if;
      insert into public.todo_steps (project_id, position, title, grp, child_project_id)
      select (p_args->>'parent_id')::uuid, 100000, p.title, 100000, p.id from public.todo_projects p where p.id = p_project;
      perform public.todo_project_sync((p_args->>'parent_id')::uuid);
    end if;

  elsif p_op = 'arrange' then
    perform public.todo_project_arrange(p_project, p_args->'groups', null);

  elsif p_op in ('set_step', 'edit_step') then
    -- A step's details: only the keys given change. "The same job, many times" sets the effort too.
    select * into v_row from public.todo_steps where id = v_step and project_id = p_project;
    if not found then raise exception 'That step is gone'; end if;
    v_minutes := case
      when p_args ? 'repeat_minutes' and p_args ? 'repeat_count' and nullif(p_args->>'repeat_minutes', '') is not null and nullif(p_args->>'repeat_count', '') is not null
        then (p_args->>'repeat_minutes')::integer * (p_args->>'repeat_count')::integer
      when p_args ? 'minutes' then nullif(p_args->>'minutes', '')::integer
      else v_row.minutes end;
    update public.todo_steps set
      title = coalesce(v_title, title),
      minutes = v_minutes,
      cost_cents = case when p_args ? 'cost_cents' then nullif(p_args->>'cost_cents', '')::integer else cost_cents end,
      who = case when p_args ? 'who' then nullif(btrim(p_args->>'who'), '') else who end,
      fits = case when jsonb_typeof(p_args->'fits') = 'array' then array(select jsonb_array_elements_text(p_args->'fits')) else fits end,
      repeat_minutes = case when p_args ? 'repeat_minutes' then nullif(p_args->>'repeat_minutes', '')::integer else repeat_minutes end,
      repeat_count = case when p_args ? 'repeat_count' then nullif(p_args->>'repeat_count', '')::integer else repeat_count end,
      repeat_unit = case when p_args ? 'repeat_unit' then nullif(btrim(p_args->>'repeat_unit'), '') else repeat_unit end,
      notes = case when p_args ? 'notes' then nullif(btrim(p_args->>'notes'), '') else notes end,
      cal_start = case when p_args ? 'cal_start' then nullif(p_args->>'cal_start', '')::date else cal_start end,
      cal_end = case when p_args ? 'cal_end' then nullif(p_args->>'cal_end', '')::date
                     when p_args ? 'cal_start' and nullif(p_args->>'cal_start', '') is null then null else cal_end end,
      shop_item = case when p_args ? 'shop_item' then nullif(btrim(p_args->>'shop_item'), '') else shop_item end,
      updated_at = now()
    where id = v_step;
    -- On the shopping list: back on it if it's there, otherwise a new line. Off: an unticked line Casa
    -- added comes off again.
    if p_args ? 'shop_item' then
      if nullif(btrim(p_args->>'shop_item'), '') is not null then
        if exists (select 1 from public.grocery_items where lower(name) = lower(btrim(p_args->>'shop_item'))) then
          update public.grocery_items set checked = false, deleted_at = null, last_modified_source = 'casa', updated_at = now()
            where id = (select id from public.grocery_items where lower(name) = lower(btrim(p_args->>'shop_item')) limit 1);
        else
          insert into public.grocery_items (name, last_modified_source) values (btrim(p_args->>'shop_item'), 'casa');
        end if;
      elsif v_row.shop_item is not null then
        update public.grocery_items set deleted_at = now(), updated_at = now()
          where lower(name) = lower(v_row.shop_item) and checked = false and deleted_at is null and last_modified_source = 'casa';
      end if;
    end if;

  elsif p_op = 'move_to' then
    -- A step into another project (at the end of its plan).
    if nullif(p_args->>'project_id', '') is null or not exists (select 1 from public.todo_projects where id = (p_args->>'project_id')::uuid) then
      raise exception 'That project is gone';
    end if;
    select reminder_event_id into v_live from public.todo_steps where id = v_step and project_id = p_project;
    update public.todo_steps set project_id = (p_args->>'project_id')::uuid, grp = 100000, position = 100000, reminder_event_id = null, updated_at = now()
      where id = v_step and project_id = p_project and child_project_id is null;
    if v_live is not null then
      update public.events set deleted_at = now(), purge_after = now() + interval '30 days', updated_at = now() where id = v_live and deleted_at is null and status <> 'cancelled';
    end if;
    perform public.todo_project_sync((p_args->>'project_id')::uuid);

  elsif p_op = 'move_step' then
    -- ↑ / ↓ (the page sends `arrange` itself; this stays for anything older): swap with the neighbour.
    select position, grp into v_row from public.todo_steps where id = v_step and project_id = p_project;
    select id, position, grp into v_swap from public.todo_steps
      where project_id = p_project and (case when p_args->>'dir' = 'up' then position < v_row.position else position > v_row.position end)
      order by case when p_args->>'dir' = 'up' then -position else position end limit 1;
    if v_swap.id is not null then
      update public.todo_steps set position = v_swap.position, grp = v_swap.grp, updated_at = now() where id = v_step;
      update public.todo_steps set position = v_row.position, grp = v_row.grp, updated_at = now() where id = v_swap.id;
    end if;

  elsif p_op = 'delete_step' then
    select reminder_event_id into v_live from public.todo_steps where id = v_step and project_id = p_project;
    delete from public.todo_steps where id = v_step and project_id = p_project;
    if v_live is not null then
      update public.events set deleted_at = now(), purge_after = now() + interval '30 days', updated_at = now() where id = v_live and deleted_at is null and status <> 'cancelled';
    end if;

  elsif p_op = 'done_step' then
    -- A step with a live reminder: complete the reminder, as a tick on his watch would (the trigger
    -- marks the step and moves on). Otherwise just mark it. A project inside finishes by its own steps.
    select s.reminder_event_id into v_live from public.todo_steps s join public.events e on e.id = s.reminder_event_id
      where s.id = v_step and s.project_id = p_project and s.done_at is null and e.deleted_at is null and e.status <> 'cancelled';
    if v_live is not null then
      update public.events set status = 'cancelled', updated_at = now() where id = v_live;
    else
      update public.todo_steps set done_at = now(), updated_at = now() where id = v_step and project_id = p_project and done_at is null and child_project_id is null;
    end if;

  elsif p_op = 'undo_step' then
    update public.todo_steps set done_at = null, updated_at = now() where id = v_step and project_id = p_project and child_project_id is null;

  elsif p_op = 'delete_project' then
    update public.todo_projects set status = 'dropped', updated_at = now() where id = p_project;

  else
    raise exception 'Unknown change: %', p_op;
  end if;

  perform public.todo_project_sync(p_project);
  return v_result;
end;
$$;

-- A step's reminder ticked off anywhere (the wall, his watch, the Reminders sync): the step is done and
-- the project moves on — the next group becomes Now when this one is finished.
create or replace function public.todo_advance_project()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_step record;
begin
  if not (new.status = 'cancelled' and old.status is distinct from 'cancelled' and new.event_type = 'reminder') then
    return new;
  end if;
  select * into v_step from public.todo_steps where reminder_event_id = new.id and done_at is null limit 1;
  if not found then return new; end if;
  update public.todo_steps set done_at = now(), updated_at = now() where id = v_step.id;
  perform public.todo_project_sync(v_step.project_id);
  return new;
end;
$$;

-- New projects list who's on them: Jake and Kelly to start.
update public.todo_projects set people = '[{"name":"Me"},{"name":"Kelly"}]'::jsonb where people = '[]'::jsonb;

revoke execute on function public.todo_project_live_steps(uuid) from public, anon, authenticated;
revoke execute on function public.todo_project_sync(uuid) from public, anon, authenticated;
revoke execute on function public.todo_project_arrange(uuid, jsonb, uuid) from public, anon, authenticated;
revoke execute on function public.todo_project_can_nest(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.todo_project_edit(uuid, text, jsonb) from public, anon, authenticated;
