-- Casa reads the email, phase 3 — "Keep me posted" (canvas row 15, approved by Jake 2026-09-30). Jake: "I want to
-- see emails from Sally generally … dances and other events for Liv, but also she sends out marketing garbage …
-- I'd rather get a summary of what she is saying vs nothing at all." A kept sender (by address) or topic (from
-- anyone) makes every such email a line of what it says, after the offers: nothing skipped, nothing quieted.
create table if not exists public.email_keep_posted (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('sender', 'topic')),
  sender text,
  topic text,
  label text not null,
  source text not null default 'settings' check (source in ('mattered', 'settings', 'voice')),
  created_at timestamptz not null default now(),
  check ((kind = 'sender' and sender is not null) or (kind = 'topic' and topic is not null))
);
create unique index if not exists email_keep_posted_sender_key on public.email_keep_posted (sender) where kind = 'sender';
-- Only the server reads it (the email-offers and email-reader functions), like email_offers.
alter table public.email_keep_posted enable row level security;

-- Each email: a line of what it says (gist) and a plain tag; which rule keeps it posted; and "Bring back" on a
-- Not needed that was quieting a sender.
alter table public.email_offers add column if not exists gist text;
alter table public.email_offers add column if not exists gist_tag text;
alter table public.email_offers add column if not exists posted_by uuid references public.email_keep_posted(id) on delete set null;
create index if not exists email_offers_posted_by_idx on public.email_offers (posted_by);
alter table public.email_offers add column if not exists unquieted_at timestamptz;
alter table public.email_offers drop constraint if exists email_offers_status_check;
alter table public.email_offers add constraint email_offers_status_check
  check (status in ('shadow', 'waiting', 'added', 'not_needed', 'later', 'expired', 'quiet', 'posted', 'seen'));

-- "Email text on the wall" (Settings › Email): on while Jake is the only user.
insert into public.settings (key, value, description)
values ('email_text_on_wall', 'true'::jsonb, 'Show an email''s own words under each offer on the wall (off for family or guest mode)')
on conflict (key) do nothing;
