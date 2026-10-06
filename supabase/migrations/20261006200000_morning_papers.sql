-- The morning paper (canvas 48a; Jake, Oct 6): one a day, written by supabase/functions/morning-paper from the
-- facts the wall sends. The wall reads it; only the function (service role) writes it.
create table if not exists public.morning_papers (
  paper_date date primary key,
  headline text not null,
  deck text not null default '',
  sky text not null default '',
  facts jsonb not null default '{}'::jsonb,
  sky_facts text,
  model text,
  created_at timestamptz not null default now()
);
alter table public.morning_papers enable row level security;
drop policy if exists morning_papers_read on public.morning_papers;
create policy morning_papers_read on public.morning_papers for select to anon, authenticated using (true);
