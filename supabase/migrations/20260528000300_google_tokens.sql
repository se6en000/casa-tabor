-- ── Google OAuth token storage ──────────────────────────────
-- One row per family member who has connected their Google account.
-- Refresh tokens are sensitive; only the service role can read them.

create table if not exists public.google_tokens (
  family_member_id uuid primary key references public.family_members(id) on delete cascade,
  google_email     text        not null,
  refresh_token    text        not null,
  access_token     text,
  expires_at       timestamptz,
  scope            text        not null,
  sync_token       text,                              -- Google incremental sync cursor
  last_sync_at     timestamptz,
  last_sync_error  text,
  connected_at     timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

alter table public.google_tokens enable row level security;

-- No anon access to the raw table.
-- A view exposes only safe, non-secret status fields for the UI.
drop view if exists public.google_connection_status;
create view public.google_connection_status as
  select
    family_member_id,
    google_email,
    connected_at,
    last_sync_at,
    last_sync_error
  from public.google_tokens;

grant select on public.google_connection_status to anon, authenticated;

-- ── Events: enforce upsertable google_event_id ──────────────
create unique index if not exists events_google_event_id_unique
  on public.events (google_event_id)
  where google_event_id is not null;

-- ── Realtime ────────────────────────────────────────────────
DO $$ BEGIN
  alter publication supabase_realtime add table public.events;
EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN
  alter publication supabase_realtime add table public.event_members;
EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN
  alter publication supabase_realtime add table public.event_enrichments;
EXCEPTION WHEN others THEN NULL; END $$;
