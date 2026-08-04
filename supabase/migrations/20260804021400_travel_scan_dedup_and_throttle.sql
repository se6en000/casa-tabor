-- scan-travel-emails was burning tokens two ways, confirmed via ai_provider_calls:
-- 5 separate full scans in 2 days each processed ~74 messages via the LLM with
-- no drop-off between runs, while the trips table only has 51 rows total --
-- meaning the same non-trip emails were being re-sent to the LLM on every run.
--
-- 1. No negative-result cache: the existing dedup only skips a message once it
--    has produced a row in `trips`. A message the LLM decided was NOT a trip
--    (no confirmation number, ambiguous, parse error, etc.) is never recorded
--    anywhere, so it gets re-extracted via the LLM on every subsequent scan for
--    as long as it stays in the 90-day lookback window.
-- 2. The "once a day" auto-scan trigger (src/hooks/useTravelScan.ts) uses
--    localStorage, which is per-browser/device, not per-household. Every
--    distinct device running the app fires its own full, all-members scan
--    once per day, multiplying the redundant work in (1).
--
-- This migration adds the storage for both fixes; the scan-travel-emails
-- function itself is updated in the same change to use them.

create table if not exists public.travel_email_scan_log (
  gmail_message_id text not null,
  family_member_id uuid not null references public.family_members(id) on delete cascade,
  outcome text not null check (outcome in ('trip_created', 'trip_updated', 'no_trip', 'error')),
  debug text,
  scanned_at timestamptz not null default now(),
  primary key (gmail_message_id, family_member_id)
);

create index if not exists travel_email_scan_log_scanned_at_idx
  on public.travel_email_scan_log (scanned_at desc);

-- Singleton row tracking the last automatic (no-context, all-members) scan,
-- so the "once a day" throttle is enforced server-side regardless of how many
-- devices independently trigger it.
create table if not exists public.travel_auto_scan_state (
  id boolean primary key default true check (id),
  last_run_date date not null default '2000-01-01',
  last_run_at timestamptz
);

insert into public.travel_auto_scan_state (id)
values (true)
on conflict (id) do nothing;
