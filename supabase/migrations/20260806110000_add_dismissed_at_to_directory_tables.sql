-- Directory "suggested" dismiss was implemented as a hard delete, so the next
-- discover_directory_candidates() scan would just recreate the same
-- suggestion once matching event history reappeared -- if you tapped X, it
-- kept coming back. Add a dismissed_at tombstone to all four suggestible
-- tables instead: dismissing sets dismissed_at rather than removing the row,
-- so the row keeps existing (with its original name/pairing) and every
-- "not exists" dedupe check in discover_directory_candidates() naturally
-- skips it on future scans. Confirmed rows are unaffected; deleting a
-- confirmed place/contact/connection/family-link still hard-deletes as
-- before via the existing delete RPCs/mutations.
alter table public.saved_places
  add column if not exists dismissed_at timestamptz;
alter table public.saved_contacts
  add column if not exists dismissed_at timestamptz;
alter table public.family_contact_relationships
  add column if not exists dismissed_at timestamptz;
alter table public.contact_place_relationships
  add column if not exists dismissed_at timestamptz;

create index if not exists saved_places_suggested_idx
  on public.saved_places (confirmed)
  where confirmed = false and dismissed_at is null;
create index if not exists saved_contacts_suggested_idx
  on public.saved_contacts (confirmed)
  where confirmed = false and dismissed_at is null;
create index if not exists family_contact_relationships_suggested_idx
  on public.family_contact_relationships (confirmed)
  where confirmed = false and dismissed_at is null;
create index if not exists contact_place_relationships_suggested_idx
  on public.contact_place_relationships (confirmed)
  where confirmed = false and dismissed_at is null;
