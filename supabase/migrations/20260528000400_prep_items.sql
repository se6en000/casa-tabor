-- ── Prep & Readiness items ──────────────────────────────────
-- AI-generated preparation reminders tied to upcoming events.
-- e.g. "Emma's birthday in 3 days — did you get a gift?"
--      "Soccer game Saturday — is Liam's uniform clean?"

create table if not exists public.prep_items (
  id           uuid primary key default gen_random_uuid(),
  event_id     uuid references public.events(id) on delete cascade,
  type         text not null,          -- gift | outfit | dish | equipment | forms | payment | rsvp | weather | logistics | general
  emoji        text not null default '📋',
  description  text not null,
  event_title  text,                   -- denormalized for display
  event_date   timestamptz,            -- denormalized for sorting
  due_by       timestamptz,            -- stop showing after event starts
  priority     int default 2,          -- 1=low 2=medium 3=high
  dismissed    boolean default false,
  dismissed_at timestamptz,
  created_at   timestamptz default now()
);

create index if not exists prep_items_event_id_idx on public.prep_items(event_id);
create index if not exists prep_items_dismissed_idx on public.prep_items(dismissed, due_by);

-- All authenticated users can read/update (dismiss) their family's prep items
alter table public.prep_items enable row level security;
create policy "family can read prep_items"  on public.prep_items for select using (true);
create policy "family can update prep_items" on public.prep_items for update using (true);
create policy "service role full access"     on public.prep_items for all using (true);
