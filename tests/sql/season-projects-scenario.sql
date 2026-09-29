-- The seasons as projects (P3.23 step 2) against the real database, rolled back — nothing is kept.
-- Run: (echo begin; cat this; echo rollback;) | bash scripts/supabase-cli.sh db query --linked -f /dev/stdin
-- It ends with "ALL PASSED" (raised, so the transaction is thrown away) or the first "FAIL n".
do $$
declare p1 uuid; p2 uuid; p3 uuid; n int; t text; w uuid;
begin
  -- 1. No last year and automatic: nothing starts (the first year waits for Jake's tap).
  if public.todo_start_season('zz_lights', 2026, 'ZZ lights', '2026-11-25', '[{"title":"storage","grp":1},{"title":"windows","grp":2,"minutes":200,"repeat_minutes":20,"repeat_count":10,"repeat_unit":"windows"},{"title":"palms","grp":2}]'::jsonb, true) is not null then raise exception 'FAIL 1'; end if;
  -- 2. Tapped: from the starter plan, side by side kept, yearly, due the day.
  p1 := public.todo_start_season('zz_lights', 2026, 'ZZ lights', '2026-11-25', '[{"title":"storage","grp":1},{"title":"windows","grp":2,"minutes":200,"repeat_minutes":20,"repeat_count":10,"repeat_unit":"windows"},{"title":"palms","grp":2}]'::jsonb);
  select count(*) into n from todo_steps where project_id = p1;
  if n <> 3 or (select grp from todo_steps where project_id = p1 and title = 'windows') <> (select grp from todo_steps where project_id = p1 and title = 'palms') then raise exception 'FAIL 2 %', n; end if;
  if not (select yearly and aim_date = '2026-11-25' and season_id = 'zz_lights:2026' from todo_projects where id = p1) then raise exception 'FAIL 2b'; end if;
  -- 3. Its first step is on his phone.
  if cardinality(todo_project_live_steps(p1)) <> 1 then raise exception 'FAIL 3'; end if;
  -- 4. Tapped again: the same project, not a second one.
  if public.todo_start_season('zz_lights', 2026, 'ZZ lights', '2026-11-25', '[]'::jsonb) <> p1 then raise exception 'FAIL 4'; end if;
  -- 5. His changes this year (his time for the windows, a new step, Kelly on the palms) …
  perform todo_project_edit(p1, 'set_step', jsonb_build_object('step_id', (select id from todo_steps where project_id = p1 and title = 'windows'), 'repeat_minutes', 25, 'repeat_count', 12));
  perform todo_project_edit(p1, 'add_step', '{"title":"timers"}');
  perform todo_project_edit(p1, 'set_step', jsonb_build_object('step_id', (select id from todo_steps where project_id = p1 and title = 'palms'), 'who', 'Kelly'));
  perform todo_project_edit(p1, 'status', '{"status":"done"}');
  -- … are next year's plan, started by itself (p_auto) from last year's.
  p2 := public.todo_start_season('zz_lights', 2027, 'ZZ lights', '2027-11-24', '[]'::jsonb, true);
  if p2 is null or p2 = p1 then raise exception 'FAIL 5'; end if;
  if (select minutes from todo_steps where project_id = p2 and title = 'windows') <> 300 then raise exception 'FAIL 6 his times'; end if;
  if (select who from todo_steps where project_id = p2 and title = 'palms') <> 'Kelly' then raise exception 'FAIL 7 who'; end if;
  if not exists (select 1 from todo_steps where project_id = p2 and title = 'timers') then raise exception 'FAIL 8 his new step'; end if;
  if exists (select 1 from todo_steps where project_id = p2 and done_at is not null) then raise exception 'FAIL 9 fresh'; end if;
  if (select aim_date from todo_projects where id = p2) <> '2027-11-24' then raise exception 'FAIL 10'; end if;
  raise exception 'ALL PASSED';
end $$;
