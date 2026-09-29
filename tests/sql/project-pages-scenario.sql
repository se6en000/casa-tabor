-- Projects, your way (P3.23): the whole flow against the real database, rolled back — nothing is kept.
-- Run: (echo begin; cat this; echo rollback;) | bash scripts/supabase-cli.sh db query --linked -f /dev/stdin
-- It ends with "ALL PASSED" (raised, so the transaction is thrown away) or the first "FAIL n".
do $$
declare
  v_p uuid; v_c uuid; a uuid; b uuid; c uuid; d uuid; v_row uuid; v_patch uuid;
  live uuid[]; n int; t text;
begin
  select (public.todo_create_project('ZZ test paint', '[{"title":"a"},{"title":"b"},{"title":"c"},{"title":"d"}]'::jsonb)->>'project_id')::uuid into v_p;
  select id into a from todo_steps where project_id = v_p and title = 'a';
  select id into b from todo_steps where project_id = v_p and title = 'b';
  select id into c from todo_steps where project_id = v_p and title = 'c';
  select id into d from todo_steps where project_id = v_p and title = 'd';
  select count(distinct grp) into n from todo_steps where project_id = v_p;
  if n <> 4 then raise exception 'FAIL 1 groups %', n; end if;
  -- 2. b and a side by side, then c, then d: the phone gets b (first of Now)
  perform todo_project_edit(v_p, 'arrange', jsonb_build_object('groups', jsonb_build_array(jsonb_build_array(b, a), jsonb_build_array(c), jsonb_build_array(d))));
  live := todo_project_live_steps(v_p);
  if live <> array[b] then raise exception 'FAIL 2 live %', live; end if;
  select e.title into t from events e join todo_steps s on s.reminder_event_id = e.id where s.id = b and e.deleted_at is null;
  if t <> 'ZZ test paint: b' then raise exception 'FAIL 2 title %', t; end if;
  if exists (select 1 from events e join todo_steps s on s.reminder_event_id = e.id where s.id = a and e.deleted_at is null) then raise exception 'FAIL 2 a still live'; end if;
  -- 3. everything in Now on the phone
  perform todo_project_edit(v_p, 'settings', '{"phone":"now"}');
  select count(*) into n from todo_steps s join events e on e.id = s.reminder_event_id where s.project_id = v_p and e.deleted_at is null and e.status <> 'cancelled';
  if n <> 2 then raise exception 'FAIL 3 reminders %', n; end if;
  -- 4. tick b's reminder (as the watch would): a stays
  update events set status = 'cancelled' where id = (select reminder_event_id from todo_steps where id = b);
  if (select done_at from todo_steps where id = b) is null then raise exception 'FAIL 4 b not done'; end if;
  if todo_project_live_steps(v_p) <> array[a] then raise exception 'FAIL 4 live %', todo_project_live_steps(v_p); end if;
  -- 5. a project inside, beside a
  select (todo_project_edit(v_p, 'add_child', jsonb_build_object('title', 'ZZ stucco', 'arrange', jsonb_build_array(jsonb_build_array(b), jsonb_build_array(a, '@new'), jsonb_build_array(c), jsonb_build_array(d))))->>'project_id')::uuid into v_c;
  select id into v_row from todo_steps where project_id = v_p and child_project_id = v_c;
  if (select grp from todo_steps where id = v_row) <> (select grp from todo_steps where id = a) then raise exception 'FAIL 5 not side by side'; end if;
  -- 6. the inside project gets a step: its own reminder
  select (todo_project_edit(v_c, 'add_step', '{"title":"patch"}')->>'step_id')::uuid into v_patch;
  if todo_project_live_steps(v_c) <> array[v_patch] then raise exception 'FAIL 6 child live'; end if;
  begin
    perform todo_project_edit(v_c, 'add_child', '{"title":"ZZ too deep"}');
    raise exception 'FAIL 6b nested two deep';
  exception when others then if sqlerrm like 'FAIL%' then raise; end if;
  end;
  -- 7. a done: Now still waits on the inside project, nothing of the parent's on the phone
  perform todo_project_edit(v_p, 'done_step', jsonb_build_object('step_id', a));
  if cardinality(todo_project_live_steps(v_p)) <> 0 then raise exception 'FAIL 7 live %', todo_project_live_steps(v_p); end if;
  -- 8. the inside project finishes: its row is done, c is Now
  perform todo_project_edit(v_c, 'done_step', jsonb_build_object('step_id', v_patch));
  if (select status from todo_projects where id = v_c) <> 'done' then raise exception 'FAIL 8 child status'; end if;
  if (select done_at from todo_steps where id = v_row) is null then raise exception 'FAIL 8 row open'; end if;
  if todo_project_live_steps(v_p) <> array[c] then raise exception 'FAIL 8 live %', todo_project_live_steps(v_p); end if;
  -- 9. same job ×10, and the shopping list
  perform todo_project_edit(v_p, 'set_step', jsonb_build_object('step_id', c, 'repeat_minutes', 20, 'repeat_count', 10, 'repeat_unit', 'windows', 'who', 'Me', 'fits', jsonb_build_array('evenings'), 'shop_item', 'ZZ warm lights'));
  if (select minutes from todo_steps where id = c) <> 200 then raise exception 'FAIL 9 minutes'; end if;
  if not exists (select 1 from grocery_items where name = 'ZZ warm lights' and deleted_at is null) then raise exception 'FAIL 9 shop'; end if;
  perform todo_project_edit(v_p, 'set_step', jsonb_build_object('step_id', c, 'shop_item', ''));
  if exists (select 1 from grocery_items where name = 'ZZ warm lights' and deleted_at is null) then raise exception 'FAIL 9 shop off'; end if;
  -- 10. pause: off the phone; going again: back
  perform todo_project_edit(v_p, 'status', '{"status":"paused","until":"2099-01-01"}');
  if exists (select 1 from todo_steps s join events e on e.id = s.reminder_event_id where s.project_id = v_p and e.deleted_at is null and e.status <> 'cancelled') then raise exception 'FAIL 10 paused still on phone'; end if;
  perform todo_project_edit(v_p, 'status', '{"status":"active"}');
  if todo_project_live_steps(v_p) <> array[c] then raise exception 'FAIL 10 resumed'; end if;
  if not exists (select 1 from todo_steps s join events e on e.id = s.reminder_event_id where s.id = c and e.deleted_at is null and e.status <> 'cancelled') then raise exception 'FAIL 10 no reminder'; end if;
  -- 11. take the inside project out: the row goes
  perform todo_project_edit(v_p, 'take_out', jsonb_build_object('step_id', v_row));
  if exists (select 1 from todo_steps where child_project_id = v_c) then raise exception 'FAIL 11'; end if;
  -- 12. delete: dropped, off the phone
  perform todo_project_edit(v_p, 'delete_project');
  if exists (select 1 from todo_steps s join events e on e.id = s.reminder_event_id where s.project_id = v_p and e.deleted_at is null and e.status <> 'cancelled') then raise exception 'FAIL 12'; end if;
  raise exception 'ALL PASSED';
end $$;
