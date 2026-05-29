-- Gmail inbox scanning support
-- Adds gmail scan toggle to google_tokens and a processed messages log table

alter table public.google_tokens
  add column if not exists gmail_scan_enabled boolean not null default false,
  add column if not exists gmail_history_id   text;   -- Gmail incremental history cursor

-- Track which Gmail messages we've already processed so we never duplicate
create table if not exists public.gmail_processed_messages (
  id               uuid primary key default gen_random_uuid(),
  family_member_id uuid        not null references public.family_members(id) on delete cascade,
  gmail_message_id text        not null,
  subject          text,
  from_email       text,
  received_at      timestamptz,
  created_event_id uuid        references public.events(id) on delete set null,
  skipped_reason   text,        -- null = event created, otherwise why we skipped
  processed_at     timestamptz not null default now()
);

create unique index if not exists gmail_processed_messages_unique
  on public.gmail_processed_messages (family_member_id, gmail_message_id);

alter table public.gmail_processed_messages enable row level security;

-- Authenticated users can read their own processed messages (via family_member_id)
drop policy if exists "members can read own gmail log" on public.gmail_processed_messages;
create policy "members can read own gmail log"
  on public.gmail_processed_messages for select
  using (true);

-- Update the safe status view to expose gmail fields
create or replace view public.google_connection_status as
  select
    family_member_id,
    google_email,
    connected_at,
    last_sync_at,
    last_sync_error,
    gmail_scan_enabled
  from public.google_tokens;

grant select on public.google_connection_status to anon, authenticated;
grant select on public.gmail_processed_messages to anon, authenticated;
