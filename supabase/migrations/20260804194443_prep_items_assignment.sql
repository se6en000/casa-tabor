-- ── Prep item assignment ────────────────────────────────────
-- Lets a single family member be assigned to a prep/action item so it's
-- clear who is responsible for following up. Purely additive/nullable;
-- existing rows and readers are unaffected.

alter table public.prep_items
  add column if not exists assigned_to uuid references public.family_members(id) on delete set null;

create index if not exists prep_items_assigned_to_idx on public.prep_items(assigned_to);
