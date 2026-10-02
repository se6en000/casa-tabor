-- A chore ticked for the day (canvas 27a/27c, Jake 2026-10-01: Next up by day, Still tonight in the evening). One row
-- per chore per date; unticking deletes it. Its own table, so nothing here reaches Google or iOS.
create table if not exists public.household_chore_done (
  chore_id uuid not null references public.household_chores(id) on delete cascade,
  on_date date not null,
  done_at timestamptz not null default now(),
  primary key (chore_id, on_date)
);
alter table public.household_chore_done enable row level security;
drop policy if exists "family full access" on public.household_chore_done;
create policy "family full access" on public.household_chore_done for all using (true) with check (true);
