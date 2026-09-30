-- A deleted event always gets its purge date (bug report 2026-09-29 10:03 PM: "Something happened when
-- trying to delete [a] duplicate appointment"). events_tombstone_check requires purge_after with every
-- deleted_at, and a delete that set only deleted_at was rejected: the app's reminder delete once
-- (fixed in eventMutations.ts), then Casa's delete_event and delete_events_by_title. The rule now lives
-- here, so no path can miss it: deleted without a purge date → 30 days after (the app's convention);
-- brought back → no purge date.
create or replace function public.events_purge_after_default()
returns trigger
language plpgsql
as $$
begin
  if new.deleted_at is not null and new.purge_after is null then
    new.purge_after := new.deleted_at + interval '30 days';
  elsif new.deleted_at is null and new.purge_after is not null then
    new.purge_after := null;
  end if;
  return new;
end;
$$;

drop trigger if exists events_purge_after_default on public.events;
create trigger events_purge_after_default
  before insert or update of deleted_at, purge_after on public.events
  for each row execute function public.events_purge_after_default();
