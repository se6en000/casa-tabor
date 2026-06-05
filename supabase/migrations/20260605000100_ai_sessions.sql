create table if not exists ai_sessions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  ended_at timestamptz,
  messages jsonb not null default '[]'::jsonb,
  working_context jsonb not null default '{}'::jsonb
);
