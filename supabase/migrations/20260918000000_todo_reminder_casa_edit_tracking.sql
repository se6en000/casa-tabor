-- Bug found 2026-09-17/18: once a reminder synced in from iOS, editing it in
-- the Casa app (or any generic events-table write -- title, schedule,
-- completion, auto-enrich, etc.) never flipped event_ios_reminder_links.
-- last_modified_source back to 'casa'. It stayed 'ios' from the last sync
-- forever, and get_todo_reminder_deltas explicitly excludes 'ios'-sourced
-- rows (to prevent echo loops) -- so an edited iOS-origin reminder was
-- permanently invisible to the Casa->iOS export. Confirmed against live data:
-- several reminders had events.updated_at well after
-- event_ios_reminder_links.ios_updated_at while still reading last_modified_source='ios'.
--
-- Fix: any update to `events` defaults the linked row back to 'casa' (a cheap
-- no-op for the vast majority of events, which have no link row at all).
-- upsert_todo_reminder_from_ios's own explicit `last_modified_source = 'ios'`
-- write runs immediately after its own `update events` statement within the
-- same function call, so it still wins for genuine iOS-origin syncs -- this
-- trigger only catches every OTHER write path that doesn't know this link
-- table exists.
create or replace function public.mark_event_ios_link_casa_origin()
returns trigger
language plpgsql
as $$
begin
  update public.event_ios_reminder_links
  set last_modified_source = 'casa',
      sync_version = coalesce(sync_version, 1) + 1
  where event_id = new.id;
  return new;
end;
$$;

drop trigger if exists event_ios_link_casa_origin_on_update on public.events;
create trigger event_ios_link_casa_origin_on_update
after update on public.events
for each row execute function public.mark_event_ios_link_casa_origin();
