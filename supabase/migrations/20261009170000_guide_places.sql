-- The local guide's places worth trying (Jake, Oct 9, canvas 85B: "push up events, items, ideas that are popular BUT
-- NOT TOURISTY"). Found weekly on Google by what they love (Your taste), checked, with what locals and the local press
-- say (grounded search) and how fast the reviews are coming (guide_place_counts, a month kept: Google's terms).
-- Server only (no policies): the scout function reads and writes them; the app gets them through its list.
create table if not exists public.guide_places (
  id uuid primary key default gen_random_uuid(),
  google_place_id text not null unique,
  name text not null,
  address text,
  shelf text not null,
  shelf_label text not null,
  types text,
  lat double precision,
  lng double precision,
  drive_min int,
  beyond boolean not null default false,
  rating numeric,
  rating_count int,
  maps_url text,
  website text,
  buzz jsonb not null default '[]'::jsonb,   -- [{kind: 'reddit'|'press', said, new, url}]
  mentions int not null default 0,
  labels text[] not null default '{}',       -- 'local' | 'hot' | 'gem'
  heard text,
  why text,
  touristy boolean not null default false,
  score numeric not null default 0,
  status text not null default 'live' check (status in ('live', 'saved', 'not_for_us', 'been')),
  seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists guide_places_score_idx on public.guide_places (status, score desc);
alter table public.guide_places enable row level security;

create table if not exists public.guide_place_counts (
  google_place_id text not null,
  seen_on date not null,
  rating numeric,
  rating_count int,
  primary key (google_place_id, seen_on)
);
alter table public.guide_place_counts enable row level security;

-- Sundays, 3 AM Eastern (07:00 UTC): the week's research.
select cron.unschedule(jobid) from cron.job where jobname = 'guide-research';
select cron.schedule(
  'guide-research',
  '0 7 * * 0',
  $$
  select net.http_post(
    url     := 'https://sjiejymuuuqzqukyeagk.supabase.co/functions/v1/scout',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'apikey',        s.k,
      'Authorization', 'Bearer ' || s.k
    ),
    body    := '{"action":"guide"}'::jsonb,
    timeout_milliseconds := 10000
  )
  from (
    select decrypted_secret as k
    from vault.decrypted_secrets
    where name = 'SUPABASE_ANON_KEY'
    limit 1
  ) s;
  $$
);
