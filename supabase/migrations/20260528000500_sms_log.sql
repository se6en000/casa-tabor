-- ── SMS Log ──────────────────────────────────────────────────
-- Tracks every SMS sent or received through Casa Tabor.

create table if not exists public.sms_log (
  id           uuid primary key default gen_random_uuid(),
  direction    text not null check (direction in ('outbound', 'inbound')),
  to_number    text,
  from_number  text,
  body         text not null,
  status       text default 'sent',   -- sent | failed | received
  twilio_sid   text,
  member_id    uuid references public.family_members(id) on delete set null,
  error        text,
  created_at   timestamptz default now()
);

create index if not exists sms_log_member_idx    on public.sms_log(member_id);
create index if not exists sms_log_direction_idx on public.sms_log(direction, created_at desc);

alter table public.sms_log enable row level security;
create policy "family can read sms_log"  on public.sms_log for select using (true);
create policy "service role full access" on public.sms_log for all using (true);
