alter table public.ai_drawer_debug_events
  add column if not exists correlation_id text null,
  add column if not exists action_id text null,
  add column if not exists lane text null,
  add column if not exists payload jsonb null;

create index if not exists ai_drawer_debug_events_correlation_idx
  on public.ai_drawer_debug_events(correlation_id, received_at desc);

create index if not exists ai_drawer_debug_events_action_idx
  on public.ai_drawer_debug_events(action_id, received_at desc);
