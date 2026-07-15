alter table public.event_enrichments
  add column if not exists category_locked boolean not null default false;

