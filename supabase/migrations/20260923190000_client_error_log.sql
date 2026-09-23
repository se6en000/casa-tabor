-- ============================================================================
-- Client-side error/crash monitoring (item 4 of the app best-practices review)
--
-- Every real bug found this week (the cron collision, the broken directory
-- matching, the chat timeout bugs) was found by a human noticing or by
-- manually digging through logs -- there was no automated signal at all for
-- frontend crashes. This is a minimal, self-hosted capture pipeline (no
-- Sentry account exists) matching the EXACT security posture already
-- established for ai_drawer_debug_events: the table itself grants nothing to
-- anon/authenticated, and all writes go through a dedicated Edge Function
-- using the service role (log-client-error), never a direct anon INSERT.
-- ============================================================================

create table if not exists public.client_error_log (
  id uuid primary key default gen_random_uuid(),
  message text not null,
  stack text,
  source text not null default 'unknown', -- 'window.onerror' | 'unhandledrejection' | 'react-error-boundary'
  url text,
  user_agent text,
  build_id text,
  device_id text,
  occurred_at timestamptz not null default now()
);

create index if not exists client_error_log_occurred_at_idx
  on public.client_error_log (occurred_at desc);

alter table public.client_error_log enable row level security;
revoke all on public.client_error_log from anon, authenticated;
grant all on public.client_error_log to service_role;
