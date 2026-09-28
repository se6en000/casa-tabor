-- To do: capture in Reminders, organised by Casa (FAMILY_WALL_PLAN.md P3.22, design section 09,
-- approved by Jake 2026-09-28). His to-dos stay `events` rows with event_type = 'reminder', synced
-- both ways with his iOS "To Do" list. These tables hold what Casa adds on top: each to-do's shape,
-- size, cost and next step; projects; and their ordered steps. Steps are their own rows because
-- Casa → iOS sends every reminder event — only a project's current step becomes a reminder, so his
-- phone shows one next move per project. Server-only (the `todos` function reads and writes them).

create table if not exists public.todo_projects (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  aim_date date,
  budget_low_cents integer,
  budget_high_cents integer,
  notes text,
  status text not null default 'active' check (status in ('active', 'done', 'dropped')),
  -- The reminder it grew from ("Paint the house" captured on his watch).
  origin_event_id uuid references public.events(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  done_at timestamptz
);
create index if not exists todo_projects_origin_event_id_idx on public.todo_projects (origin_event_id);

create table if not exists public.todo_details (
  event_id uuid primary key references public.events(id) on delete cascade,
  shape text not null default 'unsorted' check (shape in ('nudge', 'quick', 'fix', 'project', 'dated', 'unsorted')),
  minutes integer check (minutes is null or minutes > 0),
  cost_cents integer check (cost_cents is null or cost_cents >= 0),
  next_step text,
  -- "Safety", "Hot water", "Call", "Look-up", "Needs a pro", "Dry weather" …
  needs text[] not null default '{}',
  snoozed_until date,
  snooze_count integer not null default 0,
  -- 'ai' when Casa sorted it, 'jake' once he changed it (then the sorter leaves it alone).
  sorted_by text check (sorted_by in ('ai', 'jake')),
  sorted_at timestamptz,
  -- Set when this reminder is a project's current step.
  project_id uuid references public.todo_projects(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists todo_details_project_id_idx on public.todo_details (project_id);

create table if not exists public.todo_steps (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.todo_projects(id) on delete cascade,
  position integer not null,
  title text not null,
  minutes integer check (minutes is null or minutes > 0),
  cost_cents integer check (cost_cents is null or cost_cents >= 0),
  needs text[] not null default '{}',
  done_at timestamptz,
  -- The live reminder for this step while it's the current one.
  reminder_event_id uuid references public.events(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists todo_steps_project_id_idx on public.todo_steps (project_id);
create index if not exists todo_steps_reminder_event_id_idx on public.todo_steps (reminder_event_id);

alter table public.todo_projects enable row level security;
alter table public.todo_details enable row level security;
alter table public.todo_steps enable row level security;
