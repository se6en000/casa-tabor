-- Private, durable Talk & Plan projects with typed provenance and revisions.

create table if not exists public.ai_projects (
  id uuid primary key default gen_random_uuid(),
  owner_member_id uuid not null references public.family_members(id) on delete cascade,
  source_conversation_id uuid not null references public.ai_conversations(id) on delete cascade,
  title text not null,
  summary text not null default '',
  status text not null default 'active'
    check (status in ('active', 'paused', 'completed', 'archived', 'deleted')),
  briefing_state text not null default 'active'
    check (briefing_state in ('active', 'snoozed', 'not_relevant', 'decided')),
  briefing_snoozed_until timestamptz,
  target_date date,
  version integer not null default 1 check (version > 0),
  last_activity_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_member_id, source_conversation_id)
);

create table if not exists public.ai_project_items (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.ai_projects(id) on delete cascade,
  source_conversation_id uuid not null references public.ai_conversations(id) on delete cascade,
  source_message_client_id text not null,
  extractor_version text not null,
  kind text not null
    check (kind in ('goal', 'decision', 'commitment', 'open_question', 'next_action')),
  content text not null,
  status text not null default 'open'
    check (status in ('open', 'done', 'decided', 'superseded', 'dismissed')),
  due_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, source_message_client_id, extractor_version, kind)
);

create table if not exists public.ai_project_revisions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.ai_projects(id) on delete cascade,
  version integer not null,
  source_conversation_id uuid references public.ai_conversations(id) on delete set null,
  source_message_client_id text,
  change_kind text not null,
  snapshot jsonb not null,
  created_at timestamptz not null default now(),
  unique (project_id, version)
);

create index if not exists ai_projects_owner_activity_idx
  on public.ai_projects (owner_member_id, status, last_activity_at desc);
create index if not exists ai_projects_briefing_idx
  on public.ai_projects (owner_member_id, briefing_state, briefing_snoozed_until, last_activity_at desc)
  where status = 'active';
create index if not exists ai_project_items_project_idx
  on public.ai_project_items (project_id, status, created_at);
create unique index if not exists ai_project_revisions_source_turn_idx
  on public.ai_project_revisions (project_id, source_message_client_id, change_kind)
  where source_message_client_id is not null;

alter table public.ai_projects enable row level security;
alter table public.ai_project_items enable row level security;
alter table public.ai_project_revisions enable row level security;

create policy "ai projects service role only"
  on public.ai_projects for all to service_role using (true) with check (true);
create policy "ai project items service role only"
  on public.ai_project_items for all to service_role using (true) with check (true);
create policy "ai project revisions service role only"
  on public.ai_project_revisions for all to service_role using (true) with check (true);
