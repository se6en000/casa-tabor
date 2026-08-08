create table if not exists public.capture_devices (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  token_hash text not null unique,
  token_prefix text not null,
  created_by uuid not null default auth.uid(),
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists capture_devices_created_by_idx
  on public.capture_devices (created_by, created_at desc);

create index if not exists capture_devices_active_idx
  on public.capture_devices (revoked_at, created_at desc)
  where revoked_at is null;

create table if not exists public.capture_requests (
  id uuid primary key default gen_random_uuid(),
  capture_device_id uuid not null references public.capture_devices(id) on delete cascade,
  client_request_id text not null,
  channel text not null default 'shortcut',
  request_mode text not null default 'voice',
  raw_text text not null,
  normalized_text text not null default '',
  resolved_intent text,
  status text not null,
  confidence numeric(4,3),
  latency_ms integer,
  correlation_id text,
  clarification_question text,
  response_text text,
  created_entities jsonb not null default '[]'::jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  unique (capture_device_id, client_request_id),
  check (channel in ('shortcut', 'action_button', 'app')),
  check (request_mode in ('voice', 'typed')),
  check (status in ('executed', 'needs_clarification', 'unsupported', 'failed')),
  check (confidence is null or (confidence >= 0 and confidence <= 1))
);

create index if not exists capture_requests_device_created_idx
  on public.capture_requests (capture_device_id, created_at desc);

create index if not exists capture_requests_correlation_idx
  on public.capture_requests (correlation_id)
  where correlation_id is not null;

alter table public.capture_devices enable row level security;
alter table public.capture_requests enable row level security;

drop trigger if exists capture_devices_updated_at on public.capture_devices;
create trigger capture_devices_updated_at
before update on public.capture_devices
for each row execute function public.set_updated_at();

drop policy if exists "capture devices own rows" on public.capture_devices;
create policy "capture devices own rows"
  on public.capture_devices
  for all
  to authenticated
  using (created_by = auth.uid())
  with check (created_by = auth.uid());

drop policy if exists "capture devices service role access" on public.capture_devices;
create policy "capture devices service role access"
  on public.capture_devices
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists "capture requests service role access" on public.capture_requests;
create policy "capture requests service role access"
  on public.capture_requests
  for all
  to service_role
  using (true)
  with check (true);
