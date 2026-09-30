-- A deleted event always gets its purge date, against the real database, rolled back.
-- Run: (echo 'begin;'; cat supabase/migrations/20261001100000_events_purge_after_default.sql this; echo 'rollback;') | bash scripts/supabase-cli.sh db query --linked -f /dev/stdin
do $$
declare v uuid;
begin
  insert into events (title, start_time, end_time, event_type) values ('ZZ dentist twin', now() + interval '9 days', now() + interval '9 days 1 hour', 'event') returning id into v;
  -- 1: Casa's delete (deleted_at alone, as execute-ai-action sent it) is accepted, purge date 30 days on
  update events set status = 'cancelled', deleted_at = now(), updated_at = now() where id = v;
  if (select purge_after from events where id = v) is null then raise exception 'FAIL 1'; end if;
  if abs(extract(epoch from (select purge_after - deleted_at from events where id = v)) - 30 * 86400) > 1 then raise exception 'FAIL 1 not 30 days'; end if;
  -- 2: a purge date given is kept
  update events set deleted_at = now(), purge_after = now() + interval '7 days' where id = v;
  if (select purge_after::date from events where id = v) <> (now() + interval '7 days')::date then raise exception 'FAIL 2'; end if;
  -- 3: brought back, no purge date
  update events set deleted_at = null where id = v;
  if (select purge_after from events where id = v) is not null then raise exception 'FAIL 3'; end if;
  raise exception 'ALL PASSED';
end $$;
