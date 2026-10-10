-- A place, the whole story (canvas 90A–B; Jake, Oct 10: "great lets build it"): Google's details, the web's answers
-- and "for you two", kept 30 days (Google's terms) and read again after. Not for us backs off instead of banning:
-- the first hides it three weeks, the second three months, the third retires it (Passed on); Not now hides it two weeks.
alter table public.guide_places
  add column if not exists dossier jsonb,
  add column if not exists dossier_at timestamptz,
  add column if not exists no_count integer not null default 0,
  add column if not exists said_no_at timestamptz,
  add column if not exists snoozed_until date;
