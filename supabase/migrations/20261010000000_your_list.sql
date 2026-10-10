-- Out & about from your list (canvas 86C–F; Jake, Oct 9: "ok lets build this"). The page is what they put there:
-- places they saved (To try), places they love (Your spots), what they asked about, and the kinds of nights they'd do
-- again, watched for new dates — plus one surprise. guide_places is the one list of places.

-- A place they love is a spot (Blue Door, Mr B's); who it's for; how it got here; their own line about it.
alter table public.guide_places drop constraint if exists guide_places_status_check;
alter table public.guide_places add constraint guide_places_status_check check (status in ('live', 'saved', 'spot', 'not_for_us', 'been'));
alter table public.guide_places add column if not exists whose text not null default 'us' check (whose in ('us', 'family', 'jake', 'kelly'));
alter table public.guide_places add column if not exists origin text not null default 'guide' check (origin in ('guide', 'shared', 'alexa', 'taste', 'asked', 'like', 'added'));
alter table public.guide_places add column if not exists note text;
alter table public.guide_places add column if not exists saved_at timestamptz;
-- Found by More like this, from which of theirs.
alter table public.guide_places add column if not exists like_of uuid references public.guide_places(id) on delete set null;
create index if not exists guide_places_like_of_idx on public.guide_places (like_of);
update public.guide_places set origin = 'shared', saved_at = coalesce(saved_at, created_at) where status = 'saved' and origin = 'guide';

-- What to keep an eye out for: a kind of night they loved ("the Candlelight concerts" — again) or asked about (Ballet
-- Palm Beach's shows — asked). The scout looks for new dates; each one found is an outing with its watch.
-- Server only (no policies), like the rest of the guide.
create table if not exists public.guide_watch (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null check (kind in ('again', 'asked')),
  whose text not null default 'us' check (whose in ('us', 'family', 'jake', 'kelly')),
  query text not null,
  note text,
  status text not null default 'on' check (status in ('on', 'off')),
  looked_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.guide_watch enable row level security;

alter table public.outings add column if not exists watch_id uuid references public.guide_watch(id) on delete set null;
create index if not exists outings_watch_id_idx on public.outings (watch_id);
