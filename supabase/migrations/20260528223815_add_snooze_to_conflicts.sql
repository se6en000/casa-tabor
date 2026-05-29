alter table public.conflicts
  add column if not exists snoozed_until timestamptz;
