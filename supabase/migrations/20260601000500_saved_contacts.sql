-- saved_contacts: family address book for people (friends, family, providers)
create table if not exists public.saved_contacts (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  aliases      text[] not null default '{}',
  relationship text,           -- e.g. friend, family, doctor, coach, teacher
  phone        text,
  email        text,
  address      text,
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table public.saved_contacts enable row level security;
create policy "allow all" on public.saved_contacts for all using (true) with check (true);

create index saved_contacts_aliases_gin on public.saved_contacts using gin(aliases);

create trigger saved_contacts_updated_at
  before update on public.saved_contacts
  for each row execute function public.set_updated_at();
