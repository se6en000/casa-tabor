create table if not exists public.personal_artwork (
  id uuid primary key default gen_random_uuid(),
  storage_path text not null unique,
  title text not null,
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  byte_size bigint not null check (byte_size > 0 and byte_size <= 20971520),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists personal_artwork_order_idx
  on public.personal_artwork (sort_order, created_at);

alter table public.personal_artwork enable row level security;

drop policy if exists "personal artwork is readable" on public.personal_artwork;
create policy "personal artwork is readable"
  on public.personal_artwork for select
  using (true);

drop policy if exists "personal artwork is writable" on public.personal_artwork;
create policy "personal artwork is writable"
  on public.personal_artwork for all
  using (true)
  with check (true);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'personal-artwork',
  'personal-artwork',
  true,
  20971520,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "personal artwork objects are readable" on storage.objects;
create policy "personal artwork objects are readable"
  on storage.objects for select
  using (bucket_id = 'personal-artwork');

drop policy if exists "personal artwork objects are writable" on storage.objects;
create policy "personal artwork objects are writable"
  on storage.objects for all
  using (bucket_id = 'personal-artwork')
  with check (bucket_id = 'personal-artwork');
