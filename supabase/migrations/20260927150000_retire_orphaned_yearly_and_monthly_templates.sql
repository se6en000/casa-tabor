-- Dates we keep, step 1 (FAMILY_WALL_PLAN.md P3.19).
-- On 2026-08-20 at 10:18:54 UTC one bulk statement soft-deleted 92 repeating series (both Google
-- connections). Each series' first event stayed behind as a one-off: birthdays at their birth year
-- (Joyce Tabor's at 1949), and bills that had already stopped repeating in 2009–2021. Jake
-- (2026-09-27): friends' birthdays "please remove. That's very old stuff"; "Delete monthly bill
-- repeats and stuff". The family's birthdays and remembrance dates come back as fresh yearly
-- events on the family Google calendar, which Casa imports as series.
update public.events e
set deleted_at = now(), purge_after = now() + interval '30 days'
from public.event_series s
where s.template_event_id = e.id
  and s.deleted_at >= '2026-08-20 10:18:54+00' and s.deleted_at < '2026-08-20 10:18:55+00'
  and e.deleted_at is null
  and substring(s.recurrence_lines::text from 'FREQ=([A-Z]+)') in ('YEARLY', 'MONTHLY');

-- A yearly event added in Google on 2026-09-27 came in as one event per year through 2099: the
-- change feed lists every copy of a repeating event, with no end (fixed in sync-calendars by
-- google-sync-window.mjs). Copies further out than ~400 days are left to the series.
update public.events
set deleted_at = now(), purge_after = now() + interval '30 days'
where deleted_at is null
  and record_kind = 'single'
  and google_event_id ~ '_[0-9]{8}(T[0-9]{6}Z)?$'
  and start_time > now() + interval '400 days';
