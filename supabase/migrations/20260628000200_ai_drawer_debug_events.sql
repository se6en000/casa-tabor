create table if not exists public.ai_drawer_debug_events (
  id uuid primary key default gen_random_uuid(),
  received_at timestamptz not null default now(),
  client_at timestamptz null,
  event text not null,
  detail text null,
  channel text not null check (channel in ('debug', 'audit')),
  session_id text null,
  turn_id text null,
  seq integer null,
  elapsed_ms integer null,
  page text null,
  turn_state text null,
  loading boolean null,
  queue_depth integer null,
  device_id text null,
  source_origin text null,
  source_href text null,
  user_agent text null,
  platform text null
);

create index if not exists ai_drawer_debug_events_received_idx
  on public.ai_drawer_debug_events(received_at desc);

create index if not exists ai_drawer_debug_events_session_idx
  on public.ai_drawer_debug_events(session_id, received_at desc);

create index if not exists ai_drawer_debug_events_event_idx
  on public.ai_drawer_debug_events(event, received_at desc);
