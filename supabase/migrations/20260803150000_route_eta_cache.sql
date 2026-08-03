create table if not exists public.route_eta_cache (
  cache_key text primary key,
  response jsonb not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists route_eta_cache_expires_idx
  on public.route_eta_cache (expires_at);

alter table public.route_eta_cache enable row level security;

revoke all on public.route_eta_cache from anon, authenticated;
grant all on public.route_eta_cache to service_role;
