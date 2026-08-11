create table if not exists public.ai_memories (
  id uuid primary key default gen_random_uuid(),
  scope text not null check (scope in ('personal', 'household')),
  owner_member_id uuid references public.family_members(id) on delete cascade,
  source_conversation_id uuid references public.ai_conversations(id) on delete cascade,
  source_message_client_id text,
  extractor_version text not null default 'rules-v1',
  title text not null,
  content text not null,
  category text not null default 'preference',
  confidence numeric(4,3) not null check (confidence >= 0 and confidence <= 1),
  source_count integer not null default 1 check (source_count > 0),
  status text not null default 'active' check (status in ('active', 'corrected', 'deleted')),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_conversation_id, source_message_client_id, extractor_version),
  check (
    (scope = 'personal' and owner_member_id is not null)
    or (scope = 'household' and owner_member_id is null)
  )
);

create index if not exists ai_memories_active_scope_idx
  on public.ai_memories (scope, owner_member_id, updated_at desc)
  where status = 'active';

alter table public.ai_memories enable row level security;

create policy "ai memories service role only"
  on public.ai_memories
  for all
  to service_role
  using (true)
  with check (true);
