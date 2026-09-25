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

-- Production already had the original dashboard-built sms_log (see the
-- 20260527000000 baseline), so the create above was a no-op there and these
-- indexes/policies never existed. Only apply them to this file's own shape.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'sms_log' and column_name = 'member_id'
  ) then
    create index if not exists sms_log_member_idx    on public.sms_log(member_id);
    create index if not exists sms_log_direction_idx on public.sms_log(direction, created_at desc);
    create policy "family can read sms_log"  on public.sms_log for select using (true);
    create policy "service role full access" on public.sms_log for all using (true);
  end if;
end;
$$;

alter table public.sms_log enable row level security;
