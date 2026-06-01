-- saved_places: family address book with nickname/alias support
create table if not exists public.saved_places (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  aliases      text[] not null default '{}',
  address      text,
  city         text,
  state        text,
  zip          text,
  lat          numeric,
  lng          numeric,
  category     text not null default 'other',  -- restaurant | friends_house | school | sports | work | medical | other
  notes        text,
  google_place_id text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Enable RLS (all authenticated users can read/write for now — single-family app)
alter table public.saved_places enable row level security;
create policy "allow all" on public.saved_places for all using (true) with check (true);

-- Index for fast alias lookups (GIN on array)
create index saved_places_aliases_gin on public.saved_places using gin(aliases);

-- Trigger to keep updated_at fresh
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

create trigger saved_places_updated_at
  before update on public.saved_places
  for each row execute function public.set_updated_at();
