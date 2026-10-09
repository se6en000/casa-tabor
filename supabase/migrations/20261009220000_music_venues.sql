-- The venue sorter (Jake, Oct 9: "most venues that have cover bands tend to only hire cover bands... so I think this is
-- more of a venue sorter"): each live-music venue, looked up once — cover (bar bands, tributes, acoustic covers),
-- concert (touring names), original (local and indie original music), mixed — and the family's own word on it
-- (more / less / skip). Each gig carries its venue's kind, which orders a busy night's bands on Out & about.
create table if not exists public.music_venues (
  name_key text primary key,
  name text not null,
  kind text not null default 'mixed' check (kind in ('cover', 'concert', 'original', 'mixed')),
  note text,
  family text check (family in ('more', 'less', 'skip')),
  checked_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.music_venues enable row level security;
drop policy if exists "family full access" on public.music_venues;
create policy "family full access" on public.music_venues for all using (true) with check (true);

alter table public.outings add column if not exists venue_kind text;
