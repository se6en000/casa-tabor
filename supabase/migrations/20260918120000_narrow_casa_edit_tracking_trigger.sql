-- Bug found live 2026-09-18: the AFTER UPDATE trigger from
-- 20260918000000_todo_reminder_casa_edit_tracking.sql fired on ANY update to
-- `events`, including background automation (auto-enrich, conflict-analysis,
-- etc.) completely unrelated to a real edit. Every such incidental touch
-- flipped last_modified_source back to 'casa', causing get_todo_reminder_deltas
-- to re-export iOS-originated reminders that were never tagged with a
-- [casa_id:...] note on the Mac side -- the Mac script's byCasaId lookup
-- correctly found nothing (it was never Casa-created) and created a brand
-- new duplicate reminder. Confirmed live: several unrelated reminders
-- duplicated at the exact same timestamp, consistent with a batch of
-- incidental touches all re-exporting at once.
--
-- Narrowed to only fire when a field a real edit would actually change is
-- different -- title, schedule, completion status, or deletion.
drop trigger if exists event_ios_link_casa_origin_on_update on public.events;
create trigger event_ios_link_casa_origin_on_update
after update on public.events
for each row
when (
  old.title is distinct from new.title
  or old.start_time is distinct from new.start_time
  or old.end_time is distinct from new.end_time
  or old.status is distinct from new.status
  or old.deleted_at is distinct from new.deleted_at
  or old.has_due_date is distinct from new.has_due_date
)
execute function public.mark_event_ios_link_casa_origin();
