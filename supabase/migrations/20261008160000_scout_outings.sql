-- The Scout (Jake, Oct 8: date ideas "should be legit real things we actually can do"): what it found and checked —
-- restaurants confirmed open on Google within half an hour, events whose own page still shows them on a coming date,
-- the Palm Beach Post's and the city's newsletters mined. The paper and Alexa pick from here. Server only (no policies).
create table if not exists public.outings (
  id uuid primary key default gen_random_uuid(),
  dedupe_key text not null unique,
  kind text not null check (kind in ('restaurant', 'fitness', 'couple', 'family')),
  title text not null,
  "when" text,                -- 'YYYY-MM-DD HH:MM' (home time) for a dated one
  recurring text,             -- 'every Saturday 7:30 AM' for a weekly one
  place text,
  address text,
  url text,
  why text,
  free boolean,
  drive_min int,
  rating numeric,
  rating_count int,
  gem boolean not null default false,
  google_place_id text,
  source text not null default 'search' check (source in ('search', 'places', 'email')),
  source_ref text,            -- the newsletter's gmail message id
  verify_note text,
  verified_at timestamptz not null default now(),
  status text not null default 'new' check (status in ('new', 'offered', 'saved', 'not_for_us', 'been', 'expired')),
  offered_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists outings_status_when_idx on public.outings (status, "when");
alter table public.outings enable row level security;

-- Sunday and Wednesday, 9 PM Eastern (Monday and Thursday 01:00 UTC); the function researches at most once in two days.
select cron.unschedule(jobid) from cron.job where jobname = 'scout-research';
select cron.schedule('scout-research', '0 1 * * 1,4', $$
  SELECT net.http_post(
    url     := 'https://sjiejymuuuqzqukyeagk.supabase.co/functions/v1/scout',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'apikey',        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNqaWVqeW11dXVxenF1a3llYWdrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk5MTY3MzIsImV4cCI6MjA5NTQ5MjczMn0.sfEpSQkkq7ZbIwjEffEfEKIir15RgqZMGILO_mF4XhM',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNqaWVqeW11dXVxenF1a3llYWdrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk5MTY3MzIsImV4cCI6MjA5NTQ5MjczMn0.sfEpSQkkq7ZbIwjEffEfEKIir15RgqZMGILO_mF4XhM'
    ),
    body    := '{"action":"research"}'::jsonb,
    timeout_milliseconds := 10000
  );
$$);
