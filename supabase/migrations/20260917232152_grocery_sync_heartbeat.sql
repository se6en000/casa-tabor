-- The Mac-side Casa<->iOS Reminders sync (see .github/instructions/ios-reminders-sync.instructions.md)
-- can fail silently: if the launchd job isn't loaded or the Mac is asleep, nothing in the app
-- shows it. sync-casa-to-ios is polled unconditionally by the Mac's Casa->iOS script on every
-- tick (it has to ask "what changed?" whether or not anything did), so recording a heartbeat on
-- every call to that function gives a reliable "is the poller alive" signal independent of
-- whether groceries were actually touched recently.
create table if not exists public.sync_heartbeats (
  job_name text primary key,
  last_seen_at timestamptz not null default now(),
  meta jsonb
);
