-- Duplicate to-dos from the iOS sync, against the real database, rolled back.
-- Run: (echo 'begin;'; cat supabase/migrations/20261001140000_todo_reminder_placeholder_relink.sql this; echo 'rollback;') | bash scripts/supabase-cli.sh db query --linked -f /dev/stdin
do $$
declare v_orig uuid; r jsonb; v_day timestamptz := date_trunc('day', now() at time zone 'America/New_York') at time zone 'America/New_York';
begin
  -- An undated to-do Casa made (as Add it / add_todo does): its start is today's midnight placeholder.
  insert into events (title, start_time, end_time, event_type, has_due_date, record_kind, status)
  values ('ZZ Reply to Towhid', v_day, v_day + interval '15 minutes', 'reminder', false, 'single', 'confirmed') returning id into v_orig;
  -- 1: it comes back from iOS due at that midnight: linked to it, not inserted again
  r := upsert_todo_reminder_from_ios('zz-ios-1', 'ZZ Reply to Towhid', false, false, now(), v_day, true);
  if r->>'event_id' <> v_orig::text or r->>'action' <> 'linked_existing' then raise exception 'FAIL 1 %', r; end if;
  if (select count(*) from events where title = 'ZZ Reply to Towhid' and deleted_at is null) <> 1 then raise exception 'FAIL 1 duplicate'; end if;
  -- 2: and it stays undated
  if (select has_due_date from events where id = v_orig) then raise exception 'FAIL 2 became dated'; end if;
  -- 3: checked off on the iPhone: done in Casa, still undated
  r := upsert_todo_reminder_from_ios('zz-ios-1', 'ZZ Reply to Towhid', true, false, now() + interval '1 minute', v_day, true);
  if (select status from events where id = v_orig) <> 'cancelled' or (select has_due_date from events where id = v_orig) then raise exception 'FAIL 3'; end if;
  -- 4: a genuinely new iOS reminder (another title) is still inserted
  r := upsert_todo_reminder_from_ios('zz-ios-2', 'ZZ something new from the iPhone', false, false, now(), null, true);
  if r->>'action' <> 'inserted' then raise exception 'FAIL 4 %', r; end if;
  -- 5: a real due date set on the iPhone (another day) still dates it
  r := upsert_todo_reminder_from_ios('zz-ios-1', 'ZZ Reply to Towhid', false, false, now() + interval '2 minutes', v_day + interval '3 days', false);
  if not (select has_due_date from events where id = v_orig) then raise exception 'FAIL 5'; end if;
  raise exception 'ALL PASSED';
end $$;
