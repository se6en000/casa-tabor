-- Push notification subscriptions (one row per device)
create table if not exists push_subscriptions (
  id           uuid primary key default gen_random_uuid(),
  endpoint     text not null unique,
  p256dh       text not null,
  auth         text not null,
  device_label text,           -- e.g. "iPhone", "Pi Kiosk"
  created_at   timestamptz default now()
);

alter table push_subscriptions enable row level security;

-- Track which events have already triggered a notification (prevent re-firing)
alter table events add column if not exists notified_at timestamptz;

-- Allow service role full access (Edge Functions use service role)
create policy "service role full access" on push_subscriptions
  for all using (true) with check (true);
