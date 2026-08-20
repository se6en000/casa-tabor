-- ============================================================================
-- Google Calendar Webhooks / Push Notification Tracking
-- ============================================================================

alter table public.calendar_connections
  add column if not exists webhook_channel_id text,
  add column if not exists webhook_resource_id text,
  add column if not exists webhook_channel_token text,
  add column if not exists webhook_expires_at timestamptz,
  add column if not exists webhook_status text default 'disabled',
  add column if not exists last_webhook_received_at timestamptz;

create index if not exists idx_calendar_connections_webhook_channel_id
  on public.calendar_connections (webhook_channel_id)
  where webhook_channel_id is not null;

create index if not exists idx_calendar_connections_webhook_expires_at
  on public.calendar_connections (webhook_expires_at)
  where is_enabled = true;
