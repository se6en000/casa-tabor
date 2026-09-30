-- The to-do export says whether each to-do has a date, against the real database, rolled back.
-- Run: (echo 'begin;'; cat supabase/migrations/20261001150000_todo_reminder_deltas_has_due_date.sql this; echo 'rollback;') | bash scripts/supabase-cli.sh db query --linked -f /dev/stdin
do $$
declare v_undated uuid; v_dated uuid; v_since timestamptz := now() - interval '1 second';
begin
  insert into events (title, start_time, end_time, event_type, has_due_date, record_kind, status) values ('ZZ undated', date_trunc('day', now()), date_trunc('day', now()) + interval '15 minutes', 'reminder', false, 'single', 'confirmed') returning id into v_undated;
  insert into events (title, start_time, end_time, event_type, has_due_date, record_kind, status) values ('ZZ dated', now() + interval '2 days', now() + interval '2 days 15 minutes', 'reminder', true, 'single', 'confirmed') returning id into v_dated;
  if (select has_due_date from get_todo_reminder_deltas(v_since, 500) where id = v_undated) is not false then raise exception 'FAIL 1 undated'; end if;
  if (select has_due_date from get_todo_reminder_deltas(v_since, 500) where id = v_dated) is not true then raise exception 'FAIL 2 dated'; end if;
  if (select title from get_todo_reminder_deltas(v_since, 500) where id = v_undated) <> 'ZZ undated' then raise exception 'FAIL 3 columns'; end if;
  raise exception 'ALL PASSED';
end $$;
