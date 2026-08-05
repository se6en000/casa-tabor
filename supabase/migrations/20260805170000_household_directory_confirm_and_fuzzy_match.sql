-- Household directory: confirm/derive tracking + fuzzy matching for saved_places
-- and saved_contacts. This is the schema half of turning event history (event_
-- enrichments.contact_name/contact_phone + events.location_name/address +
-- event_members) into a reusable, resolvable household directory so the
-- assistant can recognize "Liv's dentist" without re-asking every time.
--
-- - `confirmed`: true for anything a person explicitly saved/approved; false for
--   automatically derived candidates awaiting a quick human glance.
-- - `source`: provenance ('manual' | 'derived') for display/filtering.
-- - `occurrence_count`: how many distinct events/enrichments this candidate was
--   seen in, used to rank/backfill and to decide what's worth surfacing.
-- - pg_trgm indexes support fuzzy name matching for STT-garbled provider/place
--   names ("Doctor One Key" -> "Dr. Wanuk"), used only to *suggest* a match for
--   confirmation, never to silently write.

create extension if not exists pg_trgm;

alter table public.saved_places
  add column if not exists confirmed boolean not null default true,
  add column if not exists source text not null default 'manual',
  add column if not exists occurrence_count integer not null default 1;

alter table public.saved_places
  drop constraint if exists saved_places_source_check;
alter table public.saved_places
  add constraint saved_places_source_check check (source in ('manual', 'derived'));

alter table public.saved_contacts
  add column if not exists confirmed boolean not null default true,
  add column if not exists source text not null default 'manual',
  add column if not exists occurrence_count integer not null default 1;

alter table public.saved_contacts
  drop constraint if exists saved_contacts_source_check;
alter table public.saved_contacts
  add constraint saved_contacts_source_check check (source in ('manual', 'derived'));

-- Fuzzy (trigram) lookup on name; existing GIN indexes on aliases already cover
-- exact alias matches, this adds tolerant matching for misheard/misspelled names.
create index if not exists saved_places_name_trgm_idx
  on public.saved_places using gin (name gin_trgm_ops);

create index if not exists saved_contacts_name_trgm_idx
  on public.saved_contacts using gin (name gin_trgm_ops);

comment on column public.saved_places.confirmed is
  'False for automatically derived candidates awaiting human confirmation.';
comment on column public.saved_places.source is
  'Provenance: manual (explicitly added/confirmed) or derived (auto-extracted from event history).';
comment on column public.saved_places.occurrence_count is
  'Number of distinct events/enrichments this place was seen in; used to rank derived candidates.';

comment on column public.saved_contacts.confirmed is
  'False for automatically derived candidates awaiting human confirmation.';
comment on column public.saved_contacts.source is
  'Provenance: manual (explicitly added/confirmed) or derived (auto-extracted from event history).';
comment on column public.saved_contacts.occurrence_count is
  'Number of distinct events/enrichments this contact was seen in; used to rank derived candidates.';
