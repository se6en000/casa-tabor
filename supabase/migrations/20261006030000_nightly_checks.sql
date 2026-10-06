-- The nightly checks (Jake, Oct 5: "lets do fewer test runs, you still run one full one at night … anything you find you
-- can email me about to review in the morning"): the Pi records each night's assistant checks and screen tests here; a
-- morning routine reads them and emails Jake when something failed. Written and read with admin access only.
create table if not exists public.nightly_checks (
  id uuid primary key default gen_random_uuid(),
  run_date date not null default (now() at time zone 'America/New_York')::date,
  kind text not null check (kind in ('assistant', 'screens')),
  ok boolean not null,
  summary text not null,
  details jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists nightly_checks_run_date_idx on public.nightly_checks (run_date desc);
alter table public.nightly_checks enable row level security;
