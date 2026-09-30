-- A to-do with a day but no time (all_day) round-trips the iPhone as a date-only reminder and stays itself,
-- against the real database, rolled back.
-- Run: (echo 'begin;'; cat supabase/migrations/20261001160000_todo_reminder_date_only.sql this; echo 'rollback;') | bash scripts/supabase-cli.sh db query --linked -f /dev/stdin
do $$
declare
  v_day timestamptz := (date '2027-03-10')::timestamp at time zone 'America/New_York';
  v_a uuid; v_b uuid; v_c uuid; v_n int; r record;
begin
  -- 1. The export says all_day.
  insert into events (title, start_time, end_time, all_day, has_due_date, event_type, record_kind, status)
    values ('ZZ pink shirt', v_day, v_day + interval '15 minutes', true, true, 'reminder', 'single', 'confirmed') returning id into v_a;
  if (select all_day from get_todo_reminder_deltas(now() - interval '1 minute', 500) where id = v_a) is not true then raise exception 'FAIL 1 export all_day'; end if;

  -- 2. Linked, it comes back date-only on its day: still that day, no time, all-day (not 5 PM).
  insert into event_ios_reminder_links (event_id, ios_reminder_id, ios_updated_at, last_modified_source, sync_version) values (v_a, 'ZZ-A', now() - interval '1 hour', 'casa', 1);
  perform upsert_todo_reminder_from_ios('ZZ-A', 'ZZ pink shirt', false, false, now(), v_day, false);
  select * into r from events where id = v_a;
  if not (r.all_day and r.has_due_date and r.start_time = v_day) then raise exception 'FAIL 2 date-only kept: all_day % start %', r.all_day, r.start_time; end if;

  -- 3. Moved to another day on the iPhone (still no time): that day, all-day.
  perform upsert_todo_reminder_from_ios('ZZ-A', 'ZZ pink shirt', false, false, now() + interval '1 second', v_day + interval '1 day', false);
  select * into r from events where id = v_a;
  if not (r.all_day and r.start_time = v_day + interval '1 day') then raise exception 'FAIL 3 moved day: all_day % start %', r.all_day, r.start_time; end if;

  -- 4. Given a time on the iPhone: timed now, not all-day.
  perform upsert_todo_reminder_from_ios('ZZ-A', 'ZZ pink shirt', false, false, now() + interval '2 seconds', v_day + interval '15 hours', true);
  select * into r from events where id = v_a;
  if r.all_day or r.start_time <> v_day + interval '15 hours' then raise exception 'FAIL 4 timed: all_day % start %', r.all_day, r.start_time; end if;

  -- 5. The old Mac's midnight-with-a-time on an all-day to-do keeps it all-day.
  insert into events (title, start_time, end_time, all_day, has_due_date, event_type, record_kind, status)
    values ('ZZ yearbook page', v_day, v_day + interval '15 minutes', true, true, 'reminder', 'single', 'confirmed') returning id into v_b;
  insert into event_ios_reminder_links (event_id, ios_reminder_id, ios_updated_at, last_modified_source, sync_version) values (v_b, 'ZZ-B', now() - interval '1 hour', 'casa', 1);
  perform upsert_todo_reminder_from_ios('ZZ-B', 'ZZ yearbook page', false, false, now(), v_day, true);
  select * into r from events where id = v_b;
  if not (r.all_day and r.start_time = v_day) then raise exception 'FAIL 5 midnight kept: all_day % start %', r.all_day, r.start_time; end if;

  -- 6. Unlinked, it comes back date-only under a new reminder id: the same to-do, not a second one.
  insert into events (title, start_time, end_time, all_day, has_due_date, event_type, record_kind, status)
    values ('ZZ field trip lunch', v_day, v_day + interval '15 minutes', true, true, 'reminder', 'single', 'confirmed') returning id into v_c;
  perform upsert_todo_reminder_from_ios('ZZ-C', 'ZZ field trip lunch', false, false, now(), v_day, false);
  select count(*) into v_n from events where title = 'ZZ field trip lunch' and deleted_at is null;
  if v_n <> 1 then raise exception 'FAIL 6 duplicate: % copies', v_n; end if;
  if (select event_id from event_ios_reminder_links where ios_reminder_id = 'ZZ-C') <> v_c then raise exception 'FAIL 6 not linked'; end if;
  select * into r from events where id = v_c;
  if not (r.all_day and r.start_time = v_day) then raise exception 'FAIL 6 kept: all_day % start %', r.all_day, r.start_time; end if;

  -- 7. A timed to-do given a date-only due on the iPhone: 5 PM that day, as before.
  perform upsert_todo_reminder_from_ios('ZZ-D', 'ZZ new from phone', false, false, now(), v_day, false);
  select * into r from events where title = 'ZZ new from phone';
  if r.all_day or r.start_time <> v_day + interval '17 hours' then raise exception 'FAIL 7 phone date-only: all_day % start %', r.all_day, r.start_time; end if;

  raise exception 'ALL PASSED';
end $$;
