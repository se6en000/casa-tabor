-- The seasons arrive as projects (FAMILY_WALL_PLAN.md P3.23 step 2, canvas 11c): this year's Christmas
-- lights, Halloween decorations … as a project due the day they're for. Next year starts from this year's
-- — the steps, their order, who does what, his own times — so each season gets easier. The first year
-- uses Casa's starter plan (from the `coming-up` function), and only when Jake taps Start it; later
-- years start by themselves on the start date (p_auto: only when there's a last year to start from).

create or replace function public.todo_start_season(
  p_season text, p_year integer, p_title text, p_target date, p_template jsonb default '[]'::jsonb, p_auto boolean default false
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_key text := p_season || ':' || p_year;
  v_id uuid;
  v_last record;
begin
  -- Already started this year.
  select id into v_id from public.todo_projects where season_id = v_key and status <> 'dropped' order by created_at desc limit 1;
  if v_id is not null then return v_id; end if;

  -- Last time's project, the newest.
  select * into v_last from public.todo_projects
    where season_id like p_season || ':%' and season_id <> v_key
    order by created_at desc limit 1;
  if v_last.id is null and p_auto then return null; end if;

  insert into public.todo_projects (title, aim_date, aim_firm, budget_cents, people, phone, yearly, season_id)
  values (
    coalesce(v_last.title, p_title), p_target, coalesce(v_last.aim_firm, true), v_last.budget_cents,
    coalesce(v_last.people, '[{"name":"Me"},{"name":"Kelly"}]'::jsonb), coalesce(v_last.phone, 'next'), true, v_key
  )
  returning id into v_id;

  if v_last.id is not null then
    insert into public.todo_steps (project_id, position, grp, title, minutes, cost_cents, who, fits, repeat_minutes, repeat_count, repeat_unit, notes)
    select v_id, position, grp, title, minutes, cost_cents, who, fits, repeat_minutes, repeat_count, repeat_unit, notes
    from public.todo_steps where project_id = v_last.id and child_project_id is null;
  else
    insert into public.todo_steps (project_id, position, grp, title, minutes, repeat_minutes, repeat_count, repeat_unit, who)
    select v_id, t.ord::integer, coalesce((t.value->>'grp')::integer, t.ord::integer), btrim(t.value->>'title'),
           nullif(t.value->>'minutes', '')::integer, nullif(t.value->>'repeat_minutes', '')::integer,
           nullif(t.value->>'repeat_count', '')::integer, nullif(t.value->>'repeat_unit', ''), nullif(t.value->>'who', '')
    from jsonb_array_elements(coalesce(p_template, '[]'::jsonb)) with ordinality as t(value, ord)
    where nullif(btrim(t.value->>'title'), '') is not null;
  end if;

  perform public.todo_project_sync(v_id);
  return v_id;
end;
$$;

revoke execute on function public.todo_start_season(text, integer, text, date, jsonb, boolean) from public, anon, authenticated;
