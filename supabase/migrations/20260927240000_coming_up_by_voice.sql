-- Coming up by voice (FAMILY_WALL_PLAN.md P3.19; Jake 2026-09-27: spirit days need themed shirts
-- "a few days" ahead — "I need a way to easily mark it so it goes on the list"). One event put on
-- the list with its own step and notice, and "every time" rules (words in the name → a step, a
-- notice, or off). Server-only, like the rest of Coming up.
alter table public.coming_up_state
  add column if not exists custom_step text,
  add column if not exists custom_lead_days integer check (custom_lead_days between 1 and 120);

create table if not exists public.coming_up_rules (
  id uuid primary key default gen_random_uuid(),
  match text not null check (length(btrim(match)) > 0),
  step text,
  lead_days integer check (lead_days between 1 and 120),
  off boolean not null default false,
  created_at timestamptz not null default now(),
  removed_at timestamptz
);
alter table public.coming_up_rules enable row level security;
