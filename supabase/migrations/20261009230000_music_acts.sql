-- The acts (Jake, Oct 9: "i just dont want to see a bunch of stuff I have no idea about"; "like a reggae band, i may want
-- to see no matter what"): each act looked up once (Google Search) — would they know the name, covers or their own
-- songs or a tribute (to whom), its genre. Out & about shows every name they'd know and every tribute, a few local acts
-- in a genre they love, and the rest as one line. Server only: the scout's list hands each gig its act.
create table if not exists public.music_acts (
  act_key text primary key,
  title text not null,
  known text not null check (known in ('yes', 'maybe', 'no')),
  plays text not null check (plays in ('tribute', 'covers', 'originals', 'unknown')),
  tribute_of text,
  genre text,
  checked_at timestamptz not null default now()
);
alter table public.music_acts enable row level security;
