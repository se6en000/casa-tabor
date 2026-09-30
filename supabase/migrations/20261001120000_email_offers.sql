-- Casa reads the email, phase 1 (design doc, decided with Jake 2026-09-30): what the new reader decides for
-- each email — nothing, already on the calendar, new details, an offer, or a real person writing — kept
-- here. In phase 1 every row is a shadow: nothing is shown or saved on the calendar; the decisions are
-- compared with Jake's labels. Later phases turn a shadow into an offer he sees.
create table if not exists public.email_offers (
  id uuid primary key default gen_random_uuid(),
  gmail_message_id text not null unique,
  mailbox_member_id uuid,
  from_email text,
  subject text,
  received_at timestamptz,
  decision text not null check (decision in ('skipped', 'none', 'already', 'details', 'offer', 'person')),
  reason text,
  quote text,
  offers jsonb not null default '[]'::jsonb,
  person jsonb,
  attachments_read integer not null default 0,
  status text not null default 'shadow' check (status in ('shadow', 'waiting', 'added', 'not_needed', 'later', 'expired')),
  model text,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.email_offers enable row level security;
create index if not exists email_offers_received_at_idx on public.email_offers (received_at desc);
