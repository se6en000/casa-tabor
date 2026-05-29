alter table public.prep_items
  add column if not exists snoozed_until timestamptz;

create index if not exists prep_items_snoozed_idx on public.prep_items(snoozed_until);
